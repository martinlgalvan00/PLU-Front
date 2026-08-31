-- Higiene de recursos y acceso barato a retenciones — PLU ARG
--
-- Auditoria DEV 2026-08-30:
--   * analytics_events: 26 MB / 47.948 filas, purga global por occurred_at;
--   * operational_event_logs: 14 MB / 11.194 filas, retencion por created_at;
--   * cron.job_run_details: acotada a tres dias y todos los jobs sanos;
--   * plu_prisma."Session": 273 de 276 vencidas, sin purga automatica;
--   * Storage: 1,5 MB, sin huerfanos.
--
-- Las bitacoras contables mantienen sus ventanas y su contrato append-only. Los
-- BRIN aceleran los cortes cronologicos con unas pocas paginas de indice, sin
-- sumar otro B-tree grande a tablas append-only. Las sesiones y cuotas son
-- efimeras: se conserva un margen de 30/120 dias para diagnostico y se elimina
-- solamente lo que ya no puede autenticar ni limitar una solicitud vigente.

create index if not exists analytics_events_retention_brin_idx
  on public.analytics_events using brin (occurred_at)
  with (pages_per_range = 32);

create index if not exists analytics_sessions_retention_brin_idx
  on public.analytics_sessions using brin (last_seen_at)
  with (pages_per_range = 32);

create index if not exists operational_event_logs_retention_brin_idx
  on public.operational_event_logs using brin (created_at)
  with (pages_per_range = 32);

create index if not exists payment_integration_events_retention_brin_idx
  on public.payment_integration_events using brin (received_at)
  with (pages_per_range = 32);

create index if not exists transactional_email_logs_retention_brin_idx
  on public.transactional_email_logs using brin (created_at)
  with (pages_per_range = 32);

create or replace function public.purge_ephemeral_history(
  p_session_grace_days integer default 30,
  p_quota_days integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_prisma_session regclass := to_regclass('plu_prisma."Session"');
  v_session_grace interval := make_interval(
    days => greatest(7, coalesce(p_session_grace_days, 30))
  );
  v_quota_cutoff date := current_date - greatest(30, coalesce(p_quota_days, 120));
begin
  if to_regclass('public.athlete_sessions') is not null then
    delete from public.athlete_sessions
    where expires_at < now() - v_session_grace
       or revoked_at < now() - v_session_grace;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('athlete_sessions', v_count);
  end if;

  if v_prisma_session is not null then
    -- SQL dinamico evita que una instalacion sin Prisma intente resolver la
    -- relacion al compilar/lintar la funcion. El nombre sigue siendo fijo y
    -- completamente calificado; solo el intervalo viaja como parametro.
    execute format(
      'delete from %s where %I < now() - $1 or %I < now() - $1',
      v_prisma_session,
      'expiresAt',
      'revokedAt'
    ) using v_session_grace;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('staff_sessions', v_count);
  end if;

  if to_regclass('public.analytics_ingest_quota') is not null then
    delete from public.analytics_ingest_quota
    where day < v_quota_cutoff;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('analytics_ingest_quota', v_count);
  end if;

  return v_result;
end;
$$;

revoke all on function public.purge_ephemeral_history(integer, integer)
  from public, anon, authenticated;
grant execute on function public.purge_ephemeral_history(integer, integer)
  to service_role;

alter table public.athlete_sessions set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- Prisma no forma parte del esquema Supabase que levanta CI. En produccion el
-- esquema existe, pero una base limpia tiene que poder aplicar exactamente el
-- mismo historial sin crear una dependencia artificial con Prisma.
do $$
begin
  if to_regclass('plu_prisma."Session"') is not null then
    execute $sql$
      alter table plu_prisma."Session" set (
        autovacuum_vacuum_scale_factor = 0.05,
        autovacuum_analyze_scale_factor = 0.02
      )
    $sql$;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'plu-storage-nightly';

    perform cron.schedule(
      'plu-storage-nightly',
      '40 4 * * *',
      $cron$
        select public.purge_defense_counters();
        select public.purge_operational_history();
        select public.purge_cron_history(3);
        select public.enforce_analytics_storage_budget();
        select public.purge_ephemeral_history();
      $cron$
    );
  end if;
end;
$$;

-- Primera pasada acotada: solo sesiones vencidas/revocadas hace mas de 30 dias
-- y cuotas diarias anteriores a 120 dias.
select public.purge_ephemeral_history();

comment on function public.purge_ephemeral_history(integer, integer) is
  'Purga sesiones inertes y cuotas de analitica antiguas; conserva margen de diagnostico y no toca auditoria.';
