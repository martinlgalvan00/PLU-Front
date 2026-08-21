-- Códigos de promoción: apagar Mercado Pago para un código puntual — PLU ARG
--
-- 20260825110000 dejó `manual_channels` como una lista ADITIVA y escribió la
-- regla en su cabecera: "Mercado Pago nunca se apaga: es el canal base de todo
-- el checkout". Eso alcanza para una promo que además se cobra por
-- transferencia, pero no para el caso que apareció con las ofertas cerradas: un
-- código pactado a un precio que sólo cierra cobrado en efectivo el día del
-- evento —o sólo por transferencia—, y que NO se puede pagar con la pasarela.
-- Hoy ese código igual ofrece Mercado Pago, porque no hay forma de decir lo
-- contrario.
--
-- Se agrega `mercado_pago_enabled` en vez de meter 'mercado_pago' dentro de
-- `manual_channels`: esa columna significa "canales manuales que este código
-- destraba", la leen el gate de Express, el preview, la ficha secreta, el panel
-- y una columna generada legacy (`enables_manual_payment`), y cambiarle el
-- conjunto de valores permitidos rompería a todos por un caso que es un
-- booleano. Las dos columnas juntas dan la matriz completa:
--
--   true  + {}                            -> sólo Mercado Pago (default histórico)
--   true  + {bank_transfer}               -> Mercado Pago + transferencia
--   true  + {bank_transfer,cash_pitbull}  -> los tres
--   false + {cash_pitbull}                -> SÓLO efectivo
--   false + {bank_transfer,cash_pitbull}  -> transferencia y efectivo, sin pasarela
--
-- Las dos columnas NO son simétricas, y de eso depende dónde se puede validar
-- cada una:
--
--   * `manual_channels` ABRE. Vacío no prohíbe nada: si Administración tiene
--     transferencia abierta, un cupón de porcentaje se paga por transferencia
--     sin declarar ningún canal. Por eso su verificación vive en Express
--     (`discountCodeManualEligibility`), como override puntual.
--   * `mercado_pago_enabled = false` CIERRA. Es una prohibición explícita del
--     código, así que se verifica también dentro de la transacción que crea la
--     orden (`apply_discount_code_to_order`, PLU28): es la guarda que no se
--     puede eludir salteando la API.
--
-- Wise queda afuera a propósito: cotiza en USD, tiene interruptor propio y
-- ningún cupón lo abre ni lo cierra (ver 20260827120000).

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists mercado_pago_enabled boolean not null default true;

-- Un código sin ningún canal es un código que nadie puede pagar: el atleta lo
-- canjea, la ficha se abre y no hay un solo medio que ofrecerle. La RPC lo
-- rechaza con un mensaje propio; el check es el piso que no depende de por
-- dónde entró la escritura.
alter table public.discount_codes drop constraint if exists discount_codes_any_channel_check;
alter table public.discount_codes
  add constraint discount_codes_any_channel_check
  check (mercado_pago_enabled or cardinality(manual_channels) > 0);

-- Una promo pública se aplica sola a TODAS las compras del concepto
-- (`plu_private.resolve_public_promo`), sin que nadie tipee nada. Cerrarle la
-- pasarela sería cerrar el checkout entero desde la pantalla de precios, que es
-- exactamente lo que 20260827105000 prohibió para los canales manuales por el
-- motivo inverso. La pasarela se cierra en Acceso y habilitación, donde queda
-- auditada como decisión de plataforma.
alter table public.discount_codes drop constraint if exists discount_codes_public_channel_check;
alter table public.discount_codes
  add constraint discount_codes_public_channel_check
  check (audience = 'code' or mercado_pago_enabled);

-- ---------------------------------------------------------------------------
-- 2. La guarda que no se puede eludir
--
-- Cuerpo idéntico a 20260902100000 salvo el bloque nuevo, que corta antes de
-- calcular el descuento: si la orden es de Mercado Pago y el código lo cierra,
-- no hay canje posible y la orden entera se cae con PLU28 (409 en Express, ver
-- server/lib/supabaseRpc.js).
-- ---------------------------------------------------------------------------

