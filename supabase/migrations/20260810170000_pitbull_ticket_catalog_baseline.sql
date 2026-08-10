-- El seed local define este catálogo, pero los entornos remotos no ejecutan
-- seed durante `db push`. Se asegura el mismo baseline de forma idempotente.

insert into public.event_days(event_id, day_index, label, date)
select e.id, d.day_index, d.label, d.date
from public.events e
cross join (values
  (0, 'Día 1'::text, '2026-12-12'::date),
  (1, 'Día 2'::text, '2026-12-13'::date)
) as d(day_index, label, date)
where e.slug = 'pitbull-classic-2026'
on conflict(event_id, day_index) do nothing;

insert into public.ticket_types(event_id, name, price, quota, sort_order, active)
select e.id, t.name, t.price, t.quota, t.sort_order, true
from public.events e
cross join (values
  ('Día 1'::text, 12000, 8, 0),
  ('Día 2'::text, 12000, 8, 1),
  ('Ambos días'::text, 20000, null::int, 2)
) as t(name, price, quota, sort_order)
where e.slug = 'pitbull-classic-2026'
  and not exists (
    select 1 from public.ticket_types existing
    where existing.event_id = e.id and existing.name = t.name
  );

insert into public.ticket_type_days(ticket_type_id, event_day_id)
select tt.id, ed.id
from public.ticket_types tt
join public.events e on e.id = tt.event_id and e.slug = 'pitbull-classic-2026'
join public.event_days ed on ed.event_id = e.id
where (tt.name = 'Día 1' and ed.day_index = 0)
   or (tt.name = 'Día 2' and ed.day_index = 1)
   or tt.name = 'Ambos días'
on conflict(ticket_type_id, event_day_id) do nothing;
