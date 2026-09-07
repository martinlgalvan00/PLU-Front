-- Eventos: venta de entradas on/off real y ventanas publicas de pesaje.
-- staff_upsert_event: ticketsEnabled default false (alineado al frontend) y
-- rules.weighInWindows. create_ticket_order_v2 rechaza si el evento no tiene
-- la venta habilitada.

create or replace function public.staff_upsert_event(p_event jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_starts timestamptz;
  v_ends timestamptz;
  v_pricing jsonb;
  v_limit int;
  v_day jsonb;
  v_day_ids uuid[];
  v_type jsonb;
  v_type_id uuid;
  v_requested_type_id uuid;
  v_type_ids uuid[] := array[]::uuid[];
  v_day_index int;
  v_day_indexes int[];
  v_addon_id text;
  v_orphan_label text;
  v_channel_overrides jsonb;
  v_bank jsonb;
  v_bank_profile_id uuid;
  v_mp_profile_id uuid;
  v_profile public.payment_profiles;
  v_mp_profile public.payment_profiles;
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

  if p_event ? 'paymentChannelOverrides' then
    if p_event -> 'paymentChannelOverrides' is null
       or jsonb_typeof(p_event -> 'paymentChannelOverrides') = 'null' then
      v_channel_overrides := null;
    else
      v_channel_overrides := p_event -> 'paymentChannelOverrides';
    end if;
  else
    v_channel_overrides := null;
  end if;

  v_bank := coalesce(p_event -> 'bankTransfer', '{}'::jsonb);
  v_bank_profile_id := nullif(p_event ->> 'bankTransferProfileId', '')::uuid;
  v_mp_profile_id := nullif(p_event ->> 'mercadoPagoProfileId', '')::uuid;

  if v_bank_profile_id is not null then
    select * into v_profile
    from public.payment_profiles
    where id = v_bank_profile_id and active = true;
    if not found then
      raise exception 'El perfil de cobro no existe o está archivado.' using errcode = 'PLU02';
    end if;
    if v_profile.kind <> 'bank_transfer' then
      raise exception 'El perfil vinculado no es de transferencia bancaria.' using errcode = 'PLU01';
    end if;
  end if;

  if v_mp_profile_id is not null then
    select * into v_mp_profile
    from public.payment_profiles
    where id = v_mp_profile_id and active = true;
    if not found then
      raise exception 'El perfil de Mercado Pago no existe o está archivado.' using errcode = 'PLU02';
    end if;
    if v_mp_profile.kind <> 'mercado_pago' then
      raise exception 'El perfil vinculado no es de Mercado Pago.' using errcode = 'PLU01';
    end if;
  end if;

  insert into public.events(
    slug, title, description, venue, location, starts_at, ends_at,
    registration_opens_at, registration_closes_at,
    ticket_sales_opens_at, ticket_sales_closes_at,
    capacity, status, published, requires_membership, price, manual_price, currency, rules,
    live_stream_url, live_stream_provider, live_status, capacity_progress_public,
    payment_channel_overrides, bank_transfer_alias, bank_transfer_cbu, bank_transfer_holder,
    bank_transfer_profile_id, mercado_pago_profile_id
  ) values (
    trim(p_event ->> 'slug'),
    trim(p_event ->> 'title'),
    nullif(trim(p_event ->> 'description'), ''),
    trim(p_event ->> 'venue'),
    trim(p_event ->> 'location'),
    v_starts,
    v_ends,
    nullif(p_event ->> 'registrationOpensAt', '')::timestamptz,
    nullif(p_event ->> 'registrationClosesAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesOpensAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesClosesAt', '')::timestamptz,
    nullif(p_event ->> 'slots', '')::int,
    coalesce(p_event ->> 'status', 'proximamente'),
    coalesce((p_event ->> 'published')::boolean, false),
    coalesce((p_event ->> 'requiresMembership')::boolean, true),
    coalesce((v_pricing ->> 'registration')::int, 0),
    nullif(v_pricing ->> 'registrationManual', '')::int,
    'ARS',
    jsonb_build_object(
      'ticketAddons', coalesce(v_pricing -> 'ticketAddons', '[]'::jsonb),
      'ticketsEnabled', coalesce((v_pricing ->> 'ticketsEnabled')::boolean, false),
      'weighInWindows', coalesce(p_event -> 'weighInWindows', v_pricing -> 'weighInWindows', '[]'::jsonb),
      'publicSurface', coalesce(
        p_event -> 'publicSurface',
        '{"calendar":true,"weighIns":true,"categories":true}'::jsonb
      ),
      'featured', coalesce((p_event ->> 'featured')::boolean, false),
      'membershipPrice', coalesce((v_pricing ->> 'membership')::int, 0),
      'comboPrice', coalesce((v_pricing ->> 'combo')::int, 0)
    ),
    nullif(p_event ->> 'liveStreamUrl', ''),
    nullif(p_event ->> 'liveStreamProvider', ''),
    coalesce(p_event ->> 'liveStatus', 'offline'),
    coalesce((p_event ->> 'capacityProgressPublic')::boolean, true),
    v_channel_overrides,
    coalesce(
      case when v_bank_profile_id is not null
        then nullif(trim(v_profile.config ->> 'alias'), '') end,
      nullif(trim(v_bank ->> 'alias'), '')
    ),
    coalesce(
      case when v_bank_profile_id is not null
        then nullif(trim(v_profile.config ->> 'cbu'), '') end,
      nullif(trim(v_bank ->> 'cbu'), '')
    ),
    coalesce(
      case when v_bank_profile_id is not null
        then nullif(trim(v_profile.config ->> 'holder'), '') end,
      nullif(trim(v_bank ->> 'holder'), '')
    ),
    v_bank_profile_id,
    v_mp_profile_id
  ) on conflict(slug) do update set
    title = excluded.title,
    description = excluded.description,
    venue = excluded.venue,
    location = excluded.location,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at,
    ticket_sales_opens_at = excluded.ticket_sales_opens_at,
    ticket_sales_closes_at = excluded.ticket_sales_closes_at,
    capacity = excluded.capacity,
    status = excluded.status,
    published = excluded.published,
    requires_membership = excluded.requires_membership,
    price = excluded.price,
    manual_price = excluded.manual_price,
    currency = excluded.currency,
    rules = excluded.rules,
    live_stream_url = excluded.live_stream_url,
    live_stream_provider = excluded.live_stream_provider,
    live_status = excluded.live_status,
    capacity_progress_public = excluded.capacity_progress_public,
    payment_channel_overrides = case
      when p_event ? 'paymentChannelOverrides' then excluded.payment_channel_overrides
      else public.events.payment_channel_overrides
    end,
    bank_transfer_alias = case
      when p_event ? 'bankTransfer' or p_event ? 'bankTransferProfileId'
        then excluded.bank_transfer_alias
      else public.events.bank_transfer_alias
    end,
    bank_transfer_cbu = case
      when p_event ? 'bankTransfer' or p_event ? 'bankTransferProfileId'
        then excluded.bank_transfer_cbu
      else public.events.bank_transfer_cbu
    end,
    bank_transfer_holder = case
      when p_event ? 'bankTransfer' or p_event ? 'bankTransferProfileId'
        then excluded.bank_transfer_holder
      else public.events.bank_transfer_holder
    end,
    bank_transfer_profile_id = case
      when p_event ? 'bankTransferProfileId' then excluded.bank_transfer_profile_id
      else public.events.bank_transfer_profile_id
    end,
    mercado_pago_profile_id = case
      when p_event ? 'mercadoPagoProfileId' then excluded.mercado_pago_profile_id
      else public.events.mercado_pago_profile_id
    end,
    updated_at = now()
  returning * into v_event;

  if coalesce((p_event ->> 'featured')::boolean, false) then
    update public.events
    set rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{featured}', 'false'::jsonb, true),
        updated_at = now()
    where id <> v_event.id
      and coalesce((rules ->> 'featured')::boolean, false) = true;
  end if;

  v_limit := nullif(p_event ->> 'slots', '')::int;
  delete from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event';
  if v_limit is not null then
    insert into public.event_capacity_rules(event_id, scope, key, limit_count)
    values(v_event.id, 'event', '', v_limit);
  end if;

  select coalesce(array_agg(coalesce((d ->> 'dayIndex')::int, 0)), array[]::int[])
  into v_day_indexes
  from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb)) d;

  select d.label into v_orphan_label
  from public.event_days d
  where d.event_id = v_event.id
    and not (d.day_index = any (v_day_indexes))
    and (
      exists (select 1 from public.event_sessions s where s.event_day_id = d.id)
      or exists (select 1 from public.event_registrations r where r.event_day_id = d.id)
    )
  limit 1;

  if v_orphan_label is not null then
    raise exception 'No se puede eliminar el día "%": ya tiene tandas o atletas asignados.', v_orphan_label
      using errcode = 'PLU07';
  end if;

  delete from public.event_days d
  where d.event_id = v_event.id
    and not (d.day_index = any (v_day_indexes));

  for v_day in
    select * from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb))
  loop
    v_day_index := coalesce((v_day ->> 'dayIndex')::int, 0);
    insert into public.event_days(event_id, day_index, label, date)
    values (
      v_event.id,
      v_day_index,
      coalesce(nullif(trim(v_day ->> 'label'), ''), 'Día ' || (v_day_index + 1)::text),
      nullif(v_day ->> 'date', '')::date
    )
    on conflict (event_id, day_index) do update set
      label = excluded.label,
      date = excluded.date;
  end loop;

  for v_type in
    select * from jsonb_array_elements(coalesce(p_event -> 'ticketTypes', '[]'::jsonb))
  loop
    if coalesce(length(trim(v_type ->> 'name')), 0) < 1 then
      raise exception 'Cada tipo de entrada necesita un nombre.' using errcode = 'PLU01';
    end if;

    v_requested_type_id := nullif(v_type ->> 'id', '')::uuid;
    if v_requested_type_id is not null then
      select id into v_type_id
      from public.ticket_types
      where id = v_requested_type_id and event_id = v_event.id
      for update;

      if not found then
        raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
      end if;
      if v_type_id = any(v_type_ids) then
        raise exception 'El tipo de entrada está repetido.' using errcode = 'PLU01';
      end if;

      update public.ticket_types set
        name = trim(v_type ->> 'name'),
        price = coalesce((v_type ->> 'price')::int, 0),
        quota = nullif(v_type ->> 'quota', '')::int,
        sort_order = coalesce((v_type ->> 'sortOrder')::int, 0),
        active = coalesce((v_type ->> 'active')::boolean, true),
        updated_at = now()
      where id = v_type_id;
    else
      insert into public.ticket_types(event_id, name, price, quota, sort_order, active)
      values (
        v_event.id,
        trim(v_type ->> 'name'),
        coalesce((v_type ->> 'price')::int, 0),
        nullif(v_type ->> 'quota', '')::int,
        coalesce((v_type ->> 'sortOrder')::int, 0),
        coalesce((v_type ->> 'active')::boolean, true)
      ) returning id into v_type_id;
    end if;

    v_type_ids := array_append(v_type_ids, v_type_id);
    delete from public.ticket_type_days where ticket_type_id = v_type_id;
    delete from public.ticket_type_included_addons where ticket_type_id = v_type_id;

    select array_agg(d.id) into v_day_ids
    from public.event_days d
    where d.event_id = v_event.id
      and d.day_index in (
        select value::int
        from jsonb_array_elements_text(coalesce(v_type -> 'dayIndexes', '[]'::jsonb))
      );
    if v_day_ids is not null then
      insert into public.ticket_type_days(ticket_type_id, event_day_id)
      select v_type_id, unnest(v_day_ids);
    end if;

    for v_addon_id in
      select jsonb_array_elements_text(coalesce(v_type -> 'includedAddonIds', '[]'::jsonb))
    loop
      insert into public.ticket_type_included_addons(ticket_type_id, addon_id)
      values (v_type_id, v_addon_id);
    end loop;
  end loop;

  update public.ticket_types tt
  set active = false, updated_at = now()
  where tt.event_id = v_event.id
    and not (tt.id = any(v_type_ids))
    and exists (select 1 from public.tickets t where t.ticket_type_id = tt.id);

  delete from public.ticket_types tt
  where tt.event_id = v_event.id
    and not (tt.id = any(v_type_ids))
    and not exists (select 1 from public.tickets t where t.ticket_type_id = tt.id);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('event.upserted', 'event', v_event.id::text, 'staff', p_actor);

  select * into v_event from public.events where id = v_event.id;
  return to_jsonb(v_event);
