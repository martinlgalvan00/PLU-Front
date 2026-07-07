-- Fase 1: funciones RPC que reemplazan server/modules/ticketing/*Workflow.js.
-- Unica via de escritura para ticket_orders/tickets/check_ins (las tablas
-- quedan sin policies de insert/update para anon/authenticated, ver
-- 20260706030100_phase1_rls.sql). SECURITY DEFINER + search_path fijo.
--
-- Los parametros usan prefijo p_ a proposito: si un parametro tuviera el
-- mismo nombre que una columna de una tabla referenciada en la misma
-- sentencia (ej. qr_token, order_id, registration_id -- las tres son
-- columnas reales), PL/pgSQL trata la comparacion como ambigua.

-- Roles que hoy tienen CHECKIN_ROLES en server/routes/tickets.js -- todos
-- menos viewer_plu_usa (lectura para PLU USA, sin permiso de check-in).
create or replace function public.can_check_in()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'seguridad_plu_arg')
  );
$$;

-- Precio por dia hardcodeado, espejando TICKET_PRICE_BY_DAY en
-- server/modules/ticketing/ticketWorkflow.js (mismo TODO: mover a un
-- campo real en events cuando el catalogo de precios lo necesite).
create or replace function public.ticket_price_for_day_pass(p_day_pass text)
returns int
language sql
immutable
as $$
  select case p_day_pass when 'both' then 20000 else 12000 end;
$$;

-- ---------------------------------------------------------------------
-- create_ticket_order: compra publica (sin cuenta), un Ticket por
-- asistente + un TicketOrder, todo en una transaccion.
-- ---------------------------------------------------------------------
create or replace function public.create_ticket_order(
  p_event_slug text,
  p_attendees jsonb,
  p_buyer jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_order public.ticket_orders;
  v_amount int;
  v_attendee jsonb;
  v_day_pass text;
  v_ticket_code text;
  v_start_count int;
  v_index int := 0;
  v_ticket_json jsonb;
  v_tickets jsonb := '[]'::jsonb;
  v_dp text;
begin
  if p_attendees is null or jsonb_array_length(p_attendees) = 0 then
    raise exception 'La compra necesita al menos un asistente.' using errcode = 'PLU01';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if v_event.ticket_sales_opens_at is not null and now() < v_event.ticket_sales_opens_at then
    raise exception 'La venta de entradas todavia no abrio.' using errcode = 'PLU03';
  end if;
  if v_event.ticket_sales_closes_at is not null and now() > v_event.ticket_sales_closes_at then
    raise exception 'La venta de entradas ya cerro.' using errcode = 'PLU03';
  end if;

  -- Bloquear las filas de reglas de cupo involucradas (evento + cada
  -- day_pass pedido) ANTES de contar: serializa compras concurrentes
  -- contra el mismo limite -- sin este lock, dos transacciones podrian
  -- leer el mismo conteo "todavia hay lugar" y sobrevender.
  perform 1 from public.event_capacity_rules
    where event_id = v_event.id and scope = 'event' and key = ''
    for update;

  for v_dp in (select distinct a ->> 'dayPass' from jsonb_array_elements(p_attendees) a)
  loop
    perform 1 from public.event_capacity_rules
      where event_id = v_event.id and scope = 'day' and key = v_dp
      for update;
  end loop;

  if exists (
    select 1 from public.event_capacity_rules
    where event_id = v_event.id and scope = 'event' and key = ''
      and limit_count < (
        (select count(*) from public.tickets where event_id = v_event.id and status <> 'cancelada')
        + jsonb_array_length(p_attendees)
      )
  ) then
    raise exception 'Evento agotado.' using errcode = 'PLU04';
  end if;

  for v_dp in (select distinct a ->> 'dayPass' from jsonb_array_elements(p_attendees) a)
  loop
    if exists (
      select 1 from public.event_capacity_rules
      where event_id = v_event.id and scope = 'day' and key = v_dp
        and limit_count < (
          (select count(*) from public.tickets
            where event_id = v_event.id and day_pass = v_dp and status <> 'cancelada')
          + (select count(*) from jsonb_array_elements(p_attendees) a where a ->> 'dayPass' = v_dp)
        )
    ) then
      raise exception 'Entradas agotadas para %.', v_dp using errcode = 'PLU04';
    end if;
  end loop;

  select sum(public.ticket_price_for_day_pass(a ->> 'dayPass'))
    into v_amount
    from jsonb_array_elements(p_attendees) a;

  insert into public.ticket_orders (event_id, buyer_name, buyer_email, buyer_phone, amount, provider, status, reference)
  values (
    v_event.id,
    p_buyer ->> 'name',
    p_buyer ->> 'email',
    p_buyer ->> 'phone',
    v_amount,
    coalesce(p_buyer ->> 'provider', 'mercado_pago'),
    'creado',
    -- gen_random_bytes vive en la extension pgcrypto, instalada en el
    -- schema `extensions` (no `public`) -- hay que calificarla porque
    -- esta funcion fija su search_path a `public` para evitar hijacking.
    'TORD-' || encode(extensions.gen_random_bytes(6), 'hex')
  )
  returning * into v_order;

  select count(*) into v_start_count from public.tickets;

  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_index := v_index + 1;
    v_day_pass := v_attendee ->> 'dayPass';
    v_ticket_code := 'TCK-' || lpad((v_start_count + v_index)::text, 5, '0');

    insert into public.tickets (ticket_code, order_id, event_id, attendee_name, attendee_dni, day_pass, unit_price, status)
    values (
      v_ticket_code,
      v_order.id,
      v_event.id,
      v_attendee ->> 'fullName',
      v_attendee ->> 'dni',
      v_day_pass,
      public.ticket_price_for_day_pass(v_day_pass),
      'pendiente_pago'
    )
    returning to_jsonb(public.tickets.*) into v_ticket_json;

    v_tickets := v_tickets || jsonb_build_array(v_ticket_json);
  end loop;

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets);
end;
$$;

grant execute on function public.create_ticket_order(text, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- approve_ticket_order: "Simular pago" -- hoy es intencionalmente publico
-- (stand-in del webhook server-to-server de Mercado Pago, no una accion
-- de seguridad), igual que en server/routes/tickets.js. Aprueba la orden
-- y todos sus tickets, todo o nada.
-- ---------------------------------------------------------------------
create or replace function public.approve_ticket_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_tickets jsonb;
begin
  update public.ticket_orders
    set status = 'aprobado', updated_at = now()
    where id = p_order_id
    returning * into v_order;

  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  update public.tickets
    set status = 'pagada', updated_at = now()
    where order_id = p_order_id and status = 'pendiente_pago';

  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
    into v_tickets
    from public.tickets t
    where t.order_id = p_order_id;

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets);
end;
$$;

grant execute on function public.approve_ticket_order(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_ticket_by_qr_token: verificacion publica de solo lectura -- a donde
-- apunta el QR. No muta nada.
-- ---------------------------------------------------------------------
create or replace function public.get_ticket_by_qr_token(p_qr_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'ticket', to_jsonb(t.*),
    'event', to_jsonb(e.*),
    'checkIn', to_jsonb(c.*)
  )
  into v_result
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.check_ins c on c.ticket_id = t.id
  where t.qr_token = p_qr_token;

  if v_result is null then
    raise exception 'Entrada no encontrada.' using errcode = 'PLU02';
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_ticket_by_qr_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- list_tickets_for_event: panel de seguridad/admin.
-- ---------------------------------------------------------------------
create or replace function public.list_tickets_for_event(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_result jsonb;
begin
  if not public.can_check_in() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('ticket', to_jsonb(t.*), 'checkIn', to_jsonb(c.*))
    order by t.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.tickets t
  left join public.check_ins c on c.ticket_id = t.id
  where t.event_id = v_event.id;

  return v_result;
end;
$$;

grant execute on function public.list_tickets_for_event(text) to authenticated;

-- ---------------------------------------------------------------------
-- check_in_ticket / check_in_registration: mutacion protegida, unica
-- forma de marcar una entrada/inscripcion como usada. La garantia de
-- "no se puede escanear dos veces" viene del unique() en check_ins
-- (ticket_id/registration_id) -- un segundo insert choca con la
-- restriccion (23505) y se captura acá como "ya usado", sin ventana de
-- carrera entre dos puertas escaneando al mismo tiempo.
-- ---------------------------------------------------------------------
create or replace function public.check_in_ticket(p_qr_token uuid, p_gate text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_checkin public.check_ins;
begin
  if not public.can_check_in() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where qr_token = p_qr_token;
  if not found then
    raise exception 'Entrada no encontrada.' using errcode = 'PLU02';
  end if;
  if v_ticket.status <> 'pagada' then
    raise exception 'Esta entrada todavia no tiene el pago acreditado.' using errcode = 'PLU05';
  end if;

  begin
    insert into public.check_ins (event_id, attendee_kind, ticket_id, scanned_by_id, gate)
    values (v_ticket.event_id, 'spectator', v_ticket.id, auth.uid(), p_gate)
    returning * into v_checkin;
  exception
    when unique_violation then
      select * into v_checkin from public.check_ins where ticket_id = v_ticket.id;
      raise exception 'Esta entrada ya fue utilizada.' using errcode = 'PLU06',
        detail = coalesce(v_checkin.scanned_at::text, '');
  end;

  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end;
$$;

grant execute on function public.check_in_ticket(uuid, text) to authenticated;

create or replace function public.check_in_registration(p_registration_id uuid, p_gate text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_checkin public.check_ins;
begin
  if not public.can_check_in() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  select * into v_registration from public.event_registrations where id = p_registration_id;
  if not found then
    raise exception 'Inscripcion no encontrada.' using errcode = 'PLU02';
  end if;
  if v_registration.status = 'cancelada' then
    raise exception 'Esta inscripcion esta cancelada.' using errcode = 'PLU05';
  end if;

  begin
    insert into public.check_ins (event_id, attendee_kind, registration_id, scanned_by_id, gate)
    values (v_registration.event_id, 'athlete', v_registration.id, auth.uid(), p_gate)
    returning * into v_checkin;
  exception
    when unique_violation then
      select * into v_checkin from public.check_ins where registration_id = v_registration.id;
      raise exception 'Esta inscripcion ya tiene un ingreso registrado.' using errcode = 'PLU06',
        detail = coalesce(v_checkin.scanned_at::text, '');
  end;

  return jsonb_build_object('registration', to_jsonb(v_registration), 'checkIn', to_jsonb(v_checkin));
end;
$$;

grant execute on function public.check_in_registration(uuid, text) to authenticated;
