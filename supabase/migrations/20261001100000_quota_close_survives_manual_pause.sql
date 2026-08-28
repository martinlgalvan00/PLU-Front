-- El cierre por cupo lleva sello, y la pausa manual lo respeta — PLU ARG
--
-- Validación del ciclo de vida de códigos (28/08/2026): dos huecos alrededor
-- del cupo (max_redemptions).
--
-- 1. **La liberación de un canje impago podía revivir una pausa manual.**
--    `release_unpaid_discount_redemption` (20260906100000) reabre el código
--    cuando se libera el último lugar de un cupo lleno, pero su única
--    distinción era archived/expired: si staff había pausado el código A MANO
--    (radio "off" del panel) estando el cupo lleno, la próxima orden muerta lo
--    volvía a prender contra la decisión del panel. La causa: `active = false`
--    no decía POR QUÉ. Se agrega `quota_closed_at`: lo sella el autocierre de
--    `apply_discount_code_to_order`, lo borra cualquier decisión manual de
--    `staff_set_discount_code_state`, y la reapertura sólo actúa si está
--    puesto.
--
-- 2. **Bajar el tope por debajo de lo ya canjeado dejaba el código prendido.**
--    `staff_upsert_discount_code` sólo valida `max_redemptions > 0`; achicar
--    el cupo a menos de `redeemedCount` dejaba `active = true` y el cartel de
--    "agotado" aparecía recién cuando un atleta chocaba en el checkout (PLU21).
--    Un trigger chico cierra el código en la misma escritura que achica el
--    cupo — que es exactamente el gesto de operaciones "ya canjearon N, que a
--    partir de acá deje de usarse": poner el tope en N lo apaga al instante.
--
-- Las tres funciones se re-emiten copiando el cuerpo VIGENTE (20260908100000,
-- 20260827110000, 20260906100000) con el delta mínimo — este archivo fue
-- ensamblado programáticamente desde esas fuentes para no repetir el incidente
-- de 20260922100000 (re-emitir desde una versión vieja pisó cuerpos vigentes).

-- ---------------------------------------------------------------------------
-- 1. El sello
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists quota_closed_at timestamptz;

comment on column public.discount_codes.quota_closed_at is
  'Cuándo el autocierre por cupo lleno apagó este código. Null con active=false = pausa manual de staff: la liberación de canjes no lo reabre.';

-- Backfill: los códigos hoy apagados cuyo conteo llena el cupo se tratan como
-- autocerrados — es exactamente la firma que la reapertura usaba hasta ahora,
-- así que el comportamiento de lo ya existente no cambia. La protección nueva
-- rige para las pausas manuales que se hagan de acá en adelante.
update public.discount_codes c
set quota_closed_at = now()
where c.active = false
  and c.archived_at is null
  and c.max_redemptions is not null
  and c.quota_closed_at is null
  and (
    select count(*) from public.discount_code_redemptions r
    where r.discount_code_id = c.id
  ) >= c.max_redemptions;

-- ---------------------------------------------------------------------------
-- 2. El autocierre sella (cuerpo de 20260908100000 + quota_closed_at)
-- ---------------------------------------------------------------------------

