-- Combo con código de acceso, y baja de promociones ya canjeadas — PLU ARG
--
-- Dos huecos que quedaron abiertos después de darle audiencia a las
-- promociones (20260827105000_promo_audience_public_or_code.sql):
--
--   1. LA OFERTA COMBO NO TENÍA AUDIENCIA. Sólo sabía estar prendida o apagada
--      para todo el mundo. No había forma de armar un combo que vieran
--      únicamente quienes reciben un código — el caso de un cupo cerrado, un
--      acuerdo con un gimnasio o una preventa.
--
--      Se le da el mismo eje que a las promociones: `audience` 'public' o
--      'code'. Con 'code', el combo existe pero no se ofrece: hay que tipear el
--      código para desbloquear el paquete.
--
--      EL CÓDIGO SE GUARDA EN CLARO, a diferencia de `registration_access_gates`
--      (que guarda un hash bcrypt). No es la misma cosa: la tanda es una
--      contraseña de apertura que Administración rota y nunca vuelve a leer; el
--      código de combo es material que se reparte —igual que `discount_codes.code`,
--      que también está en claro y también destraba un precio— y el panel tiene
--      que poder mostrarlo y copiarlo para mandarlo. Lo que sí cambia: no puede
--      salir en ninguna lectura pública. Ver el ajuste de `EVENT_SELECT` en
--      server/routes/events.js, que traía la fila entera con `*`.
--
--      SE VALIDA EN EXPRESS, no en la RPC, por el mismo criterio que las tandas:
--      el checkout de combo tiene una sola puerta de entrada
--      (`server/routes/athletes.js`), y meter el código en la firma obligaría a
--      versionar tres funciones transaccionales y a dejar overloads muertos
--      —algo que este repo ya tuvo que ir a limpiar dos veces
--      (20260824120000, 20260824130000).
--
--   2. NO SE PODÍA SACAR DEL PANEL UNA PROMOCIÓN YA USADA.
--      `staff_delete_discount_code` la rechaza si tiene canjes, y con razón:
--      `discount_code_redemptions` es registro contable —Finanzas reporta sobre
--      `discount_amount`— y `athlete_payment_orders` la referencia. Borrarla de
--      verdad sería corromper la contabilidad de órdenes ya cobradas.
--
--      Pero "no la quiero ver más" es un pedido de visibilidad, no de datos. Se
--      resuelve archivando: la promo desaparece del panel y de todos los
--      caminos de canje, el historial queda intacto, y el texto del código se
--      libera para volver a usarse (el índice único pasa a ser parcial).
--
--      `staff_delete_discount_code` deja de fallar: sin canjes borra de verdad
--      —una promo que nunca se usó no deja huella que preservar— y con canjes
--      archiva. Un solo botón en el panel que siempre hace lo correcto.

-- ---------------------------------------------------------------------------
-- 1. Audiencia de la oferta combo
-- ---------------------------------------------------------------------------

alter table public.event_combo_offers
  add column if not exists audience text not null default 'public',
  add column if not exists access_code text;

alter table public.event_combo_offers drop constraint if exists event_combo_offers_audience_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_audience_check check (audience in ('public', 'code'));

