-- Entradas personalizables y QR con vigencia inmutable — PLU ARG
--
-- El catálogo ya asociaba tipos de entrada a jornadas, pero esa relación sólo
-- servía para filtrar el roster: `staff_check_in_ticket` aceptaba una entrada
-- paga cualquier día. Además, editar los días del tipo después de vender
-- cambiaba implícitamente lo que parecía habilitar un QR emitido.
--
-- Esta migración:
--   1. agrega descripción pública al tipo de entrada;
--   2. congela `valid_from` / `valid_until` en cada QR al emitirlo;
--   3. usa límite superior exclusivo: Día 1 vence al comenzar el Día 2;
--   4. aplica la misma regla online y en la allowlist offline.

alter table public.ticket_types
  add column if not exists description text null;

alter table public.ticket_types
  drop constraint if exists ticket_types_description_length_check;
alter table public.ticket_types
  add constraint ticket_types_description_length_check
  check (description is null or char_length(description) <= 240);

comment on column public.ticket_types.description is
  'Descripción comercial visible antes de pagar. Máximo 240 caracteres.';

alter table public.tickets
  add column if not exists valid_from timestamptz null,
  add column if not exists valid_until timestamptz null;

comment on column public.tickets.valid_from is
  'Inicio inmutable de vigencia del QR, congelado al emitir la entrada.';
comment on column public.tickets.valid_until is
  'Fin exclusivo e inmutable de vigencia del QR; al alcanzar este instante ya expiró.';