end $$;

revoke all on function public.staff_upsert_event(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_event(jsonb, text)
  to service_role;

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
  v_channel text;
  v_currency text;
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
  if coalesce((v_event.rules ->> 'ticketsEnabled')::boolean, false) is distinct from true then
    raise exception 'La venta de entradas esta deshabilitada para este evento.' using errcode = 'PLU03';
  end if;

  v_provider := coalesce(p_buyer ->> 'provider', 'mercado_pago');
  if v_provider not in ('mercado_pago', 'manual') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  v_channel := nullif(trim(p_buyer ->> 'manualPaymentChannel'), '');
  if v_provider = 'manual' then
    v_channel := coalesce(v_channel, 'bank_transfer');
    if v_channel not in ('bank_transfer', 'wise_transfer') then
      raise exception 'Canal de pago manual invalido.' using errcode = 'PLU01';
    end if;
  elsif v_channel is not null then
    raise exception 'Solo el pago manual admite un canal.' using errcode = 'PLU01';
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

  -- Wise fija su propio precio en USD (calculado por la API, nunca por el
  -- cliente) en vez del catálogo ARS por tipo de entrada + addons.
  v_currency := v_event.currency;
  if v_channel = 'wise_transfer' then
    if coalesce((p_buyer ->> 'wiseAmount')::int, 0) <= 0 then
      raise exception 'Falta el importe de Wise.' using errcode = 'PLU01';
    end if;
    v_total := (p_buyer ->> 'wiseAmount')::int;
    v_currency := coalesce(nullif(trim(p_buyer ->> 'wiseCurrency'), ''), 'USD');
  end if;

  v_hold_minutes := case when v_provider = 'manual' then 1440 else 20 end;
  insert into public.ticket_orders (
    event_id, buyer_name, buyer_email, buyer_phone, amount, currency, provider,
    manual_payment_channel, status, reference, idempotency_key, access_token_hash,
    reservation_expires_at
  ) values (
    v_event.id, nullif(trim(p_buyer ->> 'name'), ''), lower(nullif(trim(p_buyer ->> 'email'), '')),
    nullif(trim(p_buyer ->> 'phone'), ''), v_total, v_currency, v_provider, v_channel,
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
    jsonb_build_object('eventId', v_event.id, 'quantity', jsonb_array_length(p_attendees), 'provider', v_provider, 'manualPaymentChannel', v_channel));

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

revoke all on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text)
  to service_role;
