-- Postulación al Cuerpo de Staff (operativo / técnico) — PLU ARG
--
-- PLU necesita reclutar voluntariado para sus eventos y hoy no hay ningún
-- formulario ni tabla para esto. El formulario público vive siempre visible
-- (logeado o no), pero enviarlo exige una cuenta de atleta ya creada —
-- `athlete_id` referencia esa cuenta, no hay alta anónima acá.
--
-- `staff_body` separa operativo de técnico porque solo el segundo tiene un
-- requisito adicional (capacitación PDCA): `technical_training_status`
-- queda nullable a nivel columna y se exige solo cuando corresponde dentro
-- de la RPC, no con un check ciego que rompería al operativo.
--
-- Igual que el resto del dominio: RLS activo sin policies públicas, toda
-- escritura por RPC `security definer`, auditoría vía
-- `plu_private.record_domain_audit`.

create table public.staff_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) >= 2),
  last_name text not null check (length(btrim(last_name)) >= 2),
  document_id text not null check (length(btrim(document_id)) >= 6),
  birth_date date not null,
  street_address text not null check (length(btrim(street_address)) >= 5),
  city text not null check (length(btrim(city)) >= 2),
  province text not null check (length(btrim(province)) >= 2),
  postal_code text not null check (length(btrim(postal_code)) >= 3),
  email text not null,
  phone text not null check (length(btrim(phone)) >= 6),
  staff_body text not null check (staff_body in ('operativo', 'tecnico')),
  technical_training_status text
    check (technical_training_status in ('aprobada', 'en_curso', 'no_realizada')),
  shirt_size text not null check (shirt_size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  photo_path text not null,
  background_check_path text not null,
  background_check_issued_at date not null,
  data_accuracy_declared boolean not null default false check (data_accuracy_declared = true),
  data_processing_consent boolean not null default false check (data_processing_consent = true),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un atleta no puede tener dos postulaciones pendientes a la vez: si la
-- primera queda pendiente, reenviar el formulario no crea una fila nueva
-- hasta que staff la resuelva.
create unique index staff_applications_pending_per_athlete_uidx
  on public.staff_applications (athlete_id)
  where status = 'pendiente';

create index staff_applications_status_idx
  on public.staff_applications (status, created_at desc);

alter table public.staff_applications enable row level security;
-- Sin policies: toda lectura/escritura pasa por las RPC de abajo con
-- service_role, igual que el resto de las tablas de dominio de este repo.

-- Bucket privado, mismo patrón que athlete-payment-proofs: el backend firma
-- la subida (foto de perfil y certificado de antecedentes) y la lectura
-- queda para staff con permiso de postulaciones, nunca una URL pública.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-application-documents',
  'staff-application-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.submit_staff_application(
  p_athlete_id uuid,
  p_first_name text,
  p_last_name text,
  p_document_id text,
  p_birth_date date,
  p_street_address text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_email text,
  p_phone text,
  p_staff_body text,
  p_technical_training_status text,
  p_shirt_size text,
  p_photo_path text,
  p_background_check_path text,
  p_background_check_issued_at date,
  p_data_accuracy_declared boolean,
  p_data_processing_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_applications;
begin
  if not exists (select 1 from public.athletes where id = p_athlete_id) then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;
  if p_staff_body not in ('operativo', 'tecnico') then
    raise exception 'Cuerpo de staff inválido.' using errcode = 'PLU01';
  end if;
  -- Solo el cuerpo técnico declara capacitación PDCA: no es un check de
  -- columna porque el operativo no tiene este campo en absoluto.
  if p_staff_body = 'tecnico' then
    if p_technical_training_status is null
       or p_technical_training_status not in ('aprobada', 'en_curso', 'no_realizada') then
      raise exception 'Falta el estado de capacitación técnica.' using errcode = 'PLU01';
    end if;
  elsif p_technical_training_status is not null then
    raise exception 'El estado de capacitación técnica solo aplica al cuerpo técnico.'
      using errcode = 'PLU01';
  end if;
  if p_shirt_size not in ('XS', 'S', 'M', 'L', 'XL', 'XXL') then
    raise exception 'Talle de chomba inválido.' using errcode = 'PLU01';
  end if;
  if p_data_accuracy_declared is distinct from true
     or p_data_processing_consent is distinct from true then
    raise exception 'Faltan las declaraciones obligatorias.' using errcode = 'PLU01';
  end if;
  if p_background_check_issued_at > current_date then
    raise exception 'La fecha de emisión del certificado no puede ser futura.' using errcode = 'PLU01';
  end if;
  if exists (
    select 1 from public.staff_applications
    where athlete_id = p_athlete_id and status = 'pendiente'
  ) then
    raise exception 'Ya tenés una postulación pendiente de revisión.' using errcode = 'PLU10';
  end if;

  insert into public.staff_applications (
    athlete_id, first_name, last_name, document_id, birth_date,
    street_address, city, province, postal_code, email, phone,
    staff_body, technical_training_status, shirt_size,
    photo_path, background_check_path, background_check_issued_at,
    data_accuracy_declared, data_processing_consent
  ) values (
    p_athlete_id, btrim(p_first_name), btrim(p_last_name), btrim(p_document_id), p_birth_date,
    btrim(p_street_address), btrim(p_city), btrim(p_province), btrim(p_postal_code),
    lower(btrim(p_email)), btrim(p_phone),
    p_staff_body, p_technical_training_status, p_shirt_size,
    p_photo_path, p_background_check_path, p_background_check_issued_at,
    p_data_accuracy_declared, p_data_processing_consent
  )
  returning * into v_row;

  perform plu_private.record_domain_audit(
    'staff_application.submitted',
    'staff_application',
    v_row.id::text,
    'athlete',
    p_athlete_id::text,
    jsonb_build_object('staffBody', v_row.staff_body),
    v_row.organization_id
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.submit_staff_application(
  uuid, text, text, text, date, text, text, text, text, text, text,
  text, text, text, text, text, date, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.submit_staff_application(
  uuid, text, text, text, date, text, text, text, text, text, text,
  text, text, text, text, text, date, boolean, boolean
) to service_role;

create or replace function public.list_staff_applications(
  p_status text default null,
  p_limit int default 50
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at desc), '[]'::jsonb)
  from (
    select sa.*, at.full_name as athlete_full_name
    from public.staff_applications sa
    join public.athletes at on at.id = sa.athlete_id
    where p_status is null or sa.status = p_status
    order by sa.created_at desc
    limit greatest(1, least(p_limit, 200))
  ) a;
$$;

revoke all on function public.list_staff_applications(text, int)
  from public, anon, authenticated;
grant execute on function public.list_staff_applications(text, int) to service_role;

create or replace function public.staff_review_application(
  p_application_id uuid,
  p_status text,
  p_review_notes text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_applications;
begin
  if p_status not in ('aprobada', 'rechazada') then
    raise exception 'Estado de revisión inválido.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la revisión.' using errcode = 'PLU01';
  end if;

  update public.staff_applications
  set status = p_status,
      review_notes = nullif(btrim(p_review_notes), ''),
      reviewed_by = p_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = p_application_id and status = 'pendiente'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'La postulación no existe o ya fue revisada.' using errcode = 'PLU02';
  end if;

  perform plu_private.record_domain_audit(
    'staff_application.reviewed',
    'staff_application',
    v_row.id::text,
    'staff',
    p_actor,
    jsonb_build_object('status', v_row.status, 'notes', v_row.review_notes),
    v_row.organization_id
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.staff_review_application(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_review_application(uuid, text, text, text)
  to service_role;

do $verification$
begin
  if not exists (select 1 from storage.buckets where id = 'staff-application-documents') then
    raise exception 'El bucket de postulaciones de staff no quedó creado.' using errcode = 'PLU01';
  end if;
  if to_regclass('public.staff_applications') is null
    or to_regprocedure(
      'public.submit_staff_application(uuid,text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,date,boolean,boolean)'
    ) is null
    or to_regprocedure('public.list_staff_applications(text,int)') is null
    or to_regprocedure('public.staff_review_application(uuid,text,text,text)') is null then
    raise exception 'La verificación de postulaciones de staff no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
