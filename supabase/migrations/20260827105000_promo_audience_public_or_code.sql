-- Promociones con audiencia: pública, restringida por código, o apagada — PLU ARG
--
-- Hasta acá una promoción sólo sabía existir de una forma: alguien tipea el
-- código y se aplica. `active` decidía si estaba viva. Faltaba el estado del
-- medio — la promo que corre para todo el mundo sin que nadie tipee nada.
--
-- Se agrega `audience` como eje ortogonal a `active`, no como un enum único de
-- tres valores, por una razón concreta: `active = false` ya lo escribe el
-- cierre automático por cupo (`apply_discount_code_to_order`, 20260821150000) y
-- lo leen el preview, el panel y `discountCodeManualEligibility`. Un enum
-- obligaría a migrar esos cinco lectores y, peor, perdería si la promo era
-- pública o restringida cuando se agota y se la vuelve a abrir.
--
--   estado en el panel        active   audience
--   ----------------------    ------   --------
--   Deshabilitada             false    (se conserva)
--   Habilitada para todos     true     public
--   Restringida por código    true     code
--
-- CÓMO SE APLICA UNA PROMO PÚBLICA. Por el mismo camino transaccional que ya
-- existe: `apply_discount_code_to_order` con `p_code` vacío deja de ser un
-- no-op y busca la mejor promo pública. Los tres wrappers de compra
-- (`create_membership_order_v4`, `create_competition_registration_v3`,
-- `create_membership_registration_combo_order`) ya la invocan siempre, con
-- código o sin él, así que el auto-aplicado entra en los tres sin tocar ni una
-- línea del checkout: mismo lock, mismo registro de canje, misma bitácora, y
-- `settle_manual_checkout_pricing` recalculando sobre el precio de canal.
--
-- ASIMETRÍA DELIBERADA. Con código, un cupón inválido tumba la orden entera
-- (PLU20/21/22): el atleta pidió ese precio y cobrarle otro sería una estafa
-- silenciosa. Sin código, la promo pública es best-effort: si no hay ninguna,
-- si se agotó entre la búsqueda y el lock, o si el atleta ya la usó, la orden
-- sigue a precio de lista. Una promo que no aplica no puede voltear una compra
-- que nadie pidió con código.
--
-- UNA PROMO PÚBLICA NO ABRE CANALES MANUALES. `manual_channels` existe para
-- destrabar transferencia o efectivo a quien tiene un código puntual
-- (20260825110000). Una promo que corre para todos y además abre un canal es
-- exactamente lo mismo que abrir el canal desde el panel, con la diferencia de
-- que queda escondida en una fila de cupones. Prohibido por constraint: los
-- canales se abren en Acceso y habilitación, que es donde el operador los
-- busca.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists audience text not null default 'code';

alter table public.discount_codes drop constraint if exists discount_codes_audience_check;
alter table public.discount_codes
  add constraint discount_codes_audience_check check (audience in ('public', 'code'));

alter table public.discount_codes drop constraint if exists discount_codes_public_channels_check;
alter table public.discount_codes
  add constraint discount_codes_public_channels_check
  check (audience = 'code' or cardinality(manual_channels) = 0);

-- El resolver corre en cada creación de orden, con código o sin él: el índice
-- parcial lo deja en una lectura de unas pocas filas en vez de un scan de la
-- tabla de cupones.
create index if not exists discount_codes_public_lookup_idx
  on public.discount_codes (organization_id, applies_to)
  where audience = 'public' and active;

-- ---------------------------------------------------------------------------
-- 2. Resolver de promo pública
--
-- Devuelve la mejor promo aplicable a este atleta y este importe, o NULL. El
-- criterio es el que espera quien compra: la que más le baja el precio. El
-- desempate por `created_at desc` hace la elección determinística — dos promos
-- que ahorran lo mismo no pueden alternar entre el preview y el cobro.
--
-- Filtra acá todo lo que después vuelve a chequearse bajo lock: vigencia, cupo
-- global, uso previo del atleta y que el ahorro sea real (>= 1 y que no deje la
-- orden en 0 — Mercado Pago no cobra $0 y no existe flujo de orden gratuita).
-- ---------------------------------------------------------------------------

