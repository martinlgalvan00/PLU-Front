-- La credencial QR identifica una entrada; no es dueña de su calendario.
-- El tipo comercial resuelve la regla de acceso en tiempo de check-in. Los
-- campos valid_from/valid_until de tickets quedan sólo como compatibilidad de
-- transición para consumidores antiguos y ya no son autoritativos.

alter table public.ticket_types
  add column if not exists access_usage_mode text not null default 'once_total';
alter table public.ticket_types
  drop constraint if exists ticket_types_access_usage_mode_check;
alter table public.ticket_types
  add constraint ticket_types_access_usage_mode_check
  check (access_usage_mode in ('once_total', 'once_per_event_day'));

alter table public.tickets
  add column if not exists access_activated_at timestamptz null;
alter table public.tickets
  add column if not exists access_override_enabled boolean not null default false,
  add column if not exists access_override_valid_from timestamptz null,
  add column if not exists access_override_valid_until timestamptz null;
alter table public.tickets
  add constraint tickets_access_override_window_check
  check (
    (access_override_enabled = false and access_override_valid_from is null and access_override_valid_until is null)
    or (access_override_enabled = true and access_override_valid_from is not null
      and access_override_valid_until is not null and access_override_valid_until > access_override_valid_from)
  );

comment on column public.ticket_types.access_usage_mode is
  'once_total o once_per_event_day; una misma credencial no se duplica por jornada.';
comment on column public.tickets.access_activated_at is
  'Instante de acreditación del derecho para políticas from_payment; no es parte del QR.';
comment on column public.tickets.access_override_enabled is
  'Excepción individual administrada sobre una entrada; nunca modifica el token QR ni el tipo comercial.';

-- Conserva el ancla de las entradas relativas que ya se emitieron. Para las
-- nuevas se completa al acreditar el pago, junto con los campos legacy.
update public.tickets
set access_activated_at = valid_from
where access_activated_at is null
  and qr_validity_mode = 'from_payment'
  and valid_from is not null;

create or replace function plu_private.activate_ticket_validity_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz;
begin
  if new.status = 'pagada'
     and old.status is distinct from 'pagada'
     and new.qr_validity_mode = 'from_payment' then
    if new.qr_validity_duration_minutes is null then
      raise exception 'Falta la duración de acceso desde acreditación.' using errcode = 'PLU01';
    end if;
    v_now := clock_timestamp();
    new.access_activated_at := v_now;
    -- Compatibilidad con las proyecciones antiguas. El check-in nuevo usa la
    -- política viva del tipo y access_activated_at, no estas fechas copiadas.
    new.valid_from := v_now;
    new.valid_until := v_now + make_interval(mins => new.qr_validity_duration_minutes);
  end if;
  return new;
end;
$$;

-- Una entrada puede consumirse una vez en total o una vez por cada jornada
-- autorizada. El QR se mantiene idéntico: cambia la llave de consumo.
alter table public.check_ins
  add column if not exists access_window_key text not null default 'once_total';
alter table public.check_ins
  drop constraint if exists check_ins_ticket_id_key;
