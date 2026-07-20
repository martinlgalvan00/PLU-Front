-- Catálogo de tipos de entrada configurable por evento.
--
-- Reemplaza el enum fijo tickets.day_pass ('day1'|'day2'|'both') -- que
-- asumía que todo evento dura exactamente 2 días -- por un catálogo real
-- por evento: N días (event_days) y N tipos de entrada (ticket_types), cada
-- uno con su propio precio, cupo y día(s) de acceso, más los addons que
-- vengan incluidos sin cargo ("packs", ej. "Día 1 + choripán").
--
-- No hay ventas reales en producción todavía (confirmado con el equipo), asi
-- que esta migración reemplaza el esquema viejo de forma directa: no hay
-- backfill de datos ni columna de compatibilidad transitoria.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- event_days
-- ---------------------------------------------------------------------
create table public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  day_index int not null check (day_index >= 0),
  label text not null,
  date date,
  created_at timestamptz not null default now(),
  unique (event_id, day_index)
);

create index event_days_event_idx on public.event_days (event_id, day_index);

-- ---------------------------------------------------------------------
-- ticket_types
-- ---------------------------------------------------------------------
create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  price int not null check (price >= 0),
  -- null = sin límite propio (solo aplica el cupo total del evento).
  quota int check (quota is null or quota >= 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_types_event_idx on public.ticket_types (event_id, sort_order);

-- ---------------------------------------------------------------------
-- ticket_type_days -- a qué día(s) da acceso cada tipo.
-- ---------------------------------------------------------------------
create table public.ticket_type_days (
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  event_day_id uuid not null references public.event_days (id) on delete cascade,
  primary key (ticket_type_id, event_day_id)
);

-- ---------------------------------------------------------------------
-- ticket_type_included_addons -- addons del catálogo (events.rules->
-- ticketAddons) que vienen sin cargo con ese tipo ("pack").
-- ---------------------------------------------------------------------
create table public.ticket_type_included_addons (
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  addon_id text not null,
  primary key (ticket_type_id, addon_id)
);

-- ---------------------------------------------------------------------
-- tickets: day_pass -> ticket_type_id
-- ---------------------------------------------------------------------
alter table public.tickets drop constraint if exists tickets_day_pass_check;
alter table public.tickets drop column if exists day_pass;
alter table public.tickets
  add column ticket_type_id uuid references public.ticket_types (id) on delete restrict;

create index tickets_ticket_type_idx on public.tickets (ticket_type_id);

-- Los cupos por día (event_capacity_rules scope='day') quedan reemplazados
-- por ticket_types.quota, que es más preciso (por tipo, no por día
-- agregado) y evita el enum fijo day1/day2/both en la propia RPC de cupo.
delete from public.event_capacity_rules where scope = 'day';

-- ---------------------------------------------------------------------
-- RLS -- mismo patrón que event_capacity_rules (phase1_rls.sql): sin
-- escritura directa para anon/authenticated (todo pasa por staff_upsert_event
-- SECURITY DEFINER), pero con lectura pública para que la página de compra
-- pueda listar tipos/días de un evento publicado sin pasar por un RPC.
-- ---------------------------------------------------------------------
alter table public.event_days enable row level security;
alter table public.ticket_types enable row level security;
alter table public.ticket_type_days enable row level security;
alter table public.ticket_type_included_addons enable row level security;

create policy "event_days_select_public"
  on public.event_days for select
  to anon, authenticated
  using (exists (
    select 1 from public.events e where e.id = event_days.event_id and e.published = true
  ));

create policy "event_days_admin"
  on public.event_days for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "ticket_types_select_public"
  on public.ticket_types for select
  to anon, authenticated
  using (active and exists (
    select 1 from public.events e where e.id = ticket_types.event_id and e.published = true
  ));

create policy "ticket_types_admin"
  on public.ticket_types for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "ticket_type_days_select_public"
  on public.ticket_type_days for select
  to anon, authenticated
  using (exists (
    select 1 from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.id = ticket_type_days.ticket_type_id and tt.active and e.published = true
  ));

create policy "ticket_type_days_admin"
  on public.ticket_type_days for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "ticket_type_included_addons_select_public"
  on public.ticket_type_included_addons for select
  to anon, authenticated
  using (exists (
    select 1 from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.id = ticket_type_included_addons.ticket_type_id and tt.active and e.published = true
  ));

create policy "ticket_type_included_addons_admin"
  on public.ticket_type_included_addons for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.event_days to anon, authenticated;
grant insert, update, delete on public.event_days to authenticated;
grant select on public.ticket_types to anon, authenticated;
grant insert, update, delete on public.ticket_types to authenticated;
grant select on public.ticket_type_days to anon, authenticated;
grant insert, update, delete on public.ticket_type_days to authenticated;
grant select on public.ticket_type_included_addons to anon, authenticated;
grant insert, update, delete on public.ticket_type_included_addons to authenticated;

-- ---------------------------------------------------------------------
-- staff_upsert_event: reemplaza el bloque de capacityDay1/Day2/Both y el
-- ticketPricing.day/bothDays fijo por el catálogo de event_days/ticket_types.
-- ---------------------------------------------------------------------
create or replace function public.staff_upsert_event(p_event jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_starts timestamptz;
  v_ends timestamptz;
  v_pricing jsonb;
  v_limit int;
  v_day jsonb;
  v_day_id uuid;
  v_day_ids uuid[];
  v_type jsonb;
  v_type_id uuid;
  v_day_index int;
  v_addon_id text;
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

  -- Un solo evento destacado a la vez (ver 20260717150000_single_featured_event.sql):
  -- si este upsert lo deja featured, se lo saca a cualquier otro que lo tuviera.
  if coalesce((p_event ->> 'featured')::boolean, false) then
    update public.events
    set rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{featured}', 'false'::jsonb, true), updated_at = now()
    where id <> v_event.id and coalesce((rules ->> 'featured')::boolean, false) = true;
  end if;

  v_limit := nullif(p_event ->> 'slots', '')::int;
  delete from public.event_capacity_rules where event_id = v_event.id and scope = 'event';
  if v_limit is not null then
    insert into public.event_capacity_rules(event_id, scope, key, limit_count) values(v_event.id, 'event', '', v_limit);
  end if;

  -- Días del evento: reemplazo completo por cada upsert (igual patrón que
  -- ya usaba capacityDay1/Day2/Both). El on delete cascade de
  -- ticket_type_days limpia las referencias de tipos existentes; el tipo en
  -- si (ticket_types) se re-crea abajo con los mismos ids si vienen en el
  -- payload, o nuevos si no.
  delete from public.event_days where event_id = v_event.id;
  for v_day in select * from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb))
  loop
    v_day_index := coalesce((v_day ->> 'dayIndex')::int, 0);
    insert into public.event_days(event_id, day_index, label, date)
    values (v_event.id, v_day_index, coalesce(nullif(trim(v_day ->> 'label'), ''), 'Día ' || (v_day_index + 1)::text),
      nullif(v_day ->> 'date', '')::date)
    returning id into v_day_id;
  end loop;

  delete from public.ticket_types where event_id = v_event.id;
  for v_type in select * from jsonb_array_elements(coalesce(p_event -> 'ticketTypes', '[]'::jsonb))
  loop
    if coalesce(length(trim(v_type ->> 'name')), 0) < 1 then
      raise exception 'Cada tipo de entrada necesita un nombre.' using errcode = 'PLU01';
    end if;
    insert into public.ticket_types(event_id, name, price, quota, sort_order, active)
    values (
      v_event.id, trim(v_type ->> 'name'), coalesce((v_type ->> 'price')::int, 0),
      nullif(v_type ->> 'quota', '')::int, coalesce((v_type ->> 'sortOrder')::int, 0),
      coalesce((v_type ->> 'active')::boolean, true)
    ) returning id into v_type_id;

    select array_agg(d.id) into v_day_ids
    from public.event_days d
    where d.event_id = v_event.id
      and d.day_index in (
        select (value)::int from jsonb_array_elements_text(coalesce(v_type -> 'dayIndexes', '[]'::jsonb))
      );
    if v_day_ids is not null then
      insert into public.ticket_type_days(ticket_type_id, event_day_id)
      select v_type_id, unnest(v_day_ids);
    end if;

    for v_addon_id in select jsonb_array_elements_text(coalesce(v_type -> 'includedAddonIds', '[]'::jsonb))
    loop
      insert into public.ticket_type_included_addons(ticket_type_id, addon_id) values (v_type_id, v_addon_id);
    end loop;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('event.upserted', 'event', v_event.id::text, 'staff', p_actor);
  return to_jsonb(v_event);
