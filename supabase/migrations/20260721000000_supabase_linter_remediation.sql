-- Corrige las advertencias de Security Advisor y Performance Advisor sin
-- cambiar la autorizacion efectiva del dominio.
--
-- 1. Fija search_path en helpers no privilegiados.
-- 2. Saca los SECURITY DEFINER del schema expuesto por PostgREST.
-- 3. Conserva las RPC publicas de credenciales como wrappers SECURITY INVOKER.
-- 4. Evita reevaluar auth.uid() por fila.
-- 5. Consolida policies permisivas que se superponian por rol y operacion.

-- ---------------------------------------------------------------------
-- search_path fijo
-- ---------------------------------------------------------------------

alter function public.ticket_price_for_day_pass(text)
  set search_path = pg_catalog;
alter function public.event_ticket_addons_catalog(jsonb)
  set search_path = pg_catalog;
alter function public.ticket_addons_total_and_snapshot(jsonb, jsonb)
  set search_path = pg_catalog;
alter function public.membership_price()
  set search_path = pg_catalog;
alter function public.registration_price()
  set search_path = pg_catalog;
alter function public.athlete_payment_status_for_method(text)
  set search_path = pg_catalog;
alter function public.next_member_code(text)
  set search_path = pg_catalog;

-- ---------------------------------------------------------------------
-- SECURITY DEFINER fuera de schemas expuestos
-- ---------------------------------------------------------------------

create schema if not exists plu_private;
revoke all on schema plu_private from public, anon, authenticated, service_role;

alter function public.is_admin() set schema plu_private;
alter function public.handle_new_user() set schema plu_private;
alter function public.can_check_in() set schema plu_private;
alter function public.can_approve_ticket_payment() set schema plu_private;
alter function public.can_view_admin_data() set schema plu_private;
alter function public.is_org_member(uuid) set schema plu_private;
alter function public.has_org_role(uuid, text[]) set schema plu_private;
alter function public.can_read_org_row(uuid) set schema plu_private;
alter function public.can_write_org_row(uuid) set schema plu_private;
alter function public.get_membership_by_code_or_token(text, text) set schema plu_private;
alter function public.get_ticket_by_qr_token(uuid) set schema plu_private;
alter function public.project_membership_order_target() set schema plu_private;

-- rls_auto_enable existe en el proyecto remoto, pero no forma parte del
-- historial versionado. Si esta presente, se endurece sin romper DB nuevas.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set schema plu_private';
  end if;
end
$$;

revoke all on all functions in schema plu_private
  from public, anon, authenticated, service_role;
alter default privileges in schema plu_private
  revoke execute on functions from public;

grant usage on schema plu_private to anon, authenticated, service_role;

grant execute on function plu_private.is_admin()
  to authenticated, service_role;
grant execute on function plu_private.can_check_in()
  to authenticated, service_role;
grant execute on function plu_private.can_approve_ticket_payment()
  to authenticated, service_role;
grant execute on function plu_private.can_view_admin_data()
  to authenticated, service_role;
grant execute on function plu_private.is_org_member(uuid)
  to authenticated, service_role;
grant execute on function plu_private.has_org_role(uuid, text[])
  to authenticated, service_role;
grant execute on function plu_private.can_read_org_row(uuid)
  to authenticated, service_role;
grant execute on function plu_private.can_write_org_row(uuid)
  to authenticated, service_role;
grant execute on function plu_private.get_membership_by_code_or_token(text, text)
  to anon, authenticated, service_role;
grant execute on function plu_private.get_ticket_by_qr_token(uuid)
  to anon, authenticated, service_role;

-- Los nombres publicos de los helpers se mantienen para no romper funciones
-- SQL antiguas que los invocan por nombre. Al ser SECURITY INVOKER ya no
-- exponen directamente una funcion privilegiada por /rest/v1/rpc.
create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.is_admin(); $$;

create function public.can_check_in()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.can_check_in(); $$;

create function public.can_approve_ticket_payment()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.can_approve_ticket_payment(); $$;

create function public.can_view_admin_data()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.can_view_admin_data(); $$;

create function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.is_org_member(p_organization_id); $$;

create function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.has_org_role(p_organization_id, p_roles); $$;

