-- Código de puerta XXX-XXX.
--
-- El QR sigue siendo el `qr_token` opaco y el `ticket_code` (`TCK-`) sigue
-- siendo el número de la compra. `gate_code` es otro nombre de la misma fila:
-- dictarlo en la puerta resuelve al mismo token y `staff_check_in_ticket`
-- escribe la misma llave de consumo. Un segundo intento del mismo día choca
-- con `check_ins_ticket_access_window_key`.
--
-- Un pase de dos o más jornadas que todavía tenía el default histórico
-- `once_total` pasa a un ingreso por jornada. Un `once_total` elegido sobre
-- una vigencia que no es por días no se toca.

alter table public.tickets
  add column if not exists gate_code text;

comment on column public.tickets.gate_code is
  'Código dictable XXX-XXX. Alias del mismo qr_token, no una segunda credencial.';

create or replace function public.generate_ticket_gate_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw text := '';
  i int;
begin
  for i in 1..6 loop
    raw := raw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(raw, 1, 3) || '-' || substr(raw, 4, 3);
end;
$$;

create or replace function public.tickets_assign_gate_code()
returns trigger
language plpgsql
as $$
declare
  attempt int := 0;
  candidate text;
begin
  if new.gate_code is not null then
    return new;
  end if;
  loop
    candidate := public.generate_ticket_gate_code();
    exit when not exists (select 1 from public.tickets where gate_code = candidate);
    attempt := attempt + 1;
    if attempt > 8 then
      raise exception 'No se pudo asignar un código de puerta único.' using errcode = 'PLU01';
    end if;
  end loop;
  new.gate_code := candidate;
  return new;
end;
$$;

drop trigger if exists tickets_assign_gate_code on public.tickets;
create trigger tickets_assign_gate_code
  before insert on public.tickets
  for each row
  execute function public.tickets_assign_gate_code();

do $$
declare
  ticket record;
  candidate text;
  attempt int;
begin
  for ticket in select id from public.tickets where gate_code is null loop
    attempt := 0;
    loop
      candidate := public.generate_ticket_gate_code();
      exit when not exists (select 1 from public.tickets where gate_code = candidate);
      attempt := attempt + 1;
      if attempt > 8 then
        raise exception 'No se pudo completar el código de puerta de las entradas existentes.';
      end if;
    end loop;
    update public.tickets
      set gate_code = candidate, updated_at = clock_timestamp()
      where id = ticket.id;
  end loop;
end;
$$;

alter table public.tickets
  alter column gate_code set not null;

alter table public.tickets
  drop constraint if exists tickets_gate_code_format;
alter table public.tickets
  add constraint tickets_gate_code_format
  check (gate_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$');

create unique index if not exists tickets_gate_code_key on public.tickets (gate_code);

update public.ticket_types tt
set access_usage_mode = 'once_per_event_day',
    updated_at = clock_timestamp()
where tt.access_usage_mode = 'once_total'
  and coalesce(tt.qr_validity_mode, 'event_days') = 'event_days'
  and (
    select count(*) from public.ticket_type_days d where d.ticket_type_id = tt.id
  ) > 1;

-- La lista offline tiene que poder canjear el código sin señal. El resto del
-- payload queda igual que en 20270102100000.
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
