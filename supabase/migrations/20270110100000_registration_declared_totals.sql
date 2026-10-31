-- Máximo total declarado en la inscripción.
-- Quien ya compitió carga el total de competencia. Quien hace su primer torneo
-- carga el máximo entrenando. Las inscripciones viejas quedan en null: no se
-- inventa un número. El perfil del atleta conserva el otro total para la
-- próxima inscripción.

alter table public.event_registrations
  add column if not exists is_first_meet boolean,
  add column if not exists competition_best_total_kg numeric(6,2),
  add column if not exists training_best_total_kg numeric(6,2);

alter table public.event_registrations
  drop constraint if exists event_registrations_declared_totals_check;
alter table public.event_registrations
  add constraint event_registrations_declared_totals_check
  check (
    (
      is_first_meet is null
      and competition_best_total_kg is null
      and training_best_total_kg is null
    )
    or (
      is_first_meet = false
      and competition_best_total_kg >= 10
      and competition_best_total_kg <= 2000
      and training_best_total_kg is null
    )
    or (
      is_first_meet = true
      and training_best_total_kg >= 10
      and training_best_total_kg <= 2000
      and competition_best_total_kg is null
    )
  );

comment on column public.event_registrations.is_first_meet is
  'True si al inscribirse declaró que es su primer torneo. Null en inscripciones anteriores a este dato.';
comment on column public.event_registrations.competition_best_total_kg is
  'Máximo total de competencia declarado (kg). Null si es primer torneo.';
comment on column public.event_registrations.training_best_total_kg is
  'Máximo total entrenando declarado (kg). Solo en el primer torneo.';

alter table public.athletes
  add column if not exists is_first_meet boolean,
  add column if not exists training_best_total_kg numeric(6,2);

alter table public.athletes
  drop constraint if exists athletes_training_best_total_kg_range_check;
alter table public.athletes
  add constraint athletes_training_best_total_kg_range_check
  check (
    training_best_total_kg is null
    or (training_best_total_kg >= 10 and training_best_total_kg <= 2000)
  );

comment on column public.athletes.is_first_meet is
  'Última declaración: true si todavía no compitió. El total de competencia sigue en declared_best_total_kg.';
comment on column public.athletes.training_best_total_kg is
  'Máximo total entrenando (kg). No reemplaza declared_best_total_kg.';