create function public.can_read_org_row(p_organization_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.can_read_org_row(p_organization_id); $$;

create function public.can_write_org_row(p_organization_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select plu_private.can_write_org_row(p_organization_id); $$;

-- Estas dos RPC siguen siendo publicas porque son las proyecciones minimas
-- que consumen los QR. La implementacion privilegiada queda en plu_private.
create function public.get_membership_by_code_or_token(
  p_code text,
  p_event_slug text default null
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select plu_private.get_membership_by_code_or_token(p_code, p_event_slug);
$$;

create function public.get_ticket_by_qr_token(p_qr_token uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select plu_private.get_ticket_by_qr_token(p_qr_token);
$$;

revoke all on function public.is_admin()
  from public, anon, authenticated, service_role;
revoke all on function public.can_check_in()
  from public, anon, authenticated, service_role;
revoke all on function public.can_approve_ticket_payment()
  from public, anon, authenticated, service_role;
revoke all on function public.can_view_admin_data()
  from public, anon, authenticated, service_role;
revoke all on function public.is_org_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.has_org_role(uuid, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.can_read_org_row(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_write_org_row(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_membership_by_code_or_token(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_ticket_by_qr_token(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_admin()
  to authenticated, service_role;
grant execute on function public.can_check_in()
  to authenticated, service_role;
grant execute on function public.can_approve_ticket_payment()
  to authenticated, service_role;
grant execute on function public.can_view_admin_data()
  to authenticated, service_role;
grant execute on function public.is_org_member(uuid)
  to authenticated, service_role;
grant execute on function public.has_org_role(uuid, text[])
  to authenticated, service_role;
grant execute on function public.can_read_org_row(uuid)
  to authenticated, service_role;
grant execute on function public.can_write_org_row(uuid)
  to authenticated, service_role;
grant execute on function public.get_membership_by_code_or_token(text, text)
  to anon, authenticated, service_role;
grant execute on function public.get_ticket_by_qr_token(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- auth_rls_initplan: auth.uid() se calcula una vez por sentencia
-- ---------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Policies permisivas consolidadas
-- ---------------------------------------------------------------------

-- events: una policy SELECT por rol y una por cada operacion de escritura.
drop policy if exists events_select_public on public.events;
drop policy if exists events_select_admin on public.events;
drop policy if exists events_write_admin on public.events;
drop policy if exists events_read_org_member on public.events;
drop policy if exists events_write_org_operator on public.events;

create policy events_select_public_anon
  on public.events
  for select
  to anon
  using (published = true);

create policy events_select_authenticated
  on public.events
  for select
  to authenticated
  using (
    published = true
    or (select plu_private.is_admin())
    or plu_private.can_read_org_row(organization_id)
  );

create policy events_insert_authenticated
  on public.events
  for insert
  to authenticated
  with check (
    (select plu_private.is_admin())
    or plu_private.can_write_org_row(organization_id)
  );

create policy events_update_authenticated
  on public.events
  for update
  to authenticated
  using (
    (select plu_private.is_admin())
    or plu_private.can_write_org_row(organization_id)
  )
  with check (
    (select plu_private.is_admin())
    or plu_private.can_write_org_row(organization_id)
  );

create policy events_delete_authenticated
  on public.events
  for delete
  to authenticated
  using (
    (select plu_private.is_admin())
    or plu_private.can_write_org_row(organization_id)
  );

-- Tablas operativas: admin global conserva lectura; los permisos de escritura
-- siguen dependiendo exclusivamente del rol dentro de la organizacion.
drop policy if exists event_registrations_select_admin on public.event_registrations;
drop policy if exists event_registrations_read_org_member on public.event_registrations;
drop policy if exists event_registrations_write_org_operator on public.event_registrations;

create policy event_registrations_select_authenticated
  on public.event_registrations
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or plu_private.can_read_org_row(organization_id)
  );

create policy event_registrations_insert_org_operator
  on public.event_registrations
  for insert
  to authenticated
  with check (plu_private.can_write_org_row(organization_id));

create policy event_registrations_update_org_operator
  on public.event_registrations
  for update
  to authenticated
  using (plu_private.can_write_org_row(organization_id))
  with check (plu_private.can_write_org_row(organization_id));

create policy event_registrations_delete_org_operator
  on public.event_registrations
  for delete
  to authenticated
  using (plu_private.can_write_org_row(organization_id));

drop policy if exists ticket_orders_select_admin on public.ticket_orders;
drop policy if exists ticket_orders_read_org_member on public.ticket_orders;
drop policy if exists ticket_orders_write_org_operator on public.ticket_orders;

create policy ticket_orders_select_authenticated
  on public.ticket_orders
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or plu_private.can_read_org_row(organization_id)
  );

create policy ticket_orders_insert_org_operator
  on public.ticket_orders
  for insert
  to authenticated
  with check (plu_private.can_write_org_row(organization_id));

create policy ticket_orders_update_org_operator
  on public.ticket_orders
  for update
  to authenticated
  using (plu_private.can_write_org_row(organization_id))
  with check (plu_private.can_write_org_row(organization_id));

create policy ticket_orders_delete_org_operator
  on public.ticket_orders
  for delete
  to authenticated
  using (plu_private.can_write_org_row(organization_id));

drop policy if exists tickets_select_admin on public.tickets;
drop policy if exists tickets_read_org_member on public.tickets;
drop policy if exists tickets_write_org_operator on public.tickets;

create policy tickets_select_authenticated
  on public.tickets
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or plu_private.can_read_org_row(organization_id)
  );

create policy tickets_insert_org_operator
  on public.tickets
  for insert
  to authenticated
  with check (plu_private.can_write_org_row(organization_id));

create policy tickets_update_org_operator
  on public.tickets
  for update
  to authenticated
  using (plu_private.can_write_org_row(organization_id))
  with check (plu_private.can_write_org_row(organization_id));

create policy tickets_delete_org_operator
  on public.tickets
  for delete
  to authenticated
  using (plu_private.can_write_org_row(organization_id));

drop policy if exists organization_members_read_same_org on public.organization_members;
drop policy if exists organization_members_write_admin on public.organization_members;

create policy organization_members_select_same_org
  on public.organization_members
  for select
  to authenticated
  using (plu_private.can_read_org_row(organization_id));

create policy organization_members_insert_admin
  on public.organization_members
  for insert
  to authenticated
  with check (plu_private.has_org_role(organization_id, array['owner', 'admin']));

create policy organization_members_update_admin
  on public.organization_members
  for update
  to authenticated
  using (plu_private.has_org_role(organization_id, array['owner', 'admin']))
  with check (plu_private.has_org_role(organization_id, array['owner', 'admin']));

create policy organization_members_delete_admin
  on public.organization_members
  for delete
  to authenticated
  using (plu_private.has_org_role(organization_id, array['owner', 'admin']));

-- Catalogo: anon ve solo datos publicados; authenticated tiene una sola
-- policy SELECT que suma la lectura publica y la lectura total del admin.
drop policy if exists event_days_select_public on public.event_days;
drop policy if exists event_days_admin on public.event_days;

create policy event_days_select_public_anon
  on public.event_days
  for select
  to anon
  using (exists (
    select 1
    from public.events e
    where e.id = event_days.event_id and e.published = true
  ));

create policy event_days_select_authenticated
  on public.event_days
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or exists (
      select 1
      from public.events e
      where e.id = event_days.event_id and e.published = true
    )
  );

create policy event_days_insert_admin
  on public.event_days for insert to authenticated
  with check ((select plu_private.is_admin()));
create policy event_days_update_admin
  on public.event_days for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));
create policy event_days_delete_admin
  on public.event_days for delete to authenticated
  using ((select plu_private.is_admin()));

drop policy if exists ticket_types_select_public on public.ticket_types;
drop policy if exists ticket_types_admin on public.ticket_types;

create policy ticket_types_select_public_anon
  on public.ticket_types
  for select
  to anon
  using (active and exists (
    select 1
    from public.events e
    where e.id = ticket_types.event_id and e.published = true
  ));

create policy ticket_types_select_authenticated
  on public.ticket_types
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or (
      active and exists (
        select 1
        from public.events e
        where e.id = ticket_types.event_id and e.published = true
      )
    )
  );

create policy ticket_types_insert_admin
  on public.ticket_types for insert to authenticated
  with check ((select plu_private.is_admin()));
create policy ticket_types_update_admin
  on public.ticket_types for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));
create policy ticket_types_delete_admin
  on public.ticket_types for delete to authenticated
  using ((select plu_private.is_admin()));

drop policy if exists ticket_type_days_select_public on public.ticket_type_days;
drop policy if exists ticket_type_days_admin on public.ticket_type_days;

create policy ticket_type_days_select_public_anon
  on public.ticket_type_days
  for select
  to anon
  using (exists (
    select 1
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.id = ticket_type_days.ticket_type_id
      and tt.active
      and e.published = true
  ));

create policy ticket_type_days_select_authenticated
  on public.ticket_type_days
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or exists (
      select 1
      from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_days.ticket_type_id
        and tt.active
        and e.published = true
    )
  );