create or replace function plu_private.resolve_public_promo(
  p_organization_id uuid,
  p_applies_to text,
  p_athlete_id uuid,
  p_base numeric
)
returns public.discount_codes
language sql
stable
set search_path = public, plu_private
as $$
  select c.*
  from public.discount_codes c
  where c.organization_id = p_organization_id
    and c.audience = 'public'
    and c.active
    and c.applies_to in (p_applies_to, 'both')
    and (c.expires_at is null or c.expires_at > now())
    and (
      c.max_redemptions is null
      or (
        select count(*) from public.discount_code_redemptions r
        where r.discount_code_id = c.id
      ) < c.max_redemptions
    )
    and not exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = c.id and r.athlete_id = p_athlete_id
    )
    and plu_private.resolve_discount_amount(p_base, c.kind, c.percent_off, c.fixed_price)
        between 1 and greatest(p_base - 1, 0)
  order by
    plu_private.resolve_discount_amount(p_base, c.kind, c.percent_off, c.fixed_price) desc,
    c.created_at desc
  limit 1;
$$;

revoke all on function plu_private.resolve_public_promo(uuid, text, uuid, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Canje: con código (estricto) o promo pública (best-effort)
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
      p_organization_id, p_applies_to, p_athlete_id, v_order.amount
    );
    if v_code.id is null then
      return null;
    end if;
    -- Relectura bajo lock: entre el resolver y acá otra transacción pudo
    -- llevarse el último cupo o apagar la promo desde el panel.
    v_promo_id := v_code.id;
    select * into v_code from public.discount_codes where id = v_promo_id for update;
    if not found or v_code.audience <> 'public'
       or (v_code.expires_at is not null and v_code.expires_at < now()) then
      return null;
    end if;
  else
    -- El lock serializa el conteo y la inserción del último cupo.
    select * into v_code from public.discount_codes
    where organization_id = p_organization_id and code = upper(trim(p_code))
    for update;
    if not found
       or v_code.applies_to not in (p_applies_to, 'both')
       or (v_code.expires_at is not null and v_code.expires_at < now()) then
      raise exception 'El código no es válido.' using errcode = 'PLU20';
    end if;
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

  v_discount := plu_private.resolve_discount_amount(
    v_order.amount, v_code.kind, v_code.percent_off, v_code.fixed_price
  )::int;

  -- Un precio fijo por encima de lo que ya cuesta la compra no es un error de
  -- datos sino un cupón que no mejora este importe: se informa distinto para
  -- que el checkout pueda explicarlo.
  if v_discount <= 0 then
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

  -- Cuando entra el último canje, la promo deja de ofrecerse también para las
  -- previsualizaciones, para el resolver público y para el panel.
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
      'source', case when v_automatic then 'public_promo' else 'code' end,
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
-- 4. Preview: con código o sin él
--
-- Sin código devuelve la promo pública que se va a aplicar sola, con
-- `source = 'public_promo'`, para que el checkout pueda mostrar el precio real
-- antes de confirmar en vez de anunciar el de lista y cobrar otro. El importe
-- que se cobra sigue saliendo únicamente de la orden.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_preview_discount_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_applies_to text,
  p_base_amount int
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
  v_automatic boolean := p_code is null or length(trim(p_code)) = 0;
