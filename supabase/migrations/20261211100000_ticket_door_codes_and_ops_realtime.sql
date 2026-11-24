-- Código de puerta de 6 dígitos + avisos en tiempo real de la operación — PLU ARG
--
-- 1. Código de puerta. Cuando el QR no se lee (pantalla rota, brillo bajo,
--    batería), la persona tiene que poder DICTARLE algo al de seguridad. El
--    `ticket_code` (`TCK-00000412`) sirve, pero es correlativo: conociendo uno
--    se adivina el siguiente. El código de puerta son 6 dígitos al azar, únicos
--    dentro del evento, uno por credencial (un entrenador tiene dos QR y dos
--    códigos). Se busca sólo desde la puerta, con sesión de staff acotada al
--    evento y límite propio de intentos (ver `POST /checkin/lookup`): adivinar
--    uno entre un millón al azar, con el guardia cotejando nombre y DNI, no es
--    un camino práctico.
--
--    Lo genera la base en un BEFORE INSERT, así ningún camino de alta (compra
--    pública, venta de mostrador, invitados, versiones viejas de la RPC) puede
--    emitir una credencial sin código. Un lock por evento serializa la elección
--    para que dos compras simultáneas no saquen el mismo número y una falle por
--    el índice único.
--
-- 2. Tiempo real. Las puertas se enteraban de un ingreso en otra puerta, de una
--    entrada cancelada o de una venta nueva recién en el próximo sondeo (30 s).
--    Con varias puertas eso deja una ventana donde un QR recién cancelado
--    todavía entra por la lista offline de otro puesto. Ahora:
--
--      check_ins     -> `ticket-ops:<slug>`  'checkin-changed'
--      tickets       -> `ticket-ops:<slug>`  'tickets-changed'
--      ticket_orders -> `ticket-orders`          'orders-changed'
--
--    Mismo contrato que el catálogo público (20261209100000) y los cupos
--    (20260817130000, `event-capacity:<slug>`): el mensaje NO lleva datos (ni nombres, ni DNI, ni
--    tokens, ni montos), sólo "cambió algo en este grupo"; el navegador relee
--    por Express con su sesión y sus permisos. Un aviso por sentencia y por
--    evento: cargar 200 invitados emite un mensaje, no 200. Si Realtime falla,
--    el cambio se guarda igual y el sondeo lo cubre.

-- ---------------------------------------------------------------------------
-- 1. Código de puerta
-- ---------------------------------------------------------------------------

alter table public.tickets
  add column if not exists door_code text;

alter table public.tickets
  drop constraint if exists tickets_door_code_format;
alter table public.tickets
  add constraint tickets_door_code_format check (door_code is null or door_code ~ '^[0-9]{6}$');

comment on column public.tickets.door_code is
  'Código de 6 dígitos al azar, único dentro del evento, para validar en la puerta '
  'cuando el QR no se puede leer. Lo asigna tickets_assign_door_code.';