create or replace function plu_private.resolve_ticket_validity_window(
  p_ticket_type_id uuid,
  p_event_id uuid
)
returns table(valid_from timestamptz, valid_until timestamptz)
language sql
stable
set search_path = public
as $$
  with day_bounds as (
    select min(d.date) as first_day, max(d.date) as last_day
    from public.ticket_type_days td
    join public.event_days d on d.id = td.event_day_id
    where td.ticket_type_id = p_ticket_type_id
      and d.event_id = p_event_id
      and d.date is not null
  )
  select
    coalesce(
      b.first_day::timestamp at time zone 'America/Argentina/Buenos_Aires',
      e.starts_at
    ) as valid_from,
    coalesce(
      (b.last_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires',
      e.ends_at
    ) as valid_until
  from public.events e
  cross join day_bounds b
  where e.id = p_event_id;
$$;

revoke all on function plu_private.resolve_ticket_validity_window(uuid, uuid)
  from public, anon, authenticated;

create or replace function plu_private.set_ticket_validity_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_until timestamptz;
begin
  if new.valid_from is not null and new.valid_until is not null then
    return new;
  end if;

  select window.valid_from, window.valid_until
    into v_from, v_until
  from plu_private.resolve_ticket_validity_window(new.ticket_type_id, new.event_id) window;

  if v_from is null or v_until is null or v_until <= v_from then
    raise exception 'No se pudo determinar la vigencia del QR de la entrada.'
      using errcode = 'PLU01';
  end if;

  new.valid_from := v_from;
  new.valid_until := v_until;
  return new;
end;
$$;

revoke all on function plu_private.set_ticket_validity_snapshot()
  from public, anon, authenticated;

drop trigger if exists tickets_set_validity_snapshot on public.tickets;
create trigger tickets_set_validity_snapshot
before insert on public.tickets
for each row execute function plu_private.set_ticket_validity_snapshot();

with validity as (
  select t.id, window.valid_from, window.valid_until
  from public.tickets t
  cross join lateral plu_private.resolve_ticket_validity_window(t.ticket_type_id, t.event_id) window
)
update public.tickets t
set valid_from = validity.valid_from,
    valid_until = validity.valid_until
from validity
where t.id = validity.id
  and (t.valid_from is null or t.valid_until is null);

alter table public.tickets
  alter column valid_from set not null,
  alter column valid_until set not null;

alter table public.tickets
  drop constraint if exists tickets_validity_window_check;
alter table public.tickets
  add constraint tickets_validity_window_check
  check (valid_until > valid_from);

create index if not exists tickets_event_validity_idx
  on public.tickets(event_id, valid_from, valid_until);

-- El upsert histórico no escribe columnas agregadas después. Se usa un merge
-- separado por el mismo patrón de las credenciales: los tipos nuevos se
-- resuelven por `sort_order` porque todavía no tenían id en el browser.
create or replace function public.staff_merge_ticket_type_descriptions(
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
  v_description text;
  v_count int := 0;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  if jsonb_typeof(coalesce(p_types, '[]'::jsonb)) <> 'array' then
    raise exception 'Las descripciones de entrada son inválidas.' using errcode = 'PLU01';
  end if;

  for v_type in select * from jsonb_array_elements(coalesce(p_types, '[]'::jsonb))
  loop
    v_type_id := null;
    if nullif(v_type ->> 'ticketTypeId', '') is not null then
      select id into v_type_id
      from public.ticket_types
      where id = (v_type ->> 'ticketTypeId')::uuid and event_id = v_event_id;
    else
      select id into v_type_id
      from public.ticket_types
      where event_id = v_event_id
        and sort_order = coalesce((v_type ->> 'sortOrder')::int, 0)
      order by created_at desc
      limit 1;
    end if;

    if v_type_id is null then
      raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
    end if;

    v_description := nullif(trim(v_type ->> 'description'), '');
    if v_description is not null and char_length(v_description) > 240 then
      raise exception 'La descripción de la entrada admite hasta 240 caracteres.'
        using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set description = v_description,
        updated_at = now()
    where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    'event.ticket_descriptions_updated', 'event', v_event_id::text,
    'staff', left(p_actor, 200), jsonb_build_object('ticketTypes', v_count)
  );

  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

revoke all on function public.staff_merge_ticket_type_descriptions(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_merge_ticket_type_descriptions(text, jsonb, text)
  to service_role;

-- Proyección pública mínima. No expone DNI ni datos del comprador; sí expone
-- la vigencia porque es parte del veredicto del QR.
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
      'ticket_type_description', tt.description,
      'addons', t.addons, 'status', t.status,
      'credential_label', coalesce(t.credential_label, 'Entrada general'),
      'credential_scopes', coalesce(t.credential_scopes, array['gate_tickets']),
      'bundle_id', t.bundle_id,
      'valid_from', t.valid_from, 'valid_until', t.valid_until,
      'validity_status', case
        when clock_timestamp() < t.valid_from then 'upcoming'
        when clock_timestamp() >= t.valid_until then 'expired'
        else 'valid'
      end,
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
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.check_ins c on c.ticket_id = t.id
  where t.qr_token = p_qr_token;

  if v_result is null then
    raise exception 'Entrada no encontrada.' using errcode = 'PLU02';
  end if;
  return v_result;
end;
$$;

revoke all on function plu_private.get_ticket_by_qr_token(uuid)
  from public, anon, authenticated;

-- La lista descargable lleva el snapshot exacto para aplicar la misma regla
-- cuando el puesto se queda sin señal.
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
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token,
    'ticketCode', t.ticket_code,
    'attendeeName', t.attendee_name,
    'attendeeDni', t.attendee_dni,
    'ticketTypeId', t.ticket_type_id,
    'ticketTypeName', tt.name,
    'ticketTypeDescription', tt.description,
    'credentialLabel', coalesce(t.credential_label, 'Entrada general'),
    'credentialScopes', coalesce(t.credential_scopes, array['gate_tickets']),
    'validFrom', t.valid_from,
    'validUntil', t.valid_until,
    'status', t.status,
    'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_tickets
  from public.tickets t
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.check_ins c on c.ticket_id = t.id
  where t.event_id = v_event.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', m.qr_token,
    'memberCode', m.member_code,
    'registrationId', r.id,
    'athleteName', a.full_name,
    'athleteDocument', a.document_id,
    'division', r.division,
    'category', r.category,
    'status', r.status,
    'checkedInAt', c.scanned_at
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

revoke all on function public.staff_get_event_checkin_allowlist(text)
  from public, anon, authenticated;
grant execute on function public.staff_get_event_checkin_allowlist(text)
  to service_role;

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
      using errcode = 'PLU05';
  end if;
  if clock_timestamp() >= v_ticket.valid_until then
    raise exception 'Este QR venció el %.',
      to_char(v_ticket.valid_until at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
      using errcode = 'PLU05';
  end if;
  if p_zone_scope is not null
     and not (p_zone_scope = any(coalesce(v_ticket.credential_scopes, array['gate_tickets']))) then
    raise exception 'La credencial "%" no habilita esta zona.',
      coalesce(v_ticket.credential_label, 'Entrada general')
      using errcode = 'PLU05';
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

create or replace function public.staff_check_in_ticket(
  p_qr_token uuid,
  p_gate text,
  p_actor text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.staff_check_in_ticket(p_qr_token, p_gate, p_actor, null::text);
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
  if exists (
    select 1 from public.tickets
    where valid_from is null or valid_until is null or valid_until <= valid_from
  ) then
    raise exception 'Hay entradas sin una vigencia válida después del backfill.';
  end if;
  if position('valid_until' in pg_get_functiondef(
      'public.staff_check_in_ticket(uuid, text, text, text)'::regprocedure
    )) = 0 then
    raise exception 'El check-in no valida el vencimiento del QR.';
  end if;
end
$verification$;

