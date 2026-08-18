-- Códigos de promoción: precio fijo, alcance combo y descuento realmente cobrado — PLU ARG
--
-- Tres cambios sobre el sistema de cupones existente
-- (20260819100000_discount_codes_and_plan_expiry.sql y sucesivas):
--
--   1. BUG DE COBRO. El descuento se registraba pero no se cobraba. Los tres
--      wrappers `*_checkout` (20260824100000_manual_price_per_channel.sql)
--      corren en este orden: configure_atomic_checkout_pricing fija el precio
--      de canal -> create_*_order aplica el cupón y baja `amount` ->
--      settle_manual_checkout_pricing hace `set amount = resolve_channel_price(...)`
--      y pisa el importe con el precio de lista. La orden quedaba con
--      `discount_code` y `discount_amount` cargados, cobrando el total.
--      Verificado en la base: un cupón del 98% sobre un plan de $85.000 dejó
--      la orden en amount=85000 con discount_amount=83300.
--
--      El importe final pasa a decidirse en un solo lugar
--      (plu_private.resolve_discount_amount) y settle lo recalcula sobre el
--      precio de canal en vez de ignorarlo.
--
--   2. PRECIO FIJO. Hasta acá un cupón sólo sabía descontar un porcentaje.
--      Ahora `kind` distingue 'percent' (descuento) de 'fixed_price'
--      (promoción: "afiliación + inscripción a $120.000"). El precio fijo es
--      el mismo en todos los canales de pago — decisión de producto explícita:
--      pisa la diferencia Mercado Pago / transferencia del catálogo.
--
--   3. ALCANCE COMBO. `applies_to` gana 'combo'. Antes el combo sólo lo
--      cubría 'both', que además habilitaba el cupón para afiliación e
--      inscripción sueltas — imposible armar una promo que valga únicamente
--      para el paquete. 'both' conserva su significado actual (afiliación,
--      inscripción y combo) para no invalidar cupones ya emitidos.
--
-- Un cupón de precio fijo exige un alcance único: un mismo importe aplicado a
-- una afiliación sola y a un combo no significa lo mismo, así que
-- kind='fixed_price' con applies_to='both' queda prohibido por constraint.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists kind text not null default 'percent',
  add column if not exists fixed_price int;

-- percent_off deja de ser obligatorio: un cupón de precio fijo no lo usa.
alter table public.discount_codes alter column percent_off drop not null;

-- El check de applies_to nació sin nombre explícito, así que se busca por
-- definición en vez de asumir el nombre que autogeneró Postgres.
do $applies_to$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.discount_codes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%applies_to%'
  loop
    execute format('alter table public.discount_codes drop constraint %I', r.conname);
  end loop;
end
$applies_to$;

alter table public.discount_codes
  add constraint discount_codes_applies_to_check
  check (applies_to in ('membership', 'registration', 'combo', 'both'));

alter table public.discount_codes drop constraint if exists discount_codes_kind_check;
alter table public.discount_codes
  add constraint discount_codes_kind_check check (kind in ('percent', 'fixed_price'));

alter table public.discount_codes drop constraint if exists discount_codes_percent_off_check;
alter table public.discount_codes
  add constraint discount_codes_percent_off_check
  check (percent_off is null or (percent_off between 1 and 99));

alter table public.discount_codes drop constraint if exists discount_codes_fixed_price_check;
alter table public.discount_codes
  add constraint discount_codes_fixed_price_check
  check (fixed_price is null or (fixed_price > 0 and fixed_price <= 10000000));

-- Cada modalidad usa su propio campo y nunca los dos. El precio fijo, además,
-- exige alcance único (ver cabecera).
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
  );

-- ---------------------------------------------------------------------------
-- 2. Cálculo único del descuento
--
-- Devuelve cuánto se le resta al importe base. Con precio fijo el "descuento"
-- es la diferencia contra ese precio; si el base ya es menor o igual, da 0 y
-- el cupón se rechaza aguas arriba (no existe cupón que suba el precio).
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
    when p_kind = 'fixed_price' then greatest(p_base - coalesce(p_fixed_price, p_base), 0)
    else floor(p_base * coalesce(p_percent_off, 0) / 100.0)
  end;
