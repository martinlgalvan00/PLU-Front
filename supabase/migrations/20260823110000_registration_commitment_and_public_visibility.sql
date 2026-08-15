-- La inscripción es un compromiso competitivo: división, categoría y peso
-- declarado quedan fijados al crearla. Los reintentos de checkout pueden
-- cambiar el canal de pago, pero nunca esos datos.
--
-- El padrón público mantiene una proyección mínima (nombre de exhibición,
-- equipo y foto opcional). Cada inscripción nace visible y Administración puede
-- retirarla sin afectar cupo, cobro, credencial ni check-in.

alter table public.event_registrations
  add column if not exists public_visible boolean not null default true;

create index if not exists event_registrations_public_recent_idx
  on public.event_registrations (event_id, created_at desc)
  where public_visible
    and status in ('pendiente_pago', 'pagada', 'confirmada');

create or replace function plu_private.lock_registration_competition_selection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Conserva la selección original incluso si una RPC histórica de reintento
  -- recibe valores distintos. Así, una edición de perfil o un retry no puede
  -- mover al atleta de categoría ni cambiar su peso comprometido.
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

drop trigger if exists lock_registration_competition_selection on public.event_registrations;
create trigger lock_registration_competition_selection
  before update on public.event_registrations
  for each row execute function plu_private.lock_registration_competition_selection();

-- Extiende la edición de perfil para reparar cuentas antiguas que no tenían
-- sexo competitivo. Los demás campos de identidad siguen fuera de esta RPC.
create or replace function public.update_athlete_profile_v4(
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

revoke all on function public.update_athlete_profile_v4(uuid, text, text, text, text, text, text, text, text, numeric, text, text, date, text)
  from public, anon, authenticated;
grant execute on function public.update_athlete_profile_v4(uuid, text, text, text, text, text, text, text, text, numeric, text, text, date, text)
  to service_role;

create or replace function public.staff_set_registration_public_visibility(
  p_registration_id uuid,
  p_public_visible boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
begin
  update public.event_registrations
  set public_visible = p_public_visible,
      updated_at = now()
  where id = p_registration_id
  returning * into v_registration;

  if not found then
    raise exception 'Inscripción no encontrada.' using errcode = 'PLU02';
  end if;

  insert into public.domain_audit_logs(
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_registration.organization_id,
    'registration.public_visibility_updated',
    'event_registration',
    v_registration.id::text,
    'staff',
    p_actor,
    jsonb_build_object('publicVisible', v_registration.public_visible)
  );

  return to_jsonb(v_registration);
end;
$$;

revoke all on function public.staff_set_registration_public_visibility(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_registration_public_visibility(uuid, boolean, text)
  to service_role;

-- El total de cupos no cambia al ocultar una persona; sólo la proyección
-- pública de recientes la excluye. Nunca se exponen DNI, email ni pagos.
create or replace function public.get_event_registration_capacity(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_registered int := 0;
  v_capacity int;
  v_recent jsonb := '[]'::jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;

  v_capacity := v_event.capacity;
  select count(*)::int into v_registered
  from public.event_registrations r
  where r.event_id = v_event.id
    and r.status in ('pendiente_pago', 'pagada', 'confirmada');

  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', item.display_name,
    'gym', item.gym,
    'photoPath', item.photo_path,
    'registeredAt', item.registered_at
  ) order by item.registered_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      case
        when cardinality(np.parts) = 0 or np.parts[1] is null or np.parts[1] = '' then 'Atleta'
        when cardinality(np.parts) = 1 then np.parts[1]
        else array_to_string(np.parts[1:cardinality(np.parts) - 1], ' ') || ' ' || upper(left(np.parts[cardinality(np.parts)], 1)) || '.'
      end as display_name,
      coalesce(nullif(trim(a.gym), ''), '') as gym,
      nullif(trim(a.photo_path), '') as photo_path,
      r.created_at as registered_at
    from public.event_registrations r
    join public.athletes a on a.id = r.athlete_id
    cross join lateral (
      select string_to_array(trim(both from regexp_replace(coalesce(a.full_name, ''), '\s+', ' ', 'g')), ' ') as parts
    ) np
    where r.event_id = v_event.id
      and r.public_visible
      and r.status in ('pendiente_pago', 'pagada', 'confirmada')
    order by r.created_at desc
    limit 8
  ) item;

  return jsonb_build_object(
    'capacity', v_capacity,
    'registered', v_registered,
    'remaining', case when v_capacity is null then null else greatest(v_capacity - v_registered, 0) end,
    'recent', v_recent
  );
end;
$$;

revoke all on function public.get_event_registration_capacity(text) from public, anon, authenticated;
grant execute on function public.get_event_registration_capacity(text) to service_role;
