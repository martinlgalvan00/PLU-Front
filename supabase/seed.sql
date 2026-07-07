-- Datos de desarrollo local -- espeja src/lib/events.js (UPCOMING_EVENTS)
-- para que el front tenga los mismos dos eventos de siempre al correr
-- contra Supabase local.

insert into public.events (
  slug, title, venue, location, starts_at, ends_at,
  status, published, price, currency,
  ticket_sales_opens_at, ticket_sales_closes_at
) values (
  'pitbull-classic-2026', 'Pitbull Classic', 'Maximal Strength Club', 'Buenos Aires',
  '2026-12-12 10:00:00-03', '2026-12-13 20:00:00-03',
  'proximamente', true, 45000, 'ARS',
  '2020-01-01 00:00:00-03', '2026-12-13 18:00:00-03'
), (
  'spring-classic-2025', 'Spring Classic 2025', 'Maximal Strength Club', 'Buenos Aires',
  '2025-05-18 10:00:00-03', '2025-05-18 20:00:00-03',
  'finalizado', true, 45000, 'ARS',
  null, null
);

-- Cupos de ejemplo para probar el enforcement de create_ticket_order.
insert into public.event_capacity_rules (event_id, scope, key, limit_count)
select id, 'day', 'day1', 8 from public.events where slug = 'pitbull-classic-2026';

insert into public.event_capacity_rules (event_id, scope, key, limit_count)
select id, 'day', 'day2', 8 from public.events where slug = 'pitbull-classic-2026';

insert into public.event_capacity_rules (event_id, scope, key, limit_count)
select id, 'day', 'both', 20 from public.events where slug = 'pitbull-classic-2026';
