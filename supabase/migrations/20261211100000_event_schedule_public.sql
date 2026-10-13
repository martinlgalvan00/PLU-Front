-- Grilla pública del evento: interruptor y proyección sin datos personales — PLU ARG
--
-- La organización arma las tandas en el panel y decide, por evento, si se
-- muestran en el sitio oficial. Arranca APAGADO: publicar una grilla a medio
-- armar es peor que no publicarla, y es una decisión que se toma a propósito.
--
-- Qué sale al público: tanda, tablado, horarios y la composición de la tanda
-- (sexos, categorías, divisiones, rango de peso y de edad, cantidad). NO salen
-- nombres, clubes ni documentos: la lista nominal es otra decisión.
--
-- Columna propia y no `rules` / `publicSurface`: staff_upsert_event reconstruye
-- `rules` en cada guardado y su `on conflict` enumera columnas, así que un flag
-- en una columna sobrevive a editar el evento (mismo criterio que
-- `capacity_progress_public`, 20260920100000).

alter table public.events
  add column if not exists schedule_public boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1. Interruptor
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_event_schedule_public(
  p_event_slug text,
  p_public boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if p_public is null then
    raise exception 'Falta indicar si la grilla es pública.' using errcode = 'PLU01';
  end if;

  update public.events
  set schedule_public = p_public, updated_at = now()
  where slug = p_event_slug
  returning * into v_event;

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  perform plu_private.record_domain_audit(
    case when p_public then 'event.schedule_published' else 'event.schedule_unpublished' end,
    'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object('eventSlug', v_event.slug, 'published', v_event.published),
    v_event.organization_id
  );

  return jsonb_build_object('schedulePublic', v_event.schedule_public);
end;
$$;

revoke all on function public.staff_set_event_schedule_public(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_schedule_public(text, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Lectura pública
-- ---------------------------------------------------------------------------
-- Devuelve `{ enabled: false }` si el evento no está publicado o la grilla está
-- apagada: el front no distingue "no existe" de "apagada", y no tiene por qué.
create or replace function public.public_event_schedule(p_event_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found or not v_event.published or not v_event.schedule_public then
    return jsonb_build_object('enabled', false);
  end if;

  return jsonb_build_object(
    'enabled', true,
    'platforms', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'sortOrder', p.sort_order)
        order by p.sort_order, p.name
      ), '[]'::jsonb)
      from public.event_platforms p
      where p.event_id = v_event.id
    ),
    'days', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'dayIndex', d.day_index,
          'label', d.label,
          'date', d.date,
          'sessions', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'name', s.name,
                'platform', s.platform,
                'platformId', s.platform_id,
                'weighInAt', s.weigh_in_at,
                'startsAt', s.starts_at,
                'athleteCount', agg.total,
                'sexes', agg.sexes,
                'categories', agg.categories,
                'divisions', agg.divisions,
                'weightMin', agg.weight_min,
                'weightMax', agg.weight_max,
                'ageMin', agg.age_min,
                'ageMax', agg.age_max
              ) order by s.sort_order, s.name
            ), '[]'::jsonb)
            from public.event_sessions s
            cross join lateral (
              select
                count(*)::int as total,
                coalesce(jsonb_agg(distinct rows.sex)
                  filter (where rows.sex is not null), '[]'::jsonb) as sexes,
                coalesce(jsonb_agg(distinct rows.category)
                  filter (where nullif(trim(rows.category), '') is not null), '[]'::jsonb) as categories,
                coalesce(jsonb_agg(distinct rows.division)
                  filter (where nullif(trim(rows.division), '') is not null), '[]'::jsonb) as divisions,
                min(rows.bodyweight_kg) as weight_min,
                max(rows.bodyweight_kg) as weight_max,
                min(rows.age) as age_min,
                max(rows.age) as age_max
              from plu_private.board_registration_rows(v_event.id) rows
              where rows.event_session_id = s.id
            ) agg
            where s.event_day_id = d.id
          )
        ) order by d.day_index
      ), '[]'::jsonb)
      from public.event_days d
      where d.event_id = v_event.id
    )
  );
end;
$$;

revoke all on function public.public_event_schedule(text) from public, anon, authenticated;
grant execute on function public.public_event_schedule(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Tablero: el panel necesita saber si la grilla está publicada
-- ---------------------------------------------------------------------------
-- Cuerpo vigente (20261210100000) más `schedulePublic`.
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