create or replace function public.apply_discount_code_to_order(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_order_id uuid,
  p_applies_to text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_order public.athlete_payment_orders;
  v_promo_id uuid;
  v_discount int;
  v_redeemed int;
  v_order_event_id uuid;
  v_quota_exhausted boolean := false;
  -- Sin código pedido, la promo pública decide sola y nunca levanta excepción.
  v_automatic boolean := p_code is null or length(trim(p_code)) = 0;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.discount_code_id is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;

  if v_automatic then
    v_code := plu_private.resolve_public_promo(
      p_organization_id, p_applies_to, p_athlete_id, v_order.amount, v_order.method
    );
    if v_code.id is null then
      return null;
    end if;
    -- Relectura bajo lock: entre el resolver y acá otra transacción pudo
    -- llevarse el último cupo o apagar la promo desde el panel.
    v_promo_id := v_code.id;
    select * into v_code from public.discount_codes where id = v_promo_id for update;
    if not found or v_code.audience <> 'public' or v_code.archived_at is not null
       or (v_code.starts_at is not null and v_code.starts_at > now())
       or (v_code.expires_at is not null and v_code.expires_at < now()) then
      return null;
    end if;
  else
    -- El lock serializa el conteo y la inserción del último cupo.
    select * into v_code from public.discount_codes
    where organization_id = p_organization_id
      and code = upper(trim(p_code))
      and archived_at is null
    for update;
    if not found
       or v_code.applies_to not in (p_applies_to, 'both')
       or (v_code.expires_at is not null and v_code.expires_at < now()) then
      raise exception 'El código no es válido.' using errcode = 'PLU20';
    end if;
    -- Una promo programada todavía no empezó: es un error distinto de "venció"
    -- y de "no existe", porque el código sí sirve —más tarde.
    if v_code.starts_at is not null and v_code.starts_at > now() then
      raise exception 'Ese código todavía no está vigente.' using errcode = 'PLU25';
    end if;
  end if;

  -- Alcance por inscripción. Se compara contra el evento de la inscripción que
  -- ESTA orden ya creó (plu_private.order_event_id), no contra el slug que
  -- mandó el navegador: es la única lectura que no se puede falsificar desde el
  -- cliente. Una orden sin inscripción (afiliación sola) da null y también
  -- queda afuera, que es lo correcto para un código atado a un evento.
  if v_code.event_id is not null then
    v_order_event_id := plu_private.order_event_id(v_order.id);
    if v_order_event_id is distinct from v_code.event_id then
      if v_automatic then return null; end if;
      raise exception 'Ese código es de otra inscripción.' using errcode = 'PLU27';
    end if;
  end if;

  -- La invitación se chequea después del lock también en el camino automático:
  -- el resolver ya filtró, pero la lista pudo cambiar entre el resolver y acá.
  if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
    if v_automatic then return null; end if;
    raise exception 'Ese código está reservado para otras cuentas.' using errcode = 'PLU26';
  end if;

  if v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = v_code.id;
    if v_redeemed >= v_code.max_redemptions then
      if v_automatic then return null; end if;
      raise exception 'El código alcanzó el máximo de usos.' using errcode = 'PLU21';
    end if;
  end if;

  if not v_code.active then
    if v_automatic then return null; end if;
    raise exception 'El código no es válido.' using errcode = 'PLU20';
  end if;

  -- Cierre de canal por código, la única guarda de canal que se puede verificar
  -- acá. `manual_channels` ABRE canales y su lista vacía no prohíbe nada —con
  -- transferencia abierta desde Administración, un cupón de porcentaje se paga
  -- por transferencia sin declarar ningún canal—, así que compararla contra el
  -- medio de la orden rechazaría compras legítimas. `mercado_pago_enabled =
  -- false` es lo contrario: una prohibición explícita del código, y por eso sí
  -- se valida dentro de la transacción que crea la orden. Express corta antes
  -- con el mensaje bueno; esto cubre el POST directo a la RPC.
  --
  -- El camino automático no llega acá con la pasarela cerrada
  -- (discount_codes_public_channel_check lo impide), pero devuelve null igual
  -- que el resto de los rechazos: una promo pública nunca voltea una compra.
  if v_order.method = 'mercado_pago' and not v_code.mercado_pago_enabled then
    if v_automatic then return null; end if;
    raise exception 'Ese código no se puede pagar con Mercado Pago.' using errcode = 'PLU28';
  end if;

  v_discount := plu_private.resolve_discount_amount(
    v_order.amount, v_code.kind, v_code.percent_off,
    plu_private.effective_fixed_price(v_order.method, v_code.fixed_price, v_code.fixed_price_manual)
  )::int;

  -- Un código 'access' da 0 a propósito: no es "no mejora el precio", es un
  -- desbloqueo. 'offer' sí tiene que mejorar: si su precio quedó por encima del
  -- combo, la oferta está mal cargada y es mejor que falle acá que cobrar el
  -- precio de lista anunciando una oferta.
  if v_code.kind <> 'access' and v_discount <= 0 then
    if v_automatic then return null; end if;
    raise exception 'El código no mejora el precio de esta compra.' using errcode = 'PLU24';
  end if;
  if v_discount >= v_order.amount then
    if v_automatic then return null; end if;
    raise exception 'El código no se puede aplicar a este importe.' using errcode = 'PLU01';
  end if;

  begin
    insert into public.discount_code_redemptions(
      organization_id, discount_code_id, athlete_id, payment_order_id, discount_amount
    ) values (p_organization_id, v_code.id, p_athlete_id, v_order.id, v_discount);
  exception when unique_violation then
    if v_automatic then return null; end if;
    raise exception 'Ya usaste este código.' using errcode = 'PLU22';
  end;

  update public.athlete_payment_orders
  set amount = amount - v_discount,
      discount_code_id = v_code.id,
      discount_code = v_code.code,
      discount_amount = v_discount,
      updated_at = now()
  where id = v_order.id;

  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    update public.discount_codes
    set active = false, updated_at = now()
    where id = v_code.id;
    v_quota_exhausted := true;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.redeemed', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object(
      'discountCodeId', v_code.id,
      'code', v_code.code,
      'kind', v_code.kind,
      'audience', v_code.audience,
      'eventId', v_code.event_id,
      'source', case when v_automatic then 'public_promo' else 'code' end,
      'paymentMethod', v_order.method,
      'discountAmount', v_discount,
      'quotaExhausted', v_quota_exhausted
    ),
    p_organization_id
  );

  return jsonb_build_object(
    'applied', true,
    'discountAmount', v_discount,
    'code', v_code.code,
    'kind', v_code.kind,
    'audience', v_code.audience,
    'source', case when v_automatic then 'public_promo' else 'code' end
  );
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. El checkout necesita saberlo ANTES de ofrecer el medio
--
-- Sin esta celda en el preview, la pantalla de inscripción sigue ofreciendo
-- Mercado Pago con un código que lo cierra y el atleta descubre el problema
-- recién al enviar la orden, como un 409 sin explicación. Cuerpo idéntico a
-- 20260902100000 salvo la clave nueva.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_preview_discount_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_applies_to text,
  p_base_amount int,
  p_payment_method text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_discount int;
  v_already_redeemed boolean;
  v_event public.events;
  v_automatic boolean := p_code is null or length(trim(p_code)) = 0;
