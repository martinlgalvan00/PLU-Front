-- Una orden abierta que se reanuda se recotiza con el código de ESTE pedido — PLU ARG
--
-- Incidente reproducido con datos reales (Pitbull Classic 2026, 31/08/2026):
-- el atleta tenía una inscripción `pendiente_pago` cuya orden se había creado
-- con `ONLY-PITBULL` (precio fijo 85.000). Después canjeó `ONLY-PITBULL-MP2026`
-- (precio fijo 92.500, sólo Mercado Pago) y el checkout anunció 92.500 — el
-- preview lo resolvía bien: base 100.000 − 7.500. Al confirmar volvió una orden
-- de 85.000 con el código viejo, que además ya estaba archivado.
--
-- La cadena, entera:
--   1. `create_competition_registration_v2` no crea una orden nueva: reanuda la
--      abierta (`resume_pending_event_registration_checkout`), que puede incluso
--      cambiarle el medio de pago y NUNCA toca `amount`.
--   2. `create_competition_registration_v3` le pide a
--      `apply_discount_code_to_order` que aplique el código del pedido, pero esa
--      función corta en la primera línea con
--      `{applied: false, reason: 'already_applied'}` porque la orden ya tiene
--      `discount_code_id`. El wrapper la llama con `perform`: nadie lee el
--      motivo, así que el rechazo es silencioso.
--   3. `settle_manual_checkout_pricing` recotiza el canal usando el código que
--      TIENE la orden —no el que pidió el atleta—, y lo busca sin filtrar
--      `archived_at`: 100.000 − (100.000 − 85.000) = 85.000.
--
-- Resultado: el checkout dice un número y la orden cobra otro, con un código
-- retirado del catálogo. Y como el código nuevo nunca se aplica, su matriz de
-- canales tampoco rige: la restricción "sólo Mercado Pago" no llegaba a existir
-- en la orden.
--
-- El arreglo es una sola regla: **una orden abierta que se reanuda se recotiza
-- con el código de este pedido**. Si el que quedó pegado es otro —o dejó de ser
-- vendible: apagado, archivado, fuera de ventana—, se suelta (devolviendo su
-- cupo y el importe base) antes de aplicar el nuevo. Y si el código del pedido
-- no se puede aplicar, la orden se cae con un motivo, nunca en silencio.
--
-- No se toca `settle_manual_checkout_pricing` a propósito: con la orden ya
-- recotizada nunca vuelve a ver un código ajeno, y su rama de fallback
-- (conservar el descuento absoluto cuando el código no existe) es peor que su
-- rama normal para un cambio de canal.

-- ---------------------------------------------------------------------------
-- 1. Soltar el código de una orden abierta
--
-- Devuelve el cupo (borra la redención) y el importe base (`amount +
-- discount_amount`, que es exactamente la base sobre la que se cotizó). No
-- inventa el precio de catálogo: `settle_manual_checkout_pricing` lo resuelve
-- después contra el canal, igual que para una orden recién creada.
--
-- Una orden con comprobante subido, con pago declarado o con un intento de
-- pasarela en vuelo NO se suelta: ese importe es el que Finanzas o Mercado Pago
-- están mirando. Se devuelve tal cual y quien llama decide.
--
-- La preferencia de Mercado Pago sí se anula: una preferencia emitida por otro
-- importe es justamente lo que no se puede reusar. Es el mismo mecanismo que ya
-- usa `resume_pending_event_registration_checkout` cuando cambia el medio de
-- pago (`provider_preference_id = null`, 20260817120000) — null significa "la
-- próxima creación emite una nueva"—, y el criterio de corte es el mismo que
-- usa esa función para decidir si puede tocar la orden: ningún intento
-- embebido en `processing` ni en `submitted`.
-- ---------------------------------------------------------------------------

create or replace function plu_private.release_order_discount(p_order_id uuid)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_released int;
  v_code text;
  v_had_preference boolean;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.discount_code_id is null then
    return v_order;
  end if;
  if v_order.status not in ('creado', 'pendiente', 'validacion_manual')
     or v_order.payment_proof_path is not null
     or v_order.manual_payment_declared_at is not null
     or exists (
       select 1
       from public.embedded_payment_attempts a
       where a.order_kind = 'athlete'
         and a.order_id = v_order.id
         and a.status in ('processing', 'submitted')
     ) then
    return v_order;
  end if;

  v_released := coalesce(v_order.discount_amount, 0);
  v_code := v_order.discount_code;
  v_had_preference := v_order.provider_preference_id is not null;

  delete from public.discount_code_redemptions
  where payment_order_id = v_order.id;

  update public.athlete_payment_orders
  set amount = amount + v_released,
      discount_code_id = null,
      discount_code = null,
      discount_amount = 0,
      provider_preference_id = null,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'payment_order.discount_released',
    'payment_order',
    v_order.id::text,
    'athlete',
    v_order.athlete_id::text,
    jsonb_build_object(
      'releasedCode', v_code,
      'releasedDiscount', v_released,
      'amount', v_order.amount,
      'preferenceCleared', v_had_preference,
      'reason', 'requote_on_resume'
    ),
    v_order.organization_id
  );

  return v_order;
