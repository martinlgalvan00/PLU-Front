-- Ciclo de vida completo de las órdenes de entradas + lista de invitados — PLU ARG
--
-- Hasta acá una orden de entradas sólo podía ir hacia adelante:
-- `pendiente -> aprobado` (staff_approve_ticket_order) o
-- `pendiente -> rechazado` (reject_ticket_payment_order). No había vuelta
-- atrás para ninguna de las dos decisiones:
--
--   * Una orden aprobada por error (comprobante falso, transferencia que el
--     banco revirtió, persona que pidió la devolución) no se podía cancelar:
--     su QR seguía abriendo la puerta.
--   * Una orden rechazada por error, o vencida por el cron cuando el
--     comprobante llegó tarde, no se podía volver a aceptar: el comprador
--     tenía que comprar de nuevo.
--   * Una orden pendiente SIN comprobante no se podía cerrar a mano
--     (`reject` exige comprobante) y retenía cupo hasta el vencimiento.
--
-- Esta migración agrega:
--
--   1. Trazabilidad de cancelación y reactivación en `ticket_orders`.
--   2. Canal manual `courtesy`: entradas sin cargo de la lista de invitados.
--   3. `staff_cancel_ticket_order`: aprobada o abierta -> cancelado; revoca
--      los QR (tickets -> `cancelada`) y libera el cupo.
--   4. `staff_reinstate_ticket_order`: rechazada o cancelada -> aprobado;
--      vuelve a validar el cupo del evento y del tipo con el evento
--      bloqueado (mismo lock que create_ticket_order_v3) y reactiva los QR.
--   5. `staff_issue_guest_tickets`: emite entradas de cortesía, una orden por
--      invitado para que cada una se pueda cancelar sola.
--
-- Convive con la reapertura del equipo (20271117100000 / 20271117120000):
-- Reabrir/Acreditar es para lo que VENCIÓ EL CRON con comprobante. Volver a
-- aceptar es para lo que cerró una PERSONA (rechazo o cancelación del staff).
-- Un caso, un camino: `staff_reinstate_ticket_order` rechaza la vencida por el
-- cron y la deriva a Acreditar.
--
-- Mercado Pago queda afuera de 3 y 4 a propósito: `apply_ticket_mercado_pago_payment`
-- recalcula el estado de la orden con cada notificación del webhook, así que
-- una cancelación a mano se desharía sola con el próximo reintento. En MP la
-- cancelación es el reembolso desde Mercado Pago, que ya revoca los QR vía
-- webhook (`reembolsado` -> tickets `cancelada`).

-- ---------------------------------------------------------------------------
-- 1. Trazabilidad
-- ---------------------------------------------------------------------------

alter table public.ticket_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_from_status text,
  add column if not exists reinstated_at timestamptz,
  add column if not exists reinstated_by text,
  add column if not exists courtesy_label text;

comment on column public.ticket_orders.cancelled_from_status is
  'Estado que tenía la orden cuando el staff la canceló. Una orden que estaba '
  'aprobada se puede volver a aceptar sin comprobante: ya se había validado.';
comment on column public.ticket_orders.courtesy_label is
  'Categoría de la invitación (Prensa, Sponsor, Staff...). Sólo canal courtesy.';

-- ---------------------------------------------------------------------------
-- 2. Canal de cortesía
-- ---------------------------------------------------------------------------

alter table public.ticket_orders
  drop constraint if exists ticket_orders_manual_payment_channel_check;
alter table public.ticket_orders
  add constraint ticket_orders_manual_payment_channel_check
  check (
    manual_payment_channel is null
    or manual_payment_channel in ('bank_transfer', 'cash_pitbull', 'wise_transfer', 'courtesy')
  );

-- ---------------------------------------------------------------------------
-- Helper: cupo disponible para reactivar/emitir. Mismo criterio que
-- create_ticket_order_v3 (sólo credenciales primarias, todo lo no cancelado
-- ocupa lugar). El caller tiene que haber bloqueado la fila del evento.
-- `p_type_counts` es {ticket_type_id: cantidad}.
-- ---------------------------------------------------------------------------

