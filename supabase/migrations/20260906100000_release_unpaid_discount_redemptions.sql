-- Liberación de canjes que nunca se cobraron — PLU ARG
--
-- El problema: la redención se escribe cuando se CREA la orden
-- (`apply_discount_code_to_order` corre dentro de la transacción que la crea),
-- pero nada la libera si esa orden muere sin pagarse. Una orden de Mercado Pago
-- vence a los 30 minutos (`create_membership_registration_combo_order_core`) y
-- `expire_domain_orders` la pasa a 'cancelado' cada 3 minutos.
--
-- Consecuencia sobre la oferta exclusiva: el atleta canjea el código secreto,
-- abre el checkout del combo, aprieta pagar, no termina — y el código queda
-- quemado para siempre. `discount_code_redemptions` tiene un unique
-- (discount_code_id, athlete_id), así que el segundo intento sale por PLU22, el
-- preview responde `already_used` y `offer_code_payload.redeemed` deja la
-- pestaña secreta diciendo "ya la usaste". Como ese mismo código es el que
-- destraba el combo restringido, el atleta tampoco puede comprarlo a precio de
-- lista: la oferta que se le prometió se vuelve incomprable sin haber pagado
-- nada. Lo mismo aplica a cualquier cupón, no sólo a las ofertas secretas.
--
-- La regla: una redención cuya orden terminó 'cancelado' o 'rechazado' y que
-- nunca tuvo un pago aprobado no es una venta, es un intento. Se borra.
--   * 'reembolsado' NO se toca: ahí la plata se movió y el código se usó de
--     verdad — es registro contable y Finanzas reporta sobre él.
--   * el unlock (`discount_code_unlocks`) tampoco se toca: "tengo el código"
--     sigue siendo cierto, y es lo que sostiene la pestaña secreta.
--
-- Se implementa con un trigger y no parcheando cada función que mata una orden
-- (vencimiento por cron, rechazo de Mercado Pago, rechazo manual de staff,
-- cancelación desde el panel): es un solo lugar, cubre los caminos que ya
-- existen y los que se agreguen después, y no obliga a versionar ninguna de las
-- RPC de checkout.

-- ---------------------------------------------------------------------------
-- 1. Permiso de borrado
--
-- La tabla nació con `grant select, insert` (20260819100000): sin esto el
-- trigger no puede borrar nada aunque corra como definer.
-- ---------------------------------------------------------------------------

grant delete on public.discount_code_redemptions to service_role;

-- ---------------------------------------------------------------------------
-- 2. Liberación de una orden puntual
--
-- Devuelve true cuando liberó algo, para que el backfill y los tests puedan
-- contar. Idempotente: correrla dos veces sobre la misma orden no falla.
--
-- Reapertura de cupo: `apply_discount_code_to_order` apaga el código al
-- ocuparse el último lugar. Si el que se libera era ese último lugar, el código
-- tiene que volver a estar activo o el cupo quedaría perdido. Se exige que
-- estuviera lleno ANTES de liberar (esa es la firma del cierre automático) y
-- que el código no esté archivado ni vencido, para no revivir uno que el panel
-- apagó a mano por otro motivo.
-- ---------------------------------------------------------------------------

create or replace function plu_private.release_unpaid_discount_redemption(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_redemption public.discount_code_redemptions;
  v_code public.discount_codes;
  v_before int;
  v_after int;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id;
  if not found or v_order.status not in ('cancelado', 'rechazado') then
    return false;
  end if;

  -- Un pago aprobado (o reembolsado, que es un aprobado devuelto) convierte el
  -- intento en venta. No importa en qué quedó la orden: el código se usó.
  if exists (
    select 1 from public.athlete_payments
    where order_id = p_order_id and status in ('aprobado', 'reembolsado')
  ) then
    return false;
  end if;

  select * into v_redemption
  from public.discount_code_redemptions
  where payment_order_id = p_order_id;
  if not found then
    return false;
  end if;

  select * into v_code from public.discount_codes
  where id = v_redemption.discount_code_id
  for update;

  select count(*) into v_before
  from public.discount_code_redemptions
  where discount_code_id = v_redemption.discount_code_id;

  delete from public.discount_code_redemptions where id = v_redemption.id;

  -- La orden no se toca. Quedó muerta con el importe y el código con los que se
  -- creó, y eso es su historia: sirve para explicar después por qué el atleta
  -- volvió a intentar. Lo único que tenía que desaparecer es el renglón que
  -- ocupaba el cupo y el unique (discount_code_id, athlete_id).
  v_after := v_before - 1;

  if v_code.id is not null
     and v_code.max_redemptions is not null
     and not v_code.active
     and v_code.archived_at is null
     and (v_code.expires_at is null or v_code.expires_at > now())
     and v_before >= v_code.max_redemptions
     and v_after < v_code.max_redemptions then
    update public.discount_codes
    set active = true, updated_at = now()
    where id = v_code.id;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.released', 'payment_order', p_order_id::text, 'system', 'expiry',
    jsonb_build_object(
      'discountCodeId', v_redemption.discount_code_id,
      'code', v_code.code,
      'kind', v_code.kind,
      'athleteId', v_redemption.athlete_id,
      'discountAmount', v_redemption.discount_amount,
      'orderStatus', v_order.status,
      'quotaReopened', v_code.max_redemptions is not null and not v_code.active
        and v_before >= v_code.max_redemptions
    ),
    v_order.organization_id
  );

  return true;
