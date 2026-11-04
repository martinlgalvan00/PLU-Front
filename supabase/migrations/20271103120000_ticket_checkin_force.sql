-- Excepción de un ingreso. No reescribe la vigencia ni la zona de la
-- credencial: saltea solo el rechazo que el puesto declaró, deja el ingreso
-- en check_ins y lo audita aparte de un ingreso normal.
--
-- Sigue exigiendo entrada paga, de este token, y no consumida. El motivo
-- viaja a la auditoría; el QR crudo y el DNI no.

create or replace function public.staff_force_check_in_ticket(
  p_qr_token uuid,
  p_gate text,
  p_actor text,
  p_zone_scope text,
  p_force text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_type public.ticket_types;
  v_access record;
  v_checkin public.check_ins;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if p_force not in ('validity', 'zone') then
    raise exception 'La excepción de ingreso es inválida.' using errcode = 'PLU01';
  end if;
  if char_length(v_reason) < 8 then
    raise exception 'El motivo de la excepción tiene que tener al menos 8 caracteres.' using errcode = 'PLU01';
  end if;

  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  if v_ticket.status <> 'pagada' then
    raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05';
  end if;

  select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
  if v_type.qr_validity_mode = 'from_first_scan' and v_ticket.access_activated_at is null then
    update public.tickets
    set access_activated_at = clock_timestamp()
    where id = v_ticket.id
    returning access_activated_at into v_ticket.access_activated_at;
  end if;

  select * into v_access from plu_private.resolve_ticket_type_access_window(v_ticket.id, clock_timestamp());
  if p_force <> 'validity' then
    if v_access.validity_status = 'upcoming' then
      raise exception 'Esta entrada todavía no está habilitada.' using errcode = 'PLU14';
    end if;
    if v_access.validity_status = 'expired' then
      raise exception 'Esta entrada ya venció.' using errcode = 'PLU15';
    end if;
    if v_access.validity_status = 'not_available_today' then
      raise exception 'Esta entrada no habilita el ingreso en la jornada de hoy.' using errcode = 'PLU05';
    end if;
    if v_access.validity_status <> 'valid' then
      raise exception 'No se pudo resolver la vigencia de esta entrada.' using errcode = 'PLU05';
    end if;
  end if;

  if p_force <> 'zone'
    and p_zone_scope is not null
    and not (p_zone_scope = any(coalesce(v_ticket.credential_scopes, array['gate_tickets'])))
  then
    raise exception 'La credencial no habilita esta zona.' using errcode = 'PLU16';
  end if;

  begin
    insert into public.check_ins(event_id, attendee_kind, ticket_id, gate, scanned_by_label, access_window_key)
    values (
      v_ticket.event_id,
      'spectator',
      v_ticket.id,
      nullif(trim(p_gate), ''),
      left(coalesce(p_actor, ''), 200),
      v_access.access_window_key
    )
    returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Esta entrada ya fue utilizada para esta jornada.' using errcode = 'PLU06';
  end;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'ticket.checked_in_override',
    'ticket',
    v_ticket.id::text,
    'staff',
    left(coalesce(p_actor, ''), 200),
    jsonb_build_object(
      'force', p_force,
      'reason', v_reason,
      'gate', nullif(trim(p_gate), ''),
      'zoneScope', p_zone_scope,
      'accessWindowKey', v_access.access_window_key,
      'validFrom', v_access.valid_from,
      'validUntil', v_access.valid_until
    )
  );

  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end;
$$;

revoke all on function public.staff_force_check_in_ticket(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_force_check_in_ticket(uuid, text, text, text, text, text)
  to service_role;