$$;

revoke all on function plu_private.resolve_discount_amount(numeric, text, int, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. settle_manual_checkout_pricing: respeta el cupón ya aplicado
--
-- Recalcula el descuento sobre el precio de canal vigente en vez de restar el
-- histórico: en el camino de idempotencia la orden puede volver a liquidarse
-- contra un catálogo que cambió de precio entre los dos requests, y restar un
-- descuento viejo dejaría un importe incoherente (o negativo). El importe
-- nunca baja de 1: Mercado Pago no puede cobrar $0 y no existe flujo de orden
-- gratuita.
-- ---------------------------------------------------------------------------

create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_default_price numeric,
  p_manual_price numeric
)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_code public.discount_codes;
  v_base numeric;
  v_discount numeric := 0;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden de checkout no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.status not in ('pendiente', 'creado', 'validacion_manual')
     or v_order.method is distinct from p_payment_method then
    return v_order;
  end if;

  if v_order.payment_proof_path is not null or v_order.provider_preference_id is not null then
    return v_order;
  end if;

  v_base := coalesce(
    plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price),
    v_order.amount + coalesce(v_order.discount_amount, 0)
  );

  if v_order.discount_code_id is not null then
    select * into v_code from public.discount_codes where id = v_order.discount_code_id;
    if found then
      v_discount := least(
        plu_private.resolve_discount_amount(v_base, v_code.kind, v_code.percent_off, v_code.fixed_price),
        greatest(v_base - 1, 0)
      );
    else
      v_discount := least(coalesce(v_order.discount_amount, 0), greatest(v_base - 1, 0));
    end if;
  end if;

  update public.athlete_payment_orders
  set amount = v_base - v_discount,
      discount_amount = case when v_order.discount_code_id is null then discount_amount
        else v_discount::int end,
      manual_payment_channel = p_manual_payment_channel,
      expires_at = case
        when p_manual_payment_channel = 'cash_pitbull' then
          greatest(coalesce(expires_at, now()), plu_private.cash_checkout_deadline(v_order.id))
        when p_manual_payment_channel = 'bank_transfer' then
          least(coalesce(expires_at, now() + interval '1 day'), now() + interval '1 day')
        else expires_at
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  -- El canje guarda su propio importe para los reportes de Finanzas: si el
  -- descuento se recalculó, esa fila tiene que contar lo mismo que la orden.
  if v_order.discount_code_id is not null then
    update public.discount_code_redemptions
    set discount_amount = v_discount::int
    where payment_order_id = v_order.id
      and discount_amount is distinct from v_discount::int;
  end if;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Canje: entiende las dos modalidades
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
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_order public.athlete_payment_orders;
  v_discount int;
  v_quota_exhausted boolean := false;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;

  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.discount_code_id is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;

  -- El lock serializa el conteo y la inserción del último cupo.
  select * into v_code from public.discount_codes
  where organization_id = p_organization_id and code = upper(trim(p_code))
  for update;
  if not found
     or v_code.applies_to not in (p_applies_to, 'both')
     or (v_code.expires_at is not null and v_code.expires_at < now()) then
    raise exception 'El código no es válido.' using errcode = 'PLU20';
  end if;

  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    raise exception 'El código alcanzó el máximo de usos.' using errcode = 'PLU21';
  end if;

  if not v_code.active then
    raise exception 'El código no es válido.' using errcode = 'PLU20';
  end if;

  v_discount := plu_private.resolve_discount_amount(
    v_order.amount, v_code.kind, v_code.percent_off, v_code.fixed_price
  )::int;

  -- Un precio fijo por encima de lo que ya cuesta la compra no es un error de
  -- datos sino un cupón que no mejora este importe: se informa distinto para
  -- que el checkout pueda explicarlo.
  if v_discount <= 0 then
    raise exception 'El código no mejora el precio de esta compra.' using errcode = 'PLU24';
  end if;
  if v_discount >= v_order.amount then
    raise exception 'El código no se puede aplicar a este importe.' using errcode = 'PLU01';
  end if;

  begin
    insert into public.discount_code_redemptions(
      organization_id, discount_code_id, athlete_id, payment_order_id, discount_amount
    ) values (p_organization_id, v_code.id, p_athlete_id, v_order.id, v_discount);
  exception when unique_violation then
    raise exception 'Ya usaste este código.' using errcode = 'PLU22';
  end;

  update public.athlete_payment_orders
  set amount = amount - v_discount,
      discount_code_id = v_code.id,
      discount_code = v_code.code,
      discount_amount = v_discount,
      updated_at = now()
  where id = v_order.id;

  -- Cuando entra el último canje, el código deja de ofrecerse también para
  -- las previsualizaciones y para el panel administrativo.
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
      'discountAmount', v_discount,
      'quotaExhausted', v_quota_exhausted
    ),
    p_organization_id
  );

  return jsonb_build_object(
    'applied', true, 'discountAmount', v_discount, 'code', v_code.code, 'kind', v_code.kind
  );
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Preview: informa modalidad e importe final
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
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_discount int;
  v_already_redeemed boolean;
