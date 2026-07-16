-- Infraestructura productiva unificada para entradas, atletas, afiliaciones e
-- inscripciones. Esta migracion es aditiva: conserva datos de fases previas,
-- cierra RPCs sensibles al rol anon y deja Express + service_role como unica
-- frontera de escritura.

create extension if not exists pgcrypto;

create table if not exists public.athlete_credentials (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  password_hash text not null,
  password_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.athlete_credentials enable row level security;
revoke all on public.athlete_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.athlete_credentials to service_role;

create or replace function public.register_athlete_v2(p_form jsonb, p_password_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_athlete jsonb;
begin
  if p_password_hash is null or length(p_password_hash) < 40 then
    raise exception 'Credencial de atleta invalida.' using errcode = 'PLU01';
  end if;
  v_athlete := public.register_athlete(p_form);
  insert into public.athlete_credentials(athlete_id, password_hash)
  values((v_athlete ->> 'id')::uuid, p_password_hash);
  return v_athlete;
end $$;
revoke all on function public.register_athlete_v2(jsonb, text) from public, anon, authenticated;
grant execute on function public.register_athlete_v2(jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Sesiones de atleta y auditoria durable
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists athlete_sessions_lookup_idx
  on public.athlete_sessions (token_hash, expires_at)
  where revoked_at is null;

alter table public.athlete_sessions enable row level security;
revoke all on public.athlete_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.athlete_sessions to service_role;

create table if not exists public.domain_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor_type text not null,
  actor_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists domain_audit_logs_entity_idx
  on public.domain_audit_logs (entity_type, entity_id, created_at desc);
alter table public.domain_audit_logs enable row level security;
revoke all on public.domain_audit_logs from public, anon, authenticated;
grant select, insert on public.domain_audit_logs to service_role;

-- ---------------------------------------------------------------------------
-- Idempotencia, reservas y codigos concurrentes
-- ---------------------------------------------------------------------------
alter table public.ticket_orders
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists access_token_hash text;

create unique index if not exists ticket_orders_access_token_hash_uidx
  on public.ticket_orders (access_token_hash)
  where access_token_hash is not null;

-- La columna ya fue agregada en fase 4; se mantiene el indice idempotente.
create unique index if not exists ticket_orders_idempotency_key_uidx
  on public.ticket_orders (idempotency_key)
  where idempotency_key is not null;

alter table public.athlete_payment_orders
  add column if not exists expires_at timestamptz;

create sequence if not exists public.ticket_code_seq;
create sequence if not exists public.membership_code_seq;

do $$
declare
  v_ticket_count bigint;
  v_member_count bigint;
begin
  select coalesce(max((regexp_match(ticket_code, '([0-9]+)$'))[1]::bigint), 0)
    into v_ticket_count from public.tickets where ticket_code ~ '[0-9]+$';
  perform setval('public.ticket_code_seq', greatest(v_ticket_count, 1), v_ticket_count > 0);
  select coalesce(max((regexp_match(member_code, '([0-9]+)$'))[1]::bigint), 0)
    into v_member_count from public.memberships where member_code ~ '[0-9]+$';
  perform setval('public.membership_code_seq', greatest(v_member_count, 1), v_member_count > 0);
end $$;

create table if not exists public.membership_order_targets (
  order_id uuid primary key references public.athlete_payment_orders (id) on delete restrict,
  membership_id uuid not null references public.memberships (id) on delete restrict,
  starts_at date not null,
  ends_at date not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists membership_order_targets_membership_idx
  on public.membership_order_targets (membership_id, starts_at desc);
alter table public.membership_order_targets enable row level security;
revoke all on public.membership_order_targets from public, anon, authenticated;
grant select, insert, update on public.membership_order_targets to service_role;

alter table public.check_ins add column if not exists scanned_by_label text;

-- Las fotos pasan a ser privadas. El backend entrega URLs firmadas solamente
-- al atleta propietario o a staff autenticado.
update storage.buckets set public = false where id = 'athlete-photos';
drop policy if exists athlete_photos_insert on storage.objects;
drop policy if exists athlete_photos_update on storage.objects;
drop policy if exists athlete_photos_delete on storage.objects;
drop policy if exists ticket_proofs_insert_buyer on storage.objects;
drop policy if exists ticket_proofs_select_admin on storage.objects;

-- ---------------------------------------------------------------------------
-- Compra de entradas atomica, idempotente y con reserva temporal
-- ---------------------------------------------------------------------------
create or replace function public.expire_ticket_reservations(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.ticket_orders o
    set status = 'cancelado', updated_at = now()
    where o.status in ('creado', 'pendiente')
      and o.reservation_expires_at is not null
      and o.reservation_expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'ticket' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
    returning o.id
  ), cancelled as (
    update public.tickets t set status = 'cancelada', updated_at = now()
    where t.order_id in (select id from expired) and t.status = 'pendiente_pago'
    returning t.order_id
  )
  select count(distinct order_id) into v_count from cancelled;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.create_ticket_order_v2(
  p_event_slug text,
  p_attendees jsonb,
  p_buyer jsonb,
  p_idempotency_key text,
  p_access_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_existing public.ticket_orders;
  v_order public.ticket_orders;
  v_attendee jsonb;
  v_ticket jsonb;
  v_tickets jsonb := '[]'::jsonb;
  v_catalog jsonb;
  v_addon_result jsonb;
  v_addons jsonb;
  v_day_pass text;
  v_provider text;
  v_unit_price int;
  v_total int := 0;
  v_day_price int;
  v_both_price int;
  v_requested int;
  v_reserved int;
  v_limit int;
  v_hold_minutes int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_access_token_hash is null or length(p_access_token_hash) <> 64 then
    raise exception 'Token de orden invalido.' using errcode = 'PLU01';
  end if;
  if jsonb_typeof(p_attendees) <> 'array'
     or jsonb_array_length(p_attendees) < 1
     or jsonb_array_length(p_attendees) > 8 then
    raise exception 'La compra debe incluir entre 1 y 8 asistentes.' using errcode = 'PLU01';
  end if;

  select * into v_existing from public.ticket_orders
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.access_token_hash is distinct from p_access_token_hash then
      raise exception 'La clave de idempotencia ya pertenece a otra solicitud.' using errcode = 'PLU01';
    end if;
    select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb)
      into v_tickets from public.tickets t where t.order_id = v_existing.id;
    return jsonb_build_object('order', to_jsonb(v_existing), 'tickets', v_tickets, 'duplicate', true);
  end if;

  perform public.expire_ticket_reservations(now());

  select * into v_event from public.events where slug = p_event_slug for update;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  if v_event.status in ('cerrado', 'finalizado') then
    raise exception 'La venta de entradas esta cerrada.' using errcode = 'PLU03';
  end if;
  if v_event.ticket_sales_opens_at is not null and now() < v_event.ticket_sales_opens_at then
    raise exception 'La venta de entradas todavia no abrio.' using errcode = 'PLU03';
  end if;
  if v_event.ticket_sales_closes_at is not null and now() > v_event.ticket_sales_closes_at then
    raise exception 'La venta de entradas ya cerro.' using errcode = 'PLU03';
  end if;

  v_provider := coalesce(p_buyer ->> 'provider', 'mercado_pago');
  if v_provider not in ('mercado_pago', 'manual') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;
  if coalesce(length(trim(p_buyer ->> 'email')), 0) > 0
     and (p_buyer ->> 'email') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email del comprador invalido.' using errcode = 'PLU01';
  end if;

  v_day_price := coalesce((v_event.rules #>> '{ticketPricing,day}')::int, 12000);
  v_both_price := coalesce((v_event.rules #>> '{ticketPricing,bothDays}')::int, 20000);
  v_catalog := public.event_ticket_addons_catalog(v_event.rules);

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    if coalesce(length(trim(v_attendee ->> 'fullName')), 0) < 3
       or coalesce(v_attendee ->> 'dni', '') !~ '^[0-9]{7,8}$'
       or coalesce(v_attendee ->> 'dayPass', '') not in ('day1', 'day2', 'both') then
      raise exception 'Datos de asistente invalidos.' using errcode = 'PLU01';
    end if;
  end loop;

  select limit_count into v_limit from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event' and key = '';
  if v_limit is not null then
    select count(*) into v_reserved from public.tickets
    where event_id = v_event.id and status <> 'cancelada';
    if v_reserved + jsonb_array_length(p_attendees) > v_limit then
      raise exception 'Evento agotado.' using errcode = 'PLU04';
    end if;
  end if;

  for v_day_pass in select unnest(array['day1', 'day2', 'both']) loop
    select limit_count into v_limit from public.event_capacity_rules
    where event_id = v_event.id and scope = 'day' and key = v_day_pass;
    if v_limit is not null then
      select count(*) into v_reserved from public.tickets
      where event_id = v_event.id and status <> 'cancelada'
        and case v_day_pass
          when 'day1' then day_pass in ('day1', 'both')
          when 'day2' then day_pass in ('day2', 'both')
          else day_pass = 'both'
        end;
      select count(*) into v_requested from jsonb_array_elements(p_attendees)
      where case v_day_pass
        when 'day1' then value ->> 'dayPass' in ('day1', 'both')
        when 'day2' then value ->> 'dayPass' in ('day2', 'both')
        else value ->> 'dayPass' = 'both'
      end;
      if v_reserved + v_requested > v_limit then
        raise exception 'Entradas agotadas para %.', v_day_pass using errcode = 'PLU04';
      end if;
    end if;
  end loop;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    v_addon_result := public.ticket_addons_total_and_snapshot(
      coalesce(v_attendee -> 'addonIds', '[]'::jsonb), v_catalog
    );
    v_unit_price := case when v_attendee ->> 'dayPass' = 'both' then v_both_price else v_day_price end
      + coalesce((v_addon_result ->> 'total')::int, 0);
    v_total := v_total + v_unit_price;
  end loop;

  v_hold_minutes := case when v_provider = 'manual' then 1440 else 20 end;
  insert into public.ticket_orders (
    event_id, buyer_name, buyer_email, buyer_phone, amount, currency, provider,
    status, reference, idempotency_key, access_token_hash, reservation_expires_at
  ) values (
    v_event.id, nullif(trim(p_buyer ->> 'name'), ''), lower(nullif(trim(p_buyer ->> 'email'), '')),
    nullif(trim(p_buyer ->> 'phone'), ''), v_total, v_event.currency, v_provider,
    case when v_provider = 'manual' then 'pendiente' else 'creado' end,
    'TORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    p_access_token_hash, now() + make_interval(mins => v_hold_minutes)
  ) returning * into v_order;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    v_day_pass := v_attendee ->> 'dayPass';
    v_addon_result := public.ticket_addons_total_and_snapshot(
      coalesce(v_attendee -> 'addonIds', '[]'::jsonb), v_catalog
    );
    v_addons := coalesce(v_addon_result -> 'addons', '[]'::jsonb);
    v_unit_price := case when v_day_pass = 'both' then v_both_price else v_day_price end
      + coalesce((v_addon_result ->> 'total')::int, 0);

    insert into public.tickets (
      ticket_code, order_id, event_id, attendee_name, attendee_dni,
      day_pass, unit_price, addons, status
    ) values (
      'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
      v_order.id, v_event.id, trim(v_attendee ->> 'fullName'),
      v_attendee ->> 'dni', v_day_pass, v_unit_price, v_addons, 'pendiente_pago'
    ) returning to_jsonb(tickets) into v_ticket;
    v_tickets := v_tickets || jsonb_build_array(v_ticket);
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, metadata)
  values ('ticket_order.created', 'ticket_order', v_order.id::text, 'public',
    jsonb_build_object('eventId', v_event.id, 'quantity', jsonb_array_length(p_attendees), 'provider', v_provider));

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

-- Se declara antes de ser invocada en instalaciones limpias; CREATE OR REPLACE
-- posterior mantiene la misma firma.
create or replace function public.expire_ticket_reservations(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.ticket_orders o
    set status = 'cancelado', updated_at = now()
    where o.status in ('creado', 'pendiente')
      and o.reservation_expires_at is not null
      and o.reservation_expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'ticket' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
    returning o.id
  ), cancelled as (
    update public.tickets t set status = 'cancelada', updated_at = now()
    where t.order_id in (select id from expired) and t.status = 'pendiente_pago'
    returning t.order_id
  )
  select count(distinct order_id) into v_count from cancelled;
  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Afiliaciones e inscripciones sin doble orden ni sobreescritura de derechos
-- ---------------------------------------------------------------------------
create or replace function public.create_membership_order_v2(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_existing public.memberships;
  v_start date;
  v_end date;
  v_year text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_plan from public.membership_plans where code = p_plan_code and active = true;
  if not found then raise exception 'Plan de afiliacion no encontrado.' using errcode = 'PLU02'; end if;
  if v_plan.collection_mode = 'recurring' and p_payment_method <> 'mercado_pago' then
    raise exception 'Los planes recurrentes requieren Mercado Pago.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select m.* into v_membership from public.membership_order_targets t
      join public.memberships m on m.id = t.membership_id where t.order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', true);
  end if;

  select m.* into v_existing from public.memberships m
  where m.athlete_id = p_athlete_id
  order by m.expiration_date desc nulls last limit 1 for update;

  -- Reusar una orden abierta evita dobles cobros aunque el browser haya
  -- perdido su clave original antes de reintentar.
  select o.* into v_order from public.athlete_payment_orders o
  join public.membership_order_targets t on t.order_id = o.id
  join public.memberships m on m.id = t.membership_id
  where m.athlete_id = p_athlete_id and m.plan_id = v_plan.id
    and o.status in ('pendiente', 'validacion_manual')
    and coalesce(o.expires_at, now() + interval '1 minute') > now()
  order by o.created_at desc limit 1;
  if found then
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_existing), 'plan', to_jsonb(v_plan), 'duplicate', true);
  end if;

  v_start := greatest(current_date, coalesce(v_existing.expiration_date + 1, current_date));
  v_end := case when v_plan.billing_frequency = 'monthly'
    then (v_start + make_interval(months => v_plan.interval_count))::date
    else (v_start + make_interval(years => v_plan.interval_count))::date end;
  v_year := extract(year from v_start)::int::text;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'membership', v_plan.price, v_plan.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'MORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  if v_existing.id is null or v_existing.year <> v_year then
    insert into public.memberships (
      athlete_id, year, status, start_date, expiration_date, member_code,
      payment_order_id, plan_id
    ) values (
      p_athlete_id, v_year, 'pendiente_pago', v_start, v_end,
      'PLU-ARG-' || v_year || '-' || lpad(nextval('public.membership_code_seq')::text, 8, '0'),
      v_order.id, v_plan.id
    ) returning * into v_membership;
  else
    v_membership := v_existing;
  end if;

  insert into public.membership_order_targets(order_id, membership_id, starts_at, ends_at)
  values (v_order.id, v_membership.id, v_start, v_end);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('membership_order.created', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('membershipId', v_membership.id, 'planCode', v_plan.code));

  return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', false);
end;
$$;

create or replace function public.create_competition_registration_v2(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_event public.events;
  v_order public.athlete_payment_orders;
  v_registration public.event_registrations;
  v_count int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link')
     or p_division not in ('Open', 'Junior', 'Sub-Junior', 'Master I', 'Master II')
     or p_category not in ('Raw', 'Classic Raw', 'Equipped')
     or (p_bodyweight_kg is not null and (p_bodyweight_kg < 20 or p_bodyweight_kg > 400)) then
    raise exception 'Datos de inscripcion invalidos.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados') then
    raise exception 'La inscripcion no esta abierta.' using errcode = 'PLU03';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at
     or v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'La inscripcion esta fuera de fecha.' using errcode = 'PLU03';
  end if;
  if v_event.requires_membership and not exists (
    select 1 from public.memberships m
    where m.athlete_id = p_athlete_id and m.status = 'activa'
      and coalesce(m.start_date, current_date) <= current_date
      and coalesce(m.expiration_date, current_date - 1) >= current_date
  ) then
    raise exception 'Necesitas una afiliacion activa y vigente.' using errcode = 'PLU05';
  end if;

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select * into v_registration from public.event_registrations where payment_order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  select * into v_registration from public.event_registrations
    where event_id = v_event.id and athlete_id = p_athlete_id;
  if found then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_event.capacity is not null then
    select count(*) into v_count from public.event_registrations
    where event_id = v_event.id and status in ('pendiente_pago', 'pagada', 'confirmada');
    if v_count >= v_event.capacity then
      raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
    end if;
  end if;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'registration', v_event.price, v_event.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'RORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  insert into public.event_registrations (
    athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id
  ) values (
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg,
    'pendiente_pago', v_order.id
  ) returning * into v_registration;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('registration.created', 'event_registration', v_registration.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('eventId', v_event.id, 'orderId', v_order.id));

  return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

-- Activa o compensa el derecho objetivo sin depender de que memberships
-- conserve el ultimo payment_order_id.
create or replace function public.project_membership_order_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.membership_order_targets;
  v_payment_id uuid;
begin
  if new.concept not in ('membership', 'combo') or new.status = old.status then return new; end if;
  select * into v_target from public.membership_order_targets where order_id = new.id;
  if not found then return new; end if;

  if new.status = 'aprobado' then
    select id into v_payment_id from public.athlete_payments
    where order_id = new.id and status = 'aprobado'
    order by confirmed_at desc nulls last, updated_at desc limit 1;
    insert into public.membership_cycles(membership_id, order_id, payment_id, starts_at, ends_at, status)
    values(v_target.membership_id, new.id, v_payment_id, v_target.starts_at, v_target.ends_at, 'active')
    on conflict (membership_id, order_id) do update set
      payment_id = coalesce(excluded.payment_id, public.membership_cycles.payment_id),
      status = 'active', updated_at = now();
    update public.memberships set
      status = 'activa',
      start_date = least(coalesce(start_date, v_target.starts_at), v_target.starts_at),
      expiration_date = greatest(coalesce(expiration_date, v_target.ends_at), v_target.ends_at),
      updated_at = now()
    where id = v_target.membership_id;
    update public.athletes set status = 'afiliado_activo', updated_at = now()
    where id = new.athlete_id;
  elsif new.status in ('cancelado', 'reembolsado') then
    update public.membership_cycles set
      status = case when new.status = 'reembolsado' then 'refunded' else 'cancelled' end,
      updated_at = now()
    where order_id = new.id;
    if not exists (
      select 1 from public.membership_cycles c
      where c.membership_id = v_target.membership_id and c.status = 'active'
        and c.starts_at <= current_date and c.ends_at >= current_date
    ) then
      update public.memberships set
        status = case when new.status = 'reembolsado' then 'reembolsada' else 'cancelada' end,
        updated_at = now()
      where id = v_target.membership_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_order_project_membership on public.athlete_payment_orders;
create trigger athlete_order_project_membership
after update of status on public.athlete_payment_orders
for each row execute function public.project_membership_order_target();

create or replace function public.expire_domain_orders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders int;
  v_registrations int;
begin
  with expired as (
    update public.athlete_payment_orders o set status = 'cancelado', updated_at = now()
    where o.status in ('pendiente', 'validacion_manual') and o.expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'athlete' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
    returning o.id
  ), cancelled as (
    update public.event_registrations r set status = 'cancelada', updated_at = now()
    where r.payment_order_id in (select id from expired) and r.status = 'pendiente_pago'
    returning r.id
  )
  select (select count(*) from expired), (select count(*) from cancelled)
    into v_orders, v_registrations;
  return jsonb_build_object('orders', coalesce(v_orders, 0), 'registrations', coalesce(v_registrations, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Operaciones de staff llamadas exclusivamente por Express
-- ---------------------------------------------------------------------------
create or replace function public.staff_list_tickets_for_event(p_event_slug text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('ticket', to_jsonb(t.*), 'checkIn', to_jsonb(c.*)) order by t.created_at desc), '[]'::jsonb)
  from public.tickets t join public.events e on e.id = t.event_id
  left join public.check_ins c on c.ticket_id = t.id where e.slug = p_event_slug;
$$;

create or replace function public.staff_get_event_checkin_allowlist(p_event_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event public.events; v_tickets jsonb; v_registrations jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code, 'attendeeName', t.attendee_name,
    'attendeeDni', t.attendee_dni, 'dayPass', t.day_pass, 'status', t.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_tickets
  from public.tickets t left join public.check_ins c on c.ticket_id = t.id where t.event_id = v_event.id;
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
end $$;

create or replace function public.staff_approve_ticket_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.ticket_orders; v_tickets jsonb;
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago solo se acredita por webhook.' using errcode = 'PLU01';
  end if;
  if v_order.status = 'aprobado' then
    select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status <> 'pendiente' or v_order.payment_proof_path is null then
    raise exception 'La orden necesita un comprobante pendiente de revision.' using errcode = 'PLU03';
  end if;
  update public.ticket_orders set status = 'aprobado', reservation_expires_at = null, updated_at = now()
  where id = p_order_id returning * into v_order;
  update public.tickets set status = 'pagada', updated_at = now()
  where order_id = p_order_id and status = 'pendiente_pago';
  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type)
  values('ticket_order.approved', 'ticket_order', p_order_id::text, 'staff');
  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end $$;

create or replace function public.staff_check_in_ticket(p_qr_token uuid, p_gate text, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket public.tickets; v_checkin public.check_ins;
begin
  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  if v_ticket.status <> 'pagada' then raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05'; end if;
  begin
    insert into public.check_ins(event_id, attendee_kind, ticket_id, gate, scanned_by_label)
    values(v_ticket.event_id, 'spectator', v_ticket.id, nullif(trim(p_gate), ''), left(p_actor, 200)) returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Esta entrada ya fue utilizada.' using errcode = 'PLU06';
  end;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('ticket.checked_in', 'ticket', v_ticket.id::text, 'staff', p_actor);
  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end $$;

create or replace function public.staff_check_in_registration(p_registration_id uuid, p_gate text, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_registration public.event_registrations; v_checkin public.check_ins;
begin
  select * into v_registration from public.event_registrations where id = p_registration_id for update;
  if not found then raise exception 'Inscripcion no encontrada.' using errcode = 'PLU02'; end if;
  if v_registration.status <> 'confirmada' then raise exception 'La inscripcion no esta confirmada.' using errcode = 'PLU05'; end if;
  if not exists(select 1 from public.memberships m where m.athlete_id = v_registration.athlete_id
    and m.status = 'activa' and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date) then
    raise exception 'La afiliacion esta vencida o inactiva.' using errcode = 'PLU05';
  end if;
  begin
    insert into public.check_ins(event_id, attendee_kind, registration_id, gate, scanned_by_label)
    values(v_registration.event_id, 'athlete', v_registration.id, nullif(trim(p_gate), ''), left(p_actor, 200)) returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Esta inscripcion ya tiene un ingreso registrado.' using errcode = 'PLU06';
  end;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('registration.checked_in', 'event_registration', v_registration.id::text, 'staff', p_actor);
  return jsonb_build_object('registration', to_jsonb(v_registration), 'checkIn', to_jsonb(v_checkin));
end $$;

create or replace function public.staff_redeem_ticket_addon(p_qr_token uuid, p_addon_id text, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket public.tickets; v_item jsonb; v_next jsonb := '[]'::jsonb; v_found boolean := false; v_checkin public.check_ins;
begin
  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  if v_ticket.status <> 'pagada' then raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_ticket.addons, '[]'::jsonb)) loop
    if v_item ->> 'id' = p_addon_id then
      if nullif(v_item ->> 'redeemedAt', '') is not null then raise exception 'Este beneficio ya fue canjeado.' using errcode = 'PLU06'; end if;
      v_found := true; v_item := v_item || jsonb_build_object('redeemedAt', timezone('utc', now())::text);
    end if;
    v_next := v_next || jsonb_build_array(v_item);
  end loop;
  if not v_found then raise exception 'Beneficio no encontrado.' using errcode = 'PLU02'; end if;
  update public.tickets set addons = v_next, updated_at = now() where id = v_ticket.id returning * into v_ticket;
  select * into v_checkin from public.check_ins where ticket_id = v_ticket.id;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values('ticket_addon.redeemed', 'ticket', v_ticket.id::text, 'staff', p_actor, jsonb_build_object('addonId', p_addon_id));
  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end $$;

create or replace function public.staff_upsert_event(p_event jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event public.events; v_starts timestamptz; v_ends timestamptz; v_pricing jsonb; v_limit int;
begin
  if coalesce(length(trim(p_event ->> 'slug')), 0) < 2
     or coalesce(length(trim(p_event ->> 'title')), 0) < 3 then
    raise exception 'Datos del evento invalidos.' using errcode = 'PLU01';
  end if;
  v_starts := nullif(p_event ->> 'startsAt', '')::timestamptz;
  v_ends := nullif(p_event ->> 'endsAt', '')::timestamptz;
  if v_starts is null or v_ends is null or v_ends < v_starts then
    raise exception 'Fechas del evento invalidas.' using errcode = 'PLU01';
  end if;
  v_pricing := coalesce(p_event -> 'pricing', '{}'::jsonb);
  insert into public.events(
    slug, title, venue, location, starts_at, ends_at, registration_opens_at,
    registration_closes_at, ticket_sales_opens_at, ticket_sales_closes_at,
    capacity, status, published, requires_membership, price, currency, rules,
    live_stream_url, live_stream_provider, live_status
  ) values (
    trim(p_event ->> 'slug'), trim(p_event ->> 'title'), trim(p_event ->> 'venue'), trim(p_event ->> 'location'),
    v_starts, v_ends, nullif(p_event ->> 'registrationOpensAt', '')::timestamptz,
    nullif(p_event ->> 'registrationClosesAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesOpensAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesClosesAt', '')::timestamptz,
    nullif(p_event ->> 'slots', '')::int, coalesce(p_event ->> 'status', 'proximamente'),
    coalesce((p_event ->> 'published')::boolean, false), true,
    coalesce((v_pricing ->> 'registration')::int, 0), 'ARS',
    jsonb_build_object(
      'ticketPricing', jsonb_build_object('day', coalesce((v_pricing ->> 'ticketDay')::int, 0), 'bothDays', coalesce((v_pricing ->> 'ticketBothDays')::int, 0)),
      'ticketAddons', coalesce(v_pricing -> 'ticketAddons', '[]'::jsonb),
      'ticketsEnabled', coalesce((v_pricing ->> 'ticketsEnabled')::boolean, true),
      'featured', coalesce((p_event ->> 'featured')::boolean, false),
      'membershipPrice', coalesce((v_pricing ->> 'membership')::int, 0),
      'comboPrice', coalesce((v_pricing ->> 'combo')::int, 0)
    ),
    nullif(p_event ->> 'liveStreamUrl', ''), nullif(p_event ->> 'liveStreamProvider', ''),
    coalesce(p_event ->> 'liveStatus', 'offline')
  ) on conflict(slug) do update set
    title = excluded.title, venue = excluded.venue, location = excluded.location,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    registration_opens_at = excluded.registration_opens_at, registration_closes_at = excluded.registration_closes_at,
    ticket_sales_opens_at = excluded.ticket_sales_opens_at, ticket_sales_closes_at = excluded.ticket_sales_closes_at,
    capacity = excluded.capacity, status = excluded.status, published = excluded.published,
    requires_membership = excluded.requires_membership, price = excluded.price, currency = excluded.currency,
    rules = excluded.rules, live_stream_url = excluded.live_stream_url,
    live_stream_provider = excluded.live_stream_provider, live_status = excluded.live_status, updated_at = now()
  returning * into v_event;

  delete from public.event_capacity_rules where event_id = v_event.id and scope in ('event', 'day');
  v_limit := nullif(p_event ->> 'slots', '')::int;
  if v_limit is not null then insert into public.event_capacity_rules(event_id, scope, key, limit_count) values(v_event.id, 'event', '', v_limit); end if;
  v_limit := nullif(p_event ->> 'capacityDay1', '')::int;
  if v_limit is not null then insert into public.event_capacity_rules(event_id, scope, key, limit_count) values(v_event.id, 'day', 'day1', v_limit); end if;
  v_limit := nullif(p_event ->> 'capacityDay2', '')::int;
  if v_limit is not null then insert into public.event_capacity_rules(event_id, scope, key, limit_count) values(v_event.id, 'day', 'day2', v_limit); end if;
  v_limit := nullif(p_event ->> 'capacityBoth', '')::int;
  if v_limit is not null then insert into public.event_capacity_rules(event_id, scope, key, limit_count) values(v_event.id, 'day', 'both', v_limit); end if;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('event.upserted', 'event', v_event.id::text, 'staff', p_actor);
  return to_jsonb(v_event);
end $$;

-- ---------------------------------------------------------------------------
-- Menor privilegio: el browser ya no puede mutar atletas/ordenes por UUID.
-- ---------------------------------------------------------------------------
revoke all on function public.register_athlete(jsonb) from public, anon, authenticated;
revoke all on function public.get_athlete_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.update_athlete_profile(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_membership_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_membership_order(uuid, text) from public, anon, authenticated;
revoke all on function public.create_competition_registration(uuid, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.register_athlete_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.create_ticket_order(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.register_ticket_payment_proof(uuid, text) from public, anon, authenticated;
revoke all on function public.approve_athlete_payment_order(uuid) from public, anon, authenticated;
revoke all on function public.approve_ticket_order(uuid) from public, anon, authenticated;
revoke all on function public.list_pending_ticket_orders() from public, anon, authenticated;
revoke all on function public.list_athlete_admin_data() from public, anon, authenticated;
revoke all on function public.list_tickets_for_event(text) from public, anon, authenticated;
revoke all on function public.check_in_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.check_in_registration(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_ticket_addon(uuid, text) from public, anon, authenticated;
revoke all on function public.get_event_checkin_allowlist(text) from public, anon, authenticated;

revoke all on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.create_membership_order_v2(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.expire_ticket_reservations(timestamptz) from public, anon, authenticated;
revoke all on function public.expire_domain_orders(timestamptz) from public, anon, authenticated;
revoke all on function public.staff_list_tickets_for_event(text) from public, anon, authenticated;
revoke all on function public.staff_get_event_checkin_allowlist(text) from public, anon, authenticated;
revoke all on function public.staff_approve_ticket_order(uuid) from public, anon, authenticated;
revoke all on function public.staff_check_in_ticket(uuid, text, text) from public, anon, authenticated;
revoke all on function public.staff_check_in_registration(uuid, text, text) from public, anon, authenticated;
revoke all on function public.staff_redeem_ticket_addon(uuid, text, text) from public, anon, authenticated;
revoke all on function public.staff_upsert_event(jsonb, text) from public, anon, authenticated;

grant execute on function public.register_athlete(jsonb) to service_role;
grant execute on function public.register_athlete_v2(jsonb, text) to service_role;
grant execute on function public.get_athlete_snapshot(uuid) to service_role;
grant execute on function public.update_athlete_profile(uuid, text, text, text, text, text) to service_role;
grant execute on function public.register_athlete_photo(uuid, text) to service_role;
grant execute on function public.approve_athlete_payment_order(uuid) to service_role;
grant execute on function public.approve_ticket_order(uuid) to service_role;
grant execute on function public.list_pending_ticket_orders() to service_role;
grant execute on function public.register_ticket_payment_proof(uuid, text) to service_role;
grant execute on function public.get_athlete_snapshot(uuid) to service_role;
grant execute on function public.list_athlete_admin_data() to service_role;
grant execute on function public.get_ticket_by_qr_token(uuid) to service_role;
grant execute on function public.get_membership_by_code_or_token(text, text) to service_role;
grant execute on function public.get_event_checkin_allowlist(text) to service_role;
grant execute on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.create_membership_order_v2(uuid, text, text, text) to service_role;
grant execute on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text) to service_role;
grant execute on function public.expire_ticket_reservations(timestamptz) to service_role;
grant execute on function public.expire_domain_orders(timestamptz) to service_role;
grant execute on function public.staff_list_tickets_for_event(text) to service_role;
grant execute on function public.staff_get_event_checkin_allowlist(text) to service_role;
grant execute on function public.staff_approve_ticket_order(uuid) to service_role;
grant execute on function public.staff_check_in_ticket(uuid, text, text) to service_role;
grant execute on function public.staff_check_in_registration(uuid, text, text) to service_role;
grant execute on function public.staff_redeem_ticket_addon(uuid, text, text) to service_role;
grant execute on function public.staff_upsert_event(jsonb, text) to service_role;

-- El QR publico solo revela identidad minima. El DNI queda disponible para el
-- scanner autenticado a traves del endpoint de staff.
create or replace function public.get_membership_by_code_or_token(p_code text, p_event_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_token uuid; v_membership public.memberships; v_athlete public.athletes; v_registration public.event_registrations; v_event public.events;
begin
  begin v_token := p_code::uuid; exception when invalid_text_representation then v_token := null; end;
  if v_token is not null then select * into v_membership from public.memberships where qr_token = v_token;
  else select * into v_membership from public.memberships where member_code = p_code; end if;
  if not found then raise exception 'Credencial no encontrada.' using errcode = 'PLU02'; end if;
  select * into v_athlete from public.athletes where id = v_membership.athlete_id;
  if p_event_slug is not null then
    select * into v_event from public.events where slug = p_event_slug;
    if found then select * into v_registration from public.event_registrations
      where athlete_id = v_athlete.id and event_id = v_event.id and status <> 'cancelada'; end if;
  end if;
  return jsonb_build_object(
    'athlete', jsonb_build_object('id', v_athlete.id, 'full_name', v_athlete.full_name),
    'membership', jsonb_build_object(
      'id', v_membership.id, 'year', v_membership.year, 'status', v_membership.status,
      'start_date', v_membership.start_date, 'expiration_date', v_membership.expiration_date,
      'member_code', v_membership.member_code, 'qr_token', v_membership.qr_token
    ),
    'registration', case when v_registration.id is null then null else jsonb_build_object(
      'id', v_registration.id, 'division', v_registration.division,
      'category', v_registration.category, 'status', v_registration.status
    ) end);
end $$;

revoke all on function public.get_membership_by_code_or_token(text, text) from public;
grant execute on function public.get_membership_by_code_or_token(text, text) to anon, authenticated, service_role;

-- El QR publico de entrada tampoco expone DNI ni datos del comprador.
create or replace function public.get_ticket_by_qr_token(p_qr_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', t.id, 'ticket_code', t.ticket_code, 'qr_token', t.qr_token,
      'event_id', t.event_id, 'attendee_name', t.attendee_name,
      'day_pass', t.day_pass, 'addons', t.addons, 'status', t.status,
      'created_at', t.created_at, 'updated_at', t.updated_at
    ),
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'venue', e.venue, 'location', e.location, 'starts_at', e.starts_at, 'ends_at', e.ends_at),
    'checkIn', case when c.id is null then null else jsonb_build_object('id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at) end
  ) into v_result
  from public.tickets t join public.events e on e.id = t.event_id
  left join public.check_ins c on c.ticket_id = t.id where t.qr_token = p_qr_token;
  if v_result is null then raise exception 'Entrada no encontrada.' using errcode = 'PLU02'; end if;
  return v_result;
end $$;
revoke all on function public.get_ticket_by_qr_token(uuid) from public;
grant execute on function public.get_ticket_by_qr_token(uuid) to anon, authenticated, service_role;
