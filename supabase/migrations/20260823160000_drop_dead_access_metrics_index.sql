-- Retira un índice muerto por desalineación de columnas — PLU ARG
--
-- `operational_event_logs_action_created_idx` (organization_id, action,
-- created_at desc) se agregó en 20260822110000 para "los accesos se leen por
-- accion y fecha". Pero `get_access_metrics` (misma migración, línea ~244)
-- filtra la tabla por `organization_id + source = 'identity' + created_at`;
-- el filtro por `action` (auth.login_succeeded / auth.login_failed / ...)
-- pasa recién en los CTE `succeeded`/`failed`/`created`, sobre el resultado
-- ya materializado — nunca llega a la cláusula WHERE que el planner podría
-- resolver con este índice. El índice nunca coincidió con el plan real.
--
-- Evidencia de producción (pg_stat_user_indexes, sesión 2026-08-16):
--   operational_event_logs_action_created_idx | idx_scan=3 | idx_tup_read=0 | 272 kB
-- Tres scans en toda su vida y cero tuplas leídas incluso en esos tres: no
-- sirvió ni una sola lectura real. Los otros cuatro índices de la misma tabla
-- (created_idx: 240 scans/164542 tuplas, entity_idx: 471 scans, actor_idx:
-- 330 scans, source_status_idx: 58 scans/7268 tuplas) sí tienen uso real y
-- quedan intactos — esto no es una purga, es un solo índice que nunca estuvo
-- alineado con la query que lo motivó.
--
-- `operational_event_logs_created_idx` (organization_id, created_at desc) ya
-- cubre el filtro real de `get_access_metrics` (organization_id + rango de
-- created_at, con source filtrado en memoria sobre ese rango) — sus 164542
-- tuplas leídas son evidencia de que ya está haciendo ese trabajo. No hace
-- falta reemplazo.
--
-- La tabla se escribe en cada login, cada evento de pago y cada email: un
-- índice de más ahí es costo de escritura permanente por un beneficio de
-- lectura que nunca se cobró.

drop index if exists public.operational_event_logs_action_created_idx;

do $verification$
begin
  if to_regclass('public.operational_event_logs_action_created_idx') is not null then
    raise exception 'operational_event_logs_action_created_idx debería haberse eliminado.' using errcode = 'PLU01';
  end if;
  if to_regclass('public.operational_event_logs_created_idx') is null then
    raise exception 'operational_event_logs_created_idx (el que sí cubre la query real) no puede faltar.' using errcode = 'PLU01';
  end if;
end
$verification$;