begin
  if v_automatic then
    v_code := plu_private.resolve_public_promo(
      p_organization_id, p_applies_to, p_athlete_id, p_base_amount
    );
    if v_code.id is null then
      return jsonb_build_object('valid', false, 'reason', 'no_public_promo');
    end if;
  else
    select * into v_code from public.discount_codes
    where organization_id = p_organization_id and code = upper(trim(p_code));
    if not found then
      return jsonb_build_object('valid', false, 'reason', 'not_found');
    end if;
    if not v_code.active then
      return jsonb_build_object('valid', false, 'reason', 'inactive');
    end if;
    if v_code.expires_at is not null and v_code.expires_at < now() then
      return jsonb_build_object('valid', false, 'reason', 'expired');
    end if;
    if v_code.applies_to not in (p_applies_to, 'both') then
      return jsonb_build_object('valid', false, 'reason', 'not_applicable');
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
    p_base_amount, v_code.kind, v_code.percent_off, v_code.fixed_price
  )::int;
  if v_discount <= 0 or v_discount >= p_base_amount then
    return jsonb_build_object('valid', false, 'reason', 'no_savings');
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', v_code.code,
    'kind', v_code.kind,
    'audience', v_code.audience,
    'source', case when v_automatic then 'public_promo' else 'code' end,
    'description', v_code.description,
    'percentOff', v_code.percent_off,
    'fixedPrice', v_code.fixed_price,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount,
    'manualChannels', to_jsonb(v_code.manual_channels),
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Alta y edición: la audiencia entra por el mismo upsert
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
  v_applies text := p_code ->> 'appliesTo';
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_manual_channels text[];
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_kind not in ('percent', 'fixed_price') then
    raise exception 'La modalidad del código es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia de la promoción es inválida.' using errcode = 'PLU01';
  end if;

  -- Cada modalidad ignora el campo de la otra: así editar un cupón de un tipo
  -- al otro desde el panel no deja el valor viejo colgado.
  if v_kind = 'percent' then
    v_fixed_price := null;
  else
    v_percent := null;
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

  -- Ver la cabecera: una promo pública que además abre un canal manual es el
  -- interruptor de canal escondido en otra pantalla.
  if v_audience = 'public' and cardinality(v_manual_channels) > 0 then
    raise exception 'Una promoción pública no puede habilitar medios de pago manuales. Abrilos desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_applies not in ('membership', 'registration', 'combo', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código son inválidos.' using errcode = 'PLU01';
  end if;

  if v_kind = 'percent' and (v_percent is null or v_percent < 1 or v_percent > 99) then
    raise exception 'El porcentaje de descuento debe estar entre 1 y 99.' using errcode = 'PLU01';
  end if;

  if v_kind = 'fixed_price' then
    if v_fixed_price is null or v_fixed_price <= 0 or v_fixed_price > 10000000 then
      raise exception 'El precio promocional es inválido.' using errcode = 'PLU01';
    end if;
    if v_applies = 'both' then
      raise exception 'Un código con precio promocional necesita un alcance único: afiliación, inscripción o combo.'
        using errcode = 'PLU01';
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
        applies_to = v_applies,
        max_redemptions = v_max_redemptions,
        expires_at = v_expires,
        active = v_active,
        manual_channels = v_manual_channels,
        updated_at = now()
    where id = v_id
    returning * into v_result;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.updated', 'discount_code', v_result.id::text, 'staff', p_actor,
      jsonb_build_object('before', v_before, 'after', to_jsonb(v_result)), v_organization_id
    );
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price, applies_to,
        max_redemptions, expires_at, active, manual_channels
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_applies, v_max_redemptions, v_expires,
        v_active, v_manual_channels
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código con ese nombre.' using errcode = 'PLU13';
    end;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.created', 'discount_code', v_result.id::text, 'staff', p_actor,
      to_jsonb(v_result), v_organization_id
    );
  end if;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Cambio de estado en un solo lugar
--
-- El panel tenía un interruptor booleano que podía dejar una promo "activa" sin
-- cupo disponible: el cierre automático la apaga al entrar el último canje, y
-- volver a prenderla la mostraba habilitada mientras el canje la seguía
-- rechazando con PLU21. Un control que miente es peor que no tenerlo, así que
-- reactivar sin cupo se rechaza acá con el motivo y la salida (ampliar el
-- cupo), en vez de escribir un `true` sin efecto.
--
-- `p_audience` nulo conserva la audiencia actual: así el toggle de encendido y
-- el cambio de audiencia usan la misma RPC sin pisarse.
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_discount_code_state(
  p_code_id uuid,
  p_active boolean,
  p_audience text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_before jsonb;
  v_audience text;
  v_redeemed int;
begin
  select * into v_code from public.discount_codes where id = p_code_id for update;
  if not found then
    raise exception 'La promoción no existe.' using errcode = 'PLU02';
  end if;
  v_before := to_jsonb(v_code);
  v_audience := coalesce(nullif(trim(coalesce(p_audience, '')), ''), v_code.audience);

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia de la promoción es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience = 'public' and cardinality(v_code.manual_channels) > 0 then
    raise exception 'Esta promoción habilita medios de pago manuales: no puede ser pública. Quitá los canales o abrilos desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  if p_active and v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = p_code_id;
    if v_redeemed >= v_code.max_redemptions then
      raise exception 'La promoción agotó su cupo (% de %). Ampliá el cupo para volver a habilitarla.',
        v_redeemed, v_code.max_redemptions using errcode = 'PLU21';
    end if;
  end if;

  update public.discount_codes
  set active = p_active,
      audience = v_audience,
      updated_at = now()
  where id = p_code_id
  returning * into v_code;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.status_changed', 'discount_code', v_code.id::text, 'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_code)), v_code.organization_id
  );

  return to_jsonb(v_code);
