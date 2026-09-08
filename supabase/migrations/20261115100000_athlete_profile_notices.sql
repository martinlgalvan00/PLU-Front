-- Avisos in-app de perfil incompleto. El admin los dispara; el atleta los
-- ve en Mi cuenta. La completitud se deriva de los campos, no se guarda
-- como flag. Un solo aviso abierto por atleta (resolved_at is null).

create table if not exists public.athlete_profile_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind text not null default 'profile_incomplete'
    check (kind = 'profile_incomplete'),
  missing_fields jsonb not null default '[]'::jsonb,
  message text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  check (char_length(coalesce(message, '')) <= 280)
);

create unique index if not exists athlete_profile_notices_one_open_idx
  on public.athlete_profile_notices (athlete_id)
  where resolved_at is null;

create index if not exists athlete_profile_notices_athlete_updated_idx
  on public.athlete_profile_notices (athlete_id, updated_at desc);

alter table public.athlete_profile_notices enable row level security;
revoke all on public.athlete_profile_notices from public, anon, authenticated;
grant select, insert, update, delete on public.athlete_profile_notices to service_role;
