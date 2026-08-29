-- Retención de comprobantes de pago (opción B)
--
-- Tras aprobar o rechazar, el archivo en Storage deja de ser evidencia operativa
-- (la decisión ya quedó en la orden). Se mantiene el binario unas horas por
-- si Finanzas necesita reabrirlo, y después un job lo borra del bucket.
--
-- No se tocan órdenes pendientes / validacion_manual: ahí el archivo es
-- requisito de la bandeja (SLA 48 h).
--
-- Columnas:
--   payment_proof_accessed_at — última vez que staff abrió el proxy
--   payment_proof_purged_at   — cuándo se borró el objeto de Storage
-- Al purgar: se limpia payment_proof_path (evita botones que apuntan a 404)
-- y se conserva payment_proof_uploaded_at + purged_at como registro.

alter table public.athlete_payment_orders
  add column if not exists payment_proof_accessed_at timestamptz,
  add column if not exists payment_proof_purged_at timestamptz;

alter table public.ticket_orders
  add column if not exists payment_proof_accessed_at timestamptz,
  add column if not exists payment_proof_purged_at timestamptz;

comment on column public.athlete_payment_orders.payment_proof_accessed_at is
  'Última apertura del comprobante por staff (proxy). Informativo; la retención B usa approved_at/rejected_at.';
comment on column public.athlete_payment_orders.payment_proof_purged_at is
  'Momento en que el objeto se borró de Storage tras retención post-decisión.';

comment on column public.ticket_orders.payment_proof_accessed_at is
  'Última apertura del comprobante por staff (proxy).';
comment on column public.ticket_orders.payment_proof_purged_at is
  'Momento en que el objeto se borró de Storage tras retención post-decisión.';

-- Candidatos: decididas, con path vivo, aún no purgadas.
create index if not exists athlete_payment_orders_proof_retention_idx
  on public.athlete_payment_orders (status, approved_at, rejected_at)
  where payment_proof_path is not null
    and payment_proof_purged_at is null;

create index if not exists ticket_orders_proof_retention_idx
  on public.ticket_orders (status, approved_at, rejected_at)
  where payment_proof_path is not null
    and payment_proof_purged_at is null;
