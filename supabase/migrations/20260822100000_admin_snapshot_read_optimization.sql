-- El snapshot del panel se filtra por organización y se ordena por alta.
-- Los índices existentes cubren estados operativos puntuales, pero no este
-- recorrido completo. Estos cuatro índices evitan scans + sort al crecer el
-- padrón, sin alterar el modelo ni la fuente de verdad.

create index if not exists athletes_org_created_at_idx
  on public.athletes (organization_id, created_at desc);

create index if not exists memberships_org_created_at_idx
  on public.memberships (organization_id, created_at desc);

create index if not exists event_registrations_org_created_at_idx
  on public.event_registrations (organization_id, created_at desc);

create index if not exists athlete_payment_orders_org_created_at_idx
  on public.athlete_payment_orders (organization_id, created_at desc);