create or replace function plu_private.apply_registration_declared_totals(
  p_registration_id uuid,
  p_is_first_meet boolean,
  p_competition_best_total_kg numeric,
  p_training_best_total_kg numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid;
  v_competition numeric(6,2);
  v_training numeric(6,2);
begin
  if p_is_first_meet is null then
    raise exception 'Indicá si es tu primer torneo.' using errcode = 'PLU01';
  end if;

  if p_is_first_meet then
    if p_training_best_total_kg is null
      or p_training_best_total_kg < 10
      or p_training_best_total_kg > 2000
      or p_competition_best_total_kg is not null then
      raise exception 'En un primer torneo ingresá el máximo total entrenando, entre 10 y 2.000 kg.'
        using errcode = 'PLU01';
    end if;
    v_competition := null;
    v_training := p_training_best_total_kg;
  else
    if p_competition_best_total_kg is null
      or p_competition_best_total_kg < 10
      or p_competition_best_total_kg > 2000
      or p_training_best_total_kg is not null then
      raise exception 'Ingresá el máximo total en competencia, entre 10 y 2.000 kg.'
        using errcode = 'PLU01';
    end if;
    v_competition := p_competition_best_total_kg;
    v_training := null;
  end if;

  update public.event_registrations
  set is_first_meet = p_is_first_meet,
      competition_best_total_kg = v_competition,
      training_best_total_kg = v_training,
      updated_at = now()
  where id = p_registration_id
  returning athlete_id into v_athlete_id;

  if v_athlete_id is null then
    raise exception 'No se pudo guardar el máximo total.' using errcode = 'P0001';
  end if;

  -- El perfil conserva el otro número: un primer torneo no borra un total de
  -- competencia que ya estaba, y una competencia nueva no borra el de entrenamiento.
  update public.athletes
  set is_first_meet = p_is_first_meet,
      training_best_total_kg = case
        when p_is_first_meet then v_training
        else training_best_total_kg
      end,
      declared_best_total_kg = case
        when p_is_first_meet then declared_best_total_kg
        else v_competition
      end,
      updated_at = now()
  where id = v_athlete_id;
end;
$$;

revoke all on function plu_private.apply_registration_declared_totals(uuid, boolean, numeric, numeric)
  from public, anon, authenticated;

create or replace function public.staff_set_registration_declared_totals(
  p_registration_id uuid,
  p_is_first_meet boolean,
  p_competition_best_total_kg numeric,
  p_training_best_total_kg numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
begin
  perform plu_private.apply_registration_declared_totals(
    p_registration_id,
    p_is_first_meet,
    p_competition_best_total_kg,
    p_training_best_total_kg
  );
  return jsonb_build_object(
    'id', p_registration_id,
    'is_first_meet', p_is_first_meet,
    'competition_best_total_kg', case when p_is_first_meet then null else p_competition_best_total_kg end,
    'training_best_total_kg', case when p_is_first_meet then p_training_best_total_kg else null end
  );
end;
$$;

revoke all on function public.staff_set_registration_declared_totals(uuid, boolean, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.staff_set_registration_declared_totals(uuid, boolean, numeric, numeric)
  to service_role;

create or replace function public.create_competition_registration_checkout_v5(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_currency text,
  p_declared_weight_class text,
  p_secondary_division text,
  p_modalities text[],
  p_additional_categories text[],
  p_is_first_meet boolean,
  p_competition_best_total_kg numeric,
  p_training_best_total_kg numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_registration_id uuid;
begin
  v_result := public.create_competition_registration_checkout_v4(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code, p_default_price,
    p_manual_price, p_manual_payment_channel, p_currency, p_declared_weight_class,
    p_secondary_division, p_modalities, p_additional_categories
  );
  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudo guardar el máximo total.' using errcode = 'P0001';
  end if;
  perform plu_private.apply_registration_declared_totals(
    v_registration_id,
    p_is_first_meet,
    p_competition_best_total_kg,
    p_training_best_total_kg
  );
  v_result := jsonb_set(v_result, '{registration,is_first_meet}', to_jsonb(p_is_first_meet), true);
  v_result := jsonb_set(
    v_result,
    '{registration,competition_best_total_kg}',
    case
      when p_is_first_meet then 'null'::jsonb
      else to_jsonb(p_competition_best_total_kg)
    end,
    true
  );
  v_result := jsonb_set(
    v_result,
    '{registration,training_best_total_kg}',
    case
      when p_is_first_meet then to_jsonb(p_training_best_total_kg)
      else 'null'::jsonb
    end,
    true
  );
  return v_result;
end;
$$;

revoke all on function public.create_competition_registration_checkout_v5(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text, text, text[], text[], boolean, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout_v5(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text, text, text[], text[], boolean, numeric, numeric
) to service_role;

create or replace function public.create_membership_registration_combo_checkout_v5(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_discount_code text,
  p_currency text,
  p_declared_weight_class text,
  p_secondary_division text,
  p_modalities text[],
  p_additional_categories text[],
  p_is_first_meet boolean,
  p_competition_best_total_kg numeric,
  p_training_best_total_kg numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_registration_id uuid;
begin
  v_result := public.create_membership_registration_combo_checkout_v4(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_default_price, p_manual_price,
    p_manual_payment_channel, p_discount_code, p_currency, p_declared_weight_class,
    p_secondary_division, p_modalities, p_additional_categories
  );
  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudo guardar el máximo total.' using errcode = 'P0001';
  end if;
  perform plu_private.apply_registration_declared_totals(
    v_registration_id,
    p_is_first_meet,
    p_competition_best_total_kg,
    p_training_best_total_kg
  );
  v_result := jsonb_set(v_result, '{registration,is_first_meet}', to_jsonb(p_is_first_meet), true);
  v_result := jsonb_set(
    v_result,
    '{registration,competition_best_total_kg}',
    case
      when p_is_first_meet then 'null'::jsonb
      else to_jsonb(p_competition_best_total_kg)
    end,
    true
  );
  v_result := jsonb_set(
    v_result,
    '{registration,training_best_total_kg}',
    case
      when p_is_first_meet then to_jsonb(p_training_best_total_kg)
      else 'null'::jsonb
    end,
    true
  );
  return v_result;
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout_v5(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text, text, text[], text[], boolean, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout_v5(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text, text, text[], text[], boolean, numeric, numeric
) to service_role;

-- Misma edición de perfil que v6, más el primer torneo y el total entrenando.
create or replace function public.update_athlete_profile_v7(
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
  p_country text default null,
  p_street_address text default null,
  p_postal_code text default null,
  p_is_first_meet boolean default false,
  p_training_best_total_kg numeric default null
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
  v_street text := nullif(trim(p_street_address), '');
  v_postal text := nullif(trim(p_postal_code), '');
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
  if p_training_best_total_kg is not null
    and (p_training_best_total_kg < 10 or p_training_best_total_kg > 2000) then
    raise exception 'El máximo total entrenando debe estar entre 10 y 2.000 kg.' using errcode = 'PLU01';
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
  if v_street is not null and char_length(v_street) > 200 then
    raise exception 'La dirección es demasiado larga.' using errcode = 'PLU01';
  end if;
  if v_postal is not null and char_length(v_postal) > 20 then
    raise exception 'El código postal es demasiado largo.' using errcode = 'PLU01';
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
        street_address = v_street,
        postal_code = v_postal,
        emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
        emergency_contact_phone = v_emergency_phone,
        instagram_handle = v_instagram_handle,
        declared_best_total_kg = p_declared_best_total_kg,
        is_first_meet = coalesce(p_is_first_meet, false),
        training_best_total_kg = p_training_best_total_kg,
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

revoke all on function public.update_athlete_profile_v7(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text, numeric, text, text, date, text, text, text, boolean, numeric
) from public, anon, authenticated;
grant execute on function public.update_athlete_profile_v7(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text, numeric, text, text, date, text, text, text, boolean, numeric
) to service_role;

do $verification$
begin
  if to_regprocedure('public.create_competition_registration_checkout_v5(uuid,text,text,text,numeric,text,text,text,numeric,numeric,text,text,text,text,text[],text[],boolean,numeric,numeric)') is null then
    raise exception 'Falta public.create_competition_registration_checkout_v5.';
  end if;
  if to_regprocedure('public.create_membership_registration_combo_checkout_v5(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text,text,text,text,text[],text[],boolean,numeric,numeric)') is null then
    raise exception 'Falta public.create_membership_registration_combo_checkout_v5.';
  end if;
  if to_regprocedure('public.staff_set_registration_declared_totals(uuid,boolean,numeric,numeric)') is null then
    raise exception 'Falta public.staff_set_registration_declared_totals.';
  end if;
  if to_regprocedure('public.update_athlete_profile_v7(uuid,text,text,text,text,text,text,text,text,numeric,text,text,numeric,text,text,date,text,text,text,boolean,numeric)') is null then
    raise exception 'Falta public.update_athlete_profile_v7.';
  end if;
end
$verification$;
