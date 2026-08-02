-- Cierre de dos escaladas de privilegio en la capa de Supabase Auth + RLS.
--
-- Contexto: la app no usa supabase.auth para loguear a nadie. El login vive en
-- Express (Prisma/Auth0 para staff, athlete_sessions para atletas) y la unica
-- sesion de Supabase que se emite la firma el backend con la service key en
-- server/services/supabaseAuthBridge.js, exclusivamente para los tres roles de
-- staff que necesitan pasar por is_admin()/can_check_in(). Nadie mas deberia
-- llegar a la base con rol `authenticated` -- pero se podia, y con permisos.
--
--   C1. plu_private.can_view_admin_data() era `exists (select 1 from profiles
--       where id = auth.uid())`: sin filtro de rol. Como el trigger
--       on_auth_user_created creaba la fila de profiles para CUALQUIER usuario
--       nuevo de auth.users, y el signup publico estaba habilitado, alcanzaba
--       con registrarse con la anon key (que viaja en el bundle) para leer
--       athletes completo -- nombre, documento, email, telefono, fecha de
--       nacimiento -- mas athlete_payment_orders, memberships, athlete_payments,
--       membership_cycles, ticket_payments, transactional_email_logs,
--       membership_renewal_notifications, embedded_payment_attempts y
--       email_suppressions.
--
--   C2. `grant select, update on public.profiles to authenticated` no lleva
--       lista de columnas, y profiles_update_own solo acota la FILA. La columna
--       `role` quedaba escribible por su propio dueño: un update a
--       role = 'admin_maximal' encendia is_admin() y con eso insert/update/
--       delete sobre events, event_days, ticket_types, ticket_type_days y
--       event_capacity_rules (precios de entradas incluidos) mas select sobre
--       tickets, ticket_orders, event_registrations y check_ins.
--       Esta via no dependia del signup: toda cuenta seguridad_plu_arg recibe
--       una sesion Supabase real del bridge, y son las credenciales de menor
--       confianza del sistema (personal de puerta, repartidas por mail y QR).
--
-- Se corrige en tres capas independientes, para que ninguna sea el unico
-- punto de falla: la funcion filtra por rol, el rol deja de ser escribible, y
-- registrarse ya no otorga perfil.

-- ---------------------------------------------------------------------------
-- C1 · can_view_admin_data() exige un rol de staff real
-- ---------------------------------------------------------------------------
-- Mismo criterio que can_check_in(): la lista es explicita y espeja el enum
-- UserRole de prisma/schema.prisma. viewer_plu_usa entra porque su razon de ser
-- es la lectura del padron; athlete_plu no existe en profiles (los atletas no
-- tienen sesion de Supabase) y un usuario auto-registrado no tiene rol alguno.
create or replace function plu_private.can_view_admin_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in (
        'admin_maximal',
        'admin_plu_arg',
        'operador_plu_arg',
        'viewer_plu_usa'
      )
  );
$$;

-- El wrapper public.can_view_admin_data() es SECURITY INVOKER y delega en el
-- de plu_private (20260721000000:118), asi que no hay que tocarlo: hereda el
-- filtro nuevo. Se reafirman los grants por si la redefinicion los reinicia.
revoke all on function plu_private.can_view_admin_data() from public, anon;
grant execute on function plu_private.can_view_admin_data()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C2 · La columna `role` deja de ser escribible desde el cliente
-- ---------------------------------------------------------------------------
-- profiles no tiene ninguna columna que su dueño necesite editar: `id` es la FK
-- a auth.users, `role` lo asigna el backend y las marcas de tiempo son
-- automaticas. El UPDATE de `authenticated` se revoca entero en vez de
-- acotarse por columna -- no hay caso de uso que preservar.
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

revoke update on public.profiles from authenticated, anon, public;

-- La lectura del propio perfil se conserva: es la unica consulta que el
-- cliente hace legitimamente sobre esta tabla.
revoke insert, delete on public.profiles from authenticated, anon, public;

-- Defensa en profundidad: aunque alguien vuelva a otorgar el UPDATE por error
-- (un `grant all`, una migracion futura, el editor del dashboard), el trigger
-- rechaza cualquier cambio de rol que no venga de la service key.
--
-- SECURITY INVOKER a proposito (es el default, se explicita para que no se
-- "corrija" a DEFINER en una revision futura): dentro de una funcion DEFINER
-- current_user es el owner de la funcion, no el rol efectivo del caller, y la
-- guarda no dispararia nunca. Como INVOKER, current_user es exactamente el rol
-- con el que PostgREST ejecuta la sentencia -- `authenticated` o `service_role`.
create or replace function plu_private.guard_profile_role_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('service_role', 'supabase_admin', 'postgres')
  then
    raise exception 'El rol de un perfil solo lo asigna el backend.'
      using errcode = 'PLU07';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function plu_private.guard_profile_role_change();

