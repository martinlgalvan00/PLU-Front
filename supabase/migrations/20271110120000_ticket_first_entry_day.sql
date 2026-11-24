-- Pase de un día elegido en la puerta.
--
-- Antes del primer ingreso vale cualquiera de las jornadas del tipo. El
-- check-in exitoso traba la credencial a ese día calendario de Argentina
-- (00:00 inclusive, 00:00 del día siguiente exclusive). El domingo, aunque
-- no hayan pasado 24 horas, la ventana ya venció. Una excepción de vigencia
-- no mueve un día ya trabado ni traba uno que hoy no estaba habilitado.

alter table public.ticket_types
  drop constraint if exists ticket_types_qr_validity_policy_check;
alter table public.ticket_types
  add constraint ticket_types_qr_validity_policy_check
  check (
    (qr_validity_mode in ('event_days', 'first_entry_day')
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
    (qr_validity_mode in ('event_days', 'fixed_window', 'first_entry_day')
      and qr_validity_duration_minutes is null)
    or (qr_validity_mode in ('from_payment', 'from_first_scan')
      and qr_validity_duration_minutes between 1 and 527040)
  );

comment on column public.tickets.access_activated_at is
  'Instante en que arranca el derecho relativo: from_payment al acreditarse, from_first_scan y first_entry_day en el primer ingreso de seguridad.';

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
  v_locked_day date;
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
  elsif v_type.qr_validity_mode = 'first_entry_day' then
    if v_ticket.access_activated_at is not null then
      v_locked_day := (v_ticket.access_activated_at at time zone 'America/Argentina/Buenos_Aires')::date;
      valid_from := v_locked_day::timestamp at time zone 'America/Argentina/Buenos_Aires';
      valid_until := (v_locked_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
      access_window_key := 'event_day:' || v_locked_day::text;
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
      access_window_key := 'event_day:' || coalesce(v_today::text, 'unknown');
    end if;
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
  v_now timestamptz;
  v_day date;
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

  -- Sólo después de saber que hoy es una jornada habilitada. Si el insert
  -- falla, la transacción deshace el trabado.
  if v_type.qr_validity_mode = 'first_entry_day' and v_ticket.access_activated_at is null then
    v_now := clock_timestamp();
    v_day := (v_now at time zone 'America/Argentina/Buenos_Aires')::date;
    update public.tickets
    set access_activated_at = v_now,
        valid_from = v_day::timestamp at time zone 'America/Argentina/Buenos_Aires',
        valid_until = (v_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
    where id = v_ticket.id
    returning * into v_ticket;
    select * into v_access from plu_private.resolve_ticket_type_access_window(v_ticket.id, v_now);
    if v_access.validity_status <> 'valid' then
      raise exception 'No se pudo trabar el día de esta credencial.' using errcode = 'PLU05';
    end if;
  end if;

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
  v_now timestamptz;
  v_day date;
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

    if v_type.qr_validity_mode = 'first_entry_day' and v_ticket.access_activated_at is null then
      v_now := clock_timestamp();
      v_day := (v_now at time zone 'America/Argentina/Buenos_Aires')::date;
      update public.tickets
      set access_activated_at = v_now,
          valid_from = v_day::timestamp at time zone 'America/Argentina/Buenos_Aires',
          valid_until = (v_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
      where id = v_ticket.id
      returning * into v_ticket;
      select * into v_access from plu_private.resolve_ticket_type_access_window(v_ticket.id, v_now);
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

    if v_mode not in ('event_days', 'fixed_window', 'from_payment', 'from_first_scan', 'first_entry_day') then
      raise exception 'La política de vigencia QR es inválida.' using errcode = 'PLU01';
    end if;
    if v_mode = 'fixed_window' and (v_from is null or v_until is null or v_until <= v_from) then
      raise exception 'La ventana fija del QR necesita inicio y fin válidos.' using errcode = 'PLU01';
    end if;
    if v_mode in ('event_days', 'from_payment', 'from_first_scan', 'first_entry_day')
      and (v_from is not null or v_until is not null) then
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
        access_usage_mode = case when v_mode = 'first_entry_day' then 'once_total' else access_usage_mode end,
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
    if v_mode not in ('event_days', 'fixed_window', 'from_payment', 'from_first_scan', 'first_entry_day') then
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
    if v_mode in ('event_days', 'from_payment', 'from_first_scan', 'first_entry_day')
      and (v_from is not null or v_until is not null) then
      raise exception 'Esta política de QR no puede tener una ventana fija.' using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set qr_validity_mode = v_mode,
        qr_validity_duration_minutes = case when v_mode in ('from_payment', 'from_first_scan') then v_duration else null end,
        access_usage_mode = case when v_mode = 'first_entry_day' then 'once_total' else access_usage_mode end,
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

-- La lista offline tiene que reconocer el modo para no admitirlo sin red.
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
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code, 'gateCode', t.gate_code,
    'attendeeName', t.attendee_name, 'attendeeDni', t.attendee_dni,
    'ticketTypeId', t.ticket_type_id, 'ticketTypeName', tt.name,
    'ticketTypeDescription', tt.description,
    'validityMode', tt.qr_validity_mode,
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

do $verification$
begin
  if position('first_entry_day' in pg_get_functiondef(
    'plu_private.resolve_ticket_type_access_window(uuid,timestamptz)'::regprocedure
  )) = 0 then
    raise exception 'resolve_ticket_type_access_window no resuelve first_entry_day.';
  end if;
  if position('first_entry_day' in pg_get_functiondef(
    'public.staff_check_in_ticket(uuid,text,text,text)'::regprocedure
  )) = 0 then
    raise exception 'staff_check_in_ticket no traba first_entry_day en la puerta.';
  end if;
  if position('first_entry_day' in pg_get_functiondef(
    'public.staff_force_check_in_ticket(uuid,text,text,text,text,text)'::regprocedure
  )) = 0 then
    raise exception 'staff_force_check_in_ticket no conoce first_entry_day.';
  end if;
end;
$verification$;