end;
$$;

revoke all on function plu_private.release_order_discount(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recotizar una orden contra el código de este pedido
--
-- Reemplaza la llamada pelada a `apply_discount_code_to_order` en los tres
-- wrappers de alta. Para una orden recién creada (sin código) el comportamiento
-- es idéntico al anterior, incluido el camino automático de la promo pública
-- cuando `p_code` viene nulo.
-- ---------------------------------------------------------------------------

create or replace function plu_private.requote_open_order(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_order_id uuid,
  p_applies_to text,
  p_code text
)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_wanted text := nullif(upper(trim(coalesce(p_code, ''))), '');
  v_current text;
  v_sellable boolean;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.discount_code_id is not null then
    v_current := nullif(upper(trim(coalesce(v_order.discount_code, ''))), '');
    -- Un código archivado o apagado no puede seguir cotizando una orden
    -- abierta: en el incidente, `ONLY-PITBULL` se retiró del catálogo y su
    -- precio siguió aplicándose durante horas.
    select c.active
       and c.archived_at is null
       and (c.starts_at is null or c.starts_at <= now())
       and (c.expires_at is null or c.expires_at >= now())
      into v_sellable
    from public.discount_codes c
    where c.id = v_order.discount_code_id;

    if v_current is distinct from v_wanted or not coalesce(v_sellable, false) then
      v_order := plu_private.release_order_discount(v_order.id);
    end if;
  end if;

  if v_order.discount_code_id is not null then
    -- Quedó el mismo código que trae el pedido: no se vuelve a redimir (el
    -- unique de (código, atleta) es el que protege una SEGUNDA compra) y el
    -- canal lo recotiza `settle_manual_checkout_pricing`.
    if v_current is distinct from v_wanted then
      -- No se pudo soltar: la orden ya tiene comprobante, pago declarado o un
      -- intento de pasarela en vuelo. Cobrarla con el código viejo mientras el
      -- checkout anuncia el nuevo es exactamente el incidente, así que se corta
      -- acá con un motivo que la pantalla puede explicar en vez de cobrar otro
      -- número en silencio.
      raise exception 'Tenés un pago en curso con el código %; completalo, cancelalo o esperá su revisión antes de usar otro código.',
        coalesce(v_current, 'anterior')
        using errcode = 'PLU30';
    end if;
    return v_order;
  end if;

  perform public.apply_discount_code_to_order(
    p_organization_id, p_athlete_id, v_order.id, p_applies_to, p_code
  );
  select * into v_order from public.athlete_payment_orders where id = v_order.id;

  -- `apply_discount_code_to_order` levanta PLU2x para cada rechazo de un código
  -- tipeado, así que llegar acá sin código aplicado sería un contrato roto —no
  -- una compra sin cupón—. Se afirma en vez de dejar pasar la divergencia que
  -- originó el incidente.
  if v_wanted is not null and v_order.discount_code_id is null then
    raise exception 'El código % no se pudo aplicar a esta orden.', v_wanted
      using errcode = 'PLU20';
  end if;

  return v_order;
end;
$$;

revoke all on function plu_private.requote_open_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Inscripción suelta — el camino del incidente
-- ---------------------------------------------------------------------------

create or replace function public.create_competition_registration_v3(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  perform 1 from public.athletes where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  v_result := public.create_competition_registration_v2(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key
  );

  select * into v_order from public.athlete_payment_orders
  where id = (v_result -> 'order' ->> 'id')::uuid for update;

  v_order := plu_private.requote_open_order(
    v_order.organization_id, p_athlete_id, v_order.id, 'registration', p_discount_code
  );

  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_competition_registration_v3(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_v3(
  uuid, text, text, text, numeric, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Afiliación — mismo agujero: `create_membership_order_v2` reusa la orden
--    abierta del mismo plan y del mismo medio tal cual.
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_v4(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_plan from public.membership_plans
  where organization_id = v_athlete.organization_id and code = p_plan_code and active = true;
  if not found
     or v_plan.effective_from > now()
     or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
    raise exception 'El plan de afiliación no está vigente.' using errcode = 'PLU03';
  end if;

  v_result := public.create_membership_order_v3(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key
  );

  select * into v_order from public.athlete_payment_orders
  where id = (v_result -> 'order' ->> 'id')::uuid for update;

  v_order := plu_private.requote_open_order(
    v_order.organization_id, p_athlete_id, v_order.id, 'membership', p_discount_code
  );

  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_order_v4(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_v4(uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Combo (afiliación + inscripción) — los dos mismos puntos de aplicación.
--
-- Cuerpo de 20260823170000 con las dos llamadas a `apply_discount_code_to_order`
-- reemplazadas por la recotización. La oferta combo está archivada hoy, pero el
-- agujero es idéntico: `create_membership_registration_combo_order_core` también
-- reanuda la orden abierta sin tocar `amount`.
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_registration_combo_order(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_athlete public.athletes;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_plan public.membership_plans;
  v_offer public.event_combo_offers;
  v_event_slug text;
  v_result jsonb;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;

  -- El reintento depende de los recursos ya creados, no del estado actual de
  -- la oferta. Asi una respuesta de red perdida se puede recuperar aunque la
  -- promo haya cerrado entre ambos requests.
  select * into v_order
  from public.athlete_payment_orders
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    select r.* into v_registration
    from public.event_registrations r
    where r.payment_order_id = v_order.id;

    select e.slug into v_event_slug
    from public.events e
    where e.id = v_registration.event_id;

    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;

    select * into v_plan
    from public.membership_plans
    where id = v_order.plan_id;

    select * into v_offer
    from public.event_combo_offers
    where event_id = v_registration.event_id;

    if v_order.athlete_id <> p_athlete_id
       or v_order.concept <> 'combo'
       or v_order.method <> p_payment_method
       or v_registration.id is null
       or v_membership.id is null
       or v_plan.id is null
       or v_event_slug <> p_event_slug
       or v_registration.division <> p_division
       or v_registration.category <> p_category
       or v_registration.bodyweight_kg is distinct from p_bodyweight_kg then
      raise exception 'La clave de idempotencia pertenece a otra operacion.' using errcode = 'PLU13';
    end if;

    -- Recotización, no aplicación pelada (20261019130000): la orden que se
    -- reanuda puede traer pegado otro código —o uno ya archivado— y
    -- `apply_discount_code_to_order` cortaba con 'already_applied' en silencio.
    v_order := plu_private.requote_open_order(
      v_order.organization_id, p_athlete_id, v_order.id, 'combo', p_discount_code
    );

    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'plan', to_jsonb(v_plan),
      'comboOffer', case when v_offer.id is null then null else to_jsonb(v_offer) end,
      'duplicate', true
    );
  end if;

  select * into v_athlete
  from public.athletes
  where id = p_athlete_id
  for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;

  if exists (
    select 1
    from public.memberships m
    where m.athlete_id = p_athlete_id
      and m.status = 'activa'
      and (
        m.start_date > current_date
        or coalesce(m.expiration_date, current_date) >= current_date
      )
  ) then
    raise exception 'El atleta ya tiene una afiliacion vigente o programada.'
      using errcode = 'PLU13';
  end if;

  if exists (
    select 1
    from public.athlete_payment_orders o
    join public.membership_order_targets t on t.order_id = o.id
    join public.memberships m on m.id = t.membership_id
    where m.athlete_id = p_athlete_id
      and o.concept = 'membership'
      and o.status in ('pendiente', 'validacion_manual')
      and (
        o.provider_preference_id is not null
        or o.payment_proof_path is not null
        or exists (
          select 1
          from public.embedded_payment_attempts a
          where a.order_kind = 'athlete'
            and a.order_id = o.id
            and a.status in ('processing', 'submitted')
        )
      )
  ) then
    raise exception 'Ya existe un pago de afiliacion en curso; completalo o espera su vencimiento.'
      using errcode = 'PLU13';
  end if;

  v_result := public.create_membership_registration_combo_order_core(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key
  );

  -- Ídem para la orden que reanuda el core (`resume_pending_event_registration_checkout`).
  v_order := plu_private.requote_open_order(
    v_athlete.organization_id, p_athlete_id, (v_result -> 'order' ->> 'id')::uuid, 'combo', p_discount_code
  );

  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Verificación: las dos funciones nuevas quedaron definidas y los TRES
--    wrappers de alta pasan por la recotización en vez de por la llamada
--    pelada. El `like` es la guarda contra copiar un cuerpo viejo encima, el
--    mismo criterio que usa 20261001100000 con PLU28.
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_name text;
  v_def text;
  v_checked int := 0;
begin
  if to_regprocedure('plu_private.release_order_discount(uuid)') is null
     or to_regprocedure('plu_private.requote_open_order(uuid,uuid,uuid,text,text)') is null then
    raise exception 'Faltan las funciones de recotización.' using errcode = 'PLU01';
  end if;

  -- Sólo las sobrecargas que reciben `p_discount_code`: de
  -- `create_membership_registration_combo_order` sobrevive también la versión de
  -- 7 argumentos anterior a los cupones (20260812150000), que nunca aplicó
  -- ningún código y no tiene nada que recotizar.
  for v_name, v_def in
    select p.proname, pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_competition_registration_v3',
        'create_membership_order_v4',
        'create_membership_registration_combo_order'
      )
      and pg_get_function_identity_arguments(p.oid) like '%p_discount_code%'
  loop
    v_checked := v_checked + 1;
    if v_def not like '%requote_open_order%' then
      raise exception '% volvió a la llamada pelada a apply_discount_code_to_order.', v_name
        using errcode = 'PLU01';
    end if;
    if v_def like '%perform public.apply_discount_code_to_order%' then
      raise exception '% todavía aplica el código sin recotizar la orden abierta.', v_name
        using errcode = 'PLU01';
    end if;
  end loop;

  if v_checked < 3 then
    raise exception 'Faltan wrappers de alta por verificar: sólo se encontraron %.', v_checked
      using errcode = 'PLU01';
  end if;
end
$verification$;