create or replace function public.apply_discount_code_to_order(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_order_id uuid,
  p_applies_to text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_order public.athlete_payment_orders;
  v_promo_id uuid;
  v_discount int;
  v_redeemed int;
  v_order_event_id uuid;
  v_quota_exhausted boolean := false;
  -- Sin código pedido, la promo pública decide sola y nunca levanta excepción.
  v_automatic boolean := p_code is null or length(trim(p_code)) = 0;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.discount_code_id is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;

  if v_automatic then
    v_code := plu_private.resolve_public_promo(
      p_organization_id, p_applies_to, p_athlete_id, v_order.amount, v_order.method
    );
    if v_code.id is null then
      return null;
    end if;
    -- Relectura bajo lock: entre el resolver y acá otra transacción pudo
    -- llevarse el último cupo o apagar la promo desde el panel.
    v_promo_id := v_code.id;
    select * into v_code from public.discount_codes where id = v_promo_id for update;
    if not found or v_code.audience <> 'public' or v_code.archived_at is not null
       or (v_code.starts_at is not null and v_code.starts_at > now())
       or (v_code.expires_at is not null and v_code.expires_at < now()) then
      return null;
    end if;
  else
    -- El lock serializa el conteo y la inserción del último cupo.
    select * into v_code from public.discount_codes
    where organization_id = p_organization_id
      and code = upper(trim(p_code))
      and archived_at is null
    for update;
    if not found
       or v_code.applies_to not in (p_applies_to, 'both')
       or (v_code.expires_at is not null and v_code.expires_at < now()) then
      raise exception 'El código no es válido.' using errcode = 'PLU20';
    end if;
    -- Una promo programada todavía no empezó: es un error distinto de "venció"
    -- y de "no existe", porque el código sí sirve —más tarde.
    if v_code.starts_at is not null and v_code.starts_at > now() then
      raise exception 'Ese código todavía no está vigente.' using errcode = 'PLU25';
    end if;
  end if;

  -- Alcance por inscripción. Se compara contra el evento de la inscripción que
  -- ESTA orden ya creó (plu_private.order_event_id), no contra el slug que
  -- mandó el navegador: es la única lectura que no se puede falsificar desde el
  -- cliente. Una orden sin inscripción (afiliación sola) da null y también
  -- queda afuera, que es lo correcto para un código atado a un evento.
  if v_code.event_id is not null then
    v_order_event_id := plu_private.order_event_id(v_order.id);
    if v_order_event_id is distinct from v_code.event_id then
      if v_automatic then return null; end if;
      raise exception 'Ese código es de otra inscripción.' using errcode = 'PLU27';
    end if;
  end if;

  -- La invitación se chequea después del lock también en el camino automático:
  -- el resolver ya filtró, pero la lista pudo cambiar entre el resolver y acá.
  if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
    if v_automatic then return null; end if;
    raise exception 'Ese código está reservado para otras cuentas.' using errcode = 'PLU26';
  end if;

  if v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = v_code.id;
    if v_redeemed >= v_code.max_redemptions then
      if v_automatic then return null; end if;
      raise exception 'El código alcanzó el máximo de usos.' using errcode = 'PLU21';
    end if;
  end if;

  if not v_code.active then
    if v_automatic then return null; end if;
    raise exception 'El código no es válido.' using errcode = 'PLU20';
  end if;

  -- Cierre de canal por código, la única guarda de canal que se puede verificar
  -- acá. `manual_channels` ABRE canales y su lista vacía no prohíbe nada —con
  -- transferencia abierta desde Administración, un cupón de porcentaje se paga
  -- por transferencia sin declarar ningún canal—, así que compararla contra el
  -- medio de la orden rechazaría compras legítimas. `mercado_pago_enabled =
  -- false` es lo contrario: una prohibición explícita del código, y por eso sí
  -- se valida dentro de la transacción que crea la orden. Express corta antes
  -- con el mensaje bueno; esto cubre el POST directo a la RPC.
  --
  -- El camino automático no llega acá con la pasarela cerrada
  -- (discount_codes_public_channel_check lo impide), pero devuelve null igual
  -- que el resto de los rechazos: una promo pública nunca voltea una compra.
  if v_order.method = 'mercado_pago' and not v_code.mercado_pago_enabled then
    if v_automatic then return null; end if;
    raise exception 'Ese código no se puede pagar con Mercado Pago.' using errcode = 'PLU28';
  end if;

  v_discount := plu_private.resolve_discount_amount(
    v_order.amount, v_code.kind, v_code.percent_off,
    plu_private.effective_fixed_price(v_order.method, v_code.fixed_price, v_code.fixed_price_manual)
  )::int;

  -- Un código 'access' da 0 a propósito: no es "no mejora el precio", es un
  -- desbloqueo. 'offer' sí tiene que mejorar: si su precio quedó por encima del
  -- combo, la oferta está mal cargada y es mejor que falle acá que cobrar el
  -- precio de lista anunciando una oferta.
  if v_code.kind <> 'access' and v_discount <= 0 then
    if v_automatic then return null; end if;
    raise exception 'El código no mejora el precio de esta compra.' using errcode = 'PLU24';
  end if;
  if v_discount >= v_order.amount then
    if v_automatic then return null; end if;
    raise exception 'El código no se puede aplicar a este importe.' using errcode = 'PLU01';
  end if;

  begin
    insert into public.discount_code_redemptions(
      organization_id, discount_code_id, athlete_id, payment_order_id, discount_amount
    ) values (p_organization_id, v_code.id, p_athlete_id, v_order.id, v_discount);
  exception when unique_violation then
    if v_automatic then return null; end if;
    raise exception 'Ya usaste este código.' using errcode = 'PLU22';
  end;

  update public.athlete_payment_orders
  set amount = amount - v_discount,
      discount_code_id = v_code.id,
      discount_code = v_code.code,
      discount_amount = v_discount,
      updated_at = now()
  where id = v_order.id;

  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    update public.discount_codes
    set active = false, quota_closed_at = now(), updated_at = now()
    where id = v_code.id;
    v_quota_exhausted := true;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.redeemed', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object(
      'discountCodeId', v_code.id,
      'code', v_code.code,
      'kind', v_code.kind,
      'audience', v_code.audience,
      'eventId', v_code.event_id,
      'source', case when v_automatic then 'public_promo' else 'code' end,
      'paymentMethod', v_order.method,
      'discountAmount', v_discount,
      'quotaExhausted', v_quota_exhausted
    ),
    p_organization_id
  );

  return jsonb_build_object(
    'applied', true,
    'discountAmount', v_discount,
    'code', v_code.code,
    'kind', v_code.kind,
    'audience', v_code.audience,
    'source', case when v_automatic then 'public_promo' else 'code' end
  );
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. La decisión manual borra el sello (cuerpo de 20260827110000)
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_discount_code_state(
  p_code_id uuid,
  p_active boolean,
  p_audience text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_before jsonb;
  v_audience text;
  v_redeemed int;
begin
  select * into v_code from public.discount_codes where id = p_code_id for update;
  if not found then
    raise exception 'La promoción no existe.' using errcode = 'PLU02';
  end if;
  if v_code.archived_at is not null then
    raise exception 'La promoción está archivada.' using errcode = 'PLU02';
  end if;
  v_before := to_jsonb(v_code);
  v_audience := coalesce(nullif(trim(coalesce(p_audience, '')), ''), v_code.audience);

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia de la promoción es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience = 'public' and cardinality(v_code.manual_channels) > 0 then
    raise exception 'Esta promoción habilita medios de pago manuales: no puede ser pública. Quitá los canales o abrilos desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  if p_active and v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = p_code_id;
    if v_redeemed >= v_code.max_redemptions then
      raise exception 'La promoción agotó su cupo (% de %). Ampliá el cupo para volver a habilitarla.',
        v_redeemed, v_code.max_redemptions using errcode = 'PLU21';
    end if;
  end if;

  update public.discount_codes
  set active = p_active,
      audience = v_audience,
      -- La decisión manual borra el sello del autocierre: una pausa de staff no
      -- es un cierre por cupo, y una reactivación (que sólo pasa con cupo libre)
      -- tampoco debe dejarlo pegado.
      quota_closed_at = null,
      updated_at = now()
  where id = p_code_id
  returning * into v_code;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.status_changed', 'discount_code', v_code.id::text, 'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_code)), v_code.organization_id
  );

  return to_jsonb(v_code);
