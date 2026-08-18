-- Datos de desarrollo local -- espeja src/lib/events.js (UPCOMING_EVENTS)
-- para que el front tenga los mismos dos eventos de siempre al correr
-- contra Supabase local.
--
-- Importante: `db reset` corre migraciones y DESPUÉS este seed. Las
-- migraciones 2026081213*/16*/17* que tocan Pitbull no encuentran el
-- evento todavía, así que acá hay que dejar status, rules y combo listos
-- para CI (`test:integration`).

insert into public.events (
  slug, title, venue, location, starts_at, ends_at,
  status, published, price, manual_price, currency, rules,
  ticket_sales_opens_at, ticket_sales_closes_at, capacity
) values (
  'pitbull-classic-2026', 'Pitbull Classic', 'La Troupe Multiespacio', 'Banfield, Buenos Aires',
  '2026-12-12 10:00:00-03', '2026-12-13 20:00:00-03',
  'inscripcion_abierta', true, 85000, 75000, 'ARS',
  jsonb_build_object(
    'membershipPrice', 85000,
    'membershipManualPrice', 75000,
    'comboPrice', 170000,
    'comboManualPrice', 120000,
    'ticketsEnabled', true,
    'ticketAddons', '[]'::jsonb,
    'featured', true
  ),
  '2020-01-01 00:00:00-03', '2026-12-13 18:00:00-03', 180
), (
  'spring-classic-2025', 'Spring Classic 2025', 'Maximal Strength Club', 'Buenos Aires',
  '2025-05-18 10:00:00-03', '2025-05-18 20:00:00-03',
  'finalizado', true, 75000, null, 'ARS',
  null,
  null, null, null
);

insert into public.event_capacity_rules (organization_id, event_id, scope, key, limit_count)
select e.organization_id, e.id, 'event', '', 180
from public.events e
where e.slug = 'pitbull-classic-2026'
on conflict (event_id, scope, key) do update
set limit_count = 180,
    updated_at = now();

-- Oferta combo vigente (afiliación + inscripción) para checkout productivo.
-- El plan one_time ya existe por migraciones; acá solo se vincula al evento.
insert into public.event_combo_offers (
  organization_id, event_id, membership_plan_id, price, manual_price, currency,
  active, starts_at, ends_at
)
select
  e.organization_id,
  e.id,
  p.id,
  170000,
  120000,
  'ARS',
  true,
  timestamptz '2026-08-01 00:00:00-03',
  timestamptz '2026-08-28 23:59:59-03'
from public.events e
join lateral (
  select id
  from public.membership_plans
  where organization_id = e.organization_id
    and collection_mode = 'one_time'
    and active = true
    and (retired_at is null or retired_at > now())
  order by version desc
  limit 1
) p on true
where e.slug = 'pitbull-classic-2026'
on conflict (event_id) do update set
  membership_plan_id = excluded.membership_plan_id,
  price = excluded.price,
  manual_price = excluded.manual_price,
  currency = excluded.currency,
  active = true,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = now();

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