create policy ticket_type_days_insert_admin
  on public.ticket_type_days for insert to authenticated
  with check ((select plu_private.is_admin()));
create policy ticket_type_days_update_admin
  on public.ticket_type_days for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));
create policy ticket_type_days_delete_admin
  on public.ticket_type_days for delete to authenticated
  using ((select plu_private.is_admin()));

drop policy if exists ticket_type_included_addons_select_public
  on public.ticket_type_included_addons;
drop policy if exists ticket_type_included_addons_admin
  on public.ticket_type_included_addons;

create policy ticket_type_included_addons_select_public_anon
  on public.ticket_type_included_addons
  for select
  to anon
  using (exists (
    select 1
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.id = ticket_type_included_addons.ticket_type_id
      and tt.active
      and e.published = true
  ));

create policy ticket_type_included_addons_select_authenticated
  on public.ticket_type_included_addons
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or exists (
      select 1
      from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_included_addons.ticket_type_id
        and tt.active
        and e.published = true
    )
  );

create policy ticket_type_included_addons_insert_admin
  on public.ticket_type_included_addons for insert to authenticated
  with check ((select plu_private.is_admin()));
create policy ticket_type_included_addons_update_admin
  on public.ticket_type_included_addons for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));
create policy ticket_type_included_addons_delete_admin
  on public.ticket_type_included_addons for delete to authenticated
  using ((select plu_private.is_admin()));
