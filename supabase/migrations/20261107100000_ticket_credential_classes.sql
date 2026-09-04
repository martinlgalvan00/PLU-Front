-- ---------------------------------------------------------------------------
-- Subcategorías de entrada y credenciales múltiples — PLU ARG
--
-- Hasta acá una entrada era una fila de `tickets`: un código, un QR, un canje.
-- Eso alcanza para el espectador pero no para el entrenador, que necesita DOS
-- credenciales por una sola compra -- la de espectador para la tribuna y la de
-- ENTRENADOR que le abre la entrada en calor -- y que seguridad canjea por
-- separado en dos puestos distintos.
--
-- El modelo ya empujaba a esta solución:
--   * cada fila de `tickets` ya trae `ticket_code` y `qr_token` propios, o sea
--     que una fila YA ES una credencial;
--   * `check_ins.ticket_id` es UNIQUE, o sea un canje por credencial.
-- Por eso una compra de entrenador emite dos FILAS y no una fila con dos
-- permisos: así el UNIQUE sigue valiendo tal cual y cada credencial se canjea
-- una vez, que es exactamente la regla que seguridad necesita.
--
-- Las subcategorías las define el admin, no un enum: `ticket_type_credentials`
-- dice qué credenciales emite cada tipo de entrada y qué zonas abre cada una.
-- Un tipo "General" declara una credencial; un tipo "Entrenador" declara dos.
--
-- El cupo NO se toca por credencial: una compra descuenta uno solo del cupo de
-- su tipo, aunque emita varias credenciales. Sin esto, habilitar entrenadores
-- habría partido al medio el aforo del evento en silencio.
-- ---------------------------------------------------------------------------

-- ── 1. Catálogo de credenciales por tipo de entrada ────────────────────────

create table if not exists public.ticket_type_credentials (
  id uuid primary key default gen_random_uuid(),
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  -- Lo que se imprime y lo que ve seguridad al escanear ("Espectador",
  -- "ENTRENADOR"). Es la subcategoría, y la escribe el admin.
  label text not null check (length(btrim(label)) between 1 and 40),
  -- Qué zonas la aceptan. Los valores son los mismos `EventSecurityZoneScope`
  -- de Prisma, donde viven las zonas del meet.
  zone_scopes text[] not null default array['gate_tickets'],
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ticket_type_credentials_scopes_not_empty
    check (array_length(zone_scopes, 1) >= 1),
  constraint ticket_type_credentials_scopes_valid
    check (zone_scopes <@ array['gate_tickets', 'athletes_only', 'athletes_coaches', 'staff_only'])
);

create index if not exists ticket_type_credentials_type_idx
  on public.ticket_type_credentials (ticket_type_id, sort_order);

alter table public.ticket_type_credentials enable row level security;

-- ── 2. La credencial emitida, congelada en el ticket ───────────────────────
--
-- `credential_label` y `credential_scopes` se copian al emitir y no se leen por
-- join: una credencial ya impresa no puede cambiar de alcance porque alguien
-- editó el tipo de entrada tres semanas después. El acceso que se vendió es el
-- que se entra.

alter table public.tickets
  add column if not exists credential_label text,
  add column if not exists credential_scopes text[] not null default array['gate_tickets'],
  -- Agrupa las credenciales que salieron de una misma compra, para poder
  -- mostrarle al comprador "tus 2 credenciales" y para reimprimir el juego.
  add column if not exists bundle_id uuid,
  -- La unidad de compra. El cupo y el aforo cuentan SOLO estas.
  add column if not exists is_primary_credential boolean not null default true;

create index if not exists tickets_bundle_idx on public.tickets (bundle_id);

-- ── 3. Backfill: lo que ya existe se comporta igual que antes ──────────────

-- Cada tipo existente estrena su credencial única, equivalente a lo de hoy.
insert into public.ticket_type_credentials (ticket_type_id, label, zone_scopes, sort_order)
select tt.id, 'Entrada general', array['gate_tickets'], 0
from public.ticket_types tt
where not exists (
  select 1 from public.ticket_type_credentials c where c.ticket_type_id = tt.id
);

-- Las entradas ya vendidas son todas primarias, de espectador, y su bundle es
-- ellas mismas.
update public.tickets
set
  credential_label = coalesce(credential_label, 'Entrada general'),
  credential_scopes = coalesce(nullif(credential_scopes, '{}'), array['gate_tickets']),
  bundle_id = coalesce(bundle_id, id),
  is_primary_credential = coalesce(is_primary_credential, true)
where credential_label is null or bundle_id is null;