alter table public.event_combo_offers drop constraint if exists event_combo_offers_access_code_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_access_code_check
  check (
    access_code is null
    or (access_code ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$' and length(access_code) between 3 and 32)
  );

-- Un combo restringido sin código sería un combo que nadie puede comprar.
alter table public.event_combo_offers drop constraint if exists event_combo_offers_audience_code_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_audience_code_check
  check (audience = 'public' or access_code is not null);

-- ---------------------------------------------------------------------------
-- 2. Archivado de promociones
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists archived_at timestamptz;

-- El único índice era `unique (organization_id, code)`. Pasa a ser parcial para
-- que archivar libere el texto del código: si una promo archivada siguiera
-- ocupando su nombre, "eliminarla" dejaría un fantasma bloqueando el alta de
-- una promo nueva con el mismo código.
alter table public.discount_codes drop constraint if exists discount_codes_org_code_uidx;
drop index if exists public.discount_codes_org_code_uidx;
create unique index if not exists discount_codes_org_code_live_uidx
  on public.discount_codes (organization_id, code)
  where archived_at is null;

create index if not exists discount_codes_archived_idx
  on public.discount_codes (organization_id, archived_at);

-- El resolver de promo pública nunca puede levantar una archivada.
drop index if exists public.discount_codes_public_lookup_idx;
create index if not exists discount_codes_public_lookup_idx
  on public.discount_codes (organization_id, applies_to)
  where audience = 'public' and active and archived_at is null;

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
    and c.archived_at is null
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
-- 3. Una promo archivada no se canjea ni se previsualiza
--
-- El canje busca por `code`, no por id: sin este filtro, archivar dejaría la
-- promo invisible en el panel pero viva para cualquiera que todavía tenga el
-- código anotado.
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
    if not found or v_code.audience <> 'public' or v_code.archived_at is not null
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
    where organization_id = p_organization_id
      and code = upper(trim(p_code))
      and archived_at is null;
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

-- Un código archivado tampoco destraba canales manuales.
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
  if v_code.archived_at is not null then
    raise exception 'La promoción está archivada.' using errcode = 'PLU02';
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

-- ---------------------------------------------------------------------------
-- 4. Baja que siempre funciona: borra si nunca se usó, archiva si ya se canjeó
-- ---------------------------------------------------------------------------

create or replace function public.staff_delete_discount_code(
  p_code_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_redeemed int;
begin
  select * into v_code from public.discount_codes where id = p_code_id for update;
  if not found then
    raise exception 'La promoción no existe.' using errcode = 'PLU02';
  end if;

  select count(*) into v_redeemed
  from public.discount_code_redemptions where discount_code_id = p_code_id;

  -- Con canjes, la fila es el respaldo de órdenes ya cobradas: los reportes de
  -- Finanzas leen `discount_code_redemptions.discount_amount` y las órdenes la
  -- referencian por id. Se archiva —desaparece del panel y de todo canje— en
  -- vez de romper la contabilidad.
  if v_redeemed > 0 then
    update public.discount_codes
    set archived_at = now(),
        active = false,
        updated_at = now()
    where id = p_code_id
    returning * into v_code;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.archived', 'discount_code', v_code.id::text, 'staff', p_actor,
      jsonb_build_object('code', v_code.code, 'redeemedCount', v_redeemed),
      v_code.organization_id
    );

    return jsonb_build_object(
      'deleted', true, 'archived', true, 'id', v_code.id, 'redeemedCount', v_redeemed
    );
  end if;

  delete from public.discount_codes where id = p_code_id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.deleted', 'discount_code', v_code.id::text, 'staff', p_actor,
    to_jsonb(v_code), v_code.organization_id
  );

  return jsonb_build_object('deleted', true, 'archived', false, 'id', v_code.id);
end;
$$;