create unique index if not exists check_ins_ticket_access_window_key
  on public.check_ins(ticket_id, access_window_key)
  where ticket_id is not null;

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
begin
  select t into v_ticket from public.tickets t where t.id = p_ticket_id;

  if not found then
    return;
  end if;
  select tt into v_type from public.ticket_types tt where tt.id = v_ticket.ticket_type_id;
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
  elsif v_type.qr_validity_mode = 'fixed_window' then
    valid_from := v_type.valid_from;
    valid_until := v_type.valid_until;
    access_window_key := 'once_total';
  else
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
    when v_type.qr_validity_mode = 'event_days' and not exists (
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

create or replace function public.staff_set_ticket_access_override(
  p_ticket_id uuid,
  p_enabled boolean,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ticket public.tickets;
begin
  if p_enabled and (p_valid_from is null or p_valid_until is null or p_valid_until <= p_valid_from) then
    raise exception 'La excepción de acceso necesita un inicio y un fin válidos.' using errcode = 'PLU01';
  end if;
  update public.tickets
  set access_override_enabled = p_enabled,
      access_override_valid_from = case when p_enabled then p_valid_from else null end,
      access_override_valid_until = case when p_enabled then p_valid_until else null end,
      updated_at = now()
  where id = p_ticket_id
  returning * into v_ticket;
  if not found then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('ticket.access_override_updated', 'ticket', v_ticket.id::text, 'staff', left(coalesce(p_actor, ''), 200),
    jsonb_build_object('enabled', p_enabled, 'validFrom', p_valid_from, 'validUntil', p_valid_until));
  return jsonb_build_object('ticket', to_jsonb(v_ticket));
end;
$$;

create or replace function public.staff_merge_ticket_type_access_policy(
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
  v_usage text;
  v_mode text;
  v_count integer := 0;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;

  for v_type in select * from jsonb_array_elements(coalesce(p_types, '[]'::jsonb)) loop
    select id, qr_validity_mode into v_type_id, v_mode
    from public.ticket_types
    where event_id = v_event_id
      and (
        id = nullif(v_type ->> 'ticketTypeId', '')::uuid
        or (nullif(v_type ->> 'ticketTypeId', '') is null
            and sort_order = coalesce((v_type ->> 'sortOrder')::integer, 0))
      )
    order by created_at desc limit 1;
    if v_type_id is null then raise exception 'El tipo de entrada no pertenece al evento.' using errcode = 'PLU01'; end if;

    v_usage := coalesce(nullif(v_type ->> 'accessUsageMode', ''), 'once_total');
    if v_usage not in ('once_total', 'once_per_event_day') then
      raise exception 'La regla de uso de la entrada es inválida.' using errcode = 'PLU01';
    end if;
    if v_usage = 'once_per_event_day' and v_mode <> 'event_days' then
      raise exception 'Un ingreso por jornada requiere jornadas asignadas.' using errcode = 'PLU01';
    end if;
    update public.ticket_types set access_usage_mode = v_usage, updated_at = now() where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('event.ticket_access_policy_updated', 'event', v_event_id::text, 'staff', left(p_actor, 200),
    jsonb_build_object('ticketTypes', v_count));
  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

-- La verificación consulta el tipo actual: el token no carga calendario.
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
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'venue', e.venue, 'location', e.location, 'starts_at', e.starts_at, 'ends_at', e.ends_at),
    'checkIn', case when c.id is null then null else jsonb_build_object('id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at) end
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
  v_access record;
  v_checkin public.check_ins;
begin
  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  if v_ticket.status <> 'pagada' then raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05'; end if;
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

create or replace function public.staff_check_in_ticket(p_qr_token uuid, p_gate text, p_actor text)
returns jsonb language sql security definer set search_path = public as $$
  select public.staff_check_in_ticket(p_qr_token, p_gate, p_actor, null::text);
$$;

-- La allowlist offline recibe la ventana resuelta del tipo y la llave de uso
-- actual. Un dispositivo desconectado no necesita ni interpreta fechas dentro
-- del QR; sólo aplica la misma autorización que descargó de la puerta.
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
    'qrToken', m.qr_token, 'memberCode', m.member_code,
    'registrationId', r.id, 'athleteName', a.full_name,
    'athleteDocument', a.document_id, 'division', r.division, 'category', r.category,
    'status', r.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_registrations
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.memberships m on m.athlete_id = a.id and m.status = 'activa'
    and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = v_event.id and r.status = 'confirmada';

  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end;
$$;

revoke all on function public.staff_merge_ticket_type_access_policy(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.staff_merge_ticket_type_access_policy(text, jsonb, text) to service_role;
revoke all on function public.staff_set_ticket_access_override(uuid, boolean, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.staff_set_ticket_access_override(uuid, boolean, timestamptz, timestamptz, text) to service_role;
revoke all on function plu_private.resolve_ticket_type_access_window(uuid, timestamptz) from public, anon, authenticated;
