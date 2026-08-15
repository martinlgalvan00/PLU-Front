-- get_database_usage: consumo del dia en cero, no en null — PLU ARG
--
-- El `coalesce` estaba adentro del subselect:
--
--   (select coalesce(events, 0) from public.analytics_ingest_quota where day = ...)
--
-- Eso cubre una fila con `events` nulo, que es un caso que no existe (la columna
-- es `not null`). El caso real es que **no haya fila**: el primer lote del dia
-- todavia no entro. Ahi el subselect entero devuelve null y el panel muestra
-- "null de 15000" en vez de "0 de 15000".
--
-- El coalesce va afuera.

create or replace function public.get_database_usage(p_limit integer default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'planLimitBytes', 524288000::bigint,
    'usedRatio', round(pg_database_size(current_database())::numeric / 524288000, 4),
    'analyticsBytes', coalesce(pg_total_relation_size('public.analytics_events'), 0),
    'analyticsRows', (select count(*) from public.analytics_events),
    'analyticsToday', coalesce(
      (select events from public.analytics_ingest_quota where day = (now() at time zone 'UTC')::date),
      0
    ),
    'analyticsThrottledToday', coalesce(
      (select throttled_batches from public.analytics_ingest_quota where day = (now() at time zone 'UTC')::date),
      0
    ),
    'analyticsDailyCap', public.analytics_daily_event_cap(),
    'tables', coalesce((
      select jsonb_agg(row_to_json(t) order by t.total_bytes desc)
      from (
        select n.nspname || '.' || c.relname as name,
               pg_total_relation_size(c.oid) as total_bytes,
               pg_relation_size(c.oid) as heap_bytes,
               pg_indexes_size(c.oid) as index_bytes,
               c.reltuples::bigint as estimated_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
        order by pg_total_relation_size(c.oid) desc
        limit greatest(1, least(coalesce(p_limit, 15), 50))
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_database_usage(integer) from public, anon, authenticated;
grant execute on function public.get_database_usage(integer) to service_role;
