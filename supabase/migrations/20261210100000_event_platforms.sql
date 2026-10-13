-- Tablados del evento y tandas asociadas a un tablado — PLU ARG
--
-- Hasta ahora la "plataforma" de una tanda era un texto libre (`event_sessions.platform`).
-- Con doble tablado eso no alcanza: hay que poder preguntar cuántos tablados tiene
-- el evento, renombrarlos en un solo lugar y agrupar la grilla por tablado.
--
-- Decisiones:
--
--   * `event_platforms` es el catálogo de tablados de UN evento (1 o 2 en la
--     práctica; el techo de 4 es de integridad, no de producto). Renombrar un
--     tablado es una fila, no editar cada tanda.
--   * `event_sessions.platform_id` apunta al tablado. La columna de texto
--     `platform` NO se elimina: la leen la credencial, el QR de puerta y el
--     roster de check-in (`plu_private.registration_schedule`). Se mantiene
--     sincronizada con el nombre del tablado, así esos consumidores no cambian.
--   * Quitar un tablado deja sus tandas "sin tablado" (platform_id y texto en
--     null): nunca borra tandas ni mueve atletas.
--   * `staff_save_event_sessions` sigue aceptando el texto `platform` del editor
--     de tandas del evento. Si coincide con el nombre de un tablado, la tanda se
--     enlaza; si no, queda como texto legado.

-- ---------------------------------------------------------------------------
-- 1. Tablados
-- ---------------------------------------------------------------------------
create table if not exists public.event_platforms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_platforms_name_not_blank check (length(trim(name)) > 0),
  constraint event_platforms_event_name_key unique (event_id, name)
);

-- Soporte de la FK compuesta de event_sessions: impide enlazar una tanda con el
-- tablado de otro evento sin necesitar un trigger.
create unique index if not exists event_platforms_id_event_uidx
  on public.event_platforms (id, event_id);

create index if not exists event_platforms_event_idx
  on public.event_platforms (event_id, sort_order);

alter table public.event_sessions
  add column if not exists platform_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_sessions_platform_fk'
  ) then
    alter table public.event_sessions
      add constraint event_sessions_platform_fk
      foreign key (platform_id, event_id)
      references public.event_platforms (id, event_id);
  end if;
end $$;

create index if not exists event_sessions_platform_idx
  on public.event_sessions (platform_id);

-- ---------------------------------------------------------------------------
-- 2. RLS de event_platforms
-- ---------------------------------------------------------------------------
-- Mismo criterio que event_sessions: el nombre de un tablado de un evento
-- publicado no es sensible; la escritura es de admin. Policies partidas por rol
-- para no romper el linter de Supabase.
alter table public.event_platforms enable row level security;

drop policy if exists event_platforms_select_public_anon on public.event_platforms;
create policy event_platforms_select_public_anon
  on public.event_platforms
  for select
  to anon
  using (exists (
    select 1
    from public.events e
    where e.id = event_platforms.event_id and e.published = true
  ));

drop policy if exists event_platforms_select_authenticated on public.event_platforms;
create policy event_platforms_select_authenticated
  on public.event_platforms
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or exists (
      select 1
      from public.events e
      where e.id = event_platforms.event_id and e.published = true
    )
  );

drop policy if exists event_platforms_insert_admin on public.event_platforms;
create policy event_platforms_insert_admin
  on public.event_platforms for insert to authenticated
  with check ((select plu_private.is_admin()));

drop policy if exists event_platforms_update_admin on public.event_platforms;
create policy event_platforms_update_admin
  on public.event_platforms for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));

drop policy if exists event_platforms_delete_admin on public.event_platforms;
create policy event_platforms_delete_admin
  on public.event_platforms for delete to authenticated
  using ((select plu_private.is_admin()));

