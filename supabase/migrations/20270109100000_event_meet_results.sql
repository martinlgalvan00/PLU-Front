-- Planilla de un meet ya disputado, pegada al evento del sitio.
--
-- Los torneos que ve el público viven en public.events. La planilla no puede
-- colgar de Prisma: esas tablas (Organization, Event) están vacías y un CSV
-- real devolvía "no encontramos ese evento".
--
-- Reemplazar es una sola función: si la planilla nueva no tiene filas válidas,
-- no se borra la anterior. Sin políticas para anon: la lectura pública pasa
-- por la API, y solo si el evento está publicado.

create table public.event_meet_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  athlete_name text not null,
  sex text,
  age int,
  division text,
  category text,
  bodyweight_kg numeric(6, 2),
  equipment text,
  team_name text,
  place int,
  squat1_kg numeric(6, 2),
  squat2_kg numeric(6, 2),
  squat3_kg numeric(6, 2),
  bench1_kg numeric(6, 2),
  bench2_kg numeric(6, 2),
  bench3_kg numeric(6, 2),
  deadlift1_kg numeric(6, 2),
  deadlift2_kg numeric(6, 2),
  deadlift3_kg numeric(6, 2),
  best_squat_kg numeric(6, 2),
  best_bench_kg numeric(6, 2),
  best_deadlift_kg numeric(6, 2),
  total_kg numeric(7, 2) not null,
  formula text not null default 'dots',
  source text not null default 'liftingcast',
  created_at timestamptz not null default now(),
  check (char_length(btrim(athlete_name)) > 0),
  check (total_kg > 0)
);

create index event_meet_results_event_idx
  on public.event_meet_results (event_id, place);

alter table public.event_meet_results enable row level security;
revoke all on public.event_meet_results from anon, authenticated;

create or replace function public.replace_event_meet_results(p_event_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  if p_event_id is null or not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'No encontramos ese evento.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'No hay filas válidas para guardar.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(athlete_name text, total_kg numeric)
    where nullif(btrim(r.athlete_name), '') is not null
      and r.total_kg is not null
      and r.total_kg > 0
  ) then
    raise exception 'No hay filas válidas para guardar.' using errcode = 'P0001';
  end if;

  delete from public.event_meet_results where event_id = p_event_id;

  insert into public.event_meet_results (
    event_id, athlete_name, sex, age, division, category,
    bodyweight_kg, equipment, team_name, place,
    squat1_kg, squat2_kg, squat3_kg,
    bench1_kg, bench2_kg, bench3_kg,
    deadlift1_kg, deadlift2_kg, deadlift3_kg,
    best_squat_kg, best_bench_kg, best_deadlift_kg,
    total_kg, formula, source
  )
  select
    p_event_id,
    btrim(r.athlete_name),
    nullif(btrim(r.sex), ''),
    r.age,
    nullif(btrim(r.division), ''),
    nullif(btrim(r.category), ''),
    r.bodyweight_kg,
    nullif(btrim(r.equipment), ''),
    nullif(btrim(r.team_name), ''),
    r.place,
    r.squat1_kg, r.squat2_kg, r.squat3_kg,
    r.bench1_kg, r.bench2_kg, r.bench3_kg,
    r.deadlift1_kg, r.deadlift2_kg, r.deadlift3_kg,
    r.best_squat_kg, r.best_bench_kg, r.best_deadlift_kg,
    r.total_kg,
    coalesce(nullif(btrim(r.formula), ''), 'dots'),
    coalesce(nullif(btrim(r.source), ''), 'liftingcast')
  from jsonb_to_recordset(p_rows) as r(
    athlete_name text,
    sex text,
    age int,
    division text,
    category text,
    bodyweight_kg numeric,
    equipment text,
    team_name text,
    place int,
    squat1_kg numeric,
    squat2_kg numeric,
    squat3_kg numeric,
    bench1_kg numeric,
    bench2_kg numeric,
    bench3_kg numeric,
    deadlift1_kg numeric,
    deadlift2_kg numeric,
    deadlift3_kg numeric,
    best_squat_kg numeric,
    best_bench_kg numeric,
    best_deadlift_kg numeric,
    total_kg numeric,
    formula text,
    source text
  )
  where nullif(btrim(r.athlete_name), '') is not null
    and r.total_kg is not null
    and r.total_kg > 0;

  get diagnostics inserted = row_count;
  if inserted = 0 then
    raise exception 'No hay filas válidas para guardar.' using errcode = 'P0001';
  end if;
  return inserted;
end;
$$;

revoke all on function public.replace_event_meet_results(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_event_meet_results(uuid, jsonb) to service_role;

create or replace function public.list_published_meet_slugs()
returns table (slug text)
language sql
stable
security definer
set search_path = public
as $$
  select e.slug
  from public.events e
  where e.published = true
    and exists (
      select 1 from public.event_meet_results r where r.event_id = e.id
    )
  order by e.starts_at desc;
$$;

revoke all on function public.list_published_meet_slugs() from public, anon, authenticated;
grant execute on function public.list_published_meet_slugs() to service_role;

notify pgrst, 'reload schema';
