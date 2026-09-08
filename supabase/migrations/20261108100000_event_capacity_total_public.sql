-- Visibilidad pública del número total de cupos, independiente de la ocupación.
--
-- `capacity_progress_public` sigue gobernando si el sitio muestra avance
-- (barra, anotados, lugares que quedan). Este flag solo decide si también se
-- publica el “de 200”. Un meet puede querer urgencia real (“quedan 18”) sin
-- anunciar el tamaño del campo.
--
-- Columna propia, no `rules`: el summary público
-- (`get_event_registration_capacity`) ya lee `capacity_progress_public` y
-- sumar un jsonb ahí mezclaba contratos. El upsert completo reconstruye
-- `rules` y no toca columnas nuevas, así que el valor se persiste con un
-- merge post-save, igual que publicSurface / publicCopy.

alter table public.events
  add column if not exists capacity_total_public boolean not null default true;

create or replace function public.staff_merge_event_capacity_total(
  p_slug text,
  p_total_public boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  update public.events
  set
    capacity_total_public = coalesce(p_total_public, true),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_capacity_total(text, boolean)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_capacity_total(text, boolean)
to service_role;

create or replace function public.get_event_registration_capacity(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_registered int := 0;
  v_registered_today int := 0;
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

  select count(*)::int into v_registered_today
  from public.event_registrations r
  where r.event_id = v_event.id
    and r.status in ('pagada', 'confirmada')
    and r.created_at >= (current_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', item.display_name,
    'gym', item.gym,
    'photoPath', item.photo_path,
    'registeredAt', item.registered_at
  ) order by item.registered_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      coalesce(nullif(trim(both from regexp_replace(coalesce(a.full_name, ''), '\s+', ' ', 'g')), ''), 'Atleta')
        as display_name,
      case
        when coalesce(nullif(trim(a.gym), ''), '') = '' then ''
        when trim(a.gym) ~ '^[.\s\-_/·•]+$' then ''
        else trim(a.gym)
      end as gym,
      nullif(trim(a.photo_path), '') as photo_path,
      r.created_at as registered_at
    from public.event_registrations r
    join public.athletes a on a.id = r.athlete_id
    where r.event_id = v_event.id
      and r.public_visible
      and r.status in ('pagada', 'confirmada')
    order by r.created_at desc
    limit 8
  ) item;

  return jsonb_build_object(
    'capacity', v_capacity,
    'registered', v_registered,
    'registeredToday', v_registered_today,
    'remaining', case when v_capacity is null then null else greatest(v_capacity - v_registered, 0) end,
    'recent', v_recent,
    'progressPublic', v_event.capacity_progress_public,
    'totalPublic', v_event.capacity_total_public
  );
end;
$$;
