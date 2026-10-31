-- Un ingreso avisa `checkin-changed` con el slug y nada más.
-- Termina en rollback.

begin;

do $flow$
declare
  v_event_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_type_id uuid := gen_random_uuid();
  v_ticket_id uuid := gen_random_uuid();
  v_slug text := 'checkin-rt-' || v_event_id;
  v_before bigint;
  v_after bigint;
  v_topic text := 'event-checkin:' || v_slug;
begin
  insert into public.events (
    id, slug, title, venue, location, starts_at, ends_at, published
  ) values (
    v_event_id, v_slug, 'Check-in realtime',
    'Test', 'Test', now() + interval '1 day', now() + interval '2 days', false
  );
  insert into public.ticket_orders (
    id, event_id, buyer_name, buyer_email, amount, currency, provider, status, reference
  ) values (
    v_order_id, v_event_id, 'Smoke', 'smoke@example.invalid',
    1000, 'ARS', 'mercado_pago', 'pendiente', 'CHK-RT-' || v_order_id
  );
  insert into public.ticket_types (id, event_id, name, price) values (
    v_type_id, v_event_id, 'Smoke', 1000
  );
  insert into public.tickets (
    id, ticket_code, order_id, event_id, attendee_name, attendee_dni,
    ticket_type_id, unit_price, status
  ) values (
    v_ticket_id, 'CHKRT-' || left(v_ticket_id::text, 8), v_order_id, v_event_id,
    'Smoke', 'SMOKE', v_type_id, 1000, 'pagada'
  );

  select count(*) into v_before from realtime.messages where topic = v_topic;

  insert into public.check_ins (
    event_id, attendee_kind, ticket_id, gate, organization_id
  ) values (
    v_event_id, 'spectator', v_ticket_id, 'Puerta',
    '00000000-0000-4000-8000-000000000001'::uuid
  );

  select count(*) into v_after from realtime.messages where topic = v_topic;
  if v_after - v_before <> 1 then
    raise exception 'esperaba un aviso de ingreso, hubo %', v_after - v_before;
  end if;

  if exists (
    select 1 from realtime.messages
    where topic = v_topic
      and (payload - 'eventSlug' - 'id') <> '{}'::jsonb
  ) then
    raise exception 'el aviso de ingreso no debe llevar datos de la persona';
  end if;

  if exists (
    select 1 from realtime.messages
    where topic = v_topic and payload->>'eventSlug' is distinct from v_slug
  ) then
    raise exception 'el aviso no trajo el slug del meet';
  end if;
end
$flow$;

rollback;
