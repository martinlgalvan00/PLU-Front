-- payment_profiles entra a la postura de seguridad — PLU ARG
--
-- `20261004110000_payment_profiles.sql` creó la tabla y se olvidó de RLS. Sale
-- en CI: `npm run db:verify:schema` (chequeo 1 de supabase/tests/schema_posture.sql)
-- aborta con «Tablas de public sin RLS: payment_profiles» contra la base recién
-- reseteada. No es ruido del verificador — de las 55 tablas de `public` es la
-- única que quedó sin la segunda capa.
--
-- Lo que guarda importa: `config` tiene alias/CBU/titular de la organización y,
-- desde 20261005100000, `secrets_ciphertext` guarda el access token de Mercado
-- Pago cifrado. Nada de eso tiene por qué salir por PostgREST.
--
-- La escritura desde el navegador ya estaba cerrada — 20260818120000 revocó
-- insert/update/delete de `public` y dejó puestos los default privileges, que
-- alcanzan a toda tabla creada después, esta incluida. Lo que ese revoke no
-- tocó, a propósito, es SELECT: las lecturas públicas del catálogo de eventos
-- dependen de él. Esta tabla no es catálogo público, así que acá se revoca
-- explícito en vez de confiar en que RLS tape una lectura que nunca debió
-- estar concedida.
--
-- El backend no se entera. Express usa service_role, que es BYPASSRLS y
-- conserva los grants de 20260720000000;
-- `server/modules/payments/supabasePaymentProfileRepository.js` es el único que
-- toca la tabla y sigue leyendo y escribiendo igual. No se agregan policies a
-- propósito: con RLS activo y sin policy, todo rol que no sea BYPASSRLS ve cero
-- filas, que es exactamente la política deseada — el mismo criterio que
-- platform_payment_channels (20260826110000).

alter table public.payment_profiles enable row level security;

revoke all on public.payment_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.payment_profiles to service_role;

do $verification$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'payment_profiles'
      and c.relrowsecurity
  ) then
    raise exception 'payment_profiles quedó sin RLS.';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'payment_profiles'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'payment_profiles sigue concedida al navegador.';
  end if;

  if not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'payment_profiles'
      and grantee = 'service_role'
      and privilege_type = 'SELECT'
  ) then
    raise exception 'payment_profiles quedó sin acceso para service_role.';
  end if;
end;
$verification$;
