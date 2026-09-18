-- Habilita `from_first_scan` como tercera política relativa de vigencia:
-- el reloj arranca en la primera lectura de seguridad en la puerta, no en
-- la acreditación del pago. El frontend (AdminTicketTypesEditor.jsx) ya
-- ofrecía este modo como opción; esta migración es la que faltaba para que
-- guardarlo no rebote contra el CHECK ni contra las RPC de política.

alter table public.ticket_types
  drop constraint if exists ticket_types_qr_validity_policy_check;
alter table public.ticket_types
  add constraint ticket_types_qr_validity_policy_check
  check (
    (qr_validity_mode = 'event_days'
      and valid_from is null and valid_until is null
      and qr_validity_duration_minutes is null)
    or (qr_validity_mode = 'fixed_window'
      and valid_from is not null and valid_until is not null and valid_until > valid_from
      and qr_validity_duration_minutes is null)
    or (qr_validity_mode in ('from_payment', 'from_first_scan')
      and valid_from is null and valid_until is null
      and qr_validity_duration_minutes between 1 and 527040)
  );

alter table public.tickets
  drop constraint if exists tickets_qr_validity_policy_check;
alter table public.tickets
  add constraint tickets_qr_validity_policy_check
  check (
    (qr_validity_mode in ('event_days', 'fixed_window') and qr_validity_duration_minutes is null)
    or (qr_validity_mode in ('from_payment', 'from_first_scan')
      and qr_validity_duration_minutes between 1 and 527040)
  );

comment on column public.tickets.access_activated_at is
  'Instante de acreditación del derecho: llena from_payment al aprobarse el pago y from_first_scan en la primera lectura de seguridad en la puerta.';