-- Elige un código libre dentro del evento. El caller tiene que tener tomado el
-- lock del evento (ver el trigger).
create or replace function plu_private.next_ticket_door_code(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    -- 100000..999999: sin ceros adelante, así nadie duda si "012345" son 5 o 6.
    v_code := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (
      select 1 from public.tickets where event_id = p_event_id and door_code = v_code
    );
    if v_attempt >= 50 then
      raise exception 'No se pudo asignar un código de puerta.' using errcode = 'PLU01';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke all on function plu_private.next_ticket_door_code(uuid) from public, anon, authenticated;

create or replace function plu_private.tickets_assign_door_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.door_code is null then
    -- Serializa la elección por evento dentro de la transacción: dos compras
    -- simultáneas no pueden quedarse con el mismo número.
    perform pg_advisory_xact_lock(hashtextextended('ticket-door-code:' || new.event_id::text, 0));
    new.door_code := plu_private.next_ticket_door_code(new.event_id);
  end if;
  return new;
end;
$$;

revoke all on function plu_private.tickets_assign_door_code() from public, anon, authenticated;

drop trigger if exists tickets_assign_door_code on public.tickets;
create trigger tickets_assign_door_code
before insert on public.tickets
for each row execute function plu_private.tickets_assign_door_code();

-- Backfill: las entradas ya emitidas también tienen que poder validarse así.
do $backfill$
declare
  v_ticket record;
begin
  for v_ticket in
    select id, event_id from public.tickets where door_code is null order by event_id, created_at
  loop
    update public.tickets
    set door_code = plu_private.next_ticket_door_code(v_ticket.event_id)
    where id = v_ticket.id;
  end loop;
end
$backfill$;

create unique index if not exists tickets_event_door_code_key
  on public.tickets (event_id, door_code);

-- Allowlist offline: el código de puerta tiene que poder validarse sin red.
create or replace function public.staff_get_event_checkin_allowlist(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_tickets jsonb;
  v_registrations jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code, 'doorCode', t.door_code,
    'attendeeName', t.attendee_name, 'attendeeDni', t.attendee_dni,
    'ticketTypeId', t.ticket_type_id, 'ticketTypeName', tt.name,
    'ticketTypeDescription', tt.description,
    'credentialLabel', coalesce(t.credential_label, 'Entrada general'),
    'credentialScopes', coalesce(t.credential_scopes, array['gate_tickets']),
    'validFrom', w.valid_from, 'validUntil', w.valid_until,
    'validityStatus', w.validity_status, 'accessWindowKey', w.access_window_key,
    'status', t.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_tickets
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  cross join lateral plu_private.resolve_ticket_type_access_window(t.id, clock_timestamp()) w
  left join public.check_ins c on c.ticket_id = t.id and c.access_window_key = w.access_window_key
  where t.event_id = v_event.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', m.qr_token, 'memberCode', m.member_code,
    'registrationId', r.id, 'athleteName', a.full_name,
    'athleteDocument', a.document_id, 'division', r.division, 'category', r.category,
    'status', r.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_registrations
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.memberships m on m.athlete_id = a.id and m.status = 'activa'
    and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = v_event.id and r.status = 'confirmada';

  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Avisos en tiempo real
-- ---------------------------------------------------------------------------

-- Un aviso por evento afectado en la sentencia. `tg_argv[0]` es el nombre del
-- mensaje. Lee la tabla de transición `changed`, que cada trigger declara.
create or replace function public.broadcast_ticket_ops_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
declare
  v_slug text;
begin
  begin
    -- Por slug, como `event-capacity:<slug>`: es lo que la puerta conoce.
    for v_slug in
      select distinct e.slug
      from changed c join public.events e on e.id = c.event_id
    loop
      perform realtime.send(
        jsonb_build_object('scope', tg_argv[0]),
        tg_argv[0],
        'ticket-ops:' || v_slug,
        false
      );
    end loop;
  exception when others then
    -- Un fallo del aviso nunca puede impedir el ingreso o la venta que lo originó.
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_ticket_ops_change() from public, anon, authenticated;

create or replace function public.broadcast_ticket_orders_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
begin
  -- Sólo si la sentencia tocó filas: el vencimiento de reservas corre su
  -- UPDATE cada minuto aunque no venza nada, y sin este corte cada pestaña de
  -- Cobros releía 200 órdenes por minuto, para siempre.
  if not exists (select 1 from changed) then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('scope', 'orders'),
      'orders-changed',
      'ticket-orders',
      false
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_ticket_orders_change() from public, anon, authenticated;

-- Postgres no admite tablas de transición en un trigger con varios eventos:
-- un trigger por evento, todos a nivel sentencia.
drop trigger if exists check_ins_ops_realtime_insert on public.check_ins;
create trigger check_ins_ops_realtime_insert
after insert on public.check_ins
referencing new table as changed
for each statement execute function public.broadcast_ticket_ops_change('checkin-changed');

drop trigger if exists check_ins_ops_realtime_delete on public.check_ins;
create trigger check_ins_ops_realtime_delete
after delete on public.check_ins
referencing old table as changed
for each statement execute function public.broadcast_ticket_ops_change('checkin-changed');

drop trigger if exists tickets_ops_realtime_insert on public.tickets;
create trigger tickets_ops_realtime_insert
after insert on public.tickets
referencing new table as changed
for each statement execute function public.broadcast_ticket_ops_change('tickets-changed');

drop trigger if exists tickets_ops_realtime_update on public.tickets;
create trigger tickets_ops_realtime_update
after update on public.tickets
referencing new table as changed
for each statement execute function public.broadcast_ticket_ops_change('tickets-changed');

drop trigger if exists ticket_orders_realtime on public.ticket_orders;
drop trigger if exists ticket_orders_realtime_insert on public.ticket_orders;
create trigger ticket_orders_realtime_insert
after insert on public.ticket_orders
referencing new table as changed
for each statement execute function public.broadcast_ticket_orders_change();

drop trigger if exists ticket_orders_realtime_update on public.ticket_orders;
create trigger ticket_orders_realtime_update
after update on public.ticket_orders
referencing new table as changed
for each statement execute function public.broadcast_ticket_orders_change();

-- Lectura de los tópicos: mensajes sin datos (sólo "cambió algo"), mismo
-- criterio que `public-catalog`. No habilita leer tablas de dominio.
drop policy if exists ticket_ops_broadcast_read on realtime.messages;
create policy ticket_ops_broadcast_read
on realtime.messages
for select
to anon, authenticated
using (realtime.topic() like 'ticket-ops:%' or realtime.topic() = 'ticket-orders');

-- ---------------------------------------------------------------------------
-- 3. "Mis entradas": el QR sólo por mail verificado
--
-- 20261210100000 vinculaba entradas a la cuenta por DNI del asistente o por
-- mail de compra verificado, y en los dos casos devolvía el QR. Pero el DNI de
-- una cuenta es lo que se tipeó al registrarse: nadie lo verifica. Alcanzaba
-- con registrarse con el DNI de un espectador sin cuenta para llevarse su QR y
-- su código de puerta, y entrar con ellos.
--
-- Ahora la coincidencia por DNI sigue MOSTRANDO la entrada (la persona sabe
-- que la tiene y para qué evento), pero el QR y el código de puerta sólo viajan
-- si el mail de compra coincide con el mail verificado de la cuenta. Si no,
-- se informa a qué mail (enmascarado) se mandó el QR.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_list_my_tickets(p_athlete_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_email text;
  v_result jsonb;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Cuenta no encontrada.' using errcode = 'PLU02';
  end if;
  v_email := case when v_athlete.email_verified_at is not null then lower(v_athlete.email) end;

  select coalesce(jsonb_agg(row_data order by starts_at nulls last, ticket_created_at), '[]'::jsonb)
    into v_result
  from (
    select
      e.starts_at,
      t.created_at as ticket_created_at,
      (to_jsonb(t.*) - 'qr_token' - 'door_code')
        || jsonb_build_object(
          -- Credencial al portador: sólo con el mail de compra verificado.
          'qr_token', case when owns then t.qr_token end,
          'door_code', case when owns then t.door_code end,
          'qr_locked', not owns,
          'buyer_email_masked', case when owns then null
            else regexp_replace(coalesce(o.buyer_email, ''), '^(.).*(@.*)$', '\1***\2') end,
          'ticket_type_name', tt.name,
          'ticket_type_description', tt.description,
          'order_reference', o.reference,
          'order_channel', coalesce(o.manual_payment_channel, o.provider),
          'courtesy_label', o.courtesy_label,
          'event', jsonb_build_object(
            'id', e.id, 'slug', e.slug, 'title', e.title, 'venue', e.venue,
            'location', e.location, 'starts_at', e.starts_at, 'ends_at', e.ends_at
          ),
          'check_in', (
            select jsonb_build_object('id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at)
            from public.check_ins c where c.ticket_id = t.id
            order by c.scanned_at limit 1
          )
        ) as row_data
    from public.tickets t
    join public.ticket_orders o on o.id = t.order_id
    join public.events e on e.id = t.event_id
    left join public.ticket_types tt on tt.id = t.ticket_type_id
    cross join lateral (
      select v_email is not null and lower(coalesce(o.buyer_email, '')) = v_email as owns
    ) ownership
    where t.status = 'pagada'
      and o.status = 'aprobado'
      and (
        t.attendee_dni = v_athlete.document_id
        or (v_email is not null and lower(o.buyer_email) = v_email)
      )
  ) mine;

  return v_result;
end;
$$;

revoke all on function public.athlete_list_my_tickets(uuid) from public, anon, authenticated;
grant execute on function public.athlete_list_my_tickets(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if exists (select 1 from public.tickets where door_code is null) then
    raise exception 'Quedaron entradas sin código de puerta.' using errcode = 'PLU01';
  end if;
  if (
    select count(*) from pg_trigger
    where tgname in (
      'tickets_assign_door_code', 'check_ins_ops_realtime_insert', 'check_ins_ops_realtime_delete',
      'tickets_ops_realtime_insert', 'tickets_ops_realtime_update',
      'ticket_orders_realtime_insert', 'ticket_orders_realtime_update'
    ) and not tgisinternal
  ) <> 7 then
    raise exception 'Faltan triggers de código de puerta o tiempo real.' using errcode = 'PLU01';
  end if;
end
$verification$;
