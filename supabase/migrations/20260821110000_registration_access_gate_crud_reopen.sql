-- Las tandas cerradas por la apertura pública tenían `ends_at = now()`. Esa
-- fecha histórica no debe viajar a una reapertura: si se activa la tanda con
-- ese valor, el repositorio la considera vencida de inmediato.
update public.registration_access_gates
set ends_at = null,
    updated_at = now()
where active = false
  and updated_by = 'migration:20260821100000'
  and ends_at <= now();

-- DELETE explícito para completar el CRUD operativo. No borra auditoría ni
-- usos históricos: sólo retira la regla que podría volver a pedir un código.
create or replace function public.staff_delete_registration_access_gate(
  p_gate_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_gate public.registration_access_gates;
begin
  select * into v_gate
  from public.registration_access_gates
  where id = p_gate_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'La tanda no existe.' using errcode = 'PLU03';
  end if;

  delete from public.registration_access_gates where id = v_gate.id;

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_org,
    'registration_access_gate.deleted',
    'registration_access_gate',
    v_gate.id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'scope', v_gate.scope,
      'eventId', v_gate.event_id,
      'label', v_gate.label
    )
  );

  return jsonb_build_object('id', v_gate.id);
end;
$$;

revoke all on function public.staff_delete_registration_access_gate(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_registration_access_gate(uuid, text) to service_role;
