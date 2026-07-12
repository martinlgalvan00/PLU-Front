-- Infraestructura de seguridad multi-organizacion para el modelo de datos v3.
-- Esta migracion es idempotente: las tablas v3 pueden convivir con fases
-- anteriores y cada bloque verifica existencia antes de crear policies/views.

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(p_roles)
  );
$$;

create or replace function public.can_read_org_row(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(p_organization_id);
$$;

create or replace function public.can_write_org_row(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(p_organization_id, array['owner', 'admin', 'operator']);
$$;

alter table if exists public.organizations enable row level security;
alter table if exists public.organization_members enable row level security;
alter table if exists public.events enable row level security;
alter table if exists public.memberships enable row level security;
alter table if exists public.event_registrations enable row level security;
alter table if exists public.ticket_orders enable row level security;
alter table if exists public.tickets enable row level security;
alter table if exists public.payment_orders enable row level security;
alter table if exists public.payments enable row level security;
alter table if exists public.audit_logs enable row level security;
alter table if exists public.integration_events enable row level security;

do $$
begin
  if to_regclass('public.organizations') is not null then
    drop policy if exists organizations_read_member on public.organizations;
    create policy organizations_read_member
      on public.organizations
      for select
      to authenticated
      using (public.can_read_org_row(id));
  end if;
end $$;

do $$
begin
  if to_regclass('public.organization_members') is not null then
    drop policy if exists organization_members_read_same_org on public.organization_members;
    create policy organization_members_read_same_org
      on public.organization_members
      for select
      to authenticated
      using (public.can_read_org_row(organization_id));

    drop policy if exists organization_members_write_admin on public.organization_members;
    create policy organization_members_write_admin
      on public.organization_members
      for all
      to authenticated
      using (public.has_org_role(organization_id, array['owner', 'admin']))
      with check (public.has_org_role(organization_id, array['owner', 'admin']));
  end if;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'events',
    'memberships',
    'event_registrations',
    'ticket_orders',
    'tickets',
    'payment_orders',
    'payments',
    'audit_logs',
    'integration_events'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', table_name || '_read_org_member', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.can_read_org_row(organization_id))',
        table_name || '_read_org_member',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_write_org_operator', table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.can_write_org_row(organization_id)) with check (public.can_write_org_row(organization_id))',
        table_name || '_write_org_operator',
        table_name
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.events') is not null then
    execute $view$
      create or replace view public.public_events_view as
      select
        e.id,
        e.organization_id,
        e.slug,
        e.title,
        e.description,
        e.starts_at,
        e.ends_at,
        e.visibility_status,
        e.lifecycle_status,
        e.published_at
      from public.events e
      where e.visibility_status = 'published'
        and e.published_at is not null
        and e.cancelled_at is null
    $view$;
  end if;
end $$;
