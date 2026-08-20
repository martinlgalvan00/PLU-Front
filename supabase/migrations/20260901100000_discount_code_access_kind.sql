-- Código de descuento sin descuento: kind = 'access' — PLU ARG
--
-- Hoy hay dos sistemas de código que no se hablan: `event_combo_offers.access_code`
-- (una sola columna de texto plano por evento, sin límite de usos, sin
-- vencimiento propio) desbloquea el combo, y `discount_codes` (con límite de
-- usos, ventana, invitados) sólo sabe descontar. Un código pensado para
-- desbloquear el combo, sin descontar nada, no tenía dónde vivir salvo el
-- `access_code` del evento.
--
-- Se agrega `kind = 'access'` a `discount_codes`: un código sin `percent_off`
-- ni `fixed_price`, con `applies_to` restringido a 'combo' (no 'both': ver el
-- comentario de la constraint más abajo), que redime
-- igual que cualquier otro (cuenta contra `max_redemptions`, respeta ventana e
-- invitados, queda auditado) pero no descuenta — sirve como prueba de acceso
-- alternativa al `access_code` del evento, resuelta en la capa de aplicación
-- (`server/services/registrationAccessService.js`), no acá.
--
-- No se toca `event_combo_offers.access_code` ni su validación: este es un
-- camino adicional, no un reemplazo.
--
-- Nota de disciplina de migraciones de este repo: `create or replace function`
-- con una firma nueva NO reemplaza la función existente, crea un overload
-- aparte. Las tres funciones tocadas acá (`apply_discount_code_to_order`,
-- `athlete_preview_discount_code`, `staff_upsert_discount_code`) mantienen
-- exactamente la firma vigente desde 20260828100000, así que no hace falta
-- ningún `drop function` — es un `create or replace` puro sobre el mismo tipo.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes drop constraint if exists discount_codes_kind_check;
alter table public.discount_codes
  add constraint discount_codes_kind_check
  check (kind in ('percent', 'fixed_price', 'access'));

