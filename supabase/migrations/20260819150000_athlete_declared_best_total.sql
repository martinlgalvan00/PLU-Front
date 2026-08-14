-- Mejor total declarado por el atleta. Es información de inscripción y de
-- operación; no reemplaza resultados oficiales importados desde LiftingCast.

alter table public.athletes
  add column if not exists declared_best_total_kg numeric(6,2);

alter table public.athletes
  drop constraint if exists athletes_declared_best_total_kg_range_check;

alter table public.athletes
  add constraint athletes_declared_best_total_kg_range_check
  check (declared_best_total_kg is null or (declared_best_total_kg >= 10 and declared_best_total_kg <= 2000));

create or replace function public.update_athlete_profile_v3(
  p_athlete_id uuid,
  p_email text,
  p_phone text,
  p_city text,
  p_province text,
  p_gym text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_instagram_handle text,
  p_declared_best_total_kg numeric
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

  if p_declared_best_total_kg is not null
    and (p_declared_best_total_kg < 10 or p_declared_best_total_kg > 2000) then
    raise exception 'El mejor total debe estar entre 10 y 2.000 kg.' using errcode = 'PLU01';
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
        declared_best_total_kg = p_declared_best_total_kg,
        updated_at = now()
    where id = p_athlete_id
    returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return to_jsonb(v_athlete);
end;
$$;

revoke all on function public.update_athlete_profile_v3(uuid, text, text, text, text, text, text, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.update_athlete_profile_v3(uuid, text, text, text, text, text, text, text, text, numeric)
  to service_role;

-- Reemplaza la función usada por el trigger ya instalado; el trigger conserva
-- su nombre y ahora captura también el total declarado.
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
    'instagramHandle', v_athlete.instagram_handle,
    'declaredBestTotalKg', v_athlete.declared_best_total_kg
  ));
  return new;
end;
$$;