begin
  if v_automatic then
    v_code := plu_private.resolve_public_promo(
      p_organization_id, p_applies_to, p_athlete_id, p_base_amount, p_payment_method
    );
    if v_code.id is null then
      return jsonb_build_object('valid', false, 'reason', 'no_public_promo');
    end if;
  else
    select * into v_code from public.discount_codes
    where organization_id = p_organization_id
      and code = upper(trim(p_code))
      and archived_at is null;
    if not found then
      return jsonb_build_object('valid', false, 'reason', 'not_found');
    end if;
    if not v_code.active then
      return jsonb_build_object('valid', false, 'reason', 'inactive');
    end if;
    if v_code.starts_at is not null and v_code.starts_at > now() then
      return jsonb_build_object(
        'valid', false, 'reason', 'not_started', 'startsAt', v_code.starts_at
      );
    end if;
    if v_code.expires_at is not null and v_code.expires_at < now() then
      return jsonb_build_object('valid', false, 'reason', 'expired');
    end if;
    if v_code.applies_to not in (p_applies_to, 'both') then
      -- El alcance del código viaja igual: la pantalla de afiliación necesita
      -- distinguir "este código no sirve para nada" de "este código es de una
      -- oferta de combo" para poder ofrecer el canje en vez de un error seco.
      return jsonb_build_object(
        'valid', false,
        'reason', 'not_applicable',
        'kind', v_code.kind,
        'appliesTo', v_code.applies_to
      );
    end if;
    if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
      return jsonb_build_object('valid', false, 'reason', 'not_invited');
    end if;
    if v_code.max_redemptions is not null
       and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
           >= v_code.max_redemptions then
      return jsonb_build_object('valid', false, 'reason', 'limit_reached');
    end if;

    select exists(
      select 1 from public.discount_code_redemptions
      where discount_code_id = v_code.id and athlete_id = p_athlete_id
    ) into v_already_redeemed;
    if v_already_redeemed then
      return jsonb_build_object('valid', false, 'reason', 'already_used');
    end if;
  end if;

  v_discount := plu_private.resolve_discount_amount(
    p_base_amount, v_code.kind, v_code.percent_off,
    plu_private.effective_fixed_price(p_payment_method, v_code.fixed_price, v_code.fixed_price_manual)
  )::int;
  -- Un código 'access' da 0 a propósito: es un desbloqueo, no un ahorro.
  if v_code.kind <> 'access' and (v_discount <= 0 or v_discount >= p_base_amount) then
    return jsonb_build_object('valid', false, 'reason', 'no_savings');
  end if;

  if v_code.event_id is not null then
    select * into v_event from public.events where id = v_code.event_id;
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', v_code.code,
    'kind', v_code.kind,
    'audience', v_code.audience,
    'source', case when v_automatic then 'public_promo' else 'code' end,
    'description', v_code.description,
    'percentOff', v_code.percent_off,
    -- El importe que se está previsualizando ya es el del canal pedido: se
    -- devuelve resuelto para que el frontend no tenga que volver a elegir.
    'fixedPrice', plu_private.effective_fixed_price(
      p_payment_method, v_code.fixed_price, v_code.fixed_price_manual
    ),
    'eventId', v_code.event_id,
    'eventSlug', v_event.slug,
    'eventTitle', v_event.title,
    'startsAt', v_code.starts_at,
    'expiresAt', v_code.expires_at,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount,
    'manualChannels', to_jsonb(v_code.manual_channels),
    -- Cierre explícito de la pasarela para este código. El checkout lo necesita
    -- para no ofrecer un medio que la RPC va a rechazar con PLU28.
    'mercadoPagoEnabled', v_code.mercado_pago_enabled,
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. La ficha de la oferta exclusiva arma su selector con esto
--
-- `manualChannels` ya viajaba en el payload; faltaba la otra mitad para poder
-- resolver los medios del código sin volver a consultar. Cuerpo idéntico a
-- 20260906110000 salvo la clave nueva.
-- ---------------------------------------------------------------------------

