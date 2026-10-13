-- Comprobantes: ledger de archivos y papelera (borrado lógico en dos etapas).
--
-- Depende de 20261213100000_payment_proof_archive.sql y de
-- 20261214100000_payment_proof_integrity.sql.
--
-- Hasta ahora una orden sólo conocía su comprobante VIGENTE y borrarlo era
-- irreversible: se sacaba el objeto de Storage y se vaciaba el path. Los
-- reemplazos y las subidas abandonadas quedaban huérfanos para siempre.
--
-- Ciclo de vida de un archivo:
--
--   activo ──(vence la política | baja manual | lo reemplaza otro | se borra el atleta)──▶
--   en papelera (deleted_at) ──(pasa el período de gracia)──▶ purgado (purged_at)
--          ▲                              │
--          └──────── restaurar ───────────┘   (solo antes de la purga)
--
-- Mientras está en la papelera el objeto sigue en el bucket. La purga física
-- (borrar de Storage) la hace el backend y después marca `purged_at` con
-- `proof_mark_purged`; la fila queda como registro.
--
-- Atletas y entradas conservan su semántica (path en null = sin comprobante
-- vigente); `payment_proof_trashed_at` distingue "en la papelera" de "nunca
-- hubo". La tienda entra al ledger y a la papelera, pero no a la política de
-- retención ni al ZIP (no tiene exported_at/purged_at ni el mismo vocabulario
-- de estados).

-- ---------------------------------------------------------------------
-- 1. Período de gracia de la papelera
-- ---------------------------------------------------------------------
alter table public.payment_proof_settings
  add column if not exists trash_grace_days int not null default 30;

do $grace$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_proof_settings_trash_grace_days_check'
      and conrelid = 'public.payment_proof_settings'::regclass
  ) then
    alter table public.payment_proof_settings
      add constraint payment_proof_settings_trash_grace_days_check
      check (trash_grace_days between 1 and 3650);
  end if;
end
$grace$;

comment on column public.payment_proof_settings.trash_grace_days is
  'Días que un archivo permanece en la papelera (restaurable) antes de borrarse de Storage.';

-- ---------------------------------------------------------------------
-- 2. Ledger de archivos
-- ---------------------------------------------------------------------
create table if not exists public.payment_proof_files (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('athlete', 'ticket', 'shop')),
  -- Null sólo en huérfanos cuyo path no empieza con un uuid de orden.
  order_id uuid,
  bucket text not null,
  path text not null,
  uploaded_at timestamptz not null default now(),
  -- Foto de payment_proof_exported_at de la orden cuando el archivo sale de ella,
  -- para no perder el "ya lo descargué" si se restaura.
  exported_at timestamptz,
  superseded_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  deleted_reason text
    check (deleted_reason in ('retention', 'manual', 'superseded', 'athlete_deleted', 'orphan')),
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_proof_files_bucket_path_key unique (bucket, path),
  -- Una purga siempre pasa por la papelera, y la papelera siempre dice por qué.
  constraint payment_proof_files_purged_was_deleted check (purged_at is null or deleted_at is not null),
  constraint payment_proof_files_deleted_has_reason check (deleted_at is null or deleted_reason is not null)
);

create index if not exists payment_proof_files_order_idx
  on public.payment_proof_files (source, order_id);

-- La papelera: lo que espera purga, de la más vieja a la más nueva.
create index if not exists payment_proof_files_trash_idx
  on public.payment_proof_files (deleted_at)
  where deleted_at is not null and purged_at is null;

comment on table public.payment_proof_files is
  'Un registro por comprobante subido (vigente, reemplazado, en papelera o purgado). Solo service_role.';

alter table public.payment_proof_files enable row level security;
revoke all on public.payment_proof_files from public, anon, authenticated;
grant select, insert, update on public.payment_proof_files to service_role;

-- ---------------------------------------------------------------------
-- 3. El ledger se mantiene solo: cada path nuevo entra, el reemplazado sale
-- ---------------------------------------------------------------------
create or replace function plu_private.track_proof_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_bucket text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_new_path text;
  v_old_path text;
