-- Entradas: medios de pago propios por tipo de entrada.
--
-- Desde 20261118100000 el evento decide sus medios de cobro por concepto
-- (`events.payment_channel_overrides` = `{concepto: {canal: bool}}`), y eso
-- alcanzaba mientras todas las entradas de un evento se cobraran igual. No es
-- el caso: un palco de $38.000 se quiere cobrar sólo por Mercado Pago —con
-- acreditación inmediata y sin comprobante que aprobar a mano—, mientras la
-- general de $12.000 sigue aceptando transferencia y efectivo. Hasta acá la
-- única forma de conseguirlo era cerrar el canal para TODAS las entradas del
-- evento.
--
-- `ticket_types.payment_channels` es un override más chico del mismo tipo, y
-- se comporta igual que el del evento:
--
--   · `null` (lo que queda en todas las filas existentes) hereda los medios
--     del evento. Ninguna entrada cargada cambia de comportamiento.
--   · un objeto `{canal: bool}` SÓLO PUEDE CERRAR. La cadena es plataforma
--     (Finanzas) → evento → tipo de entrada, y cada eslabón es un techo: un
--     canal que Finanzas cerró no se reabre desde el evento, y uno que el
--     evento cerró no se reabre desde la entrada.
--   · cerrar los cuatro se rechaza acá: es una entrada que no se puede
--     comprar por ningún lado, y el 409 aparecía recién al confirmar.
--
-- `get_event_ticket_availability` devuelve el override junto al cupo de cada
-- tipo porque la pantalla pública necesita las dos cosas a la vez: cuántos
-- lugares quedan y con qué se paga esa entrada en particular. Sin esto la
-- página ofrecía transferencia para un palco que sólo acepta Mercado Pago.

-- ---------------------------------------------------------------------------
-- 1. Columna nueva de `ticket_types`
-- ---------------------------------------------------------------------------

alter table public.ticket_types
  add column if not exists payment_channels jsonb null;

-- Mismo criterio que el override del evento: o es un objeto de canales
-- conocidos con banderas booleanas, o no está. Una forma a medias es la
-- manera silenciosa de ofrecer un medio que después rebota al confirmar.
alter table public.ticket_types
  drop constraint if exists ticket_types_payment_channels_check;
alter table public.ticket_types
  add constraint ticket_types_payment_channels_check
  check (
    payment_channels is null
    or (
      jsonb_typeof(payment_channels) = 'object'
      -- Sólo canales conocidos: restarle los cuatro tiene que dejar el objeto
      -- vacío. Una clave de más es un canal que nadie va a leer.
      and payment_channels - array['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer'] = '{}'::jsonb
      and coalesce(jsonb_typeof(payment_channels -> 'mercado_pago'), 'boolean') = 'boolean'
      and coalesce(jsonb_typeof(payment_channels -> 'bank_transfer'), 'boolean') = 'boolean'
      and coalesce(jsonb_typeof(payment_channels -> 'cash_pitbull'), 'boolean') = 'boolean'
      and coalesce(jsonb_typeof(payment_channels -> 'wise_transfer'), 'boolean') = 'boolean'
      -- Y al menos uno abierto: cerrar los cuatro es una entrada que no se
      -- puede comprar por ningún lado.
      and (
        payment_channels @> '{"mercado_pago": true}'::jsonb
        or payment_channels @> '{"bank_transfer": true}'::jsonb
        or payment_channels @> '{"cash_pitbull": true}'::jsonb
        or payment_channels @> '{"wise_transfer": true}'::jsonb
      )
    )
  );

comment on column public.ticket_types.payment_channels is
  'Medios de cobro de este tipo de entrada. null hereda los del evento; el objeto solo puede CERRAR canales que el evento y la plataforma dejaron abiertos.';

