-- Lista de interés para apertura de inscripciones / cobros.
-- Solo el service role (Express) escribe y lee; sin políticas RLS públicas.

create table if not exists public.launch_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'launch_teaser',
  event_slug text,
  created_at timestamptz not null default now(),
  constraint launch_interest_email_unique unique (email)
);

create index if not exists launch_interest_created_at_idx
  on public.launch_interest (created_at desc);

create index if not exists launch_interest_event_slug_idx
  on public.launch_interest (event_slug)
  where event_slug is not null;

alter table public.launch_interest enable row level security;

revoke all on table public.launch_interest from anon, authenticated;
grant select, insert, update on table public.launch_interest to service_role;

comment on table public.launch_interest is
  'Emails que pidieron aviso al abrir cobros/inscripciones. Operar vía service role / Express.';