revoke all on function public.staff_delete_discount_code(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_discount_code(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Alta y edición del combo con audiencia y código
-- ---------------------------------------------------------------------------

create or replace function public.staff_save_event_combo_offer(
  p_event_slug text,
  p_offer jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_plan public.membership_plans;
  v_offer public.event_combo_offers;
  v_before jsonb;
  v_price int := nullif(p_offer ->> 'price', '')::int;
  v_manual_price int := nullif(p_offer ->> 'manualPrice', '')::int;
  v_starts timestamptz := nullif(p_offer ->> 'startsAt', '')::timestamptz;
  v_ends timestamptz := nullif(p_offer ->> 'endsAt', '')::timestamptz;
  v_audience text := coalesce(nullif(trim(p_offer ->> 'audience'), ''), 'public');
  v_access_code text := nullif(upper(trim(coalesce(p_offer ->> 'accessCode', ''))), '');
begin
  select * into v_event from public.events where slug = trim(p_event_slug) for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_plan
  from public.membership_plans
  where id = nullif(p_offer ->> 'membershipPlanId', '')::uuid
    and organization_id = v_event.organization_id;
  if not found or v_plan.collection_mode <> 'one_time' then
    raise exception 'El combo requiere un plan de afiliación de pago único.' using errcode = 'PLU01';
  end if;

  if v_price is null or v_price <= 0 or v_price > 10000000
     or v_price > v_plan.price + v_event.price
     or (v_manual_price is not null and (
       v_manual_price <= 0 or v_manual_price > 10000000
       or v_manual_price > coalesce(v_plan.manual_price, v_plan.price) + coalesce(v_event.manual_price, v_event.price)
     ))
     or (v_starts is not null and v_ends is not null and v_ends < v_starts) then
    raise exception 'La oferta combo es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia del combo es inválida.' using errcode = 'PLU01';
  end if;

  -- Un combo público no conserva el código: dejarlo guardado haría que volver a
  -- restringirlo reviviera en silencio un código que ya se repartió.
  if v_audience = 'public' then
    v_access_code := null;
  else
    if v_access_code is null
       or v_access_code !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
       or length(v_access_code) < 3 or length(v_access_code) > 32 then
      raise exception 'Un combo restringido necesita un código de acceso válido: mayúsculas, números y guiones.'
        using errcode = 'PLU01';
    end if;
  end if;

  select to_jsonb(o) into v_before
  from public.event_combo_offers o where o.event_id = v_event.id;

  insert into public.event_combo_offers(
    organization_id, event_id, membership_plan_id, price, manual_price, currency,
    active, starts_at, ends_at, audience, access_code
  ) values (
    v_event.organization_id, v_event.id, v_plan.id, v_price, v_manual_price, 'ARS',
    coalesce((p_offer ->> 'active')::boolean, false), v_starts, v_ends,
    v_audience, v_access_code
  ) on conflict(event_id) do update set
    membership_plan_id = excluded.membership_plan_id,
    price = excluded.price,
    manual_price = excluded.manual_price,
    currency = excluded.currency,
    active = excluded.active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    audience = excluded.audience,
    access_code = excluded.access_code,
    updated_at = now()
  returning * into v_offer;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'event_combo_offer.upserted', 'event_combo_offer', v_offer.id::text,
    'staff', p_actor,
    -- El código no viaja a la bitácora: la auditoría registra que el combo pasó
    -- a restringido, no el material que se reparte.
    jsonb_build_object(
      'before', (v_before - 'access_code'),
      'after', (to_jsonb(v_offer) - 'access_code'),
      'audience', v_offer.audience,
      'accessCodeSet', v_offer.access_code is not null
    ),
    v_event.organization_id
  );

  return to_jsonb(v_offer);
end;
$$;

revoke all on function public.staff_save_event_combo_offer(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_event_combo_offer(text, jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. El panel lee audiencia y código; el archivo no se lista
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
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_combo_offers'
      and column_name = 'access_code'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'archived_at'
  ) then
    raise exception 'Faltan las columnas de código de combo o de archivo de promociones.'
      using errcode = 'PLU01';
  end if;

  -- El índice único tiene que ser parcial: si no, archivar deja el nombre del
  -- código bloqueado para siempre y "eliminar" no libera nada.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'discount_codes_org_code_live_uidx'
  ) then
    raise exception 'El código de una promoción archivada sigue ocupando su nombre.'
      using errcode = 'PLU01';
  end if;

  -- Una promo archivada no puede seguir canjeándose con el código repartido.
  select pg_get_functiondef(p.oid) into v_apply
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_discount_code_to_order'
  limit 1;
  if v_apply is null or v_apply not ilike '%archived_at is null%' then
    raise exception 'El canje sigue aceptando promociones archivadas.' using errcode = 'PLU01';
  end if;

  if exists (
    select 1 from public.event_combo_offers where audience = 'code' and access_code is null
  ) then
    raise exception 'Hay combos restringidos sin código de acceso.' using errcode = 'PLU01';
  end if;
end
$verification$;
