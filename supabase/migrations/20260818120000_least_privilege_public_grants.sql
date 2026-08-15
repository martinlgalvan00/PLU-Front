-- Minimo privilegio para anon/authenticated — PLU ARG
--
-- Supabase aplica de fabrica `grant all on all tables in schema public to anon,
-- authenticated`. Eso deja a los dos roles del navegador con INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES y TRIGGER sobre las 30 tablas del schema, y la
-- unica cosa que hoy frena una escritura es RLS.
--
-- Que RLS alcance no es lo mismo que que sobre defensa. Auditado sobre la base
-- hosteada: `anon` ve 0 filas en memberships, athletes, tickets y
-- event_registrations, asi que las policies estan bien puestas. El problema es
-- estructural: la clave `anon` viaja publicada en el bundle del frontend, y con
-- el GRANT intacto una sola migracion futura que agregue una policy `for all
-- using (true)`, o un `disable row level security` puesto para depurar, se
-- convierte directamente en escritura remota sin autenticar sobre datos de
-- dinero. La barrera queda a un descuido de distancia.
--
-- Esta migracion saca el privilegio base y deja RLS como segunda capa, que es
-- el orden correcto. No toca SELECT: las lecturas publicas (catalogo de eventos
-- del fallback de `fetchPublishedEvents`, planes de membresia, tipos de entrada)
-- siguen exactamente igual, porque lo unico que se revoca es lo que RLS ya
-- estaba bloqueando. Cero cambio funcional, una capa menos de la que depender.
--
-- El browser nunca escribe Supabase directo -- lo hace Express con service_role,
-- que es BYPASSRLS y conserva sus grants de
-- `20260720000000_service_role_data_access.sql`. Verificado antes de escribir
-- esto: en `src/` hay un unico `.from()` (lectura de `events`) y un unico
-- `.rpc()` (`get_membership_by_code_or_token`, wrapper publico de una funcion
-- definer en `plu_private`). Ninguna escritura.

-- ---------------------------------------------------------------------------
-- 1. Quitar la escritura de todas las tablas y vistas de public
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- Sin esto la correccion dura hasta la proxima tabla: los objetos que cree una
-- migracion futura volverian a nacer con el GRANT ALL de fabrica.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;

-- Las secuencias siguen el mismo criterio: sin INSERT no hay nextval legitimo
-- que hacer desde el navegador.
revoke usage, select, update on all sequences in schema public from anon, authenticated;

alter default privileges in schema public
  revoke usage, select, update on sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. public_events_view: vista definer y actualizable
-- ---------------------------------------------------------------------------
--
-- Este es el agujero real, no una hipotesis. La vista se creo en
-- `20260711190000_data_infrastructure_v3_rls.sql` sin `security_invoker`, con lo
-- cual corre con los privilegios de su dueño (`postgres`), que ademas es dueño
-- de `events` y por lo tanto **saltea RLS** (`relforcerowsecurity` esta en
-- false). Y como es una vista simple sobre una sola tabla, Postgres la considera
-- auto-actualizable: `information_schema.views.is_updatable = YES`.
--
-- Sumado al GRANT de fabrica, eso significaba que un UPDATE o un DELETE con la
-- clave `anon` contra `/rest/v1/public_events_view` llegaba a `public.events`
-- con RLS desactivada. Probado contra la base hosteada con un id inexistente
-- (no modifica nada): PATCH y DELETE respondieron 200, o sea que el permiso
-- pasaba; lo unico que evito el daño es que hoy la vista no matchea ninguna fila
-- (ningun evento tiene `visibility_status = 'published'` con `published_at`
-- cargado). Es un critico latente: se vuelve explotable el dia que se publique
-- un evento con ese estado.
--
-- Se corrige por las dos puntas.

-- a) Que la vista deje de ser un tunel alrededor de RLS. Con `security_invoker`
--    la lectura pasa por las policies de `events` como cualquier otra consulta.
alter view public.public_events_view set (security_invoker = true);

-- b) Que ni siquiera exista el privilegio de escribir a traves de ella.
revoke all on public.public_events_view from anon, authenticated;
grant select on public.public_events_view to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funciones de trigger expuestas a anon
-- ---------------------------------------------------------------------------
--
-- Ambas son `security definer` sin argumentos y devuelven `trigger`: no tienen
-- ningun uso legitimo desde PostgREST, y estaban alcanzables por la clave
-- publica solo por el default de `grant execute ... to public` de Postgres.

do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('broadcast_event_capacity_change', 'project_membership_order_target')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn.signature);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Verificacion dentro de la propia migracion
-- ---------------------------------------------------------------------------
--
-- Una correccion de privilegios que se aplica a medias es peor que no aplicarla,
-- porque deja la sensacion de estar cubierto. Si algo quedo con escritura, la
-- migracion falla y no se marca como aplicada.

do $$
declare
  v_restante text;
begin
  select string_agg(distinct table_name || ' (' || grantee || ')', ', ')
  into v_restante
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_restante is not null then
    raise exception 'Quedaron privilegios de escritura para anon/authenticated en: %', v_restante;
  end if;
end;
$$;
