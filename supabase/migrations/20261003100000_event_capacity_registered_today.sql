-- get_event_registration_capacity — registeredToday
--
-- El organizador puede ocultar la ocupación (progressPublic=false) y igual
-- queremos prueba social: cuántos se anotaron hoy (día calendario AR).
-- La base ya corre en America/Argentina/Buenos_Aires
-- (20260930100000_organization_timezone_buenos_aires); current_date es AR.

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
    and r.status in ('pendiente_pago', 'pagada', 'confirmada')
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
    'registeredToday', v_registered_today,
    'remaining', case when v_capacity is null then null else greatest(v_capacity - v_registered, 0) end,
    'recent', v_recent,
    'progressPublic', v_event.capacity_progress_public
  );
end;
$$;

revoke all on function public.get_event_registration_capacity(text) from public, anon, authenticated;
grant execute on function public.get_event_registration_capacity(text) to service_role;
