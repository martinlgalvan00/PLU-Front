-- Bootstrap: perfiles de usuario ligados a auth.users + helper de rol admin.
-- Los valores de role espejan el enum UserRole de prisma/schema.prisma para
-- que la migracion de auth completa (fase posterior) sea aditiva.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'operador_plu_arg'
    check (role in (
      'admin_maximal',
      'admin_plu_arg',
      'operador_plu_arg',
      'viewer_plu_usa',
      'seguridad_plu_arg'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- El GRANT de tabla es necesario ademas de las policies -- RLS solo
-- restringe filas, no reemplaza el privilegio base.
grant select, update on public.profiles to authenticated;

-- SECURITY DEFINER + search_path fijo: evita que un search_path manipulado
-- por el caller redirija la lectura a una tabla "profiles" de otro schema.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin_maximal', 'admin_plu_arg')
  );
$$;

-- Crea el profile automaticamente cuando se registra un usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