create or replace function plu_private.offer_code_payload(
  p_code public.discount_codes,
  p_athlete_id uuid
)
returns jsonb
language sql
stable
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'id', p_code.id,
    'code', p_code.code,
    'description', p_code.description,
    'kind', p_code.kind,
    'appliesTo', p_code.applies_to,
    'fixedPrice', p_code.fixed_price,
    'fixedPriceManual', p_code.fixed_price_manual,
    'manualChannels', to_jsonb(p_code.manual_channels),
    'mercadoPagoEnabled', p_code.mercado_pago_enabled,
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'maxRedemptions', p_code.max_redemptions,
    -- Cupo restante del código, no del atleta: es lo que la ficha usa para
    -- decir "quedan N". Null cuando no hay tope.
    'remaining', case
      when p_code.max_redemptions is null then null
      else greatest(
        0,
        p_code.max_redemptions - (
          select count(*) from public.discount_code_redemptions r
          where r.discount_code_id = p_code.id
        )
      )
    end,
    'redeemed', exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = p_code.id and r.athlete_id = p_athlete_id
    ),
    -- La orden que ocupó la redención. Impaga, la ficha ofrece terminar de
    -- pagarla ahí mismo con el mismo importe promocional que ya tiene la orden;
    -- aprobada, la ficha pasa a ser el recibo. Una orden muerta no llega hasta
    -- acá: 20260906100000 libera la redención y `redeemed` vuelve a false.
    -- Alias `po` y no `o`: `o` es la oferta de combo del join externo y el
    -- shadowing dejaba dos tablas distintas con la misma letra en la misma
    -- función.
    'purchase', (
      select jsonb_build_object(
        'orderId', po.id,
        'status', po.status,
        'amount', po.amount,
        'currency', po.currency,
        'concept', po.concept,
        'method', po.method,
        'manualPaymentChannel', po.manual_payment_channel,
        'expiresAt', po.expires_at,
        'createdAt', po.created_at
      )
      from public.discount_code_redemptions r
      join public.athlete_payment_orders po on po.id = r.payment_order_id
      where r.discount_code_id = p_code.id
        and r.athlete_id = p_athlete_id
      order by po.created_at desc
      limit 1
    ),
    'campaign', case when ca.id is null then null else jsonb_build_object(
      'id', ca.id,
      'slug', ca.slug,
      'name', ca.name,
      'description', ca.description,
      'objective', ca.objective,
      'status', ca.status,
      'visibility', ca.visibility
    ) end,
    'event', case when e.id is null then null else jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'startsAt', e.starts_at,
      'status', e.status,
      'registrationPrice', e.price,
      'registrationManualPrice', e.manual_price,
      'currency', e.currency
    ) end,
    'comboOffer', case when o.id is null then null else jsonb_build_object(
      'id', o.id,
      'price', o.price,
      'manualPrice', o.manual_price,
      'currency', o.currency,
      'active', o.active,
      'audience', o.audience,
      'startsAt', o.starts_at,
      'endsAt', o.ends_at
    ) end,
    'membershipPlan', case when pl.id is null then null else jsonb_build_object(
      'id', pl.id,
      'code', pl.code,
      'name', pl.name,
      'price', pl.price,
      'manualPrice', pl.manual_price,
      'currency', pl.currency
    ) end
  )
  from (select 1) as anchor
  left join public.promotion_campaigns ca on ca.id = p_code.campaign_id
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id
  left join public.membership_plans pl on pl.id = o.membership_plan_id;
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Alta y edición desde el panel
--
-- Cuerpo idéntico a 20260902100000 salvo la lectura de `mercadoPagoEnabled`
-- (default true, así un payload de una API vieja sigue guardando lo mismo) y
-- las dos validaciones que acompañan a los checks del punto 1 con un mensaje
-- que el operador pueda accionar.
-- ---------------------------------------------------------------------------

