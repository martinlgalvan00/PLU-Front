-- Lecturas que se ejecutan muchas veces por visitante u operador.
-- Los índices parciales evitan cargar el costo de las filas fuera de estas colas.

create index if not exists events_published_starts_at_idx
  on public.events (starts_at)
  where published = true;

create index if not exists ticket_orders_manual_pending_created_at_idx
  on public.ticket_orders (created_at desc)
  where provider = 'manual'
    and status in ('creado', 'pendiente');
