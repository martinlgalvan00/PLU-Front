-- Armado de grilla: el tablero del torneo — PLU ARG
--
-- `staff_get_event_schedule` (20260806230000) devuelve días, tandas y cuántos
-- atletas hay en cada una. Alcanza para la asignación masiva desde el listado
-- de inscripciones, pero no para armar la grilla: contar no dice si la Tanda G
-- quedó con tres personas y la F con veintidós, ni quién está en cada una, ni
-- quién falta ubicar.
--
-- Este tablero devuelve el roster completo. El dataset lo permite: un torneo
-- de PLU ARG son decenas o pocos cientos de inscriptos, no un producto masivo
-- -- el mismo criterio con el que `list_athlete_admin_data` devuelve el padrón
-- entero en una sola llamada.

-- ---------------------------------------------------------------------------
-- 1. Atletas de una inscripción, en forma de fila del tablero
-- ---------------------------------------------------------------------------
-- Un solo lugar para decidir qué se muestra de cada atleta al armar la grilla:
-- lo que hace falta para agrupar (categoría, división, peso) y para
-- reconocerlo (nombre, gimnasio). Sin documento ni contacto: armar tandas no
-- necesita PII.
create or replace function plu_private.board_registration_rows(p_event_id uuid)
returns table (
  id uuid,
  athlete_id uuid,
  full_name text,
  gym text,
  division text,
  category text,
  bodyweight_kg numeric,
  status text,
  event_day_id uuid,
  event_session_id uuid,
  checked_in boolean
)
language sql
stable
set search_path = public
as $$
  select
    r.id,
    r.athlete_id,
    a.full_name,
    coalesce(nullif(trim(a.gym), ''), '') as gym,
    r.division,
    r.category,
    r.bodyweight_kg,
    r.status,
    r.event_day_id,
    r.event_session_id,
    (c.id is not null) as checked_in
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = p_event_id
    and r.status <> 'cancelada'
$$;

revoke all on function plu_private.board_registration_rows(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. El tablero
-- ---------------------------------------------------------------------------
-- Orden de competencia dentro de cada tanda: categoría, división y después
-- peso. Es el orden en el que se arma una planilla de powerlifting, así que la
-- pantalla no tiene que reordenar nada para ser útil.
create or replace function public.staff_get_event_board(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'slug', v_event.slug,
      'title', v_event.title,
      'startsAt', v_event.starts_at,
      'endsAt', v_event.ends_at,
      'status', v_event.status,
      'registrationClosesAt', v_event.registration_closes_at
    ),
    'totals', jsonb_build_object(
      'registered', (select count(*) from plu_private.board_registration_rows(v_event.id)),
      'assigned', (
        select count(*) from plu_private.board_registration_rows(v_event.id)
        where event_day_id is not null
      ),
      'unassigned', (
        select count(*) from plu_private.board_registration_rows(v_event.id)
        where event_day_id is null
      )
    ),
    'days', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'dayIndex', d.day_index,
          'label', d.label,
          'date', d.date,
          'assignedCount', (
            select count(*) from plu_private.board_registration_rows(v_event.id) rows
            where rows.event_day_id = d.id
          ),
          'sessions', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'platform', s.platform,
                'weighInAt', s.weigh_in_at,
                'startsAt', s.starts_at,
                'sortOrder', s.sort_order,
                'athletes', (
                  select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'registrationId', rows.id,
                      'athleteId', rows.athlete_id,
                      'fullName', rows.full_name,
                      'gym', rows.gym,
                      'division', rows.division,
                      'category', rows.category,
                      'bodyweightKg', rows.bodyweight_kg,
                      'status', rows.status,
                      'checkedIn', rows.checked_in
                    )
                    order by rows.category, rows.division, rows.bodyweight_kg nulls last, rows.full_name
                  ), '[]'::jsonb)
                  from plu_private.board_registration_rows(v_event.id) rows
                  where rows.event_session_id = s.id
                )
              ) order by s.sort_order, s.name
            ), '[]'::jsonb)
            from public.event_sessions s
            where s.event_day_id = d.id
          ),
          -- Asignados al día pero todavía sin tanda: es un estado intermedio
          -- legítimo y tiene que verse, o esa gente desaparece del tablero.
          'withoutSession', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'registrationId', rows.id,
                'athleteId', rows.athlete_id,
                'fullName', rows.full_name,
                'gym', rows.gym,
                'division', rows.division,
                'category', rows.category,
                'bodyweightKg', rows.bodyweight_kg,
                'status', rows.status,
                'checkedIn', rows.checked_in
              )
              order by rows.category, rows.division, rows.bodyweight_kg nulls last, rows.full_name
            ), '[]'::jsonb)
            from plu_private.board_registration_rows(v_event.id) rows
            where rows.event_day_id = d.id and rows.event_session_id is null
          )
        ) order by d.day_index
      ), '[]'::jsonb)
      from public.event_days d
      where d.event_id = v_event.id
    ),
    'unassigned', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'registrationId', rows.id,
          'athleteId', rows.athlete_id,
          'fullName', rows.full_name,
          'gym', rows.gym,
          'division', rows.division,
          'category', rows.category,
          'bodyweightKg', rows.bodyweight_kg,
          'status', rows.status,
          'checkedIn', rows.checked_in
        )
        order by rows.category, rows.division, rows.bodyweight_kg nulls last, rows.full_name
      ), '[]'::jsonb)
      from plu_private.board_registration_rows(v_event.id) rows
      where rows.event_day_id is null
    )
  );