begin
  v_source := case tg_table_name
    when 'athlete_payment_orders' then 'athlete'
    when 'ticket_orders' then 'ticket'
    else 'shop'
  end;
  v_bucket := case v_source
    when 'athlete' then 'athlete-payment-proofs'
    when 'ticket' then 'ticket-payment-proofs'
    else 'shop-payment-proofs'
  end;

  -- La tienda guarda `proof_path`; atletas y entradas, `payment_proof_path`.
  v_new_path := nullif(btrim(coalesce(v_new ->> 'payment_proof_path', v_new ->> 'proof_path')), '');
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_old_path := nullif(btrim(coalesce(v_old ->> 'payment_proof_path', v_old ->> 'proof_path')), '');
  end if;

  -- Sin archivo nuevo no hay nada que registrar: vaciar el path (papelera o
  -- purga) lo resuelven las RPC, que saben el motivo.
  if v_new_path is null or v_new_path is not distinct from v_old_path then
    return null;
  end if;

  -- Reemplazo: el archivo anterior pasa a la papelera en vez de quedar huérfano.
  if v_old_path is not null then
    update public.payment_proof_files
    set superseded_at = now(),
        deleted_at = coalesce(deleted_at, now()),
        deleted_by = coalesce(deleted_by, 'system'),
        deleted_reason = coalesce(deleted_reason, 'superseded'),
        exported_at = coalesce(exported_at, nullif(v_old ->> 'payment_proof_exported_at', '')::timestamptz)
    where bucket = v_bucket and path = v_old_path and purged_at is null;
  end if;

  insert into public.payment_proof_files (source, order_id, bucket, path, uploaded_at)
  values (
    v_source,
    new.id,
    v_bucket,
    v_new_path,
    coalesce(
      nullif(coalesce(v_new ->> 'payment_proof_uploaded_at', v_new ->> 'proof_uploaded_at'), '')::timestamptz,
      now()
    )
  )
  on conflict (bucket, path) do nothing;

  return null;
end;
$$;

drop trigger if exists athlete_payment_orders_track_proof_file on public.athlete_payment_orders;
create trigger athlete_payment_orders_track_proof_file
  after insert or update of payment_proof_path on public.athlete_payment_orders
  for each row execute function plu_private.track_proof_file();

drop trigger if exists ticket_orders_track_proof_file on public.ticket_orders;
create trigger ticket_orders_track_proof_file
  after insert or update of payment_proof_path on public.ticket_orders
  for each row execute function plu_private.track_proof_file();

drop trigger if exists shop_orders_track_proof_file on public.shop_orders;
create trigger shop_orders_track_proof_file
  after insert or update of proof_path on public.shop_orders
  for each row execute function plu_private.track_proof_file();

-- Backfill: los comprobantes vigentes de hoy entran como activos.
insert into public.payment_proof_files (source, order_id, bucket, path, uploaded_at)
select 'athlete', id, 'athlete-payment-proofs', btrim(payment_proof_path),
       coalesce(payment_proof_uploaded_at, created_at)
from public.athlete_payment_orders
where payment_proof_path is not null and btrim(payment_proof_path) <> ''
on conflict (bucket, path) do nothing;

insert into public.payment_proof_files (source, order_id, bucket, path, uploaded_at)
select 'ticket', id, 'ticket-payment-proofs', btrim(payment_proof_path),
       coalesce(payment_proof_uploaded_at, created_at)
from public.ticket_orders
where payment_proof_path is not null and btrim(payment_proof_path) <> ''
on conflict (bucket, path) do nothing;

insert into public.payment_proof_files (source, order_id, bucket, path, uploaded_at)
select 'shop', id, 'shop-payment-proofs', btrim(proof_path), coalesce(proof_uploaded_at, created_at)
from public.shop_orders
where proof_path is not null and btrim(proof_path) <> ''
on conflict (bucket, path) do nothing;

