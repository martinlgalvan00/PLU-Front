-- Purga de bitacoras: resolver la columna de fecha por catalogo — PLU ARG
--
-- `purge_operational_history` de `20260818140000` asumia `created_at` en las
-- cuatro tablas. `payment_integration_events` no la tiene: usa `received_at`.
-- Como el `delete` estaba dentro de un unico bloque plpgsql, el error 42703
-- abortaba la funcion entera y **ninguna** de las cuatro tablas se purgaba: una
-- rutina de mantenimiento que fallaba en silencio es peor que no tenerla,
-- porque el espacio sigue creciendo mientras el job figura programado.
--
-- La correccion no es cambiar el nombre de la columna a mano. Es dejar de
-- adivinarlo: se resuelve contra `information_schema` en tiempo de ejecucion,
-- tomando la primera columna disponible de una lista de candidatas por tabla. Si
-- mañana una tabla se renombra o se agrega otra bitacora, la funcion se adapta
-- en vez de romperse.
--
-- Cada tabla ademas se purga en su propio bloque con manejo de excepcion: una
-- que falle no puede volver a arrastrar a las otras tres.

create or replace function public.purge_operational_history(
  p_audit_days integer default 365,
  p_email_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_target record;
  v_column text;
  v_count integer;
begin
  for v_target in
    select *
    from (values
      ('operational_event_logs',     greatest(30, coalesce(p_audit_days, 365))),
      ('domain_audit_logs',          greatest(30, coalesce(p_audit_days, 365))),
      ('payment_integration_events', greatest(30, coalesce(p_audit_days, 365))),
      ('transactional_email_logs',   greatest(30, coalesce(p_email_days, 180)))
    ) as t(table_name, retention_days)
  loop
    if to_regclass('public.' || v_target.table_name) is null then
      continue;
    end if;

    -- Primera candidata que exista. El orden importa: se prefiere la fecha de
    -- creacion del registro sobre la de su ultima modificacion, porque purgar
    -- por `updated_at` conservaria para siempre cualquier fila que se toque.
    select c.column_name into v_column
    from information_schema.columns c
    join unnest(array['created_at', 'received_at', 'occurred_at', 'sent_at']) with ordinality as p(name, priority)
      on p.name = c.column_name
    where c.table_schema = 'public'
      and c.table_name = v_target.table_name
      and c.data_type like 'timestamp%'
    order by p.priority
    limit 1;

    if v_column is null then
      v_result := v_result || jsonb_build_object(v_target.table_name, 'sin columna de fecha');
      continue;
    end if;

    begin
      execute format(
        'delete from public.%I where %I < now() - make_interval(days => $1)',
        v_target.table_name, v_column
      ) using v_target.retention_days;
      get diagnostics v_count = row_count;
      v_result := v_result || jsonb_build_object(v_target.table_name, v_count);
    exception when others then
      -- Una tabla con una FK que impide el borrado no puede dejar sin purgar al
      -- resto. Se anota el motivo y se sigue.
      v_result := v_result || jsonb_build_object(v_target.table_name, 'error: ' || sqlerrm);
    end;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.purge_operational_history(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_operational_history(integer, integer) to service_role;

-- Primera pasada real. La anterior nunca llego a ejecutarse.
select public.purge_operational_history();