-- Superset de la constraint anterior: ninguna fila existente (todas
-- 'percent'/'fixed_price') deja de cumplirla.
alter table public.discount_codes drop constraint if exists discount_codes_kind_shape_check;
alter table public.discount_codes
  add constraint discount_codes_kind_shape_check
  check (
    (kind = 'percent' and percent_off is not null and fixed_price is null)
    or (
      kind = 'fixed_price'
      and fixed_price is not null
      and percent_off is null
      and applies_to in ('membership', 'registration', 'combo')
    )
    or (
      kind = 'access'
      and percent_off is null
      and fixed_price is null
      -- Sin 'both' a propósito: un acceso 'both' se podría previsualizar (y
      -- redimir, gastando cupo) contra una compra de afiliación o inscripción
      -- sueltas, donde no existe ningún candado que desbloquear — un canje sin
      -- ningún efecto real. Restringido a 'combo', el único lugar donde este
      -- kind tiene sentido.
      and applies_to = 'combo'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Cálculo de descuento: 'access' nunca descuenta
--
-- El `else` ya daba 0 para 'access' (percent_off null -> floor(base*0/100)),
-- pero una rama explícita documenta la intención y no depende de que el else
-- seguido cubriendo ese caso si el cálculo de 'percent' cambia el día de mañana.
-- ---------------------------------------------------------------------------

create or replace function plu_private.resolve_discount_amount(
  p_base numeric,
  p_kind text,
  p_percent_off int,
  p_fixed_price int
)
returns numeric
language sql
immutable
as $$
  select case
    when p_base is null or p_base <= 0 then 0
    when p_kind = 'access' then 0
    when p_kind = 'fixed_price' then greatest(p_base - coalesce(p_fixed_price, p_base), 0)
    else floor(p_base * coalesce(p_percent_off, 0) / 100.0)
  end;
$$;

revoke all on function plu_private.resolve_discount_amount(numeric, text, int, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. apply_discount_code_to_order: no rechazar "no mejora el precio" para
-- 'access' — un código de acceso deliberadamente no mejora nada, y aun así es
-- una redención válida (cuenta cupo, queda auditada). El resto de las guardas
-- (vigencia, invitados, cupo, ya usado) corre exactamente igual que para
-- cualquier otro código: no se duplica lógica, se ramifica un solo chequeo.
-- Cuerpo idéntico a 20260828100000 salvo esa rama.
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

  v_discount := plu_private.resolve_discount_amount(
    v_order.amount, v_code.kind, v_code.percent_off,
    plu_private.effective_fixed_price(v_order.method, v_code.fixed_price, v_code.fixed_price_manual)
  )::int;

  -- Un código 'access' da 0 a propósito: no es "no mejora el precio", es un
  -- desbloqueo. El resto de los kinds sigue rechazando un descuento nulo.
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
-- 4. athlete_preview_discount_code: mismo tratamiento sobre "no_savings".
-- Cuerpo idéntico a 20260828100000 salvo esa rama.
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
      return jsonb_build_object('valid', false, 'reason', 'not_applicable');
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
    'startsAt', v_code.starts_at,
    'expiresAt', v_code.expires_at,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount,
    'manualChannels', to_jsonb(v_code.manual_channels),
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. staff_upsert_discount_code: admite kind='access'. Cuerpo idéntico a
-- 20260828100000 salvo la validación de kind, el vaciado cruzado de campos de
-- descuento y la restricción de alcance.
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
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_starts timestamptz := nullif(p_code ->> 'startsAt', '')::timestamptz;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_manual_channels text[];
  v_invitees text[];
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_kind not in ('percent', 'fixed_price', 'access') then
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
  elsif v_kind = 'fixed_price' then
    v_percent := null;
  else
    v_percent := null;
    v_fixed_price := null;
    v_fixed_price_manual := null;
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

  if v_kind = 'percent' and (v_percent is null or v_percent < 1 or v_percent > 99) then
    raise exception 'El porcentaje de descuento debe estar entre 1 y 99.' using errcode = 'PLU01';
  end if;

  if v_kind = 'fixed_price' then
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
    if v_applies = 'both' then
      raise exception 'Un código con precio promocional necesita un alcance único: afiliación, inscripción o combo.'
        using errcode = 'PLU01';
    end if;
  end if;

  -- Un código de acceso puro no tiene sentido fuera del combo: ver el
  -- comentario de discount_codes_kind_shape_check sobre por qué 'both' queda
  -- afuera.
  if v_kind = 'access' and v_applies <> 'combo' then
    raise exception 'Un código de acceso sólo puede aplicarse al combo.' using errcode = 'PLU01';
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
        max_redemptions = v_max_redemptions,
        starts_at = v_starts,
        expires_at = v_expires,
        active = v_active,
        manual_channels = v_manual_channels,
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, max_redemptions, starts_at, expires_at, active,
        manual_channels
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels
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
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_test_id uuid;
  v_apply text;
  v_preview text;
  v_upsert text;
begin
  -- La constraint acepta 'access' con applies_to combo/both y ambos campos de
  -- descuento en null.
  insert into public.discount_codes (
    organization_id, code, kind, applies_to, active
  ) values (
    v_org, 'VERIFY-ACCESS-KIND', 'access', 'combo', false
  ) returning id into v_test_id;

  if plu_private.resolve_discount_amount(85000, 'access', null, null) <> 0 then
    raise exception 'resolve_discount_amount no da 0 para kind=access.' using errcode = 'PLU01';
  end if;

  delete from public.discount_codes where id = v_test_id;

  -- La constraint rechaza 'access' con percent_off seteado.
  begin
    insert into public.discount_codes (
      organization_id, code, kind, percent_off, applies_to, active
    ) values (
      v_org, 'VERIFY-ACCESS-KIND-BAD', 'access', 10, 'combo', false
    );
    raise exception 'La constraint no rechazó un código access con percent_off.'
      using errcode = 'PLU01';
  exception when check_violation then
    null;
  end;

  -- Las tres funciones tienen que seguir existiendo con la misma firma (sin
  -- overload nuevo) y contemplar 'access' en su cuerpo.
  select pg_get_functiondef(p.oid) into v_apply
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_discount_code_to_order' limit 1;
  if v_apply is null or v_apply not ilike '%v_code.kind <> ''access''%' then
    raise exception 'apply_discount_code_to_order no contempla kind=access.' using errcode = 'PLU01';
  end if;

  select pg_get_functiondef(p.oid) into v_preview
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_preview_discount_code' limit 1;
  if v_preview is null or v_preview not ilike '%v_code.kind <> ''access''%' then
    raise exception 'athlete_preview_discount_code no contempla kind=access.' using errcode = 'PLU01';
  end if;

  select pg_get_functiondef(p.oid) into v_upsert
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'staff_upsert_discount_code' limit 1;
  if v_upsert is null or v_upsert not ilike '%''access''%' then
    raise exception 'staff_upsert_discount_code no contempla kind=access.' using errcode = 'PLU01';
  end if;

  -- No puede haber quedado ningún overload nuevo de las tres funciones.
  if to_regprocedure('public.apply_discount_code_to_order(uuid,uuid,uuid,text,text)') is null then
    raise exception 'apply_discount_code_to_order perdió su firma vigente.' using errcode = 'PLU01';
  end if;
  if to_regprocedure(
    'public.athlete_preview_discount_code(uuid,uuid,text,text,int,text)'
  ) is null then
    raise exception 'athlete_preview_discount_code perdió su firma vigente.' using errcode = 'PLU01';
  end if;
end
$verification$;
