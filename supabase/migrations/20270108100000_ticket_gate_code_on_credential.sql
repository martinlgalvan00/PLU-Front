-- El QR de la entrada ya es el secreto. Quien lo abre (el titular) tiene que
-- poder leer y cantar el XXX-XXX. La verificación pública no agrega documento:
-- el alias se resuelve sólo con el token opaco.

create or replace function plu_private.get_ticket_by_qr_token(p_qr_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', t.id, 'ticket_code', t.ticket_code, 'qr_token', t.qr_token,
      'gate_code', t.gate_code,
      'event_id', t.event_id, 'attendee_name', t.attendee_name,
      'ticket_type_id', t.ticket_type_id, 'ticket_type_name', tt.name,
      'ticket_type_description', tt.description, 'addons', t.addons, 'status', t.status,
      'credential_label', coalesce(t.credential_label, 'Entrada general'),
      'credential_scopes', coalesce(t.credential_scopes, array['gate_tickets']),
      'access_usage_mode', tt.access_usage_mode,
      'valid_from', w.valid_from, 'valid_until', w.valid_until,
      'validity_status', w.validity_status, 'access_window_key', w.access_window_key,
      'created_at', t.created_at, 'updated_at', t.updated_at
    ),
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'venue', e.venue,
      'location', e.location, 'starts_at', e.starts_at, 'ends_at', e.ends_at
    ),
    'checkIn', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at
    ) end
  ) into v_result
  from public.tickets t
  join public.events e on e.id = t.event_id
  join public.ticket_types tt on tt.id = t.ticket_type_id
  cross join lateral plu_private.resolve_ticket_type_access_window(t.id, clock_timestamp()) w
  left join lateral (
    select id, gate, scanned_at from public.check_ins
    where ticket_id = t.id and access_window_key = w.access_window_key
    order by scanned_at desc limit 1
  ) c on true
  where t.qr_token = p_qr_token;
  if v_result is null then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  return v_result;
end;
$$;
