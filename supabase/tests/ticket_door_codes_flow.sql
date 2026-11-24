-- Código de puerta + avisos en tiempo real (20261211100000). Corre en una
-- transacción y hace rollback.
--
--   docker cp supabase/tests/ticket_door_codes_flow.sql supabase_db_PLU-Front:/tmp/t.sql
--   MSYS_NO_PATHCONV=1 docker exec supabase_db_PLU-Front psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

begin;

do $flow$
declare
  v_event uuid;
  v_other uuid;
  v_type uuid;
  v_other_type uuid;
  v_result jsonb;
  v_count int;
  v_distinct int;
  v_allow jsonb;
  v_messages_before timestamp;
  v_messages int;
  v_payload jsonb;
begin
  insert into public.events (slug, title, venue, location, starts_at, ends_at, published, status, currency, rules)
  values ('test-door', 'Evento puerta', 'Sede', 'CABA', now() + interval '5 days',
          now() + interval '6 days', true, 'inscripcion_abierta', 'ARS', '{"ticketsEnabled": true}'::jsonb)
  returning id into v_event;
  insert into public.ticket_types (event_id, name, price, active)
  values (v_event, 'Entrenador', 10000, true) returning id into v_type;
  insert into public.ticket_type_credentials (ticket_type_id, label, zone_scopes, sort_order)
  values (v_type, 'Entrada general', array['gate_tickets'], 0),
         (v_type, 'Calentamiento', array['athletes_coaches'], 1);

  -- realtime.messages.inserted_at es now(): la hora de INICIO de la transacción.
  v_messages_before := now()::timestamp;

  -- 1. Cada credencial recibe su código: 6 dígitos, sin cero adelante.
  v_result := public.create_ticket_order_v3(
    'test-door',
    jsonb_build_array(jsonb_build_object('fullName', 'Coach Uno', 'dni', '41222333', 'ticketTypeId', v_type)),
    jsonb_build_object('name', 'Coach', 'email', 'coach@example.com', 'provider', 'manual', 'manualPaymentChannel', 'cash_pitbull'),
    'door-flow-idem-0001', repeat('f', 64), 'staff:test'
  );
  select count(*), count(distinct door_code) into v_count, v_distinct
  from public.tickets where event_id = v_event and door_code ~ '^[1-9][0-9]{5}$';
  if v_count <> 2 or v_distinct <> 2 then
    raise exception 'FALLO: códigos del entrenador (% con formato, % distintos)', v_count, v_distinct;
  end if;

  -- 2. Muchas altas en una sentencia (invitados): todos únicos dentro del evento.
  v_result := public.staff_issue_guest_tickets(
    'test-door', v_type,
    (select jsonb_agg(jsonb_build_object('fullName', 'Invitado ' || i, 'dni', (40000000 + i)::text))
     from generate_series(1, 60) i),
    'Prensa', 'staff:test'
  );
  select count(*), count(distinct door_code) into v_count, v_distinct
  from public.tickets where event_id = v_event;
  if v_count <> 122 or v_distinct <> 122 then
    raise exception 'FALLO: códigos repetidos (% entradas, % códigos)', v_count, v_distinct;
  end if;

  -- 3. Un código explícito repetido en el mismo evento lo frena el índice.
  begin
    -- Dos entradas distintas por id: dentro de la transacción todas comparten
    -- created_at, así que ordenar por fecha podía elegir la misma fila.
    update public.tickets set door_code = (
      select door_code from public.tickets where event_id = v_event order by id limit 1
    ) where id = (select id from public.tickets where event_id = v_event order by id desc limit 1);
    raise exception 'FALLO: el índice único no frenó un código repetido';
  exception when unique_violation then null;
  end;

  -- 4. El mismo número puede existir en otro evento (único por evento, no global).
  insert into public.events (slug, title, venue, location, starts_at, ends_at, published, status, currency, rules)
  values ('test-door-2', 'Otro evento', 'Sede', 'CABA', now() + interval '5 days',
          now() + interval '6 days', true, 'inscripcion_abierta', 'ARS', '{"ticketsEnabled": true}'::jsonb)
  returning id into v_other;
  insert into public.ticket_types (event_id, name, price, active)
  values (v_other, 'General', 5000, true) returning id into v_other_type;
  perform public.staff_issue_guest_tickets(
    'test-door-2', v_other_type, jsonb_build_array(jsonb_build_object('fullName', 'Otra Persona', 'dni', '39000000')),
    null, 'staff:test'
  );
  update public.tickets set door_code = (
    select door_code from public.tickets where event_id = v_event limit 1
  ) where event_id = v_other;

  -- 5. La lista offline lleva el código.
  v_allow := public.staff_get_event_checkin_allowlist('test-door');
  if (v_allow -> 'tickets' -> 0 ->> 'doorCode') !~ '^[0-9]{6}$' then
    raise exception 'FALLO: la allowlist no trae doorCode';
  end if;

  -- 6. Avisos: un mensaje por sentencia y por evento, en el tópico del evento,
  --    sin datos de la entrada.
  select count(*) into v_messages from realtime.messages
  where inserted_at >= v_messages_before and topic = 'ticket-ops:test-door' and event = 'tickets-changed';
  if v_messages < 1 then
    raise exception 'FALLO: no se emitió tickets-changed';
  end if;
  -- La carga de 60 invitados son 60 sentencias INSERT de una orden cada una
  -- pero el aviso de tickets es por sentencia: nunca uno por credencial dentro
  -- de la misma sentencia (el entrenador = 2 credenciales = 2 sentencias).
  select payload into v_payload from realtime.messages
  where inserted_at >= v_messages_before and topic = 'ticket-ops:test-door'
  order by inserted_at desc limit 1;
  if v_payload::text ~* '(dni|attendee|qr_token|door_code|4[0-9]{7})' then
    raise exception 'FALLO: el aviso lleva datos: %', v_payload;
  end if;

  select count(*) into v_messages from realtime.messages
  where inserted_at >= v_messages_before and topic = 'ticket-orders' and event = 'orders-changed';
  if v_messages < 1 then
    raise exception 'FALLO: no se emitió orders-changed';
  end if;

  raise notice 'OK ticket_door_codes_flow';
end
$flow$;

rollback;
