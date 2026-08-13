-- Cupo atleta de Pitbull Classic 2026: 180.
--
-- El contador público lee events.capacity vía get_event_registration_capacity.
-- El seed local y el default de admin (80) no alcanzan si el evento ya existe
-- con otro valor. Esta pasada deja el torneo y su regla de cupo alineados.

do $$
declare
  v_org uuid;
  v_event_id uuid;
  v_previous int;
begin
  select id, organization_id, capacity into v_event_id, v_org, v_previous
  from public.events
  where slug = 'pitbull-classic-2026'
  order by case
    when organization_id = '00000000-0000-4000-8000-000000000001'::uuid then 0
    else 1
  end
  limit 1
  for update;

  if v_event_id is null then
    raise notice 'Evento pitbull-classic-2026 no encontrado; el seed vigente lo crea con capacity 180.';
    return;
  end if;

  update public.events
  set capacity = 180,
      updated_at = now()
  where id = v_event_id;

  insert into public.event_capacity_rules (
    organization_id, event_id, scope, key, limit_count
  )
  values (v_org, v_event_id, 'event', '', 180)
  on conflict (event_id, scope, key) do update
  set limit_count = 180,
      updated_at = now();

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_org,
    'capacity.pitbull_athlete_slots_corrected',
    'event',
    v_event_id::text,
    'system',
    'migration:20260815120000',
    jsonb_build_object(
      'previousCapacity', v_previous,
      'capacity', 180
    )
  );
end;
$$;
