-- Archivo de comprobantes: dejar de depender de una purga automática ciega.
--
-- Hasta ahora un job borraba de Storage cada comprobante 24 h después de
-- aprobar la orden, sin que nadie hubiera guardado una copia. Esto separa las
-- dos preguntas:
--   * ¿Ya me lo llevé? -> `payment_proof_exported_at`, que se marca cuando el
--     staff descarga el comprobante a su computadora desde Cobros.
--   * ¿Cuándo se puede borrar del servidor? -> `payment_proof_settings`, que
--     decide el staff desde el panel. Por defecto NADA se borra.

alter table public.athlete_payment_orders
  add column if not exists payment_proof_exported_at timestamptz;

comment on column public.athlete_payment_orders.payment_proof_exported_at is
  'Cuándo el staff descargó el comprobante a su equipo. Habilita la purga "después de descargar".';

-- Las entradas guardan sus comprobantes en otro bucket pero la purga las alcanza
-- igual: tienen que poder respaldarse con la misma descarga.
alter table public.ticket_orders
  add column if not exists payment_proof_exported_at timestamptz;

comment on column public.ticket_orders.payment_proof_exported_at is
  'Cuándo el staff descargó el comprobante a su equipo. Habilita la purga "después de descargar".';

create table if not exists public.payment_proof_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  -- keep:         los comprobantes se conservan siempre (default).
  -- after_export: se borran `retention_days` días después de descargarlos.
  -- after_days:   se borran `retention_days` días después de aprobar/rechazar,
  --               hayan sido descargados o no.
  retention_mode text not null default 'keep'
    check (retention_mode in ('keep', 'after_export', 'after_days')),
  retention_days int not null default 30
    check (retention_days between 1 and 3650),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.payment_proof_settings enable row level security;
revoke all on public.payment_proof_settings from public, anon, authenticated;
grant select, insert, update on public.payment_proof_settings to service_role;

insert into public.payment_proof_settings (organization_id)
values ('00000000-0000-4000-8000-000000000001'::uuid)
on conflict (organization_id) do nothing;