-- ---------------------------------------------------------------------------
-- C1 (raiz) · Registrarse en Supabase Auth ya no otorga perfil
-- ---------------------------------------------------------------------------
-- El trigger on_auth_user_created (20260706021905:65) insertaba una fila de
-- profiles con el default 'operador_plu_arg' para todo usuario nuevo de
-- auth.users. Era la pieza que convertia un signup anonimo en una identidad con
-- rol operativo. No hace falta: el unico alta legitima es la del bridge, que
-- hace un upsert explicito con el rol correcto (supabaseAuthBridge.js:84) y
-- funciona igual sin fila previa.
--
-- Se neutraliza la funcion en vez de solo borrar el trigger: si el drop del
-- trigger sobre auth.users falla por permisos en algun entorno, el no-op deja
-- el agujero cerrado de todas formas.
create or replace function plu_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Intencionalmente sin efecto. El perfil lo crea el backend con la service
  -- key cuando corresponde (ver supabaseAuthBridge.ensureSupabaseSessionToken).
  return new;
end;
$$;

do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
exception when insufficient_privilege then
  raise warning 'No se pudo borrar on_auth_user_created; handle_new_user() quedo como no-op.';
end
$$;

-- El default de la columna deja de otorgar un rol operativo. Si alguna
-- insercion se escapa por un camino no previsto, cae en un rol que ninguna de
-- las funciones de autorizacion reconoce.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in (
    'sin_privilegios',
    'admin_maximal',
    'admin_plu_arg',
    'operador_plu_arg',
    'viewer_plu_usa',
    'seguridad_plu_arg'
  ));

alter table public.profiles alter column role set default 'sin_privilegios';

-- Perfiles preexistentes creados por el trigger para usuarios que nunca fueron
-- staff: quedan con 'operador_plu_arg' y, por lo tanto, con lectura del padron.
-- NO se tocan automaticamente. Un DELETE o un UPDATE masivo a ciegas sobre esta
-- tabla puede sacarle el acceso a un operador real dado de alta a mano desde el
-- dashboard, y desde una migracion no hay forma de distinguirlos.
--
-- Revision manual pendiente -- cruzar contra la lista de staff real:
--
--   select p.id, p.role, p.created_at, u.email, u.last_sign_in_at
--     from public.profiles p
--     join auth.users u on u.id = p.id
--    where p.role <> 'sin_privilegios'
--    order by p.created_at desc;
--
-- y degradar los que no correspondan:
--
--   update public.profiles set role = 'sin_privilegios' where id in (...);
do $$
declare
  v_total integer;
begin
  select count(*) into v_total
    from public.profiles
   where role in ('operador_plu_arg', 'viewer_plu_usa');

  if v_total > 0 then
    raise warning
      'Revisar a mano: % perfil(es) con rol operativo heredado. Ver la consulta en 20260802140000_critical_privilege_hardening.sql.',
      v_total;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Cambiar la contraseña de un atleta corta sus sesiones abiertas
-- ---------------------------------------------------------------------------
-- Ni reset_athlete_password_with_token (20260728120000) ni el upsert directo
-- que hacia el repositorio tocaban athlete_sessions. Una cuenta tomada seguia
-- tomada despues del reset: la cookie del atacante vale 30 dias.
create or replace function plu_private.revoke_athlete_sessions(p_athlete_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked integer;
begin
  update public.athlete_sessions
     set revoked_at = now()
   where athlete_id = p_athlete_id
     and revoked_at is null;

  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

revoke all on function plu_private.revoke_athlete_sessions(uuid)
  from public, anon, authenticated, service_role;

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

  -- Los tokens de reset restantes tambien caen: pedir dos enlaces y usar uno
  -- no deberia dejar el otro vivo.
  update public.athlete_password_reset_tokens
     set used_at = now()
   where athlete_id = p_athlete_id
     and used_at is null;

  perform plu_private.revoke_athlete_sessions(p_athlete_id);

  return true;
end;
$$;

revoke all on function public.reset_athlete_password_with_token(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reset_athlete_password_with_token(uuid, text, text)
  to service_role;

-- Cambio de contraseña con sesion iniciada y asignacion desde el panel. Antes
-- era un upsert suelto desde el repositorio (supabaseAthleteRepository.setPassword),
-- que no podia revocar nada porque athlete_sessions no esta expuesta a PostgREST.
create or replace function public.set_athlete_password(
  p_athlete_id uuid,
  p_password_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked integer;
begin
  if not exists (select 1 from public.athletes where id = p_athlete_id) then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
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

  update public.athlete_password_reset_tokens
     set used_at = now()
   where athlete_id = p_athlete_id
     and used_at is null;

  v_revoked := plu_private.revoke_athlete_sessions(p_athlete_id);

  return jsonb_build_object('revokedSessions', v_revoked);
end;
$$;

revoke all on function public.set_athlete_password(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_athlete_password(uuid, text) to service_role;