-- ── 4. Guardado desde el panel ─────────────────────────────────────────────
--
-- Va aparte de `staff_upsert_event` a propósito, igual que
-- `staff_merge_event_public_surface` y `staff_merge_event_public_copy`: esa
-- función tiene ~555 líneas y reemitirla entera para sumar una tabla hija es
-- justamente el riesgo que este patrón evita. Además las credenciales cuelgan
-- de tipos de entrada cuyos ids recién existen DESPUÉS del upsert.

create or replace function public.staff_merge_ticket_type_credentials(
  p_event_slug text,
  p_credentials jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_entry jsonb;
  v_credential jsonb;
  v_type_id uuid;
  v_scopes text[];
  v_index int;
  v_sort_order int;
  v_matches int;
  v_seen uuid[] := array[]::uuid[];
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if jsonb_typeof(p_credentials) <> 'array' then
    raise exception 'Formato de credenciales inválido.' using errcode = 'PLU01';
  end if;

  for v_entry in select value from jsonb_array_elements(p_credentials)
  loop
    v_type_id := nullif(v_entry ->> 'ticketTypeId', '')::uuid;

    -- Un tipo de entrada recién creado todavía no tiene id: `staff_save_event`
    -- no devuelve los tipos, así que el panel manda el `sortOrder` con el que
    -- lo guardó y lo resolvemos acá. Sin esto, las credenciales de un tipo
    -- nuevo recién se podrían cargar en un segundo guardado.
    if v_type_id is null then
      v_sort_order := nullif(v_entry ->> 'sortOrder', '')::int;
      if v_sort_order is null then
        raise exception 'Falta el tipo de entrada.' using errcode = 'PLU01';
      end if;

      select count(*), min(id) into v_matches, v_type_id
      from public.ticket_types
      where event_id = v_event.id and sort_order = v_sort_order;

      if v_matches = 0 then
        raise exception 'No se encontró el tipo de entrada en la posición %.', v_sort_order
          using errcode = 'PLU01';
      end if;
      if v_matches > 1 then
        raise exception 'Hay más de un tipo de entrada en la posición %.', v_sort_order
          using errcode = 'PLU01';
      end if;
    end if;

    if not exists (
      select 1 from public.ticket_types where id = v_type_id and event_id = v_event.id
    ) then
      raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
    end if;
    if v_type_id = any(v_seen) then
      raise exception 'El tipo de entrada está repetido.' using errcode = 'PLU01';
    end if;
    v_seen := array_append(v_seen, v_type_id);

    if jsonb_typeof(v_entry -> 'credentials') <> 'array'
       or jsonb_array_length(v_entry -> 'credentials') < 1 then
      raise exception 'Cada tipo de entrada necesita al menos una credencial.' using errcode = 'PLU01';
    end if;
    -- Un tope bajo a propósito: más de cuatro credenciales por compra no es un
    -- caso real de un meet, y sí sería una forma cómoda de inflar el aforo.
    if jsonb_array_length(v_entry -> 'credentials') > 4 then
      raise exception 'Una entrada no puede emitir más de 4 credenciales.' using errcode = 'PLU01';
    end if;

    delete from public.ticket_type_credentials where ticket_type_id = v_type_id;

    v_index := 0;
    for v_credential in select value from jsonb_array_elements(v_entry -> 'credentials')
    loop
      if coalesce(length(btrim(v_credential ->> 'label')), 0) < 1 then
        raise exception 'Cada credencial necesita un nombre.' using errcode = 'PLU01';
      end if;

      select coalesce(array_agg(distinct scope), array[]::text[])
        into v_scopes
      from jsonb_array_elements_text(coalesce(v_credential -> 'zoneScopes', '[]'::jsonb)) scope;

      if array_length(v_scopes, 1) is null then
        raise exception 'La credencial "%" no abre ninguna zona.', btrim(v_credential ->> 'label')
          using errcode = 'PLU01';
      end if;
      if not (v_scopes <@ array['gate_tickets', 'athletes_only', 'athletes_coaches', 'staff_only']) then
        raise exception 'Zona inválida en la credencial "%".', btrim(v_credential ->> 'label')
          using errcode = 'PLU01';
      end if;

      insert into public.ticket_type_credentials (ticket_type_id, label, zone_scopes, sort_order)
      values (v_type_id, btrim(v_credential ->> 'label'), v_scopes, v_index);

      v_index := v_index + 1;
    end loop;
  end loop;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ticketTypeId', c.ticket_type_id,
      'id', c.id,
      'label', c.label,
      'zoneScopes', to_jsonb(c.zone_scopes),
      'sortOrder', c.sort_order
    ) order by c.ticket_type_id, c.sort_order), '[]'::jsonb)
    from public.ticket_type_credentials c
    join public.ticket_types t on t.id = c.ticket_type_id
    where t.event_id = v_event.id
  );
