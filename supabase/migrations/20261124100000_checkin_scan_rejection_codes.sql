-- Códigos de rechazo distintos para cada motivo de escaneo — PLU ARG
--
-- `staff_check_in_ticket` levantaba `PLU05` para tres motivos distintos: sin
-- pago, no vigente todavía y vencido (y también para zona incorrecta). Como
-- el servidor sólo reenvía el código PLU al cliente, todo 409 que no fuera
-- "ya usada" (PLU06) se clasificaba en el browser con una regex sobre el
-- mensaje en español (`useAppData.js`), y cualquier motivo sin match caía en
-- "sin pago". Un QR vencido rechazado por el servidor le aparecía al
-- operador en la puerta como si la entrada no tuviera el pago acreditado —
-- exactamente lo contrario de detectar rápido el vencimiento.
--
-- Esta migración sólo cambia los `errcode` de tres de esos `raise
-- exception`, conservando el mensaje en español tal cual. `PLU05` queda
-- exclusivo de "sin pago"; `PLU06` no se toca.

create or replace function public.staff_check_in_ticket(
  p_qr_token uuid,
  p_gate text,
  p_actor text,
  p_zone_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_checkin public.check_ins;
begin
  select * into v_ticket
  from public.tickets
  where qr_token = p_qr_token
  for update;

  if not found then
    raise exception 'Entrada no encontrada.' using errcode = 'PLU02';
  end if;
  if v_ticket.status <> 'pagada' then
    raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05';
  end if;
  if clock_timestamp() < v_ticket.valid_from then
    raise exception 'Este QR todavía no está vigente. Se habilita el %.',
      to_char(v_ticket.valid_from at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
      using errcode = 'PLU14';
  end if;
  if clock_timestamp() >= v_ticket.valid_until then
    raise exception 'Este QR venció el %.',
      to_char(v_ticket.valid_until at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
      using errcode = 'PLU15';
  end if;
  if p_zone_scope is not null
     and not (p_zone_scope = any(coalesce(v_ticket.credential_scopes, array['gate_tickets']))) then
    raise exception 'La credencial "%" no habilita esta zona.',
      coalesce(v_ticket.credential_label, 'Entrada general')
      using errcode = 'PLU16';
  end if;

  begin
    insert into public.check_ins(event_id, attendee_kind, ticket_id, gate, scanned_by_label)
    values(
      v_ticket.event_id,
      'spectator',
      v_ticket.id,
      nullif(trim(p_gate), ''),
      left(p_actor, 200)
    ) returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Esta entrada ya fue utilizada.' using errcode = 'PLU06';
  end;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    'ticket.checked_in', 'ticket', v_ticket.id::text, 'staff', p_actor,
    jsonb_build_object(
      'credential', v_ticket.credential_label,
      'zoneScope', p_zone_scope,
      'validFrom', v_ticket.valid_from,
      'validUntil', v_ticket.valid_until
    )
  );

  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end;
$$;

revoke all on function public.staff_check_in_ticket(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_check_in_ticket(uuid, text, text, text)
  to service_role;
revoke all on function public.staff_check_in_ticket(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_check_in_ticket(uuid, text, text)
  to service_role;

do $verification$
begin
  if position('PLU14' in pg_get_functiondef(
      'public.staff_check_in_ticket(uuid, text, text, text)'::regprocedure
    )) = 0 then
    raise exception 'Falta el código PLU14 (QR todavía no vigente).';
  end if;
  if position('PLU15' in pg_get_functiondef(
      'public.staff_check_in_ticket(uuid, text, text, text)'::regprocedure
    )) = 0 then
    raise exception 'Falta el código PLU15 (QR vencido).';
  end if;
  if position('PLU16' in pg_get_functiondef(
      'public.staff_check_in_ticket(uuid, text, text, text)'::regprocedure
    )) = 0 then
    raise exception 'Falta el código PLU16 (zona incorrecta).';
  end if;
  if (
    select count(*) from regexp_matches(
      pg_get_functiondef('public.staff_check_in_ticket(uuid, text, text, text)'::regprocedure),
      'PLU05', 'g'
    )
  ) <> 1 then
    raise exception 'PLU05 debe quedar exclusivo del rechazo por falta de pago.';
  end if;
end
$verification$;