end $$;

-- ---------------------------------------------------------------------
-- get_event_ticket_availability: itera ticket_types en vez de
-- unnest(array['day1','day2','both']).
-- ---------------------------------------------------------------------
create or replace function public.get_event_ticket_availability(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_limit int;
  v_reserved int;
  v_type public.ticket_types;
  v_result jsonb := '{}'::jsonb;
  v_types jsonb := '[]'::jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;

  perform public.expire_ticket_reservations(now());

  select limit_count into v_limit from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event' and key = '';
  if v_limit is null then
    v_result := jsonb_set(v_result, '{event}', jsonb_build_object('limit', null, 'remaining', null));
  else
    select count(*) into v_reserved from public.tickets
    where event_id = v_event.id and status <> 'cancelada';
    v_result := jsonb_set(v_result, '{event}', jsonb_build_object(
      'limit', v_limit, 'remaining', greatest(v_limit - v_reserved, 0)
    ));
  end if;

  for v_type in select * from public.ticket_types where event_id = v_event.id and active order by sort_order
  loop
    if v_type.quota is null then
      v_types := v_types || jsonb_build_array(jsonb_build_object(
        'ticketTypeId', v_type.id, 'limit', null, 'remaining', null
      ));
    else
      select count(*) into v_reserved from public.tickets
      where ticket_type_id = v_type.id and status <> 'cancelada';
      v_types := v_types || jsonb_build_array(jsonb_build_object(
        'ticketTypeId', v_type.id, 'limit', v_type.quota, 'remaining', greatest(v_type.quota - v_reserved, 0)
      ));
    end if;
  end loop;
  v_result := jsonb_set(v_result, '{ticketTypes}', v_types);

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- create_ticket_order_v2: attendee.ticketTypeId reemplaza attendee.dayPass.
-- ---------------------------------------------------------------------
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
  v_included_addons jsonb;
  v_type_id uuid;
  v_type public.ticket_types;
  v_provider text;
  v_unit_price int;
  v_total int := 0;
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

  v_catalog := public.event_ticket_addons_catalog(v_event.rules);

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    if coalesce(length(trim(v_attendee ->> 'fullName')), 0) < 3
       or coalesce(v_attendee ->> 'dni', '') !~ '^[0-9]{7,8}$' then
      raise exception 'Datos de asistente invalidos.' using errcode = 'PLU01';
    end if;
    begin
      v_type_id := (v_attendee ->> 'ticketTypeId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Tipo de entrada invalido.' using errcode = 'PLU01';
    end;
    if not exists (
      select 1 from public.ticket_types where id = v_type_id and event_id = v_event.id and active
    ) then
      raise exception 'Tipo de entrada invalido.' using errcode = 'PLU01';
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

  for v_type in select * from public.ticket_types where event_id = v_event.id and quota is not null
  loop
    select count(*) into v_reserved from public.tickets
    where ticket_type_id = v_type.id and status <> 'cancelada';
    select count(*) into v_requested from jsonb_array_elements(p_attendees)
    where (value ->> 'ticketTypeId')::uuid = v_type.id;
    if v_requested > 0 and v_reserved + v_requested > v_type.quota then
      raise exception 'Entradas agotadas para %.', v_type.name using errcode = 'PLU04';
    end if;
  end loop;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    select * into v_type from public.ticket_types where id = (v_attendee ->> 'ticketTypeId')::uuid;
    v_addon_result := public.ticket_addons_total_and_snapshot(
      coalesce(v_attendee -> 'addonIds', '[]'::jsonb), v_catalog
    );
    v_unit_price := v_type.price + coalesce((v_addon_result ->> 'total')::int, 0);
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
    select * into v_type from public.ticket_types where id = (v_attendee ->> 'ticketTypeId')::uuid;
    v_addon_result := public.ticket_addons_total_and_snapshot(
      coalesce(v_attendee -> 'addonIds', '[]'::jsonb), v_catalog
    );
    v_unit_price := v_type.price + coalesce((v_addon_result ->> 'total')::int, 0);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', addon ->> 'id', 'label', addon ->> 'label', 'price', 0,
      'redeemLabel', addon ->> 'redeemLabel', 'redeemedAt', null, 'included', true
    )), '[]'::jsonb)
    into v_included_addons
    from jsonb_array_elements(v_catalog) addon
    where addon ->> 'id' in (
      select addon_id from public.ticket_type_included_addons where ticket_type_id = v_type.id
    );

    v_addons := coalesce(v_addon_result -> 'addons', '[]'::jsonb) || v_included_addons;

    insert into public.tickets (
      ticket_code, order_id, event_id, attendee_name, attendee_dni,
      ticket_type_id, unit_price, addons, status
    ) values (
      'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
      v_order.id, v_event.id, trim(v_attendee ->> 'fullName'),
      v_attendee ->> 'dni', v_type.id, v_unit_price, v_addons, 'pendiente_pago'
    ) returning to_jsonb(tickets) into v_ticket;
    v_tickets := v_tickets || jsonb_build_array(v_ticket);
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, metadata)
  values ('ticket_order.created', 'ticket_order', v_order.id::text, 'public',
    jsonb_build_object('eventId', v_event.id, 'quantity', jsonb_array_length(p_attendees), 'provider', v_provider));

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- staff_list_tickets_for_event / staff_get_event_checkin_allowlist:
-- exponen ticket_type_id + ticket_type_name en vez de day_pass.
-- ---------------------------------------------------------------------
create or replace function public.staff_list_tickets_for_event(p_event_slug text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ticket', to_jsonb(t.*) || jsonb_build_object('ticketTypeName', tt.name),
      'checkIn', to_jsonb(c.*)
    ) order by t.created_at desc
  ), '[]'::jsonb)
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.check_ins c on c.ticket_id = t.id
  where e.slug = p_event_slug;
