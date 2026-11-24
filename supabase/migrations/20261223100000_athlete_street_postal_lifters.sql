-- Calle y CP para export Lifters (LiftingCast) y avisos de perfil.
-- Nueva RPC update_athlete_profile_v6; v5 se mantiene por compat.

alter table public.athletes
  add column if not exists street_address text,
  add column if not exists postal_code text;

comment on column public.athletes.street_address is
  'Dirección (calle y número) para planillas de competencia / LiftingCast.';
comment on column public.athletes.postal_code is
  'Código postal del atleta.';

create or replace function public.update_athlete_profile_v6(
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
  p_postal_code text default null
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

revoke all on function public.update_athlete_profile_v6(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text, numeric, text, text, date, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_athlete_profile_v6(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text, numeric, text, text, date, text, text, text
) to service_role;
