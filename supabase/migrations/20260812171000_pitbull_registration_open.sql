-- Pitbull tiene una ventana de inscripcion vigente, por lo que el estado debe
-- habilitar las RPC create_competition_registration_v2 y
-- create_membership_registration_combo. La UI nunca confirma este permiso:
-- ambas funciones vuelven a validarlo dentro de la transaccion.

do $$
declare
  v_event_id uuid;
begin
  select id into v_event_id
  from public.events
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    and slug = 'pitbull-classic-2026'
  for update;

  if v_event_id is null then
    raise notice 'Evento pitbull-classic-2026 no encontrado; no se puede abrir la inscripcion.';
    return;
  end if;

  update public.events
  set status = 'inscripcion_abierta',
      published = true,
      updated_at = now()
  where id = v_event_id
    and status <> 'inscripcion_abierta';

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'registration.pitbull_opened',
    'event',
    v_event_id::text,
    'system',
    'migration:20260812171000',
    jsonb_build_object('status', 'inscripcion_abierta', 'published', true)
  );
end;
$$;
