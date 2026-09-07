-- ---------------------------------------------------------------------------
-- La puerta tiene que ver QUÉ credencial escaneó — PLU ARG
--
-- Una entrada de entrenador emite dos credenciales con el mismo nombre y el
-- mismo DNI: la de espectador y la de ENTRENADOR. Hasta acá el escáner mostraba
-- "Espectador" para las dos, porque `attendee_kind` de `check_ins` sólo
-- distingue atleta de espectador y la verificación nunca devolvía la etiqueta.
--
-- Con eso, seguridad no podía diferenciarlas en la puerta: exactamente el
-- problema que las dos credenciales venían a resolver. Se agregan al payload
-- de verificación y a la lista de ingreso offline (la que se usa cuando no hay
-- señal, que es cuando más se necesita).
-- ---------------------------------------------------------------------------

create or replace function plu_private.get_ticket_by_qr_token(p_qr_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', t.id, 'ticket_code', t.ticket_code, 'qr_token', t.qr_token,
      'event_id', t.event_id, 'attendee_name', t.attendee_name,
      'ticket_type_id', t.ticket_type_id, 'ticket_type_name', tt.name,
      'addons', t.addons, 'status', t.status,
      -- Lo que se imprime en la credencial y qué zonas abre. Van desde la
      -- entrada emitida, no desde el tipo: el alcance que se vendió es el que
      -- vale, aunque después alguien haya editado el tipo de entrada.
      'credential_label', coalesce(t.credential_label, 'Entrada general'),
      'credential_scopes', coalesce(t.credential_scopes, array['gate_tickets']),
      'bundle_id', t.bundle_id,
      'created_at', t.created_at, 'updated_at', t.updated_at
    ),
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'venue', e.venue, 'location', e.location, 'starts_at', e.starts_at, 'ends_at', e.ends_at),
    'checkIn', case when c.id is null then null else jsonb_build_object('id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at) end
  ) into v_result
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.check_ins c on c.ticket_id = t.id where t.qr_token = p_qr_token;
  if v_result is null then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  return v_result;
end $function$;

do $verification$
begin
  if position('credential_label' in
      pg_get_functiondef('plu_private.get_ticket_by_qr_token(uuid)'::regprocedure)) = 0 then
    raise exception 'La verificacion de entrada no devuelve la credencial: la puerta no podria distinguirlas.';
  end if;
end
$verification$;

-- La lista de ingreso offline tambien lleva la credencial: sin señal en la
-- puerta es el unico dato que tiene el escaner, y sin el las dos credenciales
-- del entrenador vuelven a ser indistinguibles justo cuando menos se puede
-- consultar.

CREATE OR REPLACE FUNCTION public.staff_get_event_checkin_allowlist(p_event_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_event public.events; v_tickets jsonb; v_registrations jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code, 'attendeeName', t.attendee_name,
    'attendeeDni', t.attendee_dni, 'ticketTypeId', t.ticket_type_id, 'ticketTypeName', tt.name,
    'credentialLabel', coalesce(t.credential_label, 'Entrada general'),
    'credentialScopes', coalesce(t.credential_scopes, array['gate_tickets']),
    'status', t.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_tickets
  from public.tickets t
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.check_ins c on c.ticket_id = t.id where t.event_id = v_event.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', m.qr_token, 'memberCode', m.member_code, 'registrationId', r.id,
    'athleteName', a.full_name, 'athleteDocument', a.document_id, 'division', r.division,
    'category', r.category, 'status', r.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_registrations
  from public.event_registrations r join public.athletes a on a.id = r.athlete_id
  join public.memberships m on m.athlete_id = a.id and m.status = 'activa'
    and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = v_event.id and r.status = 'confirmada';
  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end $function$;
