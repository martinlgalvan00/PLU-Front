-- Tokens de recuperacion de contraseña de atletas.
-- El link enviado por email contiene el token crudo; la base solo guarda
-- un hash SHA-256 para poder invalidarlo despues del primer uso.

create table if not exists public.athlete_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists athlete_password_reset_tokens_athlete_idx
  on public.athlete_password_reset_tokens (athlete_id, expires_at desc);

create index if not exists athlete_password_reset_tokens_active_idx
  on public.athlete_password_reset_tokens (token_hash)
  where used_at is null;

alter table public.athlete_password_reset_tokens enable row level security;

revoke all on public.athlete_password_reset_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.athlete_password_reset_tokens to service_role;

create or replace function public.reset_athlete_password_with_token(
  p_athlete_id uuid,
  p_token_hash text,
  p_password_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_id uuid;
begin
  update public.athlete_password_reset_tokens
     set used_at = now()
   where athlete_id = p_athlete_id
     and token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
   returning id into v_token_id;

  if v_token_id is null then
    return false;
  end if;

  insert into public.athlete_credentials (
    athlete_id,
    password_hash,
    password_updated_at
  )
  values (
    p_athlete_id,
    p_password_hash,
    now()
  )
  on conflict (athlete_id) do update
    set password_hash = excluded.password_hash,
        password_updated_at = excluded.password_updated_at;

  return true;
end;
$$;

revoke all on function public.reset_athlete_password_with_token(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reset_athlete_password_with_token(uuid, text, text)
  to service_role;
