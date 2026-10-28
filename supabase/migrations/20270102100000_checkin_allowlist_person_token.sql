-- Allowlist offline de la puerta: el QR que hoy lleva el atleta.
--
-- Desde 20260806140000 la credencial del atleta es su `athletes.credential_token`
-- (uno por persona, de por vida). La allowlist seguía mandando solo el
-- `memberships.qr_token` viejo: sin conexión, el escáner no encontraba el QR
-- del perfil y lo daba por desconocido.
--
-- Además exigía una membresía vigente para cualquier evento. El check-in
-- online (`staff_check_in_registration`) la pide solo si el evento la pide
-- (`requires_membership`): un atleta sin afiliación inscripto en un evento
-- abierto pasaba online y quedaba afuera offline. Ahora se aplica la misma
-- regla en los dos caminos.
--
-- Cada inscripción viaja una sola vez (antes, dos membresías activas la
-- duplicaban) con los dos códigos: `credentialToken` (QR actual) y `qrToken`
-- (credencial impresa vieja, que se sigue aceptando).
create or replace function public.staff_get_event_checkin_allowlist(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_tickets jsonb;
  v_registrations jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code,
    'attendeeName', t.attendee_name, 'attendeeDni', t.attendee_dni,
    'ticketTypeId', t.ticket_type_id, 'ticketTypeName', tt.name,
    'ticketTypeDescription', tt.description,
    'credentialLabel', coalesce(t.credential_label, 'Entrada general'),
    'credentialScopes', coalesce(t.credential_scopes, array['gate_tickets']),
    'validFrom', w.valid_from, 'validUntil', w.valid_until,
    'validityStatus', w.validity_status, 'accessWindowKey', w.access_window_key,
    'status', t.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_tickets
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  cross join lateral plu_private.resolve_ticket_type_access_window(t.id, clock_timestamp()) w
  left join public.check_ins c on c.ticket_id = t.id and c.access_window_key = w.access_window_key
  where t.event_id = v_event.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'credentialToken', a.credential_token,
    'qrToken', m.qr_token, 'memberCode', m.member_code,
    'registrationId', r.id, 'athleteName', a.full_name,
    'athleteDocument', a.document_id, 'division', r.division, 'category', r.category,
    'status', r.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_registrations
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  left join lateral (
    select mm.qr_token, mm.member_code
    from public.memberships mm
    where mm.athlete_id = a.id
      and mm.status = 'activa'
      and coalesce(mm.start_date, current_date) <= current_date
      and coalesce(mm.expiration_date, current_date - 1) >= current_date
    order by mm.expiration_date desc nulls last
    limit 1
  ) m on true
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = v_event.id
    and r.status = 'confirmada'
    and (not coalesce(v_event.requires_membership, true) or m.qr_token is not null);

  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end;
$$;

revoke all on function public.staff_get_event_checkin_allowlist(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_checkin_allowlist(text) to service_role;
