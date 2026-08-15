-- Postura de seguridad de la base, verificada contra el catalogo real.
--
-- Los tests estaticos (tests/infra.databaseSchema.test.js) leen el SQL del
-- repositorio: prueban lo que las migraciones *dicen*. Este archivo pregunta
-- por lo que la base *tiene*, que no es lo mismo en cuanto una migracion se
-- aplica a medias, alguien toca un privilegio desde el panel de Supabase o el
-- repositorio queda atrasado respecto del entorno hosteado.
--
-- Es de solo lectura: no inserta, no modifica y termina en rollback. Cualquier
-- desvio aborta con el detalle de que objeto lo provoca.

begin;

do $posture$
declare
  v_offenders text;
  v_count int;
begin
  -- -----------------------------------------------------------------------
  -- 1. RLS activo en todas las tablas de `public`
  -- -----------------------------------------------------------------------
  -- Con el GRANT base ya revocado (20260818120000) RLS es la segunda capa,
  -- pero sigue siendo la unica que limita fila por fila lo que ve service_role
  -- delegado y cualquier rol futuro.
  select string_agg(c.relname, ', ' order by c.relname), count(*)
  into v_offenders, v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_count > 0 then
    raise exception 'Tablas de public sin RLS: %', v_offenders using errcode = 'PLU01';
  end if;

  -- -----------------------------------------------------------------------
  -- 2. El navegador no puede escribir ninguna tabla
  -- -----------------------------------------------------------------------
  -- La clave `anon` viaja en el bundle del frontend y `authenticated` la
  -- obtiene cualquiera que se registre. Ninguno de los dos tiene por que poder
  -- insertar, actualizar o borrar: todo pasa por Express con service_role.
  select string_agg(distinct format('%s(%s a %s)', table_name, privilege_type, grantee), ', '), count(*)
  into v_offenders, v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_count > 0 then
    raise exception 'Escritura abierta al navegador: %', v_offenders using errcode = 'PLU01';
  end if;

  -- -----------------------------------------------------------------------
  -- 3. Las RPC que mueven plata solo las ejecuta el backend
  -- -----------------------------------------------------------------------
  select string_agg(p.proname, ', '), count(*)
  into v_offenders, v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname like 'staff\_%'
      or p.proname in (
        'apply_mercado_pago_payment',
        'apply_ticket_mercado_pago_payment',
        'apply_subscription_payment'
      )
    )
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if v_count > 0 then
    raise exception 'Funciones de staff/cobro ejecutables desde el navegador: %', v_offenders
      using errcode = 'PLU01';
  end if;

  -- -----------------------------------------------------------------------
  -- 4. Toda funcion SECURITY DEFINER fija su search_path
  -- -----------------------------------------------------------------------
  -- Sin esto, una definer resuelve nombres con el path de quien la llama: un
  -- objeto homonimo en otro schema desvia lo que se ejecuta con privilegios de
  -- owner. Se verifica sobre el catalogo porque una funcion puede haber quedado
  -- en la base desde antes de que la regla existiera.
  select string_agg(p.proname, ', ' order by p.proname), count(*)
  into v_offenders, v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'plu_private')
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as config
      where config like 'search_path=%'
    );

  if v_count > 0 then
    raise exception 'Funciones SECURITY DEFINER sin search_path: %', v_offenders
      using errcode = 'PLU01';
  end if;

  -- -----------------------------------------------------------------------
  -- 5. Ninguna vista de public es actualizable por el navegador
  -- -----------------------------------------------------------------------
  -- `public_events_view` fue exactamente este agujero: vista simple, definer
  -- por omision y por lo tanto auto-actualizable, salteando el RLS de `events`.
  select string_agg(table_name, ', '), count(*)
  into v_offenders, v_count
  from information_schema.views v
  where v.table_schema = 'public'
    and v.is_updatable = 'YES'
    and exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = v.table_name
        and g.grantee in ('anon', 'authenticated')
        and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    );

  if v_count > 0 then
    raise exception 'Vistas actualizables expuestas al navegador: %', v_offenders
      using errcode = 'PLU01';
  end if;

  -- -----------------------------------------------------------------------
  -- 6. Las piezas del cobro siguen existiendo
  -- -----------------------------------------------------------------------
  -- Una migracion aplicada a medias deja el esquema respondiendo pero sin la
  -- funcion que acredita: se descubre cuando un socio paga y no le figura.
  foreach v_offenders in array array[
    'public.apply_mercado_pago_payment(uuid, text, text, integer, text, text, text, jsonb)',
    'public.apply_ticket_mercado_pago_payment(uuid, text, text, integer, text, text, text, jsonb)',
    'public.apply_subscription_payment(text, text, text, integer, text, text, text, jsonb)',
    'public.staff_force_settle_payment_order(uuid, text, text, text)',
    'public.staff_set_registration_status(uuid, text, text, text)',
    'public.claim_payment_integration_event(uuid, boolean)',
    'public.complete_payment_integration_event(uuid, boolean, jsonb, text)',
    'public.claim_due_payment_integration_events(integer)',
    'public.claim_embedded_payment_reconciliations(integer)',
    'public.get_payment_operations_summary()',
    'public.get_payment_system_health()'
  ] loop
    if to_regprocedure(v_offenders) is null then
      raise exception 'Falta la funcion de cobro %', v_offenders using errcode = 'PLU02';
    end if;
  end loop;

  -- -----------------------------------------------------------------------
  -- 7. La bitacora de cobros es append-only
  -- -----------------------------------------------------------------------
  -- `operational_event_logs` es la prueba de que paso con cada pago. Si alguien
  -- puede editarla o borrarla, deja de servir para reconstruir un reclamo.
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'operational_event_logs'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('UPDATE', 'DELETE');

  if v_count > 0 then
    raise exception 'La bitacora operativa admite edicion desde el navegador.' using errcode = 'PLU01';
  end if;

  raise notice 'Postura de esquema verificada: RLS, privilegios, definer, vistas y RPC de cobro.';
end;
$posture$;

rollback;
