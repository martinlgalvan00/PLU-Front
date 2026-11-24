-- Legajo de documentos del atleta (DNI frente/dorso, certificado médico,
-- autorización de tutor si es menor). El binario vive en Storage; Postgres
-- sólo guarda metadata. Sin cola de aprobación: alcanzar con subirlos.
--
-- Cuentas ya existentes quedan grandfathered para inscribirse a eventos.
-- Pagar afiliación (alta o renovación) y el combo siempre exigen el pack.

alter table public.athletes
  add column if not exists documents_grandfathered boolean not null default false;

update public.athletes
  set documents_grandfathered = true
  where documents_grandfathered is distinct from true;

create table if not exists public.athlete_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind text not null check (
    kind in ('dni_front', 'dni_back', 'medical_certificate', 'minor_authorization')
  ),
  storage_path text not null check (length(btrim(storage_path)) >= 8),
  content_type text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 409600),
  original_name text,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, kind)
);

create index if not exists athlete_documents_athlete_idx
  on public.athlete_documents (athlete_id, kind);

alter table public.athlete_documents enable row level security;
-- Sin policies públicas: lectura y escritura pasan por service_role / RPC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-documents',
  'athlete-documents',
  false,
  409600,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.register_athlete_document(
  p_athlete_id uuid,
  p_kind text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes integer,
  p_original_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_previous public.athlete_documents;
  v_row public.athlete_documents;
  v_folder text;
  v_kind_folder text;
begin
  if p_kind not in ('dni_front', 'dni_back', 'medical_certificate', 'minor_authorization') then
    raise exception 'Tipo de documento inválido.' using errcode = 'PLU01';
  end if;
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Formato de documento inválido.' using errcode = 'PLU01';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 409600 then
    raise exception 'El archivo supera el límite de 400 KB.' using errcode = 'PLU01';
  end if;

  v_folder := split_part(p_storage_path, '/', 1);
  v_kind_folder := split_part(p_storage_path, '/', 2);
  if v_folder <> p_athlete_id::text or v_kind_folder <> p_kind then
    raise exception 'Ruta de documento inválida.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_previous
  from public.athlete_documents
  where athlete_id = p_athlete_id and kind = p_kind;

  insert into public.athlete_documents (
    organization_id, athlete_id, kind, storage_path, content_type, size_bytes, original_name
  ) values (
    v_athlete.organization_id, p_athlete_id, p_kind, p_storage_path, p_content_type,
    p_size_bytes, nullif(btrim(p_original_name), '')
  )
  on conflict (athlete_id, kind) do update set
    storage_path = excluded.storage_path,
    content_type = excluded.content_type,
    size_bytes = excluded.size_bytes,
    original_name = excluded.original_name,
    uploaded_at = now(),
    updated_at = now()
  returning * into v_row;

  update public.athletes
    set updated_at = now()
    where id = p_athlete_id;

  perform plu_private.record_domain_audit(
    'athlete_document.registered',
    'athlete_document',
    v_row.id::text,
    'athlete',
    p_athlete_id::text,
    jsonb_build_object(
      'kind', v_row.kind,
      'replaced', v_previous.id is not null
    ),
    v_athlete.organization_id
  );

  return jsonb_build_object(
    'document', to_jsonb(v_row),
    'previousPath', v_previous.storage_path
  );
end;
$$;

revoke all on function public.register_athlete_document(uuid, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.register_athlete_document(uuid, text, text, text, integer, text)
  to service_role;

do $verification$
begin
  if not exists (select 1 from storage.buckets where id = 'athlete-documents') then
    raise exception 'El bucket de documentos de atleta no quedó creado.' using errcode = 'PLU01';
  end if;
  if to_regclass('public.athlete_documents') is null
    or to_regprocedure(
      'public.register_athlete_document(uuid,text,text,text,integer,text)'
    ) is null then
    raise exception 'La verificación de documentos de atleta no fue superada.'
      using errcode = 'PLU01';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'athletes'
      and column_name = 'documents_grandfathered'
  ) then
    raise exception 'Falta athletes.documents_grandfathered.' using errcode = 'PLU01';
  end if;
end
$verification$;