grant select on public.event_platforms to anon, authenticated;
grant insert, update, delete on public.event_platforms to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill: los textos de plataforma que ya existen pasan a ser tablados
-- ---------------------------------------------------------------------------
-- Un evento con tandas que ya dicen "Plataforma 1" / "Plataforma 2" conserva esa
-- estructura. Se respeta el orden de aparición (sort_order mínimo de la tanda).
insert into public.event_platforms (event_id, name, sort_order)
select s.event_id, trim(s.platform), (row_number() over (
  partition by s.event_id order by min(s.sort_order), trim(s.platform)
) - 1)::int
from public.event_sessions s
where nullif(trim(s.platform), '') is not null
group by s.event_id, trim(s.platform)
on conflict (event_id, name) do nothing;

update public.event_sessions s
set platform_id = p.id
from public.event_platforms p
where p.event_id = s.event_id
  and p.name = trim(s.platform)
  and s.platform_id is null;

-- ---------------------------------------------------------------------------
-- 4. Guardar el set de tablados de un evento
-- ---------------------------------------------------------------------------
-- Reemplaza el set completo. Los que traen `id` se renombran/reordenan (y sus
-- tandas heredan el nombre nuevo en la columna de texto); los que no, se crean;
-- los que faltan se quitan y sus tandas quedan sin tablado.
create or replace function public.staff_save_event_platforms(
  p_event_slug text,
  p_platforms jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_item jsonb;
  v_id uuid;
  v_name text;
  v_order int := 0;
  v_keep uuid[] := array[]::uuid[];
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if jsonb_typeof(coalesce(p_platforms, '[]'::jsonb)) <> 'array' then
    raise exception 'Los tablados tienen que ser una lista.' using errcode = 'PLU01';
  end if;

  if jsonb_array_length(coalesce(p_platforms, '[]'::jsonb)) > 4 then
    raise exception 'Un evento admite hasta 4 tablados.' using errcode = 'PLU01';
  end if;

  -- Los nombres son únicos por evento. Se valida antes de escribir para
  -- devolver un mensaje legible en vez de la violación de unique cruda.
  if (
    select count(*) <> count(distinct lower(trim(value ->> 'name')))
    from jsonb_array_elements(coalesce(p_platforms, '[]'::jsonb))
  ) then
    raise exception 'Dos tablados no pueden llamarse igual.' using errcode = 'PLU01';
  end if;

  -- Para poder intercambiar nombres entre tablados sin chocar con el unique,
  -- se parquean primero los existentes con un nombre transitorio.
  update public.event_platforms
  set name = '~' || id::text
  where event_id = v_event.id;

  for v_item in select * from jsonb_array_elements(coalesce(p_platforms, '[]'::jsonb))
  loop
    v_name := trim(v_item ->> 'name');
    if coalesce(length(v_name), 0) < 1 or length(v_name) > 80 then
      raise exception 'Cada tablado necesita un nombre de hasta 80 caracteres.' using errcode = 'PLU01';
    end if;

    v_id := nullif(v_item ->> 'id', '')::uuid;

    if v_id is not null then
      update public.event_platforms
      set name = v_name, sort_order = v_order, updated_at = now()
      where id = v_id and event_id = v_event.id
      returning id into v_id;

      if v_id is null then
        raise exception 'El tablado ya no existe. Actualizá la grilla antes de continuar.'
          using errcode = 'PLU09';
      end if;
    else
      insert into public.event_platforms (event_id, name, sort_order)
      values (v_event.id, v_name, v_order)
      returning id into v_id;
    end if;

    v_keep := v_keep || v_id;
    v_order := v_order + 1;
  end loop;

  -- Los que no vinieron se quitan; sus tandas quedan sin tablado.
  update public.event_sessions
  set platform_id = null, platform = null, updated_at = now()
  where event_id = v_event.id
    and platform_id is not null
    and not (platform_id = any (v_keep));

  delete from public.event_platforms
  where event_id = v_event.id and not (id = any (v_keep));

  -- El texto de la tanda sigue al nombre del tablado: es lo que lee la credencial.
  update public.event_sessions s
  set platform = p.name, updated_at = now()
  from public.event_platforms p
  where s.platform_id = p.id
    and s.platform is distinct from p.name;

  perform plu_private.record_domain_audit(
    'event.platforms_saved', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object('eventSlug', v_event.slug, 'platformCount', cardinality(v_keep)),
    v_event.organization_id
  );

  return public.staff_get_event_schedule(v_event.slug);
end;
$$;

revoke all on function public.staff_save_event_platforms(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_event_platforms(text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. staff_get_event_schedule: tablados y platformId por tanda
-- ---------------------------------------------------------------------------
-- Cuerpo vigente (20260806230000) más `platforms` y `platformId`.
create or replace function public.staff_get_event_schedule(p_event_slug text)
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
    'eventSlug', v_event.slug,
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
          'id', d.id,
          'dayIndex', d.day_index,
          'label', d.label,
          'date', d.date,
          'assignedCount', (
            select count(*) from public.event_registrations r
            where r.event_day_id = d.id and r.status <> 'cancelada'
          )
        ) order by d.day_index
      ), '[]'::jsonb)
      from public.event_days d
      where d.event_id = v_event.id
    ),
    'sessions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'eventDayId', s.event_day_id,
          'dayIndex', d.day_index,
          'name', s.name,
          'platform', s.platform,
          'platformId', s.platform_id,
          'weighInAt', s.weigh_in_at,
          'startsAt', s.starts_at,
          'sortOrder', s.sort_order,
          'assignedCount', (
            select count(*) from public.event_registrations r
            where r.event_session_id = s.id and r.status <> 'cancelada'
          )
        ) order by d.day_index, s.sort_order, s.name
      ), '[]'::jsonb)
      from public.event_sessions s
      join public.event_days d on d.id = s.event_day_id
      where s.event_id = v_event.id
    ),
    'unassignedCount', (
      select count(*) from public.event_registrations r
      where r.event_id = v_event.id
        and r.status <> 'cancelada'
        and r.event_day_id is null
    )
  );