end;
$$;

revoke all on function plu_private.release_unpaid_discount_redemption(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trigger: cualquier camino que mate una orden libera su canje
--
-- `after update of status`, y con `when` en la definición para que el trigger no
-- se dispare en las escrituras que no cambian el estado — que son casi todas
-- (repricing manual, preference_id, payer_email).
-- ---------------------------------------------------------------------------

create or replace function plu_private.release_discount_on_dead_order()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
begin
  perform plu_private.release_unpaid_discount_redemption(new.id);
  return null;
end;
$$;

revoke all on function plu_private.release_discount_on_dead_order()
  from public, anon, authenticated;

drop trigger if exists release_discount_on_dead_order on public.athlete_payment_orders;
create trigger release_discount_on_dead_order
  after update of status on public.athlete_payment_orders
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('cancelado', 'rechazado')
    and old.status not in ('aprobado', 'reembolsado')
  )
  execute function plu_private.release_discount_on_dead_order();

-- ---------------------------------------------------------------------------
-- 4. Backfill
--
-- Los códigos que ya quedaron quemados por una orden muerta se liberan ahora:
-- son atletas que hoy tienen una oferta secreta que no pueden comprar. El
-- trigger sólo actúa de acá en adelante.
-- ---------------------------------------------------------------------------

do $backfill$
declare
  v_order uuid;
  v_released int := 0;
begin
  for v_order in
    select o.id
    from public.athlete_payment_orders o
    join public.discount_code_redemptions r on r.payment_order_id = o.id
    where o.status in ('cancelado', 'rechazado')
      and not exists (
        select 1 from public.athlete_payments p
        where p.order_id = o.id and p.status in ('aprobado', 'reembolsado')
      )
  loop
    if plu_private.release_unpaid_discount_redemption(v_order) then
      v_released := v_released + 1;
    end if;
  end loop;
  raise notice 'Canjes liberados de órdenes muertas: %', v_released;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 5. La pestaña secreta habla de su campaña
--
-- `offer_code_payload` nació antes de `promotion_campaigns` (20260905100000):
-- la ficha lee `offer.campaign?.name` y `offer.remaining` y los recibía siempre
-- vacíos, así que una campaña con nombre propio aparecía como "Oferta
-- exclusiva" genérica y el cupo restante no se mostraba nunca. Mismo payload
-- para el canje y para el listado, que es lo que evita que las dos pantallas
-- muestren cosas distintas.
-- ---------------------------------------------------------------------------

create or replace function plu_private.offer_code_payload(
  p_code public.discount_codes,
  p_athlete_id uuid
)
returns jsonb
language sql
stable
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'id', p_code.id,
    'code', p_code.code,
    'description', p_code.description,
    'kind', p_code.kind,
    'appliesTo', p_code.applies_to,
    'fixedPrice', p_code.fixed_price,
    'fixedPriceManual', p_code.fixed_price_manual,
    'manualChannels', to_jsonb(p_code.manual_channels),
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'maxRedemptions', p_code.max_redemptions,
    -- Cupo restante del código, no del atleta: es lo que la ficha usa para
    -- decir "quedan N". Null cuando no hay tope.
    'remaining', case
      when p_code.max_redemptions is null then null
      else greatest(
        0,
        p_code.max_redemptions - (
          select count(*) from public.discount_code_redemptions r
          where r.discount_code_id = p_code.id
        )
      )
    end,
    'redeemed', exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = p_code.id and r.athlete_id = p_athlete_id
    ),
    'campaign', case when ca.id is null then null else jsonb_build_object(
      'id', ca.id,
      'slug', ca.slug,
      'name', ca.name,
      'description', ca.description,
      'objective', ca.objective,
      'status', ca.status,
      'visibility', ca.visibility
    ) end,
    'event', case when e.id is null then null else jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'startsAt', e.starts_at,
      'status', e.status,
      'registrationPrice', e.price,
      'registrationManualPrice', e.manual_price,
      'currency', e.currency
    ) end,
    'comboOffer', case when o.id is null then null else jsonb_build_object(
      'id', o.id,
      'price', o.price,
      'manualPrice', o.manual_price,
      'currency', o.currency,
      'active', o.active,
      'audience', o.audience,
      'startsAt', o.starts_at,
      'endsAt', o.ends_at
    ) end,
    'membershipPlan', case when pl.id is null then null else jsonb_build_object(
      'id', pl.id,
      'code', pl.code,
      'name', pl.name,
      'price', pl.price,
      'manualPrice', pl.manual_price,
      'currency', pl.currency
    ) end
  )
  from (select 1) as anchor
  left join public.promotion_campaigns ca on ca.id = p_code.campaign_id
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id
  left join public.membership_plans pl on pl.id = o.membership_plan_id;
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

do $verification$
begin
  if to_regprocedure('plu_private.release_unpaid_discount_redemption(uuid)') is null then
    raise exception 'La liberación de canjes impagos no quedó instalada.'
      using errcode = 'PLU01';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'release_discount_on_dead_order'
      and tgrelid = 'public.athlete_payment_orders'::regclass
      and not tgisinternal
  ) then
    raise exception 'El trigger de liberación de canjes no quedó instalado.'
      using errcode = 'PLU01';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'discount_code_redemptions'
      and grantee = 'service_role'
      and privilege_type = 'DELETE'
  ) then
    raise exception 'Falta el permiso de borrado sobre discount_code_redemptions.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
