-- Venta de entradas de mostrador: alta manual por staff — PLU ARG
--
-- El circuito de pago manual (transferencia / efectivo / Wise) hoy es
-- self-service del comprador: la persona completa el checkout público,
-- `create_ticket_order_v2` le crea la orden, y recién ahí un operador con
-- `admin.payments.approve` la valida desde el panel (`staff_approve_ticket_order`,
-- 20261119100000). El panel solo aprueba o rechaza lo que ya entró por esa vía.
--
-- Falta el caso de mostrador: alguien paga en efectivo en la puerta, o hace
-- una transferencia por privado, y nadie completó el formulario público. Hoy
-- el operador tendría que simular ser el comprador desde el sitio público —
-- con el rate limit público encima, auditado como `actor_type: 'public'`, y
-- bloqueado si la venta online ya cerró (exactamente lo que suele pasar
-- cuando alguien compra en la puerta).
--
-- `create_ticket_order_v3` es el cuerpo vigente de v2 con un parámetro nuevo,
-- `p_staff_actor`: cuando viene no nulo, saltea las ventanas de tiempo de la
-- venta online (evento y tipo) y el interruptor `ticketsEnabled`, pero
-- mantiene todo lo demás intacto — evento publicado, `status not in
-- ('cerrado', 'finalizado')`, cupo de evento y de tipo, precio por canal. Un
-- operador puede vender fuera de horario, no sobrevender ni inventar precios,
-- y `status = 'cerrado'` sigue siendo una decisión de la organización que un
-- alta de mostrador no pisa (ver 20260807140000: "un evento cerrado a mano
-- tiene que quedarse cerrado").
--
-- La auditoría distingue el origen: `actor_type = 'staff'` con
-- `actor_id = p_staff_actor` cuando la carga vino del panel, igual que ya
-- hace `staff_approve_ticket_order`.
--
-- v2 queda en pie: el deploy de base y de app son pasos separados, y
-- dropearla acá rompería al Node viejo durante la ventana de deploy. Se
-- retira en una migración posterior una vez confirmado el rollout.

-- ---------------------------------------------------------------------------
-- 1. create_ticket_order_v3: v2 + p_staff_actor opcional.
-- ---------------------------------------------------------------------------

create or replace function public.create_ticket_order_v3(
  p_event_slug text,
  p_attendees jsonb,
  p_buyer jsonb,
  p_idempotency_key text,
  p_access_token_hash text,
  p_staff_actor text default null
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
  v_credential public.ticket_type_credentials;
  v_bundle_id uuid;
  v_credential_index int;
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
  -- Las ventanas de venta online (evento y por tipo, más abajo) y el
  -- interruptor `ticketsEnabled` gobiernan el checkout público. Una venta de
  -- mostrador ocurre justo cuando esa ventana ya cerró: el staff las saltea,
  -- pero sigue atado al `status` de arriba y al cupo, más abajo.
  if p_staff_actor is null then
    if v_event.ticket_sales_opens_at is not null and now() < v_event.ticket_sales_opens_at then
      raise exception 'La venta de entradas todavia no abrio.' using errcode = 'PLU03';
    end if;
    if v_event.ticket_sales_closes_at is not null and now() > v_event.ticket_sales_closes_at then
      raise exception 'La venta de entradas ya cerro.' using errcode = 'PLU03';
    end if;
    if coalesce((v_event.rules ->> 'ticketsEnabled')::boolean, false) is distinct from true then
      raise exception 'La venta de entradas esta deshabilitada para este evento.' using errcode = 'PLU03';
    end if;
  end if;

  v_provider := coalesce(p_buyer ->> 'provider', 'mercado_pago');
  if v_provider not in ('mercado_pago', 'manual') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  v_channel := nullif(trim(p_buyer ->> 'manualPaymentChannel'), '');
  if v_provider = 'manual' then
    v_channel := coalesce(v_channel, 'bank_transfer');
    if v_channel not in ('bank_transfer', 'cash_pitbull', 'wise_transfer') then
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
    select * into v_type from public.ticket_types
    where id = v_type_id and event_id = v_event.id and active;
    if not found then
      raise exception 'Tipo de entrada invalido.' using errcode = 'PLU01';
    end if;

    -- Ventana propia del tipo. La del evento sigue mandando como techo: esto
    -- sólo cierra antes. Sirve para que una preventa se apague sola sin tocar
    -- el interruptor del evento ni desactivar el tipo a mano el mismo día.
    -- El staff la saltea igual que la del evento, arriba.
    if p_staff_actor is null then
      if v_type.sales_opens_at is not null and now() < v_type.sales_opens_at then
        raise exception 'La venta de % todavia no abrio.', v_type.name using errcode = 'PLU03';
      end if;
      if v_type.sales_closes_at is not null and now() > v_type.sales_closes_at then
        raise exception 'La venta de % ya cerro.', v_type.name using errcode = 'PLU03';
      end if;
    end if;
  end loop;

  select limit_count into v_limit from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event' and key = '';
  if v_limit is not null then
    -- `is_primary_credential`: una compra de entrenador emite dos credenciales
    -- y ocupa UN lugar, no dos. Sin este filtro habilitar entrenadores partia
    -- el aforo del evento al medio en silencio.
    select count(*) into v_reserved from public.tickets
    where event_id = v_event.id and status <> 'cancelada' and is_primary_credential;
    if v_reserved + jsonb_array_length(p_attendees) > v_limit then
      raise exception 'Evento agotado.' using errcode = 'PLU04';
    end if;
  end if;

  for v_type in select * from public.ticket_types where event_id = v_event.id and quota is not null
  loop
    select count(*) into v_reserved from public.tickets
    where ticket_type_id = v_type.id and status <> 'cancelada' and is_primary_credential;
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
    v_unit_price := plu_private.resolve_ticket_channel_price(
      v_provider, v_channel, v_type.price, v_type.manual_price
    )::int + coalesce((v_addon_result ->> 'total')::int, 0);
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
    v_unit_price := plu_private.resolve_ticket_channel_price(
      v_provider, v_channel, v_type.price, v_type.manual_price
    )::int + coalesce((v_addon_result ->> 'total')::int, 0);

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

    -- Una fila por credencial declarada en el tipo. Cada fila trae su
    -- `ticket_code` y su `qr_token`, asi que cada una se canjea una sola vez
    -- (`check_ins.ticket_id` es UNIQUE) en el puesto que le corresponde.
    -- La primera lleva el precio y los addons; las demas van en 0 porque ya
    -- estan pagas dentro de la misma compra y contarlas de nuevo inflaria la
    -- recaudacion del evento.
    v_bundle_id := gen_random_uuid();
    v_credential_index := 0;

    for v_credential in
      select * from public.ticket_type_credentials
      where ticket_type_id = v_type.id
      order by sort_order, created_at
    loop
      insert into public.tickets (
        ticket_code, order_id, event_id, attendee_name, attendee_dni,
        ticket_type_id, unit_price, addons, status,
        credential_label, credential_scopes, bundle_id, is_primary_credential
      ) values (
        'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
        v_order.id, v_event.id, trim(v_attendee ->> 'fullName'),
        v_attendee ->> 'dni', v_type.id,
        case when v_credential_index = 0 then v_unit_price else 0 end,
        case when v_credential_index = 0 then v_addons else '[]'::jsonb end,
        'pendiente_pago',
        v_credential.label, v_credential.zone_scopes, v_bundle_id,
        v_credential_index = 0
      ) returning to_jsonb(tickets) into v_ticket;
      v_tickets := v_tickets || jsonb_build_array(v_ticket);
      v_credential_index := v_credential_index + 1;
    end loop;

    -- Un tipo sin credenciales declaradas emite la de siempre. Pasa con un
    -- tipo creado por una version anterior del panel: preferimos vender una
    -- entrada de espectador que cortar la compra.
    if v_credential_index = 0 then
      insert into public.tickets (
        ticket_code, order_id, event_id, attendee_name, attendee_dni,
        ticket_type_id, unit_price, addons, status,
        credential_label, credential_scopes, bundle_id, is_primary_credential
      ) values (
        'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
        v_order.id, v_event.id, trim(v_attendee ->> 'fullName'),
        v_attendee ->> 'dni', v_type.id, v_unit_price, v_addons, 'pendiente_pago',
        'Entrada general', array['gate_tickets'], v_bundle_id, true
      ) returning to_jsonb(tickets) into v_ticket;
      v_tickets := v_tickets || jsonb_build_array(v_ticket);
    end if;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'ticket_order.created', 'ticket_order', v_order.id::text,
    case when p_staff_actor is not null then 'staff' else 'public' end,
    p_staff_actor,
    jsonb_build_object('eventId', v_event.id, 'quantity', jsonb_array_length(p_attendees), 'provider', v_provider, 'manualPaymentChannel', v_channel)
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

revoke all on function public.create_ticket_order_v3(text, jsonb, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_ticket_order_v3(text, jsonb, jsonb, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if to_regprocedure(
    'public.create_ticket_order_v3(text,jsonb,jsonb,text,text,text)'
  ) is null or to_regprocedure(
    'public.create_ticket_order_v2(text,jsonb,jsonb,text,text)'
  ) is null then
    raise exception 'La verificación de venta manual de entradas por staff no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