$$;

create or replace function public.staff_get_event_checkin_allowlist(p_event_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event public.events; v_tickets jsonb; v_registrations jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code, 'attendeeName', t.attendee_name,
    'attendeeDni', t.attendee_dni, 'ticketTypeId', t.ticket_type_id, 'ticketTypeName', tt.name,
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
end $$;

-- ---------------------------------------------------------------------
-- get_ticket_by_qr_token / get_event_checkin_allowlist: seguían
-- proyectando t.day_pass -- referencian la columna eliminada y romperían
-- en la primera ejecución real si no se reescriben acá.
-- ---------------------------------------------------------------------
create or replace function public.get_ticket_by_qr_token(p_qr_token uuid)
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
      'addons', t.addons, 'status', t.status,
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
end $$;
grant execute on function public.get_ticket_by_qr_token(uuid) to anon, authenticated, service_role;

create or replace function public.get_event_checkin_allowlist(p_event_slug text)
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
  if not public.can_check_in() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

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
    'status', t.status,
    'checkedInAt', c.scanned_at
  )), '[]'::jsonb)
  into v_tickets
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
  )), '[]'::jsonb)
  into v_registrations
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.memberships m on m.athlete_id = a.id
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = v_event.id and r.status <> 'cancelada';

  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end;
$$;
revoke all on function public.get_event_checkin_allowlist(text) from public, anon, authenticated;
grant execute on function public.get_event_checkin_allowlist(text) to service_role;

revoke all on function public.staff_upsert_event(jsonb, text) from public, anon, authenticated;
grant execute on function public.staff_upsert_event(jsonb, text) to service_role;
revoke all on function public.get_event_ticket_availability(text) from public, anon, authenticated;
grant execute on function public.get_event_ticket_availability(text) to service_role;
revoke all on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text) to service_role;
revoke all on function public.staff_list_tickets_for_event(text) from public, anon, authenticated;
grant execute on function public.staff_list_tickets_for_event(text) to service_role;
revoke all on function public.staff_get_event_checkin_allowlist(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_checkin_allowlist(text) to service_role;