create or replace function public.staff_upsert_discount_code(
  p_code jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_code ->> 'id', '')::uuid;
  v_organization_id uuid := coalesce(
    nullif(p_code ->> 'organizationId', '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  v_code_text text := upper(trim(p_code ->> 'code'));
  v_kind text := coalesce(nullif(trim(p_code ->> 'kind'), ''), 'percent');
  v_audience text := coalesce(nullif(trim(p_code ->> 'audience'), ''), 'code');
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_fixed_price int := nullif(p_code ->> 'fixedPrice', '')::int;
  v_fixed_price_manual int := nullif(p_code ->> 'fixedPriceManual', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_event_id uuid := nullif(p_code ->> 'eventId', '')::uuid;
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_starts timestamptz := nullif(p_code ->> 'startsAt', '')::timestamptz;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_manual_channels text[];
  -- Default true: los códigos que existían antes de esta migración, y cualquier
  -- payload de una API desplegada sin el campo, siguen aceptando la pasarela.
  v_mercado_pago_enabled boolean := coalesce((p_code ->> 'mercadoPagoEnabled')::boolean, true);
  v_invitees text[];
  v_before jsonb;
  v_combo public.event_combo_offers;
  v_result public.discount_codes;
begin
  if v_kind not in ('percent', 'fixed_price', 'access', 'offer') then
    raise exception 'La modalidad del código es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia de la promoción es inválida.' using errcode = 'PLU01';
  end if;

  -- Cada modalidad ignora los campos de las otras: así editar un cupón de un
  -- tipo a otro desde el panel no deja el valor viejo colgado.
  if v_kind = 'percent' then
    v_fixed_price := null;
    v_fixed_price_manual := null;
  elsif v_kind in ('fixed_price', 'offer') then
    v_percent := null;
  else
    v_percent := null;
    v_fixed_price := null;
    v_fixed_price_manual := null;
  end if;

  -- Una afiliación no pertenece a ninguna inscripción: el alcance de evento se
  -- descarta en vez de rechazar el guardado, por el mismo criterio que arriba.
  if v_applies not in ('registration', 'combo') then
    v_event_id := null;
  end if;

  if jsonb_typeof(p_code -> 'manualChannels') = 'array' then
    select coalesce(array_agg(distinct channel), '{}'::text[])
    into v_manual_channels
    from jsonb_array_elements_text(p_code -> 'manualChannels') as channel;
  elsif coalesce((p_code ->> 'enablesManualPayment')::boolean, false) then
    -- Payload de la API anterior: el booleano significaba los dos canales.
    v_manual_channels := array['bank_transfer', 'cash_pitbull']::text[];
  else
    v_manual_channels := '{}'::text[];
  end if;

  if not (v_manual_channels <@ array['bank_transfer', 'cash_pitbull']::text[]) then
    raise exception 'Los medios de pago del código son inválidos.' using errcode = 'PLU01';
  end if;

  -- Ver la cabecera de 20260827105000: una promo pública que además abre un
  -- canal manual es el interruptor de canal escondido en otra pantalla.
  if v_audience = 'public' and cardinality(v_manual_channels) > 0 then
    raise exception 'Una promoción pública no puede habilitar medios de pago manuales. Abrilos desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  -- Un código que no acepta ningún canal es un código que nadie puede pagar:
  -- el atleta lo canjea, la ficha se abre y no hay un solo medio que ofrecer.
  if not v_mercado_pago_enabled and cardinality(v_manual_channels) = 0 then
    raise exception 'Si el código no acepta Mercado Pago, habilitá al menos transferencia o efectivo.'
      using errcode = 'PLU01';
  end if;

  -- Mismo criterio que el de arriba, del otro lado: una promo pública se aplica
  -- sola a todas las compras, así que cerrarle la pasarela es cerrar el
  -- checkout entero desde la pantalla de precios. Se cierra en Acceso y
  -- habilitación, que es donde queda auditado como decisión de plataforma.
  if v_audience = 'public' and not v_mercado_pago_enabled then
    raise exception 'Una promoción pública no puede cerrar Mercado Pago. Cerralo desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  if jsonb_typeof(p_code -> 'invitees') = 'array' then
    select coalesce(array_agg(distinct lower(trim(email))), '{}'::text[])
    into v_invitees
    from jsonb_array_elements_text(p_code -> 'invitees') as email
    where trim(email) <> '';

    if cardinality(v_invitees) > 500 then
      raise exception 'La lista de invitados no puede tener más de 500 direcciones.'
        using errcode = 'PLU01';
    end if;
    if exists (
      select 1 from unnest(v_invitees) as t(email)
      where t.email not like '%_@_%._%' or t.email like '% %' or length(t.email) > 200
    ) then
      raise exception 'Hay direcciones de correo inválidas en la lista de invitados.'
        using errcode = 'PLU01';
    end if;
  else
    v_invitees := null;
  end if;

  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_applies not in ('membership', 'registration', 'combo', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código son inválidos.' using errcode = 'PLU01';
  end if;

  if v_starts is not null and v_expires is not null and v_expires <= v_starts then
    raise exception 'El cierre de la promoción debe ser posterior a su apertura.'
      using errcode = 'PLU01';
  end if;

  -- Ver `discount_codes_public_event_check`: el resolver de promo pública no
  -- recibe el evento, así que una promo pública con alcance de inscripción
  -- podría bloquear la aplicación de cualquier otra.
  if v_audience = 'public' and v_event_id is not null then
    raise exception 'Una promoción pública no puede limitarse a una inscripción. Repartila como código.'
      using errcode = 'PLU01';
  end if;

  if v_event_id is not null
     and not exists (select 1 from public.events where id = v_event_id
                       and organization_id = v_organization_id) then
    raise exception 'La inscripción del código no existe.' using errcode = 'PLU02';
  end if;

  if v_kind = 'percent' and (v_percent is null or v_percent < 1 or v_percent > 99) then
    raise exception 'El porcentaje de descuento debe estar entre 1 y 99.' using errcode = 'PLU01';
  end if;

  if v_kind in ('fixed_price', 'offer') then
    if v_fixed_price is null or v_fixed_price <= 0 or v_fixed_price > 10000000 then
      raise exception 'El precio promocional es inválido.' using errcode = 'PLU01';
    end if;
    -- A propósito sin comparar contra `v_fixed_price`: el precio del canal
    -- manual puede ser igual, menor o mayor. Ver el punto 2 de la cabecera de
    -- 20260828100000.
    if v_fixed_price_manual is not null
       and (v_fixed_price_manual <= 0 or v_fixed_price_manual > 10000000) then
      raise exception 'El precio promocional por transferencia o efectivo es inválido.'
        using errcode = 'PLU01';
    end if;
  end if;

  if v_kind = 'fixed_price' and v_applies = 'both' then
    raise exception 'Un código con precio promocional necesita un alcance único: afiliación, inscripción o combo.'
      using errcode = 'PLU01';
  end if;

  -- Un código de acceso puro no tiene sentido fuera del combo: ver el
  -- comentario de discount_codes_kind_shape_check sobre por qué 'both' queda
  -- afuera.
  if v_kind = 'access' and v_applies <> 'combo' then
    raise exception 'Un código de acceso sólo puede aplicarse al combo.' using errcode = 'PLU01';
  end if;

  if v_kind = 'offer' then
    if v_applies <> 'combo' then
      raise exception 'Una oferta exclusiva se aplica al combo de afiliación e inscripción.'
        using errcode = 'PLU01';
    end if;
    if v_audience <> 'code' then
      raise exception 'Una oferta exclusiva se reparte como código: no puede ser pública.'
        using errcode = 'PLU01';
    end if;
    if v_event_id is null then
      raise exception 'Elegí a qué inscripción aplica la oferta exclusiva.' using errcode = 'PLU01';
    end if;

    -- El combo del evento define QUÉ se está ofertando (qué plan de afiliación
    -- se empaqueta) y contra qué precio se compara. Sin combo cargado, la
    -- oferta no se puede cotizar: se corta acá y no en el checkout del atleta.
    select * into v_combo from public.event_combo_offers where event_id = v_event_id;
    if not found then
      raise exception 'Esa inscripción todavía no tiene combo de afiliación e inscripción configurado.'
        using errcode = 'PLU02';
    end if;
    -- Una "oferta" que cobra igual o más que el combo no es una oferta, y el
    -- canje la rechazaría con PLU24 recién en el checkout.
    if v_fixed_price >= v_combo.price then
      raise exception 'El precio de la oferta (%) tiene que ser menor al del combo (%).',
        v_fixed_price, v_combo.price using errcode = 'PLU01';
    end if;
  end if;

  if v_id is not null then
    select * into v_result from public.discount_codes
    where id = v_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El código no existe.' using errcode = 'PLU02';
    end if;
    v_before := to_jsonb(v_result);

    update public.discount_codes
    set code = v_code_text,
        description = nullif(trim(p_code ->> 'description'), ''),
        kind = v_kind,
        audience = v_audience,
        percent_off = v_percent,
        fixed_price = v_fixed_price,
        fixed_price_manual = v_fixed_price_manual,
        applies_to = v_applies,
        event_id = v_event_id,
        max_redemptions = v_max_redemptions,
        starts_at = v_starts,
        expires_at = v_expires,
        active = v_active,
        manual_channels = v_manual_channels,
        mercado_pago_enabled = v_mercado_pago_enabled,
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, event_id, max_redemptions, starts_at, expires_at,
        active, manual_channels, mercado_pago_enabled
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_event_id, v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels,
        v_mercado_pago_enabled
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código con ese nombre.' using errcode = 'PLU13';
    end;
  end if;

  -- La lista se reemplaza entera en la misma transacción que el código: no hay
  -- ventana en la que la promo esté guardada con la exclusividad a medio migrar.
  if v_invitees is not null then
    delete from public.discount_code_invitations
    where discount_code_id = v_result.id
      and not (email = any(v_invitees));

    if cardinality(v_invitees) > 0 then
      insert into public.discount_code_invitations(organization_id, discount_code_id, email)
      select v_organization_id, v_result.id, t.email from unnest(v_invitees) as t(email)
      on conflict (discount_code_id, email) do nothing;
    end if;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    case when v_before is null then 'discount_code.created' else 'discount_code.updated' end,
    'discount_code', v_result.id::text, 'staff', p_actor,
    case
      when v_before is null then to_jsonb(v_result) || jsonb_build_object(
        'inviteeCount', coalesce(cardinality(v_invitees), 0)
      )
      else jsonb_build_object(
        'before', v_before,
        'after', to_jsonb(v_result),
        'inviteeCount', coalesce(cardinality(v_invitees), 0)
      )
    end,
    v_organization_id
  );

  return to_jsonb(v_result) || jsonb_build_object(
    'invitees', coalesce((
      select jsonb_agg(i.email order by i.email)
      from public.discount_code_invitations i
      where i.discount_code_id = v_result.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. El panel lee la celda para poder editarla
--
-- Cuerpo idéntico a 20260903100000 salvo la clave nueva.
-- ---------------------------------------------------------------------------

create or replace function public.staff_get_pricing_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.family_code, p.version desc)
      from public.membership_plans p
      where p.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'registrationPrice', e.price,
          'registrationManualPrice', e.manual_price,
          'currency', e.currency,
          'status', e.status,
          'published', e.published,
          'comboOffer', case when o.id is null then null else
            jsonb_build_object(
              'id', o.id,
              'membershipPlanId', o.membership_plan_id,
              'price', o.price,
              'manualPrice', o.manual_price,
              'currency', o.currency,
              'active', o.active,
              'audience', o.audience,
              'accessCode', o.access_code,
              'financed', o.financed,
              'startsAt', o.starts_at,
              'endsAt', o.ends_at,
              'updatedAt', o.updated_at
            )
          end
        ) order by e.starts_at
      )
      from public.events e
      left join public.event_combo_offers o
        on o.event_id = e.id and o.archived_at is null
      where e.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'discountCodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'code', c.code,
          'description', c.description,
          'kind', c.kind,
          'audience', c.audience,
          'percentOff', c.percent_off,
          'fixedPrice', c.fixed_price,
          'fixedPriceManual', c.fixed_price_manual,
          'appliesTo', c.applies_to,
          'eventId', c.event_id,
          'eventSlug', ev.slug,
          'eventTitle', ev.title,
          'maxRedemptions', c.max_redemptions,
          'startsAt', c.starts_at,
          'expiresAt', c.expires_at,
          'active', c.active,
          'manualChannels', to_jsonb(c.manual_channels),
          'mercadoPagoEnabled', c.mercado_pago_enabled,
          'enablesManualPayment', c.enables_manual_payment,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'invitees', coalesce((
            select jsonb_agg(i.email order by i.email)
            from public.discount_code_invitations i
            where i.discount_code_id = c.id
          ), '[]'::jsonb),
          'redeemedCount', (
            select count(*) from public.discount_code_redemptions r
            where r.discount_code_id = c.id
          ),
          'unlockedCount', (
            select count(*) from public.discount_code_unlocks u
            where u.discount_code_id = c.id
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      left join public.events ev on ev.id = c.event_id
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
        and c.archived_at is null
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'discount_codes'
      and column_name = 'mercado_pago_enabled'
  ) then
    raise exception 'discount_codes.mercado_pago_enabled no quedó instalada.'
      using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.apply_discount_code_to_order(uuid,uuid,uuid,text,text)') is null
     or to_regprocedure('public.athlete_preview_discount_code(uuid,uuid,text,text,int,text)') is null
     or to_regprocedure('plu_private.offer_code_payload(discount_codes,uuid)') is null
     or to_regprocedure('public.staff_upsert_discount_code(jsonb,text)') is null
     or to_regprocedure('public.staff_get_pricing_configuration()') is null then
    raise exception 'Las funciones de canal por código no quedaron instaladas.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
