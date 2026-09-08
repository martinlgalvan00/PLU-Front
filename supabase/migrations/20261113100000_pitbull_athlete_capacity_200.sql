-- Cupo atleta de Pitbull Classic 2026: 180 -> 200.
--
-- Mismo patrón que 20260815120000_pitbull_athlete_capacity_180: el contador
-- público lee events.capacity vía get_event_registration_capacity, y
-- events_capacity_status_guard (20260817130000) recalcula el estado del
-- evento apenas cambia esta columna. Subir el número acá alcanza para:
--   * reabrir la inscripción si estaba en 'agotado' con cupo libre bajo 200;
--   * volver a cerrarla sola ('agotado') en cuanto se llegue a 200 inscriptos.
-- No hace falta tocar la lógica de cierre automático: ya existe y corre por
-- trigger sobre event_registrations y sobre events.capacity.

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
    raise notice 'Evento pitbull-classic-2026 no encontrado; el seed vigente lo crea con capacity 200.';
    return;
  end if;

  update public.events
  set capacity = 200,
      updated_at = now()
  where id = v_event_id;

  insert into public.event_capacity_rules (
    organization_id, event_id, scope, key, limit_count
  )
  values (v_org, v_event_id, 'event', '', 200)
  on conflict (event_id, scope, key) do update
  set limit_count = 200,
      updated_at = now();

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_org,
    'capacity.pitbull_athlete_slots_corrected',
    'event',
    v_event_id::text,
    'system',
    'migration:20261113100000',
    jsonb_build_object(
      'previousCapacity', v_previous,
      'capacity', 200
    )
  );
end;
$$;