begin
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
    'percentOff', v_code.percent_off,
    'fixedPrice', v_code.fixed_price,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount,
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. CRUD admin
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
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_fixed_price int := nullif(p_code ->> 'fixedPrice', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_enables_manual boolean := coalesce((p_code ->> 'enablesManualPayment')::boolean, false);
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_kind not in ('percent', 'fixed_price') then
    raise exception 'La modalidad del código es inválida.' using errcode = 'PLU01';
  end if;

  -- Cada modalidad ignora el campo de la otra: así editar un cupón de un tipo
  -- al otro desde el panel no deja el valor viejo colgado.
  if v_kind = 'percent' then
    v_fixed_price := null;
  else
    v_percent := null;
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
        percent_off = v_percent,
        fixed_price = v_fixed_price,
        applies_to = v_applies,
        max_redemptions = v_max_redemptions,
        expires_at = v_expires,
        active = v_active,
        enables_manual_payment = v_enables_manual,
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
        organization_id, code, description, kind, percent_off, fixed_price, applies_to,
        max_redemptions, expires_at, active, enables_manual_payment
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_percent, v_fixed_price, v_applies, v_max_redemptions, v_expires,
        v_active, v_enables_manual
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
          'percentOff', c.percent_off,
          'fixedPrice', c.fixed_price,
          'appliesTo', c.applies_to,
          'maxRedemptions', c.max_redemptions,
          'expiresAt', c.expires_at,
          'active', c.active,
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
  v_settle text;
begin
  if to_regprocedure('plu_private.resolve_discount_amount(numeric,text,int,int)') is null then
    raise exception 'Falta el cálculo unificado de descuento.' using errcode = 'PLU01';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes' and column_name = 'kind'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes' and column_name = 'fixed_price'
  ) then
    raise exception 'La tabla de códigos no quedó con las columnas de promoción.' using errcode = 'PLU01';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.discount_codes'::regclass
      and conname = 'discount_codes_applies_to_check'
      and pg_get_constraintdef(oid) ilike '%combo%'
  ) then
    raise exception 'El alcance combo no quedó habilitado.' using errcode = 'PLU01';
  end if;

  -- La regresión que motivó esta migración: settle tiene que conocer el
  -- descuento, no sólo el precio de canal.
  select pg_get_functiondef(p.oid) into v_settle
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'settle_manual_checkout_pricing'
  limit 1;
  if v_settle is null or v_settle not ilike '%resolve_discount_amount%' then
    raise exception 'La liquidación de checkout sigue pisando el descuento.' using errcode = 'PLU01';
  end if;

  -- Datos existentes coherentes con las nuevas restricciones.
  if exists (select 1 from public.discount_codes where kind = 'percent' and percent_off is null) then
    raise exception 'Quedaron cupones de porcentaje sin porcentaje.' using errcode = 'PLU01';
  end if;
end
$verification$;