end;
$$;

revoke all on function public.staff_merge_ticket_type_credentials(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.staff_merge_ticket_type_credentials(text, jsonb)
  to service_role;

-- ── 5. Emisión: una compra puede salir con varias credenciales ───────────
--
-- Cuerpo vigente de `create_ticket_order_v2` (de
-- 20261102100000_event_tickets_enabled_and_weigh_in.sql) con tres cambios:
--   * el aforo del evento y el cupo por tipo cuentan solo credenciales
--     primarias, o sea unidades de compra;
--   * la emisión recorre `ticket_type_credentials` en vez de insertar una fila;
--   * la primera credencial se queda con el precio y los addons.

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

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, metadata)
  values ('ticket_order.created', 'ticket_order', v_order.id::text, 'public',
    jsonb_build_object('eventId', v_event.id, 'quantity', jsonb_array_length(p_attendees), 'provider', v_provider, 'manualPaymentChannel', v_channel));

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

revoke all on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text)
  from public, anon, authenticated;

revoke all on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text)
  to service_role;

-- ── 6. Canje: la zona del puesto decide qué credencial abre ────────────────
--
-- Hasta acá `staff_check_in_ticket` solo exigía que la entrada estuviera
-- pagada, y `gate` era texto libre: cualquier entrada abría cualquier puesto.
-- Con eso, emitir dos credenciales habría sido emitir dos QR indistintos.
--
-- La versión de 4 argumentos recibe el alcance de la zona de quien escanea
-- (`User.securityZoneId` -> `EventSecurityZone.scope`, en Prisma) y exige que
-- la credencial lo tenga declarado. Con `p_zone_scope` nulo no valida nada:
-- una cuenta de seguridad sin zona asignada sigue funcionando igual que hoy,
-- así que habilitar esto no deja a nadie afuera de un día para el otro.

create or replace function public.staff_check_in_ticket(
  p_qr_token uuid,
  p_gate text,
  p_actor text,
  p_zone_scope text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.tickets;
  v_checkin public.check_ins;
begin
  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then
    raise exception 'Entrada no encontrada.' using errcode = 'PLU02';
  end if;
  if v_ticket.status <> 'pagada' then
    raise exception 'Esta entrada no tiene el pago acreditado.' using errcode = 'PLU05';
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
      v_ticket.event_id, 'spectator', v_ticket.id,
      nullif(trim(p_gate), ''), left(p_actor, 200)
    ) returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Esta entrada ya fue utilizada.' using errcode = 'PLU06';
  end;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values(
    'ticket.checked_in', 'ticket', v_ticket.id::text, 'staff', p_actor,
    jsonb_build_object('credential', v_ticket.credential_label, 'zoneScope', p_zone_scope)
  );

  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end $$;

-- La firma de 3 argumentos sigue existiendo para no romper llamadas viejas, y
-- delega sin validar zona.
create or replace function public.staff_check_in_ticket(p_qr_token uuid, p_gate text, p_actor text)
returns jsonb language sql security definer set search_path = public as $$
  select public.staff_check_in_ticket(p_qr_token, p_gate, p_actor, null::text);
$$;

revoke all on function public.staff_check_in_ticket(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_check_in_ticket(uuid, text, text, text) to service_role;
revoke all on function public.staff_check_in_ticket(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_check_in_ticket(uuid, text, text) to service_role;

-- ── 7. Verificación ────────────────────────────────────────────────────────

do $verification$
declare
  v_missing int;
begin
  -- Todo tipo de entrada tiene que haber quedado con al menos una credencial:
  -- un tipo sin credenciales vendería una entrada que no abre nada.
  select count(*) into v_missing
  from public.ticket_types tt
  where not exists (
    select 1 from public.ticket_type_credentials c where c.ticket_type_id = tt.id
  );
  if v_missing > 0 then
    raise exception 'Quedaron % tipos de entrada sin credencial.', v_missing;
  end if;

  -- El cupo tiene que contar unidades de compra, no credenciales.
  if position('is_primary_credential' in
      pg_get_functiondef('public.create_ticket_order_v2(text, jsonb, jsonb, text, text)'::regprocedure)) = 0 then
    raise exception 'create_ticket_order_v2 no filtra por credencial primaria: el cupo contaria de mas.';
  end if;

  -- El canje tiene que mirar el alcance de la zona.
  if position('credential_scopes' in
      pg_get_functiondef('public.staff_check_in_ticket(uuid, text, text, text)'::regprocedure)) = 0 then
    raise exception 'staff_check_in_ticket no valida la zona de la credencial.';
  end if;
end
$verification$;