end;
$$;

revoke all on function public.staff_get_event_schedule(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_schedule(text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. staff_save_event_sessions: acepta platformId
-- ---------------------------------------------------------------------------
-- Cuerpo vigente (20260806230000) con la resolución del tablado:
--
--   * `platformId` con valor  → la tanda se enlaza y el texto toma el nombre.
--   * `platformId` en null    → la tanda queda sin tablado; el texto es el que venga.
--   * sin la clave `platformId` (el editor de tandas del evento solo manda
--     texto) → si el texto coincide con un tablado se enlaza, si no queda como
--     texto legado.
create or replace function public.staff_save_event_sessions(
  p_event_slug text,
  p_sessions jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_session jsonb;
  v_session_id uuid;
  v_day_id uuid;
  v_day_index int;
  v_keep uuid[] := array[]::uuid[];
  v_orphan_name text;
  v_platform_id uuid;
  v_platform_name text;
  v_platform_text text;
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  for v_session in select * from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb))
  loop
    if coalesce(length(trim(v_session ->> 'name')), 0) < 1 then
      raise exception 'Cada tanda necesita un nombre.' using errcode = 'PLU01';
    end if;

    v_day_index := nullif(v_session ->> 'dayIndex', '')::int;
    select d.id into v_day_id
    from public.event_days d
    where d.event_id = v_event.id and d.day_index = v_day_index;
    if v_day_id is null then
      raise exception 'La tanda "%" apunta a un día que no existe en este evento.',
        trim(v_session ->> 'name') using errcode = 'PLU01';
    end if;

    -- Tablado de la tanda.
    v_platform_id := null;
    v_platform_name := null;
    v_platform_text := nullif(trim(v_session ->> 'platform'), '');

    if v_session ? 'platformId' and nullif(v_session ->> 'platformId', '') is not null then
      select p.id, p.name into v_platform_id, v_platform_name
      from public.event_platforms p
      where p.id = (v_session ->> 'platformId')::uuid and p.event_id = v_event.id;
      if v_platform_id is null then
        raise exception 'El tablado de la tanda "%" ya no existe. Actualizá la grilla antes de continuar.',
          trim(v_session ->> 'name') using errcode = 'PLU09';
      end if;
    elsif not (v_session ? 'platformId') and v_platform_text is not null then
      select p.id, p.name into v_platform_id, v_platform_name
      from public.event_platforms p
      where p.event_id = v_event.id and lower(p.name) = lower(v_platform_text);
    end if;

    v_session_id := nullif(v_session ->> 'id', '')::uuid;

    if v_session_id is not null then
      update public.event_sessions set
        event_day_id = v_day_id,
        name = trim(v_session ->> 'name'),
        platform_id = v_platform_id,
        platform = coalesce(v_platform_name, v_platform_text),
        weigh_in_at = nullif(v_session ->> 'weighInAt', '')::timestamptz,
        starts_at = nullif(v_session ->> 'startsAt', '')::timestamptz,
        sort_order = coalesce((v_session ->> 'sortOrder')::int, 0),
        updated_at = now()
      where id = v_session_id and event_id = v_event.id
      returning id into v_session_id;

      if v_session_id is null then
        raise exception 'La tanda ya no existe. Actualizá el listado antes de continuar.'
          using errcode = 'PLU09';
      end if;
    else
      insert into public.event_sessions(
        event_id, event_day_id, name, platform_id, platform, weigh_in_at, starts_at, sort_order
      ) values (
        v_event.id, v_day_id, trim(v_session ->> 'name'),
        v_platform_id, coalesce(v_platform_name, v_platform_text),
        nullif(v_session ->> 'weighInAt', '')::timestamptz,
        nullif(v_session ->> 'startsAt', '')::timestamptz,
        coalesce((v_session ->> 'sortOrder')::int, 0)
      ) returning id into v_session_id;
    end if;

    v_keep := v_keep || v_session_id;
  end loop;

  select s.name into v_orphan_name
  from public.event_sessions s
  where s.event_id = v_event.id
    and not (s.id = any (v_keep))
    and exists (select 1 from public.event_registrations r where r.event_session_id = s.id)
  limit 1;

  if v_orphan_name is not null then
    raise exception 'No se puede eliminar la tanda "%": todavía tiene atletas asignados.', v_orphan_name
      using errcode = 'PLU07';
  end if;

  delete from public.event_sessions s
  where s.event_id = v_event.id and not (s.id = any (v_keep));

  perform plu_private.record_domain_audit(
    'event.sessions_saved', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object('eventSlug', v_event.slug, 'sessionCount', cardinality(v_keep)),
    v_event.organization_id
  );

  return public.staff_get_event_schedule(v_event.slug);
end;
$$;

revoke all on function public.staff_save_event_sessions(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_event_sessions(text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Tablero: tablados, platformId por tanda y edad del atleta
-- ---------------------------------------------------------------------------
-- La edad es la que el atleta tiene el día que arranca el evento (no la de hoy):
-- es la que sirve para agrupar una tanda. Se devuelve solo la edad, nunca la
-- fecha de nacimiento: armar tandas no necesita PII.
--
-- PostgreSQL no deja agregar una columna a RETURNS TABLE con CREATE OR REPLACE:
-- se dropea y recrea la función de filas (staff_get_event_board es plpgsql y no
-- depende de su firma en catálogo), mismo procedimiento que 20261104100000.
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
    case
      when a.birth_date is null then null
      else extract(year from age(e.starts_at::date, a.birth_date))::int
    end as age,
    r.status,
    r.event_day_id,
    r.event_session_id,
    (c.id is not null) as checked_in
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.events e on e.id = r.event_id
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = p_event_id
    and r.status <> 'cancelada'
$$;

revoke all on function plu_private.board_registration_rows(uuid)
  from public, anon, authenticated, service_role;

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
