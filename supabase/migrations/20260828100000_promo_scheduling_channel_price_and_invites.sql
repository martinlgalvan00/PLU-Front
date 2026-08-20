-- Promociones: programación, precio por canal y exclusividad nominal — PLU ARG
--
-- Tres huecos que quedaron después de darle audiencia y archivo a las
-- promociones (20260827105000, 20260827110000):
--
--   1. NO HABÍA FECHA DE INICIO. `discount_codes` sólo tenía `expires_at`, así
--      que una oferta preparada para arrancar el viernes había que prenderla a
--      mano el viernes. La oferta combo ya tenía ventana completa
--      (`starts_at`/`ends_at`, 20260812130000): esto le da el mismo eje a la
--      promoción. `starts_at` nulo = vigente desde que se enciende, que es el
--      comportamiento actual de todas las filas existentes.
--
--   2. EL PRECIO PROMOCIONAL ERA UNO SOLO PARA TODOS LOS CANALES. `kind =
--      'fixed_price'` fija el importe final de la compra, pero el catálogo sí
--      sabe cobrar distinto por canal (`membership_plans.manual_price`,
--      20260824100000). Una promo no podía: quien pactaba "$120.000" lo pactaba
--      para Mercado Pago y para transferencia por igual, sin poder separarlos.
--
--      Se agrega `fixed_price_manual`: el importe final para los canales
--      manuales (transferencia y efectivo). Nulo = cobra lo mismo que
--      `fixed_price` en cualquier canal — el caso más común y el default.
--
--      NO SE EXIGE QUE SEA MENOR QUE `fixed_price`. Pactar $120.000 por Mercado
--      Pago y $120.000 por transferencia es un acuerdo válido, y también lo es
--      cobrar más por el canal manual si el acuerdo fue ese. El único tope es
--      el de cualquier importe (> 0, <= 10.000.000) y la regla que ya existía:
--      el descuento nunca puede dejar la orden en $0 (Mercado Pago no cobra eso
--      y no hay flujo de orden gratuita).
--
--      Wise queda afuera a propósito: cotiza en USD por variable de entorno y
--      su branch en `settle_manual_checkout_pricing` sale antes de tocar
--      cupones (20260827120000).
--
--   3. LA EXCLUSIVIDAD ERA "HAY QUE SABER EL CÓDIGO". Con `audience = 'code'`
--      cualquiera que reciba el texto lo usa, y el único límite era el tope
--      global de canjes. No había forma de reservar una promo para personas
--      determinadas — el caso de un acuerdo con un gimnasio, una preventa a
--      quienes compitieron el año pasado, o un precio pactado con un atleta.
--
--      Se agrega `discount_code_invitations`: la lista de emails habilitados.
--      SIN LISTA la promo se comporta igual que hoy (abierta a quien tenga el
--      código, o a todos si es pública). CON LISTA sólo la usan esos emails, y
--      eso es ortogonal a `audience`: una promo pública con lista se aplica
--      sola, pero únicamente a las personas invitadas.
--
--      La exclusividad se deriva de la lista, no de un flag aparte: no existe
--      el estado "marqué exclusiva y me olvidé de cargar a nadie", que dejaría
--      una promo abierta creyendo que estaba cerrada.
--
-- IMPORTANTE: `CREATE OR REPLACE FUNCTION` con un parámetro nuevo NO reemplaza
-- la función existente — crea un overload aparte (el equipo ya pisó esto en
-- 20260824120000 y 20260824130000). Por eso `resolve_public_promo` y
-- `athlete_preview_discount_code` llevan su `drop function if exists` con la
-- firma vigente antes del `create or replace` con la firma nueva.

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists starts_at timestamptz,
  add column if not exists fixed_price_manual int;

-- Mismo rango que `fixed_price` y que cualquier importe del catálogo. No hay
-- CHECK contra `fixed_price`: ver el punto 2 de la cabecera.
alter table public.discount_codes drop constraint if exists discount_codes_fixed_price_manual_check;
alter table public.discount_codes
  add constraint discount_codes_fixed_price_manual_check
  check (fixed_price_manual is null or (fixed_price_manual > 0 and fixed_price_manual <= 10000000));

-- Un precio manual sin precio promocional no significa nada: la modalidad
-- 'percent' descuenta un porcentaje sobre el precio de cada canal, que ya sale
-- distinto de `resolve_channel_price`.
alter table public.discount_codes drop constraint if exists discount_codes_fixed_price_manual_kind_check;
alter table public.discount_codes
  add constraint discount_codes_fixed_price_manual_kind_check
  check (fixed_price_manual is null or kind = 'fixed_price');

-- Una ventana que cierra antes de abrir es una promo que nadie puede usar.
alter table public.discount_codes drop constraint if exists discount_codes_window_check;
alter table public.discount_codes
  add constraint discount_codes_window_check
  check (starts_at is null or expires_at is null or expires_at > starts_at);

