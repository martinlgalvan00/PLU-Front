-- Mantiene la version reportada por health alineada con el historial real.

create or replace function public.get_payment_schema_version()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select '20260722150000'::text; $$;

revoke all on function public.get_payment_schema_version()
  from public, anon, authenticated;
grant execute on function public.get_payment_schema_version() to service_role;

create or replace function public.get_payment_system_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with athlete_rollup as (
    select o.id, o.status,
      case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
    from public.athlete_payment_orders o
    join public.athlete_payments p on p.order_id = o.id
    where o.method = 'mercado_pago'
    group by o.id, o.status
  ), ticket_rollup as (
    select o.id, o.status,
      case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
    from public.ticket_orders o
    join public.ticket_payments p on p.order_id = o.id
    where o.provider = 'mercado_pago'
    group by o.id, o.status
  ), checks as (
    select
      (select count(*) from athlete_rollup where status <> expected_status) as athlete_drift,
      (select count(*) from ticket_rollup where status <> expected_status) as ticket_drift,
      (select count(*) from public.payment_integration_events
        where status = 'processing'
          and (locked_at is null or locked_at < now() - interval '10 minutes')) as stale_event_locks,
      (select count(*) from public.embedded_payment_attempts
        where reconciliation_status = 'processing'
          and (reconciliation_locked_at is null or reconciliation_locked_at < now() - interval '10 minutes')) as stale_reconciliation_locks,
      (select count(*) from public.payment_integration_events
        where status = 'failed' and attempts_count >= max_attempts) as exhausted_events
  )
  select jsonb_build_object(
    'schemaVersion', public.get_payment_schema_version(),
    'healthy', athlete_drift = 0 and ticket_drift = 0
      and stale_event_locks = 0 and stale_reconciliation_locks = 0
      and exhausted_events = 0,
    'athleteOrderDrift', athlete_drift,
    'ticketOrderDrift', ticket_drift,
    'staleEventLocks', stale_event_locks,
    'staleReconciliationLocks', stale_reconciliation_locks,
    'exhaustedEvents', exhausted_events,
    'checkedAt', now()
  ) from checks;
$$;

revoke all on function public.get_payment_system_health()
  from public, anon, authenticated;
grant execute on function public.get_payment_system_health() to service_role;
