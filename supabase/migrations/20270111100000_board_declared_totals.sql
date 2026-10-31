-- El máximo total se declara al inscribirse y se usa para armar tandas.
-- El tablero no lo traía: había que abrir cada inscripción para verlo.
-- La grilla pública sigue mostrando solo conteos y rangos, nunca el número.

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
  age int,
  status text,
  event_day_id uuid,
  event_session_id uuid,
  checked_in boolean,
  is_first_meet boolean,
  competition_best_total_kg numeric,
  training_best_total_kg numeric
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
    case
      when a.birth_date is null then null
      else extract(year from age(e.starts_at::date, a.birth_date))::int
    end as age,
    r.status,
    r.event_day_id,
    r.event_session_id,
    (c.id is not null) as checked_in,
    r.is_first_meet,
    r.competition_best_total_kg,
    r.training_best_total_kg
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.events e on e.id = r.event_id
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = p_event_id
    and r.status <> 'cancelada'
$$;

revoke all on function plu_private.board_registration_rows(uuid)
  from public, anon, authenticated, service_role;

-- Cuerpo vigente (20261211100000) más el total declarado en cada atleta.
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
    'schedulePublic', v_event.schedule_public,
    'platforms', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'sortOrder', p.sort_order)
        order by p.sort_order, p.name
      ), '[]'::jsonb)
      from public.event_platforms p
      where p.event_id = v_event.id
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
                'platformId', s.platform_id,
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
                      'isFirstMeet', rows.is_first_meet,
                      'competitionBestTotalKg', rows.competition_best_total_kg,
                      'trainingBestTotalKg', rows.training_best_total_kg,
                      'sex', rows.sex,
                      'age', rows.age,
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
                'isFirstMeet', rows.is_first_meet,
                'competitionBestTotalKg', rows.competition_best_total_kg,
                'trainingBestTotalKg', rows.training_best_total_kg,
                'sex', rows.sex,
                'age', rows.age,
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
          'isFirstMeet', rows.is_first_meet,
          'competitionBestTotalKg', rows.competition_best_total_kg,
          'trainingBestTotalKg', rows.training_best_total_kg,
          'sex', rows.sex,
          'age', rows.age,
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
