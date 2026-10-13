-- Comprobantes: integridad del archivo y lectura agregada (paso 1 de la mejora).
--
-- Depende de 20261213100000_payment_proof_archive.sql (columnas exported_at y
-- purged_at, tabla payment_proof_settings).
--
-- 1. Un comprobante nuevo no hereda el estado del anterior.
--    `register_*_payment_proof` pisa `payment_proof_path` pero dejaba
--    `payment_proof_exported_at` del archivo viejo. Si el staff descargó el
--    primero mientras la orden estaba abierta y el atleta lo reemplazó, la
--    política "después de descargar" veía el archivo nuevo como respaldado y
--    podía borrarlo sin que nadie lo hubiera bajado. Un trigger lo resuelve en
--    un solo lugar, sea cual sea la RPC o el repositorio que cambie el path.
--
-- 2. `payment_proof_overview`: resumen y pronóstico de borrado calculados en la
--    base, en una sola pasada y sin topes. Antes eran 6 `count` más un escaneo
--    de hasta 5000 filas por tabla filtrado en JavaScript, que subcontaba sin
--    avisar al pasar ese número.

-- ---------------------------------------------------------------------
-- 1. Un archivo nuevo nace sin marcas de descarga, acceso ni purga
-- ---------------------------------------------------------------------
-- `payment_proof_trashed_at`: el comprobante vigente está en la papelera (el
-- path de la orden queda en null y el archivo sigue en el bucket hasta que
-- pase el período de gracia). Lo escriben las RPC de 20261214110000.
alter table public.athlete_payment_orders
  add column if not exists payment_proof_trashed_at timestamptz;
alter table public.ticket_orders
  add column if not exists payment_proof_trashed_at timestamptz;

comment on column public.athlete_payment_orders.payment_proof_trashed_at is
  'Cuándo el comprobante vigente se movió a la papelera. Mientras tanto payment_proof_path es null.';
comment on column public.ticket_orders.payment_proof_trashed_at is
  'Cuándo el comprobante vigente se movió a la papelera. Mientras tanto payment_proof_path es null.';

create or replace function plu_private.reset_proof_state_on_new_file()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Restaurar desde la papelera vuelve a poner un archivo que ya tenía su
  -- historia (descargado, etc.): la RPC lo declara con `plu.proof_restore`.
  if coalesce(current_setting('plu.proof_restore', true), '') = 'on' then
    return new;
  end if;
  -- Solo cuando entra un archivo distinto. Borrar el path (purga) o dejarlo
  -- igual no es un archivo nuevo y no toca las marcas.
  if new.payment_proof_path is not null
     and new.payment_proof_path is distinct from old.payment_proof_path then
    new.payment_proof_exported_at := null;
    new.payment_proof_accessed_at := null;
    new.payment_proof_purged_at := null;
    new.payment_proof_trashed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_payment_orders_reset_proof_state on public.athlete_payment_orders;
create trigger athlete_payment_orders_reset_proof_state
  before update of payment_proof_path on public.athlete_payment_orders
  for each row execute function plu_private.reset_proof_state_on_new_file();

drop trigger if exists ticket_orders_reset_proof_state on public.ticket_orders;
create trigger ticket_orders_reset_proof_state
  before update of payment_proof_path on public.ticket_orders
  for each row execute function plu_private.reset_proof_state_on_new_file();

-- ---------------------------------------------------------------------
-- 2. Resumen y pronóstico en una pasada
-- ---------------------------------------------------------------------
-- Mismas reglas que `proofPurgeDueAt` (paymentProofRetention.js):
--   * solo cuentan órdenes aprobadas o rechazadas, con archivo y sin purgar;
--   * after_days  -> ancla en approved_at / rejected_at (updated_at si falta);
--   * after_export -> ancla en payment_proof_exported_at (sin descarga no corre);
--   * keep -> nada vence.
-- Atletas filtra por organización; las entradas son de una única organización.
create or replace function public.payment_proof_overview(
  p_mode text,
  p_days int,
  p_window_days int default 7
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_result jsonb;
begin
  if p_mode is null or p_mode not in ('keep', 'after_export', 'after_days') then
    raise exception 'Modo de retención inválido.' using errcode = 'PLU01';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Plazo de retención inválido.' using errcode = 'PLU01';
  end if;
  if p_window_days is null or p_window_days < 0 or p_window_days > 3650 then
    raise exception 'Ventana de aviso inválida.' using errcode = 'PLU01';
  end if;

  with proofs as (
    select status, payment_proof_path, payment_proof_exported_at, payment_proof_purged_at,
           case status
             when 'aprobado' then coalesce(approved_at, updated_at)
             when 'rechazado' then coalesce(rejected_at, updated_at)
           end as decided_at
    from public.athlete_payment_orders
    where organization_id = v_org
    union all
    select status, payment_proof_path, payment_proof_exported_at, payment_proof_purged_at,
           case status
             when 'aprobado' then coalesce(approved_at, updated_at)
             when 'rechazado' then coalesce(rejected_at, updated_at)
           end
    from public.ticket_orders
  ),
  due as (
    select *,
      case
        when payment_proof_path is null
          or btrim(payment_proof_path) = ''
          or payment_proof_purged_at is not null
          or status not in ('aprobado', 'rechazado') then null
        when p_mode = 'after_days'
          then decided_at + make_interval(days => p_days)
        when p_mode = 'after_export'
          then payment_proof_exported_at + make_interval(days => p_days)
      end as due_at
    from proofs
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'onServer', count(*) filter (where payment_proof_path is not null),
      'notDownloaded', count(*) filter (
        where payment_proof_path is not null and payment_proof_exported_at is null),
      'deleted', count(*) filter (where payment_proof_purged_at is not null)
    ),
    'forecast', jsonb_build_object(
      'count', count(*) filter (
        where due_at <= now() + make_interval(days => p_window_days)),
      'notDownloaded', count(*) filter (
        where due_at <= now() + make_interval(days => p_window_days)
          and payment_proof_exported_at is null),
      'dueNow', count(*) filter (where due_at <= now()),
      'nextDueAt', min(due_at)
    )
  )
  into v_result
  from due;

  return v_result;
end;
$$;

-- Solo el backend (service_role). SECURITY INVOKER: no escala privilegios.
revoke all on function public.payment_proof_overview(text, int, int)
  from public, anon, authenticated;
grant execute on function public.payment_proof_overview(text, int, int)
  to service_role;

comment on function public.payment_proof_overview(text, int, int) is
  'Resumen de comprobantes y pronóstico de purga según una política (guardada o a medio elegir). Solo service_role.';

do $verification$
begin
  if to_regprocedure('public.payment_proof_overview(text,int,int)') is null
     or to_regprocedure('plu_private.reset_proof_state_on_new_file()') is null
     or not exists (
       select 1 from pg_trigger
       where tgname = 'athlete_payment_orders_reset_proof_state' and not tgisinternal)
     or not exists (
       select 1 from pg_trigger
       where tgname = 'ticket_orders_reset_proof_state' and not tgisinternal) then
    raise exception 'La verificación de integridad de comprobantes no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