-- ---------------------------------------------------------------------------
-- 2. `staff_upsert_event` persiste el override por tipo
-- ---------------------------------------------------------------------------

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
  v_type_wise int;
  v_type_opens timestamptz;
  v_type_closes timestamptz;
  v_type_channels jsonb;
  v_type_open_channels int;
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

    -- Precio en USD para Wise: opcional, pero si viene tiene que ser un monto
    -- cobrable. El check de la tabla lo repite; acá el error dice qué tipo es.
    v_type_wise := nullif(v_type ->> 'wisePrice', '')::int;
    if v_type_wise is not null and (v_type_wise <= 0 or v_type_wise > 100000) then
      raise exception 'El precio en USD de "%" esta fuera de rango.', trim(v_type ->> 'name')
        using errcode = 'PLU01';
    end if;

    -- Ventana propia de venta. Se acepta abierta de un solo lado (sólo
    -- apertura, sólo cierre); invertida no, porque sería un tipo que nunca
    -- se puede comprar y nadie lo carga a propósito.
    v_type_opens := nullif(v_type ->> 'salesOpensAt', '')::timestamptz;
    v_type_closes := nullif(v_type ->> 'salesClosesAt', '')::timestamptz;
    if v_type_opens is not null and v_type_closes is not null
       and v_type_closes <= v_type_opens then
      raise exception 'La venta de "%" cierra antes de abrir.', trim(v_type ->> 'name')
        using errcode = 'PLU01';
    end if;

    -- Medios de pago propios del tipo. Ausente o null hereda los del
    -- evento, que es como se comportó siempre. Presente, sólo puede cerrar:
    -- un canal que el evento (o la plataforma) ya cerró no se reabre acá.
    v_type_channels := null;
    if v_type ? 'paymentChannels' and jsonb_typeof(v_type -> 'paymentChannels') = 'object' then
      select jsonb_object_agg(key, value)
        into v_type_channels
      from jsonb_each(v_type -> 'paymentChannels')
      where key in ('mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer')
        and jsonb_typeof(value) = 'boolean';

      if v_type_channels is not null then
        select count(*)
          into v_type_open_channels
        from jsonb_each(v_type_channels)
        where value = 'true'::jsonb;

        -- Cerrar los cuatro es una entrada que no se puede comprar por ningún
        -- lado: el 409 aparecía recién al confirmar la compra.
        if v_type_open_channels = 0 then
          raise exception 'La entrada "%" no acepta ningun medio de pago.', trim(v_type ->> 'name')
            using errcode = 'PLU01';
        end if;
      end if;
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
        wise_price = nullif(v_type ->> 'wisePrice', '')::int,
        sales_opens_at = nullif(v_type ->> 'salesOpensAt', '')::timestamptz,
        sales_closes_at = nullif(v_type ->> 'salesClosesAt', '')::timestamptz,
        payment_channels = v_type_channels,
        updated_at = now()
      where id = v_type_id;
    else
      insert into public.ticket_types(
        event_id, name, price, quota, sort_order, active,
        wise_price, sales_opens_at, sales_closes_at, payment_channels
      )
      values (
        v_event.id,
        trim(v_type ->> 'name'),
        coalesce((v_type ->> 'price')::int, 0),
        nullif(v_type ->> 'quota', '')::int,
        coalesce((v_type ->> 'sortOrder')::int, 0),
        coalesce((v_type ->> 'active')::boolean, true),
        nullif(v_type ->> 'wisePrice', '')::int,
        nullif(v_type ->> 'salesOpensAt', '')::timestamptz,
        nullif(v_type ->> 'salesClosesAt', '')::timestamptz,
        v_type_channels
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

-- ---------------------------------------------------------------------------
-- 3. La disponibilidad pública viaja con los medios de cada tipo
-- ---------------------------------------------------------------------------

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
        'ticketTypeId', v_type.id, 'limit', null, 'remaining', null,
        'paymentChannels', v_type.payment_channels
      ));
    else
      select count(*) into v_reserved from public.tickets
      where ticket_type_id = v_type.id and status <> 'cancelada';
      v_types := v_types || jsonb_build_array(jsonb_build_object(
        'ticketTypeId', v_type.id, 'limit', v_type.quota, 'remaining', greatest(v_type.quota - v_reserved, 0),
        'paymentChannels', v_type.payment_channels
      ));
    end if;
  end loop;
  v_result := jsonb_set(v_result, '{ticketTypes}', v_types);

  return v_result;
end;
$$;

revoke all on function public.get_event_ticket_availability(text) from public, anon, authenticated;
grant execute on function public.get_event_ticket_availability(text) to service_role;