-- El resolver de promo pública filtra por ventana además de por audiencia.
drop index if exists public.discount_codes_public_lookup_idx;
create index if not exists discount_codes_public_lookup_idx
  on public.discount_codes (organization_id, applies_to, starts_at, expires_at)
  where audience = 'public' and active and archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. Lista de invitados
--
-- Por email y no por athlete_id: Administración reparte la exclusividad antes
-- de que la persona tenga cuenta (un acuerdo se cierra por mail, la cuenta se
-- crea después). `athletes` ya tiene índice por (organization_id, lower(email))
-- desde 20260722130000, así que el join de resolución es barato.
-- ---------------------------------------------------------------------------

create table if not exists public.discount_code_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  -- Normalizado en la escritura: la comparación contra el email del atleta es
  -- por igualdad y no por ilike, para que pueda usar el índice.
  constraint discount_code_invitations_email_check
    check (email = lower(email) and email like '%_@_%._%' and email not like '% %'),
  constraint discount_code_invitations_uidx unique (discount_code_id, email)
);

alter table public.discount_code_invitations enable row level security;
revoke all on public.discount_code_invitations from public, anon, authenticated;
grant select, insert, delete on public.discount_code_invitations to service_role;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

-- Precio promocional efectivo según el canal. `manual_link` es el `method` con
-- el que se guardan transferencia, efectivo y Wise (ver storagePaymentMethod en
-- server/modules/pricing/checkoutPricePolicy.js) — el mismo criterio que usa
-- `resolve_channel_price` para elegir el precio de catálogo, así que promo y
-- catálogo no pueden discrepar sobre qué es un canal manual.
create or replace function plu_private.effective_fixed_price(
  p_payment_method text,
  p_fixed_price int,
  p_fixed_price_manual int
)
returns int
language sql
immutable
as $$
  select case
    when p_payment_method = 'manual_link' and p_fixed_price_manual is not null
      then p_fixed_price_manual
    else p_fixed_price
  end;
$$;

revoke all on function plu_private.effective_fixed_price(text, int, int)
  from public, anon, authenticated;

