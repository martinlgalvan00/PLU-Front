-- La base opera en hora argentina, como la federación — PLU ARG
--
-- El bug que esto cierra, encontrado por el E2E de Mercado Pago corriendo a
-- las 23:14 hora argentina: el atleta pagaba la afiliación, Mercado Pago
-- acreditaba, la fila quedaba 'activa'… y Mi cuenta decía "Sin afiliación"
-- con la ficha en "Afiliación programada — comienza mañana".
--
-- La causa: las RPC que fijan la vigencia calculan
--   v_start := greatest(current_date, …)
-- y `current_date` corre en la zona del servidor (UTC en Supabase). Entre las
-- 21:00 y las 00:00 de Argentina, `current_date` ya es MAÑANA: la membresía
-- nace con start_date del día siguiente, el frontend la proyecta SCHEDULED
-- (getMembershipLifecycle) y el que acaba de pagar queda tres horas por día
-- —justo el prime time de pagos— viendo "Sin afiliación", con la credencial
-- deshabilitada hasta la medianoche.
--
-- El mismo desfase corre para TODO lo que compara fechas-calendario:
-- `expiration_date >= current_date` (la membresía "vence" a las 21:00 del día
-- anterior), el año del member_code, la vigencia de planes al filo del día.
--
-- La corrección es una sola decisión, no N parches: la federación opera en
-- Argentina, así que las fechas-calendario de la base se calculan en
-- America/Argentina/Buenos_Aires. Se fija a nivel base (toma en cada conexión
-- nueva) y en los roles de entrada de PostgREST, que es por donde corren todas
-- las RPC del dominio. Los timestamptz no cambian de valor —siguen siendo
-- instantes absolutos—; sólo cambia qué "día" es para `current_date` y los
-- casts `::date`.
--
-- pg_cron no se ve afectado: sus jobs son por intervalo (`* * * * *`,
-- `*/3 * * * *`) y su scheduler usa su propio GUC (`cron.timezone`).
--
-- Nota de despliegue: las conexiones ya abiertas del pooler conservan la zona
-- anterior hasta reciclarse (minutos). No hace falta reiniciar nada.

alter database postgres set timezone to 'America/Argentina/Buenos_Aires';

-- PostgREST entra como `authenticator` y las herramientas administrativas como
-- `postgres`: ambos quedan alineados sin esperar el rollover de la base.
--
-- Best-effort a propósito: en la instancia hosteada `postgres` no es
-- superusuario y podría no tener ADMIN sobre `authenticator`. Si un rol no se
-- puede tocar, se avisa y se sigue — el ajuste a nivel BASE (arriba) es el que
-- garantiza la zona en cada conexión nueva, y es lo único que la verificación
-- exige.
do $roles$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    begin
      alter role authenticator set timezone to 'America/Argentina/Buenos_Aires';
    exception when insufficient_privilege then
      raise notice 'Sin permiso para alterar authenticator: queda cubierto por el ajuste a nivel base.';
    end;
  end if;
  begin
    alter role postgres set timezone to 'America/Argentina/Buenos_Aires';
  exception when insufficient_privilege then
    raise notice 'Sin permiso para alterar postgres: queda cubierto por el ajuste a nivel base.';
  end;
end
$roles$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if not exists (
    select 1
    from pg_db_role_setting s
    join pg_database d on d.oid = s.setdatabase
    where d.datname = current_database()
      and 'TimeZone=America/Argentina/Buenos_Aires' = any(s.setconfig)
  ) then
    raise exception 'La base no quedó en hora argentina.';
  end if;
end
$verification$;
