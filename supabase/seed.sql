-- Datos de desarrollo local -- espeja src/lib/events.js (UPCOMING_EVENTS)
-- para que el front tenga los mismos dos eventos de siempre al correr
-- contra Supabase local.

insert into public.events (
  slug, title, venue, location, starts_at, ends_at,
  status, published, price, currency,
  ticket_sales_opens_at, ticket_sales_closes_at
) values (
  'pitbull-classic-2026', 'Pitbull Classic', 'La Troupe Multiespacio', 'Banfield, Buenos Aires',
  '2026-12-12 10:00:00-03', '2026-12-13 20:00:00-03',
  'proximamente', true, 75000, 'ARS',
  '2020-01-01 00:00:00-03', '2026-12-13 18:00:00-03'
), (
  'spring-classic-2025', 'Spring Classic 2025', 'Maximal Strength Club', 'Buenos Aires',
  '2025-05-18 10:00:00-03', '2025-05-18 20:00:00-03',
  'finalizado', true, 75000, 'ARS',
  null, null
);

-- Días y tipos de entrada de ejemplo para probar el enforcement de
-- create_ticket_order_v2. day1/day2 tienen cupo propio de 8 (tests de
-- capacidad); el pase de ambos días no tiene límite propio.
insert into public.event_days (event_id, day_index, label, date)
select id, 0, 'Día 1', '2026-12-12' from public.events where slug = 'pitbull-classic-2026';

insert into public.event_days (event_id, day_index, label, date)
select id, 1, 'Día 2', '2026-12-13' from public.events where slug = 'pitbull-classic-2026';

insert into public.ticket_types (event_id, name, price, quota, sort_order)
select id, 'Día 1', 12000, 8, 0 from public.events where slug = 'pitbull-classic-2026';

insert into public.ticket_types (event_id, name, price, quota, sort_order)
select id, 'Día 2', 12000, 8, 1 from public.events where slug = 'pitbull-classic-2026';

insert into public.ticket_types (event_id, name, price, quota, sort_order)
select id, 'Ambos días', 20000, null, 2 from public.events where slug = 'pitbull-classic-2026';

insert into public.ticket_type_days (ticket_type_id, event_day_id)
select tt.id, ed.id from public.ticket_types tt
join public.events e on e.id = tt.event_id and e.slug = 'pitbull-classic-2026'
join public.event_days ed on ed.event_id = e.id
where (tt.name = 'Día 1' and ed.day_index = 0)
   or (tt.name = 'Día 2' and ed.day_index = 1)
   or (tt.name = 'Ambos días');
