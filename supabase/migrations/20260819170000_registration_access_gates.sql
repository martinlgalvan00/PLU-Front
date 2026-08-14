-- Tandas privadas de afiliación e inscripción.
-- El secreto nunca llega a Postgres: Express guarda solamente un hash bcrypt
-- y lo verifica antes de crear una orden. La base conserva el alcance,
-- vigencia y bitácora de cada tanda para operar aperturas graduales.

create table if not exists public.registration_access_gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('membership', 'registration')),
  event_id uuid references public.events(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 2 and 80),
  code_hash text,
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'membership' and event_id is null)
    or (scope = 'registration' and event_id is not null)
  ),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (not active or code_hash is not null)
);

create unique index if not exists registration_access_gates_membership_scope_unique
  on public.registration_access_gates (organization_id)
  where scope = 'membership';

create unique index if not exists registration_access_gates_event_scope_unique
  on public.registration_access_gates (organization_id, event_id)
  where scope = 'registration';

create index if not exists registration_access_gates_active_idx
  on public.registration_access_gates (organization_id, scope, active, starts_at, ends_at);

alter table public.registration_access_gates enable row level security;
revoke all on public.registration_access_gates from public, anon, authenticated;
grant select, insert, update, delete on public.registration_access_gates to service_role;

create or replace function public.staff_get_registration_access_gates()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'membershipGate', (
      select to_jsonb(g) - 'code_hash'
      from public.registration_access_gates g
      where g.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
        and g.scope = 'membership'
    ),
    'eventGates', coalesce((
      select jsonb_agg(
        (to_jsonb(g) - 'code_hash') || jsonb_build_object('eventSlug', e.slug, 'eventTitle', e.title)
        order by e.starts_at nulls last, e.title
      )
      from public.registration_access_gates g
      join public.events e on e.id = g.event_id
      where g.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
        and g.scope = 'registration'
    ), '[]'::jsonb)
  );
$$;

create or replace function public.staff_upsert_registration_access_gate(
  p_gate jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_scope text := lower(btrim(coalesce(p_gate ->> 'scope', '')));
  v_event public.events;
  v_gate public.registration_access_gates;
  v_label text := btrim(coalesce(p_gate ->> 'label', ''));
  v_active boolean := coalesce((p_gate ->> 'active')::boolean, true);
  v_starts_at timestamptz := nullif(p_gate ->> 'startsAt', '')::timestamptz;
  v_ends_at timestamptz := nullif(p_gate ->> 'endsAt', '')::timestamptz;
  v_code_hash text := nullif(btrim(coalesce(p_gate ->> 'codeHash', '')), '');
  v_code_rotated boolean := v_code_hash is not null;
begin
  if v_scope not in ('membership', 'registration') then
    raise exception 'El alcance de la tanda es inválido.' using errcode = 'PLU02';
  end if;
  if char_length(v_label) < 2 or char_length(v_label) > 80 then
    raise exception 'El nombre de la tanda es inválido.' using errcode = 'PLU02';
  end if;
  if v_ends_at is not null and v_starts_at is not null and v_ends_at <= v_starts_at then
    raise exception 'El cierre debe ser posterior a la apertura.' using errcode = 'PLU02';
  end if;

  if v_scope = 'registration' then
    select * into v_event
    from public.events
    where organization_id = v_org and slug = btrim(coalesce(p_gate ->> 'eventSlug', ''));
    if not found then
      raise exception 'El torneo seleccionado no existe.' using errcode = 'PLU02';
    end if;
    select * into v_gate
    from public.registration_access_gates
    where organization_id = v_org and scope = 'registration' and event_id = v_event.id
    for update;
  else
    select * into v_gate
    from public.registration_access_gates
    where organization_id = v_org and scope = 'membership'
    for update;
  end if;

  -- Cerrar una tanda borra el hash: reabrir siempre obliga a elegir un código
  -- nuevo y evita que una contraseña filtrada vuelva a servir por accidente.
  if not v_active then
    v_code_hash := null;
  elsif v_code_hash is null and v_gate.id is not null then
    v_code_hash := v_gate.code_hash;
  end if;

  if v_active and v_code_hash is null then
    raise exception 'Para habilitar una tanda definí un código nuevo.' using errcode = 'PLU02';
  end if;

  if v_gate.id is null then
    insert into public.registration_access_gates(
      organization_id, scope, event_id, label, code_hash, active, starts_at, ends_at, created_by, updated_by
    ) values (
      v_org, v_scope, case when v_scope = 'registration' then v_event.id else null end,
      v_label, v_code_hash, v_active, v_starts_at, v_ends_at, p_actor, p_actor
    ) returning * into v_gate;
  else
    update public.registration_access_gates
    set label = v_label,
        code_hash = v_code_hash,
        active = v_active,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        updated_by = p_actor,
        updated_at = now()
    where id = v_gate.id
    returning * into v_gate;
  end if;

  insert into public.domain_audit_logs(
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_org,
    case when v_active then 'registration_access_gate.saved' else 'registration_access_gate.closed' end,
    'registration_access_gate', v_gate.id::text, 'staff', p_actor,
    jsonb_build_object(
      'scope', v_scope,
      'eventSlug', case when v_scope = 'registration' then v_event.slug else null end,
      'label', v_gate.label,
      'startsAt', v_gate.starts_at,
      'endsAt', v_gate.ends_at,
      'codeRotated', v_code_rotated
    )
  );

  return to_jsonb(v_gate) - 'code_hash';
end;
$$;

revoke all on function public.staff_get_registration_access_gates() from public, anon, authenticated;
revoke all on function public.staff_upsert_registration_access_gate(jsonb, text) from public, anon, authenticated;
grant execute on function public.staff_get_registration_access_gates() to service_role;
grant execute on function public.staff_upsert_registration_access_gate(jsonb, text) to service_role;