-- Misma ventana que from_payment, pero anclada a `access_activated_at` sin
-- exigir que ya esté seteado: activarlo es responsabilidad de
-- staff_check_in_ticket, no de esta función de sólo lectura.
create or replace function plu_private.resolve_ticket_type_access_window(
  p_ticket_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns table(
  valid_from timestamptz,
  valid_until timestamptz,
  access_window_key text,
  validity_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_type public.ticket_types;
  v_first date;
  v_last date;
  v_today date;
  -- Distingue "la ventana salió del calendario de jornadas" de "salió de una
  -- excepción de acceso / from_payment / from_first_scan / fixed_window",
  -- que también pueden convivir con qr_validity_mode = 'event_days' (la
  -- excepción no cambia el modo del tipo, solo pisa la ventana calculada).
  v_from_event_days boolean := false;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;

  if not found then
    return;
  end if;
  select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
  if not found then return; end if;

  if v_ticket.access_override_enabled then
    valid_from := v_ticket.access_override_valid_from;
    valid_until := v_ticket.access_override_valid_until;
    access_window_key := 'once_total';
  elsif v_type.qr_validity_mode = 'from_payment' then
    valid_from := v_ticket.access_activated_at;
    valid_until := case
      when v_ticket.access_activated_at is null then null
      else v_ticket.access_activated_at + make_interval(mins => v_type.qr_validity_duration_minutes)
    end;
    access_window_key := 'once_total';
  elsif v_type.qr_validity_mode = 'from_first_scan' then
    valid_from := v_ticket.access_activated_at;
    valid_until := case
      when v_ticket.access_activated_at is null then null
      else v_ticket.access_activated_at + make_interval(mins => v_type.qr_validity_duration_minutes)
    end;
    access_window_key := 'once_total';
  elsif v_type.qr_validity_mode = 'fixed_window' then
    valid_from := v_type.valid_from;
    valid_until := v_type.valid_until;
    access_window_key := 'once_total';
  else
    v_from_event_days := true;
    select min(d.date), max(d.date)
      into v_first, v_last
    from public.ticket_type_days td
    join public.event_days d on d.id = td.event_day_id
    where td.ticket_type_id = v_type.id;

    valid_from := v_first::timestamp at time zone 'America/Argentina/Buenos_Aires';
    valid_until := (v_last + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
    v_today := p_now at time zone 'America/Argentina/Buenos_Aires';
    access_window_key := case
      when v_type.access_usage_mode = 'once_per_event_day'
        then 'event_day:' || coalesce(v_today::text, 'unknown')
      else 'once_total'
    end;
  end if;

  validity_status := case
    when valid_from is null or valid_until is null or valid_until <= valid_from then 'unknown'
    when p_now < valid_from then 'upcoming'
    when p_now >= valid_until then 'expired'
    when v_from_event_days and not exists (
      select 1 from public.ticket_type_days td
      join public.event_days d on d.id = td.event_day_id
      where td.ticket_type_id = v_type.id
        and d.date = (p_now at time zone 'America/Argentina/Buenos_Aires')::date
    ) then 'not_available_today'
    else 'valid'
  end;
  return next;
end;
$$;

-- Activa `access_activated_at` en la primera lectura real de seguridad
-- (esta RPC, nunca la verificación pública/anónima `get_ticket_by_qr_token`):
-- así un QR con `from_first_scan` no arranca a correr por una consulta de
-- estado, sólo por el intento de ingreso que ya pasó el chequeo de pago.
create or replace function public.staff_check_in_ticket(
  p_qr_token uuid, p_gate text, p_actor text, p_zone_scope text
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
begin
  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  if v_ticket.status <> 'pagada' then raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05'; end if;

  select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
  if v_type.qr_validity_mode = 'from_first_scan' and v_ticket.access_activated_at is null then
    update public.tickets
    set access_activated_at = clock_timestamp()
    where id = v_ticket.id
    returning access_activated_at into v_ticket.access_activated_at;
  end if;

  select * into v_access from plu_private.resolve_ticket_type_access_window(v_ticket.id, clock_timestamp());
  if v_access.validity_status = 'upcoming' then raise exception 'Esta entrada todavía no está habilitada.' using errcode = 'PLU05'; end if;
  if v_access.validity_status = 'expired' then raise exception 'Esta entrada ya venció.' using errcode = 'PLU15'; end if;
  if v_access.validity_status = 'not_available_today' then raise exception 'Esta entrada no habilita el ingreso en la jornada de hoy.' using errcode = 'PLU05'; end if;
  if v_access.validity_status <> 'valid' then raise exception 'No se pudo resolver la vigencia de esta entrada.' using errcode = 'PLU05'; end if;
  if p_zone_scope is not null and not (p_zone_scope = any(coalesce(v_ticket.credential_scopes, array['gate_tickets']))) then
    raise exception 'La credencial no habilita esta zona.' using errcode = 'PLU05';
  end if;
  begin
    insert into public.check_ins(event_id, attendee_kind, ticket_id, gate, scanned_by_label, access_window_key)
    values (v_ticket.event_id, 'spectator', v_ticket.id, nullif(trim(p_gate), ''), left(p_actor, 200), v_access.access_window_key)
    returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Esta entrada ya fue utilizada para esta jornada.' using errcode = 'PLU06';
  end;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('ticket.checked_in', 'ticket', v_ticket.id::text, 'staff', p_actor,
    jsonb_build_object('accessWindowKey', v_access.access_window_key, 'validFrom', v_access.valid_from, 'validUntil', v_access.valid_until));
  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end;
$$;

-- Mismas dos RPC de política, ahora aceptando from_first_scan igual que
-- from_payment: sin ventana fija, con duración obligatoria entre 1 minuto y
-- 366 días.
create or replace function public.staff_merge_ticket_type_validity(
  p_event_slug text,
  p_types jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_type jsonb;
  v_type_id uuid;
  v_from timestamptz;
  v_until timestamptz;
  v_mode text;
  v_duration integer;
  v_count int := 0;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  if jsonb_typeof(coalesce(p_types, '[]'::jsonb)) <> 'array' then
    raise exception 'Las vigencias de QR son inválidas.' using errcode = 'PLU01';
  end if;

  for v_type in select * from jsonb_array_elements(coalesce(p_types, '[]'::jsonb))
  loop
    v_type_id := null;
    if nullif(v_type ->> 'ticketTypeId', '') is not null then
      select id into v_type_id from public.ticket_types
      where id = (v_type ->> 'ticketTypeId')::uuid and event_id = v_event_id;
    else
      select id into v_type_id from public.ticket_types
      where event_id = v_event_id
        and sort_order = coalesce((v_type ->> 'sortOrder')::int, 0)
      order by created_at desc
      limit 1;
    end if;
    if v_type_id is null then
      raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
    end if;

    begin
      v_from := nullif(trim(v_type ->> 'validFrom'), '')::timestamptz;
      v_until := nullif(trim(v_type ->> 'validUntil'), '')::timestamptz;
      v_duration := nullif(trim(v_type ->> 'validityDurationMinutes'), '')::integer;
    exception when others then
      raise exception 'La vigencia o duración del QR es inválida.' using errcode = 'PLU01';
    end;
    v_mode := coalesce(
      nullif(trim(v_type ->> 'validityMode'), ''),
      case when v_from is not null or v_until is not null then 'fixed_window' else 'event_days' end
    );

    if v_mode not in ('event_days', 'fixed_window', 'from_payment', 'from_first_scan') then
      raise exception 'La política de vigencia QR es inválida.' using errcode = 'PLU01';
    end if;
    if v_mode = 'fixed_window' and (v_from is null or v_until is null or v_until <= v_from) then
      raise exception 'La ventana fija del QR necesita inicio y fin válidos.' using errcode = 'PLU01';
    end if;
    if v_mode in ('event_days', 'from_payment', 'from_first_scan') and (v_from is not null or v_until is not null) then
      raise exception 'Esta política de QR no puede tener una ventana fija.' using errcode = 'PLU01';
    end if;
    if v_mode in ('from_payment', 'from_first_scan') and (v_duration is null or v_duration not between 1 and 527040) then
      raise exception 'La duración del QR debe estar entre 1 minuto y 366 días.' using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set valid_from = case when v_mode = 'fixed_window' then v_from else null end,
        valid_until = case when v_mode = 'fixed_window' then v_until else null end,
        qr_validity_mode = v_mode,
        qr_validity_duration_minutes = case when v_mode in ('from_payment', 'from_first_scan') then v_duration else null end,
        updated_at = now()
    where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'event.ticket_qr_validity_policy_updated', 'event', v_event_id::text,
    'staff', left(p_actor, 200), jsonb_build_object('ticketTypes', v_count)
  );
  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

create or replace function public.staff_merge_ticket_type_validity_policy(
  p_event_slug text,
  p_types jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_type jsonb;
  v_type_id uuid;
  v_mode text;
  v_duration integer;
  v_from timestamptz;
  v_until timestamptz;
  v_count int := 0;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  if jsonb_typeof(coalesce(p_types, '[]'::jsonb)) <> 'array' then
    raise exception 'Las políticas de vigencia QR son inválidas.' using errcode = 'PLU01';
  end if;

  for v_type in select * from jsonb_array_elements(coalesce(p_types, '[]'::jsonb))
  loop
    v_type_id := null;
    if nullif(v_type ->> 'ticketTypeId', '') is not null then
      select id into v_type_id from public.ticket_types
      where id = (v_type ->> 'ticketTypeId')::uuid and event_id = v_event_id;
    else
      select id into v_type_id from public.ticket_types
      where event_id = v_event_id
        and sort_order = coalesce((v_type ->> 'sortOrder')::int, 0)
      order by created_at desc
      limit 1;
    end if;
    if v_type_id is null then
      raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
    end if;

    v_mode := coalesce(nullif(trim(v_type ->> 'validityMode'), ''), 'event_days');
    if v_mode not in ('event_days', 'fixed_window', 'from_payment', 'from_first_scan') then
      raise exception 'La política de vigencia QR es inválida.' using errcode = 'PLU01';
    end if;
    begin
      v_duration := nullif(trim(v_type ->> 'validityDurationMinutes'), '')::integer;
    exception when others then
      raise exception 'La duración del QR es inválida.' using errcode = 'PLU01';
    end;

    select valid_from, valid_until into v_from, v_until
    from public.ticket_types where id = v_type_id for update;

    if v_mode = 'fixed_window' and (v_from is null or v_until is null or v_until <= v_from) then
      raise exception 'La ventana fija del QR necesita inicio y fin válidos.' using errcode = 'PLU01';
    end if;
    if v_mode in ('from_payment', 'from_first_scan') and (v_duration is null or v_duration not between 1 and 527040) then
      raise exception 'La duración del QR debe estar entre 1 minuto y 366 días.' using errcode = 'PLU01';
    end if;
    if v_mode in ('event_days', 'from_payment', 'from_first_scan') and (v_from is not null or v_until is not null) then
      raise exception 'Esta política de QR no puede tener una ventana fija.' using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set qr_validity_mode = v_mode,
        qr_validity_duration_minutes = case when v_mode in ('from_payment', 'from_first_scan') then v_duration else null end,
        updated_at = now()
    where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'event.ticket_qr_validity_policy_updated', 'event', v_event_id::text,
    'staff', left(p_actor, 200), jsonb_build_object('ticketTypes', v_count)
  );

  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

-- El informe de escaneos ya no expone el token ni el DNI (verificado más
-- abajo); `ticketId` es un uuid interno, no un dato personal ni un
-- credencial al portador, y es lo único que le falta a esta fila para poder
-- ofrecer "otorgar excepción de acceso" sin tener que resolver el ticketCode
-- de nuevo contra el token crudo.
create or replace function public.staff_get_event_scan_error_report(
  p_event_slug text,
  p_from timestamptz default null,
  p_until timestamptz default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_from timestamptz;
  v_until timestamptz;
  v_limit integer;
  v_summary jsonb;
  v_by_outcome jsonb;
  v_by_gate jsonb;
  v_by_hour jsonb;
  v_repeated jsonb;
  v_recent jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);

  if p_from is not null and p_until is not null then
    v_from := p_from;
    v_until := p_until;
  else
    select
      coalesce(min(d.date)::timestamp at time zone 'America/Argentina/Buenos_Aires', v_event.starts_at),
      coalesce((max(d.date) + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires', v_event.ends_at)
    into v_from, v_until
    from public.event_days d
    where d.event_id = v_event.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', total)), '[]'::jsonb)
  into v_by_outcome
  from (
    select outcome, count(*) as total
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by outcome
    order by total desc
  ) t;

  select jsonb_build_object(
    'total', coalesce(sum(total), 0),
    'admitted', coalesce(sum(total) filter (where outcome in ('checked_in', 'ready')), 0),
    'rejected', coalesce(sum(total) filter (where outcome not in ('checked_in', 'ready')), 0),
    'byOutcome', v_by_outcome
  )
  into v_summary
  from (
    select outcome, count(*) as total
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by outcome
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('gate', coalesce(gate, '—'), 'count', total)), '[]'::jsonb)
  into v_by_gate
  from (
    select gate, count(*) as total
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by gate
    order by total desc
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'count', total) order by hour), '[]'::jsonb)
  into v_by_hour
  from (
    select date_trunc('hour', scanned_at) as hour, count(*) as total
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by hour
  ) t;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_repeated
  from (
    select jsonb_build_object(
      'qrFingerprint', s.qr_fingerprint,
      'attempts', s.attempts,
      'gates', s.gates,
      'outcomes', s.outcomes,
      'firstAt', s.first_at,
      'lastAt', s.last_at,
      'ticketCode', t.ticket_code,
      'credentialLabel', t.credential_label
    ) as row
    from (
      select
        qr_fingerprint,
        count(*) as attempts,
        array_agg(distinct gate) filter (where gate is not null) as gates,
        array_agg(distinct outcome) as outcomes,
        min(scanned_at) as first_at,
        max(scanned_at) as last_at,
        (array_agg(ticket_id order by scanned_at desc))[1] as last_ticket_id
      from public.checkin_scan_events
      where event_id = v_event.id
        and scanned_at >= v_from and scanned_at < v_until
        and qr_fingerprint is not null
      group by qr_fingerprint
      having count(*) >= 2 and bool_or(outcome <> 'checked_in')
      order by count(*) desc
      limit 20
    ) s
    left join public.tickets t on t.id = s.last_ticket_id
  ) rows;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_recent
  from (
    select jsonb_build_object(
      'id', e.id,
      'scannedAt', e.scanned_at,
      'outcome', e.outcome,
      'kind', e.kind,
      'evidence', e.evidence,
      'gate', e.gate,
      'zoneScope', e.zone_scope,
      'actorLabel', e.actor_label,
      'deviceId', e.device_id,
      'offline', e.offline,
      'errorCode', e.error_code,
      'ticketId', e.ticket_id,
      'ticketCode', t.ticket_code,
      'credentialLabel', t.credential_label,
      'ticketTypeName', tt.name
    ) as row
    from public.checkin_scan_events e
    left join public.tickets t on t.id = e.ticket_id
    left join public.ticket_types tt on tt.id = t.ticket_type_id
    where e.event_id = v_event.id and e.scanned_at >= v_from and e.scanned_at < v_until
    order by e.scanned_at desc
    limit v_limit
  ) rows;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'slug', v_event.slug, 'title', v_event.title, 'from', v_from, 'until', v_until
    ),
    'summary', v_summary,
    'byGate', v_by_gate,
    'byHour', v_by_hour,
    'repeated', v_repeated,
    'recent', v_recent
  );
end;
$$;

revoke all on function public.staff_get_event_scan_error_report(text, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.staff_get_event_scan_error_report(text, timestamptz, timestamptz, integer)
  to service_role;

do $verification$
begin
  if position('from_first_scan' in pg_get_functiondef(
    'plu_private.resolve_ticket_type_access_window(uuid,timestamptz)'::regprocedure
  )) = 0 then
    raise exception 'resolve_ticket_type_access_window no resuelve from_first_scan.';
  end if;
  if position('from_first_scan' in pg_get_functiondef(
    'public.staff_check_in_ticket(uuid,text,text,text)'::regprocedure
  )) = 0 then
    raise exception 'staff_check_in_ticket no activa from_first_scan en la puerta.';
  end if;
  if position('from_first_scan' in pg_get_functiondef(
    'public.staff_merge_ticket_type_validity(text,jsonb,text)'::regprocedure
  )) = 0 then
    raise exception 'staff_merge_ticket_type_validity no acepta from_first_scan.';
  end if;
  if position('from_first_scan' in pg_get_functiondef(
    'public.staff_merge_ticket_type_validity_policy(text,jsonb,text)'::regprocedure
  )) = 0 then
    raise exception 'staff_merge_ticket_type_validity_policy no acepta from_first_scan.';
  end if;
  if position('qr_token' in pg_get_functiondef(
      'public.staff_get_event_scan_error_report(text,timestamptz,timestamptz,integer)'::regprocedure
    )) <> 0 then
    raise exception 'El informe de escaneos no debe exponer el token crudo del QR.';
  end if;
  if position('attendee_dni' in pg_get_functiondef(
      'public.staff_get_event_scan_error_report(text,timestamptz,timestamptz,integer)'::regprocedure
    )) <> 0 then
    raise exception 'El informe de escaneos no debe exponer el DNI.';
  end if;
end
$verification$;
