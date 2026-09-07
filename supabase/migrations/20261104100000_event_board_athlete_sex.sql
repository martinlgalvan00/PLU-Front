-- Sexo competitivo en el tablero de grilla — PLU ARG
--
-- Armar tandas de powerlifting sin el sexo es operar a ciegas: no se puede
-- evitar mezclar Femenino y Masculino en la misma tanda. El dato ya vive en
-- athletes.sex; el tablero no lo devolvía. Sin documento ni contacto: el
-- sexo competitivo es dato de agrupación, no PII de identidad.
--
-- PostgreSQL no deja agregar una columna a RETURNS TABLE con CREATE OR
-- REPLACE: hay que dropear la función de filas y recrearla. staff_get_event_board
-- es plpgsql y no depende en catálogo de esa firma, así que el drop es seguro.

drop function if exists plu_private.board_registration_rows(uuid);

create function plu_private.board_registration_rows(p_event_id uuid)
returns table (
  id uuid,
  athlete_id uuid,
  full_name text,
  gym text,
  division text,
  category text,
  bodyweight_kg numeric,
  sex text,
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
    a.sex,
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

-- Orden de competencia: sexo → categoría → división → peso. Femenino ordena
-- antes que Masculino alfabéticamente; los null van al final.
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
                      'sex', rows.sex,
                      'status', rows.status,
                      'checkedIn', rows.checked_in
                    )
                    order by rows.sex nulls last, rows.category, rows.division,
                      rows.bodyweight_kg nulls last, rows.full_name
                  ), '[]'::jsonb)
                  from plu_private.board_registration_rows(v_event.id) rows
                  where rows.event_session_id = s.id
                )
              ) order by s.sort_order, s.name
            ), '[]'::jsonb)
            from public.event_sessions s
            where s.event_day_id = d.id
          ),
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
                'sex', rows.sex,
                'status', rows.status,
                'checkedIn', rows.checked_in
              )
              order by rows.sex nulls last, rows.category, rows.division,
                rows.bodyweight_kg nulls last, rows.full_name
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
          'sex', rows.sex,
          'status', rows.status,
          'checkedIn', rows.checked_in
        )
        order by rows.sex nulls last, rows.category, rows.division,
          rows.bodyweight_kg nulls last, rows.full_name
      ), '[]'::jsonb)
      from plu_private.board_registration_rows(v_event.id) rows
      where rows.event_day_id is null
    )
  );
end;
$$;

revoke all on function public.staff_get_event_board(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_board(text) to service_role;
