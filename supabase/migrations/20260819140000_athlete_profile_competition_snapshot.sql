-- Perfil de competencia y foto inmutable al crear una inscripción.
--
-- Los datos personales se conservan en athletes para reutilizarlos. La
-- inscripción guarda además el estado con el que la persona se anotó: cambios
-- posteriores de teléfono/equipo no reescriben el registro operativo de un
-- torneo ya creado.

alter table public.athletes
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists instagram_handle text;

alter table public.athletes
  drop constraint if exists athletes_instagram_handle_format_check;

alter table public.athletes
  add constraint athletes_instagram_handle_format_check
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

alter table public.event_registrations
  add column if not exists athlete_profile_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.update_athlete_profile_v2(
  p_athlete_id uuid,
  p_email text,
  p_phone text,
  p_city text,
  p_province text,
  p_gym text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_instagram_handle text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_emergency_phone text := nullif(trim(p_emergency_contact_phone), '');
  v_instagram_handle text := nullif(regexp_replace(trim(p_instagram_handle), '^@', ''), '');
begin
  if v_emergency_phone is not null
    and length(regexp_replace(v_emergency_phone, '\D', '', 'g')) not between 8 and 15 then
    raise exception 'El teléfono de emergencia debe tener entre 8 y 15 dígitos.' using errcode = 'PLU01';
  end if;

  if v_instagram_handle is not null and v_instagram_handle !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'El usuario de Instagram no es válido.' using errcode = 'PLU01';
  end if;

  update public.athletes
    set email = lower(trim(p_email)),
        phone = trim(p_phone),
        city = trim(p_city),
        province = trim(p_province),
        gym = nullif(trim(p_gym), ''),
        emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
        emergency_contact_phone = v_emergency_phone,
        instagram_handle = v_instagram_handle,
        updated_at = now()
    where id = p_athlete_id
    returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return to_jsonb(v_athlete);
end;
$$;

revoke all on function public.update_athlete_profile_v2(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_athlete_profile_v2(uuid, text, text, text, text, text, text, text, text)
  to service_role;

create or replace function plu_private.capture_registration_athlete_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  select * into v_athlete from public.athletes where id = new.athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  new.athlete_profile_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'fullName', v_athlete.full_name,
    'documentId', v_athlete.document_id,
    'birthDate', v_athlete.birth_date,
    'sex', v_athlete.sex,
    'team', v_athlete.gym,
    'phone', v_athlete.phone,
    'country', v_athlete.country,
    'province', v_athlete.province,
    'city', v_athlete.city,
    'email', v_athlete.email,
    'emergencyContactName', v_athlete.emergency_contact_name,
    'emergencyContactPhone', v_athlete.emergency_contact_phone,
    'instagramHandle', v_athlete.instagram_handle
  ));
  return new;
end;
$$;

drop trigger if exists capture_registration_athlete_snapshot on public.event_registrations;
create trigger capture_registration_athlete_snapshot
  before insert on public.event_registrations
  for each row execute function plu_private.capture_registration_athlete_snapshot();