-- Sin lista, la promo es abierta (comportamiento previo a esta migración).
-- Con lista, sólo la usan los emails invitados.
create or replace function plu_private.athlete_allowed_by_invitations(
  p_code_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
stable
set search_path = public, plu_private
as $$
  select not exists (
    select 1 from public.discount_code_invitations i
    where i.discount_code_id = p_code_id
  ) or exists (
    select 1
    from public.discount_code_invitations i
    join public.athletes a on a.id = p_athlete_id
    where i.discount_code_id = p_code_id
      and i.email = lower(trim(a.email))
  );
$$;

revoke all on function plu_private.athlete_allowed_by_invitations(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. resolve_public_promo: ventana, invitación y precio por canal
--
-- Gana el descuento más grande del canal por el que se está pagando. Sin
-- `p_payment_method` se comporta como antes y usa `fixed_price`.
-- ---------------------------------------------------------------------------

drop function if exists plu_private.resolve_public_promo(uuid, text, uuid, numeric);

create or replace function plu_private.resolve_public_promo(
  p_organization_id uuid,
  p_applies_to text,
  p_athlete_id uuid,
  p_base numeric,
  p_payment_method text default null
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
    and c.archived_at is null
    and c.applies_to in (p_applies_to, 'both')
    and (c.starts_at is null or c.starts_at <= now())
    and (c.expires_at is null or c.expires_at > now())
    and plu_private.athlete_allowed_by_invitations(c.id, p_athlete_id)
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
    and plu_private.resolve_discount_amount(
      p_base, c.kind, c.percent_off,
      plu_private.effective_fixed_price(p_payment_method, c.fixed_price, c.fixed_price_manual)
    ) between 1 and greatest(p_base - 1, 0)
  order by
    plu_private.resolve_discount_amount(
      p_base, c.kind, c.percent_off,
      plu_private.effective_fixed_price(p_payment_method, c.fixed_price, c.fixed_price_manual)
    ) desc,
    c.created_at desc
  limit 1;
$$;

revoke all on function plu_private.resolve_public_promo(uuid, text, uuid, numeric, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. apply_discount_code_to_order
--
-- El canal sale de la orden (`v_order.method`), que es el mismo valor que
-- después vuelve a usar `settle_manual_checkout_pricing`: si acá se resolviera
-- con otro canal, el importe cambiaría entre el alta y el settle.
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
-- 6. settle_manual_checkout_pricing: el re-cálculo del canal manual también
-- tiene que usar el precio promocional del canal. Sin esto una promo con
-- `fixed_price_manual` se aplicaba bien al crear la orden y se pisaba con
-- `fixed_price` al asentar el canal. Firma sin cambios respecto de
-- 20260827120000 — el resto del cuerpo queda igual.
-- ---------------------------------------------------------------------------

create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_default_price numeric,
  p_manual_price numeric,
  p_currency text default null
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

  -- Wise: precio propio en USD, sin cupón ni resolve_channel_price -- no hay
  -- equivalente ARS y los cupones no aplican a este canal.
  if p_manual_payment_channel = 'wise_transfer' then
    update public.athlete_payment_orders
    set amount = coalesce(p_default_price, amount),
        currency = coalesce(p_currency, currency),
        manual_payment_channel = p_manual_payment_channel,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
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
        plu_private.resolve_discount_amount(
          v_base, v_code.kind, v_code.percent_off,
          plu_private.effective_fixed_price(
            p_payment_method, v_code.fixed_price, v_code.fixed_price_manual
          )
        ),
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

  if v_order.discount_code_id is not null then
    update public.discount_code_redemptions
    set discount_amount = v_discount::int
    where payment_order_id = v_order.id
      and discount_amount is distinct from v_discount::int;
  end if;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. athlete_preview_discount_code: recibe el canal y devuelve los motivos
-- nuevos. `not_started` y `not_invited` son distintos de `not_found`: el código
-- existe y es correcto, lo que falla es cuándo o quién.
-- ---------------------------------------------------------------------------

drop function if exists public.athlete_preview_discount_code(uuid, uuid, text, text, int);

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
-- 8. staff_upsert_discount_code: ventana, precio manual y lista de invitados
--
-- `invitees` ausente NO toca la lista: un payload parcial no puede convertir
-- una promo exclusiva en abierta por omisión. Un array presente (incluso vacío)
-- la reemplaza entera — vacío es "abrila a todos".
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
  if v_kind not in ('percent', 'fixed_price') then
    raise exception 'La modalidad del código es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia de la promoción es inválida.' using errcode = 'PLU01';
  end if;

  -- Cada modalidad ignora los campos de la otra: así editar un cupón de un tipo
  -- al otro desde el panel no deja el valor viejo colgado.
  if v_kind = 'percent' then
    v_fixed_price := null;
    v_fixed_price_manual := null;
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
    -- manual puede ser igual, menor o mayor. Ver el punto 2 de la cabecera.
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
-- 9. staff_get_pricing_configuration: el panel necesita ver la ventana, el
-- precio por canal y a quién está reservada la promo.
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
          'fixedPriceManual', c.fixed_price_manual,
          'appliesTo', c.applies_to,
          'maxRedemptions', c.max_redemptions,
          'startsAt', c.starts_at,
          'expiresAt', c.expires_at,
          'active', c.active,
          'manualChannels', to_jsonb(c.manual_channels),
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
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
        and c.archived_at is null
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
  v_settle text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'starts_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'fixed_price_manual'
  ) then
    raise exception 'Faltan las columnas de ventana o precio manual de la promoción.'
      using errcode = 'PLU01';
  end if;

  if to_regclass('public.discount_code_invitations') is null then
    raise exception 'Falta la tabla de invitados de la promoción.' using errcode = 'PLU01';
  end if;

  -- El overload viejo tiene que quedar dropeado: si sobrevive, los llamadores
  -- que no pasan el canal siguen resolviendo con el precio equivocado.
  if to_regprocedure('plu_private.resolve_public_promo(uuid,text,uuid,numeric)') is not null then
    raise exception 'Quedó vivo el overload viejo de resolve_public_promo.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.athlete_preview_discount_code(uuid,uuid,text,text,int)') is not null then
    raise exception 'Quedó vivo el overload viejo de athlete_preview_discount_code.'
      using errcode = 'PLU01';
  end if;
  if to_regprocedure('plu_private.resolve_public_promo(uuid,text,uuid,numeric,text)') is null then
    raise exception 'No quedó creada la firma nueva de resolve_public_promo.' using errcode = 'PLU01';
  end if;

  -- El canje y el settle tienen que resolver el precio promocional por canal:
  -- si uno de los dos usa `fixed_price` a secas, el importe cambia entre el
  -- alta de la orden y el asentamiento del canal manual.
  select pg_get_functiondef(p.oid) into v_apply
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_discount_code_to_order' limit 1;
  if v_apply is null or v_apply not ilike '%effective_fixed_price%' then
    raise exception 'El canje no resuelve el precio promocional por canal.' using errcode = 'PLU01';
  end if;
  if v_apply not ilike '%athlete_allowed_by_invitations%' then
    raise exception 'El canje no verifica la lista de invitados.' using errcode = 'PLU01';
  end if;

  select pg_get_functiondef(p.oid) into v_settle
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'settle_manual_checkout_pricing' limit 1;
  if v_settle is null or v_settle not ilike '%effective_fixed_price%' then
    raise exception 'El settle manual no resuelve el precio promocional por canal.'
      using errcode = 'PLU01';
  end if;

  -- Ninguna fila existente puede haber quedado con una ventana imposible.
  if exists (
    select 1 from public.discount_codes
    where starts_at is not null and expires_at is not null and expires_at <= starts_at
  ) then
    raise exception 'Hay promociones con una ventana que cierra antes de abrir.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