create or replace function plu_private.assert_ticket_capacity(
  p_event_id uuid,
  p_total int,
  p_type_counts jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_reserved int;
  v_type public.ticket_types;
  v_requested int;
begin
  select limit_count into v_limit from public.event_capacity_rules
  where event_id = p_event_id and scope = 'event' and key = '';
  if v_limit is not null then
    select count(*) into v_reserved from public.tickets
    where event_id = p_event_id and status <> 'cancelada' and is_primary_credential;
    if v_reserved + p_total > v_limit then
      raise exception 'No queda cupo en el evento (% de % ocupados).', v_reserved, v_limit
        using errcode = 'PLU04';
    end if;
  end if;

  for v_type in
    select * from public.ticket_types where event_id = p_event_id and quota is not null
  loop
    v_requested := coalesce((p_type_counts ->> v_type.id::text)::int, 0);
    if v_requested = 0 then continue; end if;
    select count(*) into v_reserved from public.tickets
    where ticket_type_id = v_type.id and status <> 'cancelada' and is_primary_credential;
    if v_reserved + v_requested > v_type.quota then
      raise exception 'No queda cupo para % (% de % ocupados).', v_type.name, v_reserved, v_type.quota
        using errcode = 'PLU04';
    end if;
  end loop;
end;
$$;

revoke all on function plu_private.assert_ticket_capacity(uuid, int, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cancelar
-- ---------------------------------------------------------------------------

create or replace function public.staff_cancel_ticket_order(
  p_order_id uuid,
  p_reason text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_previous text;
  v_tickets jsonb;
  v_checked_in int;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'manual' then
    raise exception 'Una orden de Mercado Pago se cancela reembolsándola desde Mercado Pago.'
      using errcode = 'PLU01';
  end if;
  if v_order.status = 'cancelado' then
    select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status not in ('aprobado', 'pendiente', 'creado') then
    raise exception 'La orden ya está cerrada y no se puede cancelar.' using errcode = 'PLU03';
  end if;
  if v_order.status = 'aprobado' and v_reason is null then
    raise exception 'Indicá el motivo: el comprador lo recibe por mail.' using errcode = 'PLU01';
  end if;

  v_previous := v_order.status;

  select count(*) into v_checked_in
  from public.check_ins c join public.tickets t on t.id = c.ticket_id
  where t.order_id = p_order_id;

  update public.ticket_orders
  set status = 'cancelado',
      reservation_expires_at = null,
      cancelled_at = now(),
      cancelled_by = coalesce(p_actor, 'staff:desconocido'),
      cancellation_reason = v_reason,
      cancelled_from_status = v_previous,
      updated_at = now()
  where id = p_order_id returning * into v_order;

  update public.tickets set status = 'cancelada', updated_at = now()
  where order_id = p_order_id and status <> 'cancelada';

  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'ticket_order.cancelled', 'ticket_order', p_order_id::text, 'staff', p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'reason', v_reason,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'checkedInTickets', v_checked_in
    )
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'tickets', v_tickets,
    'previousStatus', v_previous,
    'checkedInTickets', v_checked_in,
    'duplicate', false
  );
end;
$$;

revoke all on function public.staff_cancel_ticket_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_cancel_ticket_order(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Volver a aceptar
-- ---------------------------------------------------------------------------

create or replace function public.staff_reinstate_ticket_order(
  p_order_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_previous text;
  v_tickets jsonb;
  v_total int;
  v_type_counts jsonb;
  v_had_approval boolean;
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago solo se acredita por webhook.' using errcode = 'PLU01';
  end if;
  if v_order.status = 'aprobado' then
    select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status not in ('rechazado', 'cancelado') then
    raise exception 'Sólo se vuelve a aceptar una orden rechazada o cancelada.' using errcode = 'PLU03';
  end if;
  -- Cancelada sin `cancelled_at` = la venció el cron, no una persona. Ese caso
  -- tiene su propio camino (staff_settle_cancelled_ticket_order), que exige
  -- comprobante y motivo: no se duplica acá.
  if v_order.status = 'cancelado' and v_order.cancelled_at is null then
    raise exception 'La venció el sistema: acreditala con "Acreditar".' using errcode = 'PLU03';
  end if;

  -- Misma evidencia que exige la aprobación: comprobante, salvo efectivo y
  -- cortesía (no generan archivo) o una orden que ya había sido aprobada
  -- antes de cancelarse (la validación ya se hizo).
  v_had_approval := v_order.cancelled_from_status = 'aprobado';
  if v_order.payment_proof_path is null
     and not v_had_approval
     and coalesce(v_order.manual_payment_channel, 'bank_transfer') not in ('cash_pitbull', 'courtesy') then
    raise exception 'La orden no tiene comprobante: cargá la venta desde "Venta manual".'
      using errcode = 'PLU03';
  end if;

  -- El cupo puede haberse vendido mientras la orden estuvo cerrada. Mismo
  -- lock que create_ticket_order_v3 para no sobrevender en carrera.
  perform 1 from public.events where id = v_order.event_id for update;

  -- Sólo lo que hoy no ocupa lugar (las cancelada de esta orden) se suma.
  select coalesce(sum(qty), 0)::int,
         coalesce(jsonb_object_agg(type_id, qty) filter (where type_id is not null), '{}'::jsonb)
    into v_total, v_type_counts
  from (
    select ticket_type_id::text as type_id, count(*) as qty
    from public.tickets
    where order_id = p_order_id and is_primary_credential and status = 'cancelada'
    group by ticket_type_id
  ) grouped;

  perform plu_private.assert_ticket_capacity(v_order.event_id, v_total, v_type_counts);

  v_previous := v_order.status;

  update public.ticket_orders
  set status = 'aprobado',
      reservation_expires_at = null,
      reinstated_at = now(),
      reinstated_by = coalesce(p_actor, 'staff:desconocido'),
      rejected_at = null,
      rejected_by = null,
      rejection_reason = null,
      cancelled_at = null,
      cancelled_by = null,
      cancellation_reason = null,
      cancelled_from_status = null,
      updated_at = now()
  where id = p_order_id returning * into v_order;

  update public.tickets set status = 'pagada', updated_at = now()
  where order_id = p_order_id and status <> 'pagada';

  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'ticket_order.reinstated', 'ticket_order', p_order_id::text, 'staff', p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'withoutProof', v_order.payment_proof_path is null
    )
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'tickets', v_tickets,
    'previousStatus', v_previous,
    'duplicate', false
  );
end;
$$;

revoke all on function public.staff_reinstate_ticket_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_reinstate_ticket_order(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Lista de invitados
--
-- `p_guests`: [{fullName, dni, email?}] (1..200). Una orden por invitado,
-- acreditada en el acto, con monto 0 y canal `courtesy`: cada invitación se
-- cancela sola desde Cobros y el mail de confirmación sale a quien
-- corresponde. Un DNI que ya tiene una entrada activa en el evento se omite
-- (subir dos veces la misma planilla no duplica).
--
-- No saltea el cupo: un invitado ocupa un lugar en la sala igual que
-- cualquiera. Sí saltea ventanas de venta y el interruptor de venta online:
-- es una decisión de la organización, no una compra.
-- ---------------------------------------------------------------------------

create or replace function public.staff_issue_guest_tickets(
  p_event_slug text,
  p_ticket_type_id uuid,
  p_guests jsonb,
  p_label text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_type public.ticket_types;
  v_guest jsonb;
  v_name text;
  v_dni text;
  v_email text;
  v_label text := nullif(left(trim(coalesce(p_label, '')), 60), '');
  v_order public.ticket_orders;
  v_ticket jsonb;
  v_order_tickets jsonb;
  v_issued jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_valid jsonb := '[]'::jsonb;
  v_credential public.ticket_type_credentials;
  v_bundle_id uuid;
  v_credential_index int;
  v_included_addons jsonb;
  v_catalog jsonb;
begin
  if jsonb_typeof(p_guests) <> 'array'
     or jsonb_array_length(p_guests) < 1
     or jsonb_array_length(p_guests) > 200 then
    raise exception 'La lista debe tener entre 1 y 200 invitados.' using errcode = 'PLU01';
  end if;

  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  if v_event.status in ('cerrado', 'finalizado') then
    raise exception 'El evento está cerrado.' using errcode = 'PLU03';
  end if;

  select * into v_type from public.ticket_types
  where id = p_ticket_type_id and event_id = v_event.id;
  if not found then
    raise exception 'Tipo de entrada inválido para este evento.' using errcode = 'PLU01';
  end if;

  -- Validación + deduplicación antes de tocar nada: la carga es todo o nada
  -- para los datos inválidos (el operador corrige la planilla) y tolerante
  -- para los duplicados (se informan, no frenan).
  for v_guest in select value from jsonb_array_elements(p_guests)
  loop
    v_name := trim(coalesce(v_guest ->> 'fullName', ''));
    v_dni := regexp_replace(coalesce(v_guest ->> 'dni', ''), '[^0-9]', '', 'g');
    v_email := lower(nullif(trim(coalesce(v_guest ->> 'email', '')), ''));
    if length(v_name) < 3 or v_dni !~ '^[0-9]{7,8}$' then
      raise exception 'Invitado inválido: "%" / DNI "%".', v_name, coalesce(v_guest ->> 'dni', '')
        using errcode = 'PLU01';
    end if;
    if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Email inválido para %.', v_name using errcode = 'PLU01';
    end if;

    if v_dni = any(v_seen) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'fullName', v_name, 'dni', v_dni, 'reason', 'duplicate_in_list'));
      continue;
    end if;
    v_seen := array_append(v_seen, v_dni);

    if exists (
      select 1 from public.tickets
      where event_id = v_event.id and attendee_dni = v_dni
        and status <> 'cancelada' and is_primary_credential
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'fullName', v_name, 'dni', v_dni, 'reason', 'already_has_ticket'));
      continue;
    end if;

    v_valid := v_valid || jsonb_build_array(jsonb_build_object(
      'fullName', v_name, 'dni', v_dni, 'email', v_email));
  end loop;

  if jsonb_array_length(v_valid) > 0 then
    perform plu_private.assert_ticket_capacity(
      v_event.id,
      jsonb_array_length(v_valid),
      jsonb_build_object(v_type.id::text, jsonb_array_length(v_valid))
    );
  end if;

  v_catalog := public.event_ticket_addons_catalog(v_event.rules);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', addon ->> 'id', 'label', addon ->> 'label', 'price', 0,
    'redeemLabel', addon ->> 'redeemLabel', 'redeemedAt', null, 'included', true
  )), '[]'::jsonb)
  into v_included_addons
  from jsonb_array_elements(v_catalog) addon
  where addon ->> 'id' in (
    select addon_id from public.ticket_type_included_addons where ticket_type_id = v_type.id
  );

  for v_guest in select value from jsonb_array_elements(v_valid)
  loop
    insert into public.ticket_orders (
      event_id, buyer_name, buyer_email, amount, currency, provider,
      manual_payment_channel, status, reference, idempotency_key, access_token_hash,
      reservation_expires_at, courtesy_label
    ) values (
      v_event.id, v_guest ->> 'fullName', v_guest ->> 'email', 0, v_event.currency, 'manual',
      'courtesy', 'aprobado',
      'TORD-' || encode(extensions.gen_random_bytes(8), 'hex'),
      'guest:' || gen_random_uuid()::text,
      -- Nadie conoce el token: el invitado recibe su QR y su código de puerta
      -- por mail; sin mail, en la puerta se lo encuentra por DNI.
      encode(extensions.gen_random_bytes(32), 'hex'),
      null, v_label
    ) returning * into v_order;

    v_bundle_id := gen_random_uuid();
    v_credential_index := 0;
    v_order_tickets := '[]'::jsonb;

    for v_credential in
      select * from public.ticket_type_credentials
      where ticket_type_id = v_type.id
      order by sort_order, created_at
    loop
      insert into public.tickets (
        ticket_code, order_id, event_id, attendee_name, attendee_dni,
        ticket_type_id, unit_price, addons, status,
        credential_label, credential_scopes, bundle_id, is_primary_credential
      ) values (
        'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
        v_order.id, v_event.id, v_guest ->> 'fullName', v_guest ->> 'dni', v_type.id, 0,
        case when v_credential_index = 0 then v_included_addons else '[]'::jsonb end,
        'pagada', v_credential.label, v_credential.zone_scopes, v_bundle_id,
        v_credential_index = 0
      ) returning to_jsonb(tickets) into v_ticket;
      v_order_tickets := v_order_tickets || jsonb_build_array(v_ticket);
      v_credential_index := v_credential_index + 1;
    end loop;

    if v_credential_index = 0 then
      insert into public.tickets (
        ticket_code, order_id, event_id, attendee_name, attendee_dni,
        ticket_type_id, unit_price, addons, status,
        credential_label, credential_scopes, bundle_id, is_primary_credential
      ) values (
        'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
        v_order.id, v_event.id, v_guest ->> 'fullName', v_guest ->> 'dni', v_type.id, 0,
        v_included_addons, 'pagada', 'Entrada general', array['gate_tickets'], v_bundle_id, true
      ) returning to_jsonb(tickets) into v_ticket;
      v_order_tickets := v_order_tickets || jsonb_build_array(v_ticket);
    end if;

    insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
    values (
      'ticket_order.guest_issued', 'ticket_order', v_order.id::text, 'staff', p_actor,
      jsonb_build_object('eventId', v_event.id, 'ticketTypeId', v_type.id, 'label', v_label)
    );

    v_issued := v_issued || jsonb_build_array(jsonb_build_object(
      'order', to_jsonb(v_order), 'tickets', v_order_tickets));
  end loop;

  return jsonb_build_object(
    'event', jsonb_build_object('id', v_event.id, 'slug', v_event.slug, 'title', v_event.title),
    'issued', v_issued,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.staff_issue_guest_tickets(text, uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_issue_guest_tickets(text, uuid, jsonb, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if to_regprocedure('public.staff_cancel_ticket_order(uuid,text,text)') is null
     or to_regprocedure('public.staff_reinstate_ticket_order(uuid,text)') is null
     or to_regprocedure('public.staff_issue_guest_tickets(text,uuid,jsonb,text,text)') is null then
    raise exception 'La verificación del ciclo de vida de órdenes de entradas no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