end;
$$;

revoke all on function public.staff_get_event_board(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_board(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Reparto sugerido
-- ---------------------------------------------------------------------------
-- Con doscientos inscriptos, repartir a mano es el trabajo; revisar un reparto
-- ya hecho es una tarea de diez minutos. Esto llena las tandas de UN día en
-- orden de competencia (categoría → división → peso), respetando un tope por
-- tanda.
--
-- Dos decisiones deliberadas:
--
--   * Solo toca inscripciones SIN día asignado. Nunca mueve a alguien que la
--     organización ya ubicó a mano: una "sugerencia" que pisa decisiones
--     previas es una trampa, no una ayuda.
--   * Respeta lo que cada tanda ya tiene. El tope cuenta los que están, así
--     que correrlo dos veces no desborda nada.
--
-- Devuelve cuántos ubicó y cuántos quedaron afuera por falta de lugar, para
-- que la pantalla lo diga en vez de dar el reparto por completo.
create or replace function public.staff_autofill_event_day(
  p_event_slug text,
  p_day_index int,
  p_max_per_session int,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_day public.event_days;
  v_session record;
  v_placed int := 0;
  v_room int;
  v_taken int;
begin
  if p_max_per_session is null or p_max_per_session < 1 then
    raise exception 'El tope por tanda debe ser al menos 1.' using errcode = 'PLU01';
  end if;

  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_day
  from public.event_days
  where event_id = v_event.id and day_index = p_day_index;
  if not found then
    raise exception 'El día no existe en este evento.' using errcode = 'PLU01';
  end if;

  if not exists (select 1 from public.event_sessions where event_day_id = v_day.id) then
    raise exception 'Este día todavía no tiene tandas cargadas.' using errcode = 'PLU03';
  end if;

  for v_session in
    select s.id, s.sort_order, s.name
    from public.event_sessions s
    where s.event_day_id = v_day.id
    order by s.sort_order, s.name
  loop
    select count(*) into v_taken
    from public.event_registrations
    where event_session_id = v_session.id and status <> 'cancelada';

    v_room := p_max_per_session - v_taken;
    if v_room <= 0 then continue; end if;

    with candidates as (
      select r.id
      from public.event_registrations r
      join public.athletes a on a.id = r.athlete_id
      where r.event_id = v_event.id
        and r.status <> 'cancelada'
        and r.event_day_id is null
      -- Orden de competencia: así una tanda queda con gente comparable y no
      -- con una mezcla arbitraria de categorías y pesos.
      order by r.category, r.division, r.bodyweight_kg nulls last, a.full_name
      limit v_room
    )
    update public.event_registrations r
    set event_day_id = v_day.id,
        event_session_id = v_session.id,
        updated_at = now()
    from candidates
    where r.id = candidates.id;

    get diagnostics v_taken = row_count;
    v_placed := v_placed + v_taken;
  end loop;

  perform plu_private.record_domain_audit(
    'registration.schedule_autofilled', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'dayIndex', p_day_index,
      'maxPerSession', p_max_per_session,
      'placed', v_placed
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'placed', v_placed,
    'remaining', (
      select count(*) from public.event_registrations
      where event_id = v_event.id and status <> 'cancelada' and event_day_id is null
    ),
    'board', public.staff_get_event_board(v_event.slug)
  );
end;
$$;

revoke all on function public.staff_autofill_event_day(text, int, int, text)
  from public, anon, authenticated;
grant execute on function public.staff_autofill_event_day(text, int, int, text) to service_role;
