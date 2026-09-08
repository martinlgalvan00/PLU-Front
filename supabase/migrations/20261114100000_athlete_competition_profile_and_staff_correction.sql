-- Perfil competitivo editable (división, categoría, peso estimado) y
-- corrección staff de una inscripción ya comprometida.
--
-- El trigger `lock_registration_competition_selection` sigue protegiendo
-- retries de checkout y ediciones de perfil: una inscripción confirmada no
-- cambia sola. Staff puede saltar ese lock con el GUC
-- `plu.skip_competition_lock` (sólo dentro de la RPC auditada).

create or replace function plu_private.lock_registration_competition_selection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('plu.skip_competition_lock', true) = 'on' then
    return new;
  end if;

  -- Una inscripción cancelada dejó de ser un compromiso. Si el atleta la
  -- revive con un checkout nuevo vuelve a elegir división, categoría y peso.
  if old.status = 'cancelada' and new.status <> 'cancelada' then
    return new;
  end if;

  if old.division is distinct from new.division
     or old.category is distinct from new.category
     or old.bodyweight_kg is distinct from new.bodyweight_kg then
    new.division := old.division;
    new.category := old.category;
    new.bodyweight_kg := old.bodyweight_kg;
  end if;
  return new;
end;
$$;

-- Corrección operativa: cambia el compromiso de una inscripción viva y alinea
-- el perfil del atleta (punto de partida para el próximo torneo). No toca
-- cobro, cupo, estado ni visibilidad pública.
create or replace function public.staff_correct_registration_competition(
  p_registration_id uuid,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_previous_division text;
  v_previous_category text;
  v_previous_bodyweight numeric;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'Falta el actor de la corrección.' using errcode = 'PLU01';
  end if;
  if p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
     or p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited')
     or p_bodyweight_kg is null
     or p_bodyweight_kg < 10
     or p_bodyweight_kg > 250 then
    raise exception 'Datos competitivos inválidos.' using errcode = 'PLU01';
  end if;

  select * into v_registration
  from public.event_registrations
  where id = p_registration_id
  for update;
  if not found then
    raise exception 'Inscripción no encontrada.' using errcode = 'PLU02';
  end if;
  if v_registration.status = 'cancelada' then
    raise exception 'No se puede corregir una inscripción cancelada.' using errcode = 'PLU03';
  end if;

  v_previous_division := v_registration.division;
  v_previous_category := v_registration.category;
  v_previous_bodyweight := v_registration.bodyweight_kg;

  perform set_config('plu.skip_competition_lock', 'on', true);

  update public.event_registrations
  set division = p_division,
      category = p_category,
      bodyweight_kg = p_bodyweight_kg,
      updated_at = now()
  where id = p_registration_id
  returning * into v_registration;

  update public.athletes
  set division = p_division,
      category = p_category,
      estimated_weight = p_bodyweight_kg,
      updated_at = now()
  where id = v_registration.athlete_id;

  perform plu_private.record_domain_audit(
    'registration.competition_corrected',
    'event_registration',
    v_registration.id::text,
    'staff',
    trim(p_actor),
    jsonb_build_object(
      'previousDivision', v_previous_division,
      'newDivision', v_registration.division,
      'previousCategory', v_previous_category,
      'newCategory', v_registration.category,
      'previousBodyweightKg', v_previous_bodyweight,
      'newBodyweightKg', v_registration.bodyweight_kg
    ),
    v_registration.organization_id
  );

  return to_jsonb(v_registration);
end;
$$;

revoke all on function public.staff_correct_registration_competition(uuid, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.staff_correct_registration_competition(uuid, text, text, numeric, text)
  to service_role;

create or replace function public.update_athlete_profile_v5(
  p_athlete_id uuid,
  p_email text,
  p_phone text,
  p_city text,
  p_province text,
  p_gym text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_instagram_handle text,
  p_declared_best_total_kg numeric,
  p_division text,
  p_category text,
  p_estimated_weight numeric,
  p_sex text default null,
  p_full_name text default null,
  p_birth_date date default null,
  p_country text default null
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
  if p_sex is not null and p_sex not in ('Masculino', 'Femenino') then
    raise exception 'El sexo competitivo no es válido.' using errcode = 'PLU01';
  end if;
  if p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters') then
    raise exception 'La división no es válida.' using errcode = 'PLU01';
  end if;
  if p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited') then
    raise exception 'La categoría no es válida.' using errcode = 'PLU01';
  end if;
  if p_estimated_weight is null
     or p_estimated_weight < 10
     or p_estimated_weight > 250 then
    raise exception 'El peso estimado debe estar entre 10 y 250 kg.' using errcode = 'PLU01';
  end if;

  update public.athletes
    set email = lower(trim(p_email)),
        full_name = case
          when nullif(trim(full_name), '') is null then nullif(trim(p_full_name), '')
          else full_name
        end,
        birth_date = case when birth_date is null then p_birth_date else birth_date end,
        country = case
          when nullif(trim(country), '') is null then nullif(trim(p_country), '')
          else country
        end,
        phone = trim(p_phone),
        city = trim(p_city),
        province = trim(p_province),
        gym = nullif(trim(p_gym), ''),
        emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
        emergency_contact_phone = v_emergency_phone,
        instagram_handle = v_instagram_handle,
        declared_best_total_kg = p_declared_best_total_kg,
        division = p_division,
        category = p_category,
        estimated_weight = p_estimated_weight,
        sex = coalesce(p_sex, sex),
        updated_at = now()
    where id = p_athlete_id
    returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;
  return to_jsonb(v_athlete);
end;
$$;

revoke all on function public.update_athlete_profile_v5(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text, numeric, text, text, date, text
) from public, anon, authenticated;
grant execute on function public.update_athlete_profile_v5(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text, numeric, text, text, date, text
) to service_role;
