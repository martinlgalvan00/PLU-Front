-- Compatibilidad para instalaciones limpias. La migracion v3 siguiente fue
-- incorporada antes que el modelo multi-organizacion existiera en la cadena
-- Supabase; este puente crea solamente las dependencias que necesita.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null default 'Argentina',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  currency text not null default 'ARS',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations(id, slug, name)
values('00000000-0000-4000-8000-000000000001', 'plu-arg', 'PLU Argentina')
on conflict(slug) do nothing;

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'operator',
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

alter table public.events
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists visibility_status text not null default 'draft',
  add column if not exists lifecycle_status text not null default 'scheduled',
  add column if not exists published_at timestamptz,
  add column if not exists cancelled_at timestamptz;

update public.events set
  organization_id = coalesce(organization_id, '00000000-0000-4000-8000-000000000001'::uuid),
  visibility_status = case when published then 'published' else 'draft' end,
  published_at = case when published then coalesce(published_at, updated_at, created_at, now()) else published_at end;
alter table public.events alter column organization_id set default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.events alter column organization_id set not null;

do $$
declare v_table text;
begin
  foreach v_table in array array['event_registrations', 'ticket_orders', 'tickets'] loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', v_table);
    execute format('update public.%I set organization_id = $1 where organization_id is null', v_table)
      using '00000000-0000-4000-8000-000000000001'::uuid;
    execute format('alter table public.%I alter column organization_id set default %L::uuid', v_table, '00000000-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column organization_id set not null', v_table);
  end loop;
end $$;