end;
$$;

revoke all on function public.staff_set_discount_code_state(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_discount_code_state(uuid, boolean, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. La reapertura respeta la pausa manual (cuerpo de 20260906100000)
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
     -- El sello dice POR QUÉ está apagado: sólo se reabre lo que cerró el
     -- autocierre por cupo. Una pausa manual de staff (quota_closed_at null)
     -- sobrevive a la liberación aunque el cupo vuelva a tener lugar.
     and v_code.quota_closed_at is not null
     and v_code.archived_at is null
     and (v_code.expires_at is null or v_code.expires_at > now())
     and v_before >= v_code.max_redemptions
     and v_after < v_code.max_redemptions then
    update public.discount_codes
    set active = true, quota_closed_at = null, updated_at = now()
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
        and v_code.quota_closed_at is not null
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
-- 5. Achicar el cupo por debajo de lo canjeado apaga el código ahí mismo
--
-- Trigger y no re-emisión de staff_upsert_discount_code: cubre cualquier
-- escritor presente o futuro de max_redemptions, y no arriesga los ~400
-- renglones de la función de alta/edición. before update: si el tope nuevo ya
-- está cubierto por los canjes existentes, la misma fila se guarda cerrada y
-- sellada. No toca inserts (un código nuevo no tiene canjes) ni el camino en
-- que el tope no cambia.
-- ---------------------------------------------------------------------------

create or replace function plu_private.close_discount_code_on_quota_shrink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.max_redemptions is not null
     and new.active
     and (
       select count(*) from public.discount_code_redemptions r
       where r.discount_code_id = new.id
     ) >= new.max_redemptions then
    new.active := false;
    new.quota_closed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function plu_private.close_discount_code_on_quota_shrink()
  from public, anon, authenticated;

drop trigger if exists discount_codes_quota_shrink_close on public.discount_codes;
create trigger discount_codes_quota_shrink_close
  before update of max_redemptions on public.discount_codes
  for each row
  when (old.max_redemptions is distinct from new.max_redemptions)
  execute function plu_private.close_discount_code_on_quota_shrink();

-- ---------------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_def text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'quota_closed_at'
  ) then
    raise exception 'Falta discount_codes.quota_closed_at.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_discount_code_to_order';
  if v_def not like '%quota_closed_at = now()%' then
    raise exception 'El autocierre por cupo no sella quota_closed_at.';
  end if;
  -- La re-emisión tiene que seguir siendo la de 20260908 (guarda PLU28).
  if v_def not like '%PLU28%' then
    raise exception 'apply_discount_code_to_order perdió la guarda de Mercado Pago (PLU28): se copió un cuerpo viejo.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'staff_set_discount_code_state';
  if v_def not like '%quota_closed_at = null%' then
    raise exception 'El cambio manual de estado no borra el sello del autocierre.';
  end if;
  if v_def not like '%agotó su cupo%' then
    raise exception 'staff_set_discount_code_state perdió el rechazo de reactivación sin cupo: se copió un cuerpo viejo.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'release_unpaid_discount_redemption';
  if v_def not like '%quota_closed_at is not null%' then
    raise exception 'La reapertura de cupo no exige el sello del autocierre.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'discount_codes_quota_shrink_close'
      and tgrelid = 'public.discount_codes'::regclass
  ) then
    raise exception 'Falta el trigger que cierra el código al achicar el cupo.';
  end if;
end
$verification$;