-- ---------------------------------------------------------------------
-- 4. A la papelera
-- ---------------------------------------------------------------------
-- Núcleo sin guardas de estado: lo usan la baja manual (con guarda) y la
-- retención (que ya sólo elige órdenes resueltas). Devuelve el id del archivo
-- movido, o null si la orden no tenía comprobante vigente.
create or replace function plu_private.proof_trash_core(
  p_source text,
  p_order_id uuid,
  p_reason text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_path text;
  v_exported timestamptz;
  v_bucket text;
  v_file uuid;
begin
  if p_source = 'athlete' then
    v_bucket := 'athlete-payment-proofs';
    select payment_proof_path, payment_proof_exported_at into v_path, v_exported
    from public.athlete_payment_orders where id = p_order_id for update;
    if not found then
      raise exception 'Orden no encontrada.' using errcode = 'PLU02';
    end if;
    if v_path is null then return null; end if;
    update public.athlete_payment_orders
    set payment_proof_path = null, payment_proof_trashed_at = now(), updated_at = now()
    where id = p_order_id;
  elsif p_source = 'ticket' then
    v_bucket := 'ticket-payment-proofs';
    select payment_proof_path, payment_proof_exported_at into v_path, v_exported
    from public.ticket_orders where id = p_order_id for update;
    if not found then
      raise exception 'Orden no encontrada.' using errcode = 'PLU02';
    end if;
    if v_path is null then return null; end if;
    update public.ticket_orders
    set payment_proof_path = null, payment_proof_trashed_at = now(), updated_at = now()
    where id = p_order_id;
  elsif p_source = 'shop' then
    v_bucket := 'shop-payment-proofs';
    select proof_path into v_path from public.shop_orders where id = p_order_id for update;
    if not found then
      raise exception 'Orden no encontrada.' using errcode = 'PLU02';
    end if;
    if v_path is null then return null; end if;
    update public.shop_orders set proof_path = null, updated_at = now() where id = p_order_id;
  else
    raise exception 'Origen de comprobante inválido.' using errcode = 'PLU01';
  end if;

  update public.payment_proof_files
  set deleted_at = now(),
      deleted_by = p_actor,
      deleted_reason = p_reason,
      exported_at = coalesce(exported_at, v_exported)
  where bucket = v_bucket and path = v_path and purged_at is null
  returning id into v_file;

  -- Defensa: un archivo vigente sin fila (no debería pasar tras el backfill).
  if v_file is null then
    insert into public.payment_proof_files
      (source, order_id, bucket, path, exported_at, deleted_at, deleted_by, deleted_reason)
    values (p_source, p_order_id, v_bucket, v_path, v_exported, now(), p_actor, p_reason)
    on conflict (bucket, path) do update
      set deleted_at = coalesce(payment_proof_files.deleted_at, now()),
          deleted_by = coalesce(payment_proof_files.deleted_by, excluded.deleted_by),
          deleted_reason = coalesce(payment_proof_files.deleted_reason, excluded.deleted_reason)
    returning id into v_file;
  end if;

  return v_file;
end;
$$;

-- Baja manual desde el panel. Solo órdenes ya resueltas: mientras una orden
-- espera decisión, el archivo es lo que Finanzas tiene que revisar.
create or replace function public.proof_trash(
  p_source text,
  p_order_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_file uuid;
begin
  if p_source = 'athlete' then
    select status into v_status from public.athlete_payment_orders where id = p_order_id;
  elsif p_source = 'ticket' then
    select status into v_status from public.ticket_orders where id = p_order_id;
  elsif p_source = 'shop' then
    select status into v_status from public.shop_orders where id = p_order_id;
  else
    raise exception 'Origen de comprobante inválido.' using errcode = 'PLU01';
  end if;
  if v_status is null then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if (p_source = 'shop' and v_status = 'pendiente')
     or (p_source <> 'shop' and v_status not in ('aprobado', 'rechazado')) then
    raise exception 'Solo se puede mover a la papelera el comprobante de una orden ya resuelta.'
      using errcode = 'PLU10';
  end if;

  v_file := plu_private.proof_trash_core(p_source, p_order_id, 'manual', p_actor);
  return jsonb_build_object('trashed', v_file is not null, 'fileId', v_file);
end;
$$;

-- Archivos de órdenes que dejan de existir (baja de atleta): van a la papelera
-- en vez de borrarse, así que todavía se pueden descargar durante la gracia.
create or replace function public.proof_trash_order_files(
  p_order_ids uuid[],
  p_reason text,
  p_actor text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_reason not in ('athlete_deleted', 'manual') then
    raise exception 'Motivo de papelera inválido.' using errcode = 'PLU01';
  end if;
  update public.payment_proof_files
  set deleted_at = now(), deleted_by = p_actor, deleted_reason = p_reason
  where order_id = any(coalesce(p_order_ids, array[]::uuid[]))
    and deleted_at is null
    and purged_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Restaurar
-- ---------------------------------------------------------------------
create or replace function public.proof_restore(p_file_id uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.payment_proof_files;
  v_current text;
  v_found boolean;
  v_grace int;
begin
  select * into v_file from public.payment_proof_files where id = p_file_id for update;
  if not found then
    raise exception 'Archivo no encontrado.' using errcode = 'PLU02';
  end if;
  if v_file.purged_at is not null then
    raise exception 'El archivo ya se eliminó definitivamente.' using errcode = 'PLU10';
  end if;
  if v_file.deleted_at is null then
    return jsonb_build_object('restored', false, 'fileId', v_file.id);
  end if;

  -- Pasado el período de gracia el archivo ya es candidato a la purga física.
  -- Si se pudiera restaurar justo entonces, el job podría borrar el objeto de
  -- Storage de un comprobante que acaba de volver a estar vigente. Con el mismo
  -- criterio de corte que usa el job, esa carrera no existe.
  select coalesce(max(trash_grace_days), 30) into v_grace
  from public.payment_proof_settings
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid;
  if v_file.deleted_at <= now() - make_interval(days => v_grace) then
    raise exception 'El archivo superó el período de la papelera y está por eliminarse: descargalo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;
  if v_file.order_id is null then
    raise exception 'El archivo no está asociado a una orden: descargalo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;

  -- Restaurar = volver a ser el comprobante vigente de su orden. Si la orden ya
  -- no existe o tiene otro archivo, no hay dónde ponerlo.
  if v_file.source = 'athlete' then
    select true, payment_proof_path into v_found, v_current
    from public.athlete_payment_orders where id = v_file.order_id for update;
  elsif v_file.source = 'ticket' then
    select true, payment_proof_path into v_found, v_current
    from public.ticket_orders where id = v_file.order_id for update;
  else
    select true, proof_path into v_found, v_current
    from public.shop_orders where id = v_file.order_id for update;
  end if;
  if not coalesce(v_found, false) then
    raise exception 'La orden ya no existe: descargá el archivo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;
  if v_current is not null then
    raise exception 'La orden ya tiene otro comprobante: descargá este archivo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;

  -- Transaction-local: el trigger de "archivo nuevo" no debe borrar la historia.
  perform set_config('plu.proof_restore', 'on', true);
  if v_file.source = 'athlete' then
    update public.athlete_payment_orders
    set payment_proof_path = v_file.path,
        payment_proof_exported_at = v_file.exported_at,
        payment_proof_trashed_at = null,
        payment_proof_purged_at = null,
        updated_at = now()
    where id = v_file.order_id;
  elsif v_file.source = 'ticket' then
    update public.ticket_orders
    set payment_proof_path = v_file.path,
        payment_proof_exported_at = v_file.exported_at,
        payment_proof_trashed_at = null,
        payment_proof_purged_at = null,
        updated_at = now()
    where id = v_file.order_id;
  else
    update public.shop_orders set proof_path = v_file.path, updated_at = now()
    where id = v_file.order_id;
  end if;
  perform set_config('plu.proof_restore', 'off', true);

  update public.payment_proof_files
  set deleted_at = null, deleted_by = null, deleted_reason = null, superseded_at = null
  where id = v_file.id;

  return jsonb_build_object('restored', true, 'fileId', v_file.id, 'source', v_file.source,
                            'orderId', v_file.order_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Purga física: el backend borra el objeto y recién entonces lo marca
-- ---------------------------------------------------------------------
create or replace function public.proof_mark_purged(p_file_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- La orden que había mandado ese archivo a la papelera pasa a "purgado".
  update public.athlete_payment_orders o
  set payment_proof_purged_at = now(), payment_proof_trashed_at = null, updated_at = now()
  from public.payment_proof_files f
  where f.id = any(coalesce(p_file_ids, array[]::uuid[]))
    and f.source = 'athlete' and f.order_id = o.id
    and f.deleted_at is not null and f.purged_at is null
    and f.deleted_reason in ('retention', 'manual')
    and o.payment_proof_trashed_at is not null and o.payment_proof_path is null;

  update public.ticket_orders o
  set payment_proof_purged_at = now(), payment_proof_trashed_at = null, updated_at = now()
  from public.payment_proof_files f
  where f.id = any(coalesce(p_file_ids, array[]::uuid[]))
    and f.source = 'ticket' and f.order_id = o.id
    and f.deleted_at is not null and f.purged_at is null
    and f.deleted_reason in ('retention', 'manual')
    and o.payment_proof_trashed_at is not null and o.payment_proof_path is null;

  update public.payment_proof_files
  set purged_at = now()
  where id = any(coalesce(p_file_ids, array[]::uuid[]))
    and deleted_at is not null and purged_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Retención: lo vencido va a la papelera (nunca se borra directo)
-- ---------------------------------------------------------------------
-- Candidatas según la política. Mismas reglas que `proofPurgeDueAt`:
--   * solo órdenes aprobadas o rechazadas, con archivo vigente y sin purgar;
--   * after_days  -> ancla en approved_at / rejected_at (updated_at si falta);
--   * after_export -> ancla en payment_proof_exported_at (sin descarga no corre);
--   * keep -> nada vence.
-- Atletas filtra por organización; las entradas son de una única organización.
create or replace function plu_private.proof_candidates(p_mode text, p_days int)
returns table (
  source text,
  order_id uuid,
  status text,
  exported_at timestamptz,
  due_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with proofs as (
    select 'athlete'::text as source, id, status, payment_proof_exported_at as exported_at,
           case status
             when 'aprobado' then coalesce(approved_at, updated_at)
             when 'rechazado' then coalesce(rejected_at, updated_at)
           end as decided_at
    from public.athlete_payment_orders
    where organization_id = '00000000-0000-4000-8000-000000000001'::uuid
      and payment_proof_path is not null and btrim(payment_proof_path) <> ''
      and payment_proof_purged_at is null
      and status in ('aprobado', 'rechazado')
    union all
    select 'ticket'::text, id, status, payment_proof_exported_at,
           case status
             when 'aprobado' then coalesce(approved_at, updated_at)
             when 'rechazado' then coalesce(rejected_at, updated_at)
           end
    from public.ticket_orders
    where payment_proof_path is not null and btrim(payment_proof_path) <> ''
      and payment_proof_purged_at is null
      and status in ('aprobado', 'rechazado')
  )
  select source, id, status, exported_at,
         case p_mode
           when 'after_days' then decided_at + make_interval(days => p_days)
           when 'after_export' then exported_at + make_interval(days => p_days)
         end
  from proofs;
$$;

create or replace function public.proof_retention_trash(
  p_mode text,
  p_days int,
  p_limit int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_athlete int := 0;
  v_ticket int := 0;
  v_file uuid;
begin
  if p_mode is null or p_mode not in ('keep', 'after_export', 'after_days') then
    raise exception 'Modo de retención inválido.' using errcode = 'PLU01';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Plazo de retención inválido.' using errcode = 'PLU01';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'Tamaño de tanda inválido.' using errcode = 'PLU01';
  end if;
  if p_mode = 'keep' then
    return jsonb_build_object('athlete', 0, 'ticket', 0);
  end if;

  for r in
    select c.source, c.order_id
    from plu_private.proof_candidates(p_mode, p_days) c
    where c.due_at <= now()
    order by c.due_at
    limit p_limit
  loop
    v_file := plu_private.proof_trash_core(r.source, r.order_id, 'retention', 'system:retention');
    if v_file is not null then
      if r.source = 'athlete' then v_athlete := v_athlete + 1; else v_ticket := v_ticket + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('athlete', v_athlete, 'ticket', v_ticket);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Huérfanos: objetos del bucket que ninguna orden ni el ledger conocen
-- ---------------------------------------------------------------------
-- Subidas firmadas que nunca se registraron. Entran a la papelera (restaurable)
-- y salen por la purga normal. SECURITY DEFINER porque lee storage.objects.
create or replace function public.proof_register_orphans(
  p_min_age interval default interval '24 hours',
  p_limit int default 500
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_gone int;
begin
  if p_min_age < interval '1 hour' then
    raise exception 'La antigüedad mínima es de 1 hora.' using errcode = 'PLU01';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'Tamaño de tanda inválido.' using errcode = 'PLU01';
  end if;

  with orphans as (
    select o.bucket_id, o.name, o.created_at
    from storage.objects o
    where o.bucket_id in ('athlete-payment-proofs', 'ticket-payment-proofs', 'shop-payment-proofs')
      and o.created_at < now() - p_min_age
      and not exists (
        select 1 from public.payment_proof_files f
        where f.bucket = o.bucket_id and f.path = o.name
      )
      and not exists (
        select 1 from public.athlete_payment_orders a
        where o.bucket_id = 'athlete-payment-proofs' and a.payment_proof_path = o.name
      )
      and not exists (
        select 1 from public.ticket_orders t
        where o.bucket_id = 'ticket-payment-proofs' and t.payment_proof_path = o.name
      )
      and not exists (
        select 1 from public.shop_orders s
        where o.bucket_id = 'shop-payment-proofs' and s.proof_path = o.name
      )
    order by o.created_at
    limit p_limit
  )
  insert into public.payment_proof_files
    (source, order_id, bucket, path, uploaded_at, deleted_at, deleted_by, deleted_reason)
  select
    case bucket_id
      when 'athlete-payment-proofs' then 'athlete'
      when 'ticket-payment-proofs' then 'ticket'
      else 'shop'
    end,
    case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then split_part(name, '/', 1)::uuid end,
    bucket_id, name, created_at, now(), 'system:orphans', 'orphan'
  from orphans
  on conflict (bucket, path) do nothing;
  get diagnostics v_count = row_count;

  -- Archivos "activos" cuya orden ya no existe (p. ej. se borró el atleta y la
  -- baja a la papelera no llegó a correr): sin orden no hay a quién mostrarle
  -- ese comprobante, así que van a la papelera como el resto.
  update public.payment_proof_files f
  set deleted_at = now(), deleted_by = 'system:orphans', deleted_reason = 'orphan'
  where f.deleted_at is null
    and f.purged_at is null
    and f.order_id is not null
    and f.uploaded_at < now() - p_min_age
    and not exists (
      select 1 from public.athlete_payment_orders a
      where f.source = 'athlete' and a.id = f.order_id
    )
    and not exists (
      select 1 from public.ticket_orders t where f.source = 'ticket' and t.id = f.order_id
    )
    and not exists (
      select 1 from public.shop_orders s where f.source = 'shop' and s.id = f.order_id
    );
  get diagnostics v_gone = row_count;

  return v_count + v_gone;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Resumen, pronóstico y papelera en una pasada
-- ---------------------------------------------------------------------
-- Reemplaza la versión de 20261214100000: suma `trash`. La firma no cambia.
create or replace function public.payment_proof_overview(
  p_mode text,
  p_days int,
  p_window_days int default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_grace int;
  v_summary jsonb;
  v_forecast jsonb;
  v_trash jsonb;
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

  select coalesce(max(trash_grace_days), 30) into v_grace
  from public.payment_proof_settings where organization_id = v_org;

  with proofs as (
    select payment_proof_path, payment_proof_exported_at, payment_proof_purged_at
    from public.athlete_payment_orders where organization_id = v_org
    union all
    select payment_proof_path, payment_proof_exported_at, payment_proof_purged_at
    from public.ticket_orders
  )
  select jsonb_build_object(
    'onServer', count(*) filter (where payment_proof_path is not null),
    'notDownloaded', count(*) filter (
      where payment_proof_path is not null and payment_proof_exported_at is null),
    'deleted', count(*) filter (where payment_proof_purged_at is not null)
  ) into v_summary
  from proofs;

  select jsonb_build_object(
    'count', count(*) filter (where due_at <= now() + make_interval(days => p_window_days)),
    'notDownloaded', count(*) filter (
      where due_at <= now() + make_interval(days => p_window_days) and exported_at is null),
    'dueNow', count(*) filter (where due_at <= now()),
    'nextDueAt', min(due_at)
  ) into v_forecast
  from plu_private.proof_candidates(p_mode, p_days);

  select jsonb_build_object(
    'count', count(*),
    'oldestDeletedAt', min(deleted_at),
    'graceDays', v_grace,
    'dueForPurge', count(*) filter (where deleted_at <= now() - make_interval(days => v_grace))
  ) into v_trash
  from public.payment_proof_files
  where deleted_at is not null and purged_at is null;

  return jsonb_build_object('summary', v_summary, 'forecast', v_forecast, 'trash', v_trash);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Permisos: solo el backend
-- ---------------------------------------------------------------------
revoke all on function plu_private.proof_trash_core(text, uuid, text, text) from public, anon, authenticated;
revoke all on function plu_private.proof_candidates(text, int) from public, anon, authenticated;

revoke all on function public.proof_trash(text, uuid, text) from public, anon, authenticated;
revoke all on function public.proof_trash_order_files(uuid[], text, text) from public, anon, authenticated;
revoke all on function public.proof_restore(uuid, text) from public, anon, authenticated;
revoke all on function public.proof_mark_purged(uuid[]) from public, anon, authenticated;
revoke all on function public.proof_retention_trash(text, int, int) from public, anon, authenticated;
revoke all on function public.proof_register_orphans(interval, int) from public, anon, authenticated;
revoke all on function public.payment_proof_overview(text, int, int) from public, anon, authenticated;

grant execute on function public.proof_trash(text, uuid, text) to service_role;
grant execute on function public.proof_trash_order_files(uuid[], text, text) to service_role;
grant execute on function public.proof_restore(uuid, text) to service_role;
grant execute on function public.proof_mark_purged(uuid[]) to service_role;
grant execute on function public.proof_retention_trash(text, int, int) to service_role;
grant execute on function public.proof_register_orphans(interval, int) to service_role;
grant execute on function public.payment_proof_overview(text, int, int) to service_role;
-- Los helpers de plu_private los invocan estas funciones, que son SECURITY
-- DEFINER con search_path fijo: service_role no necesita acceso al esquema.

do $verification$
begin
  if to_regclass('public.payment_proof_files') is null
     or to_regprocedure('public.proof_trash(text,uuid,text)') is null
     or to_regprocedure('public.proof_restore(uuid,text)') is null
     or to_regprocedure('public.proof_mark_purged(uuid[])') is null
     or to_regprocedure('public.proof_retention_trash(text,integer,integer)') is null
     or to_regprocedure('public.proof_register_orphans(interval,integer)') is null
     or to_regprocedure('public.proof_trash_order_files(uuid[],text,text)') is null
     or to_regprocedure('plu_private.proof_candidates(text,integer)') is null
     or not exists (
       select 1 from pg_trigger
       where tgname in ('athlete_payment_orders_track_proof_file')
         and not tgisinternal)
     or not exists (
       select 1 from pg_trigger
       where tgname = 'ticket_orders_track_proof_file' and not tgisinternal)
     or not exists (
       select 1 from pg_trigger
       where tgname = 'shop_orders_track_proof_file' and not tgisinternal) then
    raise exception 'La verificación del ledger de comprobantes no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