end;
$$;

revoke all on function public.staff_set_discount_code_state(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_discount_code_state(uuid, boolean, text, text)
  to service_role;

-- El setter anterior queda como alias: una API desplegada antes que esta
-- migración sigue apagando y prendiendo sin conocer la audiencia.
create or replace function public.staff_set_discount_code_active(
  p_code_id uuid,
  p_active boolean,
  p_actor text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.staff_set_discount_code_state(p_code_id, p_active, null, p_actor);
$$;

revoke all on function public.staff_set_discount_code_active(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_discount_code_active(uuid, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Baja de la oferta combo
--
-- El combo era la única fila del catálogo económico que se podía crear y editar
-- pero no dar de baja: `staff_save_event_combo_offer` la deja inactiva, y la
-- fila queda para siempre. Con canjes registrados no se borra —el FK lo
-- impediría con un error ilegible— y se explica la alternativa.
-- ---------------------------------------------------------------------------

create or replace function public.staff_delete_event_combo_offer(
  p_event_slug text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_event public.events;
  v_offer public.event_combo_offers;
begin
  select * into v_event from public.events
  where organization_id = v_org and slug = btrim(coalesce(p_event_slug, ''));
  if not found then
    raise exception 'El torneo seleccionado no existe.' using errcode = 'PLU02';
  end if;

  select * into v_offer from public.event_combo_offers
  where event_id = v_event.id for update;
  if not found then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  if exists (
    select 1 from public.athlete_payment_orders o
    where o.concept = 'combo'
      and o.organization_id = v_org
      and exists (
        select 1 from public.event_registrations r
        where r.payment_order_id = o.id and r.event_id = v_event.id
      )
  ) then
    raise exception 'No se puede eliminar un combo con órdenes registradas. Desactivalo en su lugar.'
      using errcode = 'PLU23';
  end if;

  delete from public.event_combo_offers where id = v_offer.id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'event_combo_offer.deleted', 'event_combo_offer', v_offer.id::text, 'staff', p_actor,
    to_jsonb(v_offer), v_org
  );

  return jsonb_build_object('deleted', true, 'id', v_offer.id);
end;
$$;

revoke all on function public.staff_delete_event_combo_offer(text, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_event_combo_offer(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. El panel lee la audiencia junto al resto del catálogo
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
              'startsAt', o.starts_at,
              'endsAt', o.ends_at,
              'updatedAt', o.updated_at
            )
          end
        ) order by e.starts_at
      )
      from public.events e
      left join public.event_combo_offers o on o.event_id = e.id
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
          'appliesTo', c.applies_to,
          'maxRedemptions', c.max_redemptions,
          'expiresAt', c.expires_at,
          'active', c.active,
          'manualChannels', to_jsonb(c.manual_channels),
          'enablesManualPayment', c.enables_manual_payment,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'redeemedCount', (
            select count(*) from public.discount_code_redemptions r
            where r.discount_code_id = c.id
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_apply text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes' and column_name = 'audience'
  ) then
    raise exception 'Falta la audiencia de la promoción.' using errcode = 'PLU01';
  end if;

  if to_regprocedure('plu_private.resolve_public_promo(uuid,text,uuid,numeric)') is null
     or to_regprocedure('public.staff_set_discount_code_state(uuid,boolean,text,text)') is null
     or to_regprocedure('public.staff_delete_event_combo_offer(text,text)') is null then
    raise exception 'Faltan las funciones de promoción pública o de baja del combo.'
      using errcode = 'PLU01';
  end if;

  -- La regresión que motiva esta migración: sin código, el canje tiene que
  -- buscar la promo pública en vez de devolver null.
  select pg_get_functiondef(p.oid) into v_apply
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_discount_code_to_order'
  limit 1;
  if v_apply is null or v_apply not ilike '%resolve_public_promo%' then
    raise exception 'El canje no resuelve promociones públicas.' using errcode = 'PLU01';
  end if;

  -- Las promos existentes conservan su significado: todas eran por código.
  if exists (select 1 from public.discount_codes where audience is null) then
    raise exception 'Quedaron promociones sin audiencia.' using errcode = 'PLU01';
  end if;
  if exists (
    select 1 from public.discount_codes
    where audience = 'public' and cardinality(manual_channels) > 0
  ) then
    raise exception 'Hay promociones públicas que abren canales manuales.' using errcode = 'PLU01';
  end if;
end
$verification$;
