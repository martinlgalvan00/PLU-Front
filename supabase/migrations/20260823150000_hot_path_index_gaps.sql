-- Índices faltantes en columnas calientes — PLU ARG
--
-- La instancia de Postgres viene mostrando swap crónico y estable (~50% de la
-- memoria, sin picos correlacionados con tráfico), señal de que además del
-- tamaño de la instancia hay queries filtradas/ordenadas sin índice que
-- Postgres resuelve con sort en memoria/disco sobre tablas que crecen sin
-- límite (auditoría, eventos de webhook, cobros). Estos tres índices cubren
-- los casos detectados por auditoría de código donde el filtro/orden real no
-- coincidía con ningún índice existente:
--
--   1. domain_audit_logs: se filtra por organization_id en cada apertura del
--      panel de auditoría (server/modules/audit/supabaseAuditRepository.js),
--      pero organization_id no entra en ningún índice de la tabla.
--   2. payment_integration_events: listIntegrationEvents (server/modules/
--      payments/supabasePaymentRepository.js) filtra organization_id+provider
--      y ordena por updated_at; el índice existente cubre (provider,
--      resource_id) y (status, received_at), ninguno sirve para ese patrón.
--   3. athlete_payments / ticket_payments: el reporte de Finanzas
--      (server/routes/finance.js) filtra status='aprobado' y ordena por
--      confirmed_at, pero los índices existentes ordenan por created_at.

create index if not exists domain_audit_logs_org_created_idx
  on public.domain_audit_logs (organization_id, created_at desc);

create index if not exists payment_integration_events_org_provider_updated_idx
  on public.payment_integration_events (organization_id, provider, updated_at desc);

create index if not exists athlete_payments_org_status_confirmed_idx
  on public.athlete_payments (organization_id, status, confirmed_at desc);

create index if not exists ticket_payments_org_status_confirmed_idx
  on public.ticket_payments (organization_id, status, confirmed_at desc);

do $verification$
begin
  if to_regclass('public.domain_audit_logs_org_created_idx') is null then
    raise exception 'Falta domain_audit_logs_org_created_idx.' using errcode = 'PLU01';
  end if;
  if to_regclass('public.payment_integration_events_org_provider_updated_idx') is null then
    raise exception 'Falta payment_integration_events_org_provider_updated_idx.' using errcode = 'PLU01';
  end if;
  if to_regclass('public.athlete_payments_org_status_confirmed_idx') is null then
    raise exception 'Falta athlete_payments_org_status_confirmed_idx.' using errcode = 'PLU01';
  end if;
  if to_regclass('public.ticket_payments_org_status_confirmed_idx') is null then
    raise exception 'Falta ticket_payments_org_status_confirmed_idx.' using errcode = 'PLU01';
  end if;
end
$verification$;
