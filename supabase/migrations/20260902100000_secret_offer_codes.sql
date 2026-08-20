-- Código secreto de oferta exclusiva: kind = 'offer' y alcance por inscripción — PLU ARG
--
-- Hasta acá un código sabía hacer una de dos cosas, nunca las dos:
--
--   * `kind = 'fixed_price'` fija el importe final de la compra, pero no
--     desbloquea nada: si el combo del evento está restringido
--     (`event_combo_offers.audience = 'code'`), el atleta igual choca contra la
--     puerta.
--   * `kind = 'access'` desbloquea el combo restringido, pero no toca el precio:
--     la oferta tenía que estar cargada de antemano en `event_combo_offers.price`,
--     lo que obliga a esconder el combo de todo el mundo para poder ofrecerlo a
--     un precio especial, y deja un solo precio posible por evento.
--
-- Lo que el producto pide es una tercera cosa, que no es un descuento: una
-- OFERTA EXCLUSIVA detrás de un código secreto. "Afiliación + inscripción a
-- $120.000 para quien tenga ONLY-PITBULL", con el combo público del evento
-- siguiendo a su precio de lista para el resto. Eso es desbloquear Y fijar
-- precio en el mismo objeto, y es `kind = 'offer'`.
--
-- Tres cosas nuevas, en ese orden de importancia:
--
--   1. ALCANCE POR INSCRIPCIÓN (`discount_codes.event_id`). Hoy un código
--      'access' desbloquea CUALQUIER combo restringido de la organización: con
--      un solo evento no se nota, con dos es una fuga silenciosa. Un código de
--      oferta declara a qué inscripción aplica y el canje lo verifica contra el
--      evento REAL de la orden — no contra lo que dijo el navegador.
--
--      Queda opcional (null = cualquiera) para no cambiarle el comportamiento a
--      los códigos que ya existen, y prohibido en promos públicas: ver el
--      comentario de `discount_codes_public_event_check`.
--
--   2. `kind = 'offer'`: precio fijo (como 'fixed_price') + desbloqueo del combo
--      (como 'access'), siempre `applies_to = 'combo'`, siempre
--      `audience = 'code'` y siempre con `event_id`. Un secreto que se aplica
--      solo no es un secreto, y una oferta sin inscripción no se puede cotizar.
--
--   3. `discount_code_unlocks`: quién canjeó la llave. NO es una redención —
--      `discount_code_redemptions` sigue siendo el registro contable, se escribe
--      recién cuando hay orden y es lo que consume cupo. El unlock es sólo
--      "esta persona tiene la llave", y es lo que sostiene la ficha "Oferta
--      exclusiva" de Mi cuenta entre sesiones y dispositivos. Sin tabla, la
--      ficha se perdería en cada refresh.
--
-- Disciplina de migraciones de este repo: `create or replace function` con una
-- firma nueva NO reemplaza, crea un overload aparte (ya hubo que ir a limpiar
-- dos veces: 20260824120000, 20260824130000). Las cinco funciones que se tocan
-- acá mantienen exactamente su firma vigente, así que no hace falta ningún
-- `drop function`. Las dos nuevas (`athlete_unlock_offer_code`,
-- `athlete_list_offer_unlocks`) nacen con firma propia.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists event_id uuid references public.events(id) on delete cascade;

comment on column public.discount_codes.event_id is
  'Inscripción a la que aplica el código. Null = cualquiera. Obligatorio para kind=offer.';

alter table public.discount_codes drop constraint if exists discount_codes_kind_check;
alter table public.discount_codes
  add constraint discount_codes_kind_check
  check (kind in ('percent', 'fixed_price', 'access', 'offer'));

-- Superset de la constraint anterior: ninguna fila existente deja de cumplirla.
-- La rama 'offer' es la unión de 'fixed_price' (importe) y 'access' (alcance
-- combo), más las dos exigencias propias del secreto.
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
      and applies_to = 'combo'
    )
    or (
      kind = 'offer'
      and percent_off is null
      and fixed_price is not null
      and applies_to = 'combo'
      -- Una oferta sin inscripción no se puede cotizar: el precio de lista
      -- contra el que se compara (y el combo que desbloquea) salen del evento.
      and event_id is not null
      -- Una oferta que se aplica sola a todo el mundo no es una oferta secreta,
      -- es el precio nuevo del combo — eso se cambia en Precios.
      and audience = 'code'
    )
  );

-- El precio del canal manual es parte de un importe promocional; 'percent' y
-- 'access' no tienen ninguno. Superset de la constraint de 20260828100000.
alter table public.discount_codes drop constraint if exists discount_codes_fixed_price_manual_kind_check;
alter table public.discount_codes
  add constraint discount_codes_fixed_price_manual_kind_check
  check (fixed_price_manual is null or kind in ('fixed_price', 'offer'));

-- Atar una afiliación a un evento no significa nada: la afiliación es anual y
-- no pertenece a ninguna inscripción.
alter table public.discount_codes drop constraint if exists discount_codes_event_scope_check;
alter table public.discount_codes
  add constraint discount_codes_event_scope_check
  check (event_id is null or applies_to in ('registration', 'combo'));

-- Una promo pública NO puede tener alcance de evento. No es una restricción
-- estética: `plu_private.resolve_public_promo` elige la promo pública sin saber
-- contra qué evento se está comprando (no recibe el evento en su firma). Si
-- levantara una promo atada a otro evento, `apply_discount_code_to_order` la
-- rechazaría por alcance y la compra terminaría sin NINGUNA promo aplicada —
-- ni siquiera otra que sí correspondía. Mientras el resolver no reciba el
-- evento, el alcance es una propiedad de los códigos que se reparten.
alter table public.discount_codes drop constraint if exists discount_codes_public_event_check;
alter table public.discount_codes
  add constraint discount_codes_public_event_check
  check (audience = 'code' or event_id is null);

create index if not exists discount_codes_event_idx
  on public.discount_codes (organization_id, event_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. discount_code_unlocks: la llave, no la venta
--
-- Deliberadamente separada de `discount_code_redemptions`:
--
--   * unlock = "tengo el código". No consume cupo, no tiene importe, no entra
--     en ningún reporte de Finanzas. Puede haber mil unlocks de un código con
--     cupo 50.
--   * redemption = "compré con el código". Tiene importe, consume cupo, la
--     referencia una orden y es registro contable (por eso
--     staff_delete_discount_code archiva en vez de borrar cuando existe).
--
-- `on delete cascade` en las dos FK: un unlock no es historia que preservar. Si
-- el código se borra de verdad (nunca se usó) o la cuenta se purga, el unlock
-- se va con ellos.
-- ---------------------------------------------------------------------------

create table if not exists public.discount_code_unlocks (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  constraint discount_code_unlocks_athlete_uidx unique (discount_code_id, athlete_id)
);

create index if not exists discount_code_unlocks_athlete_idx
  on public.discount_code_unlocks (athlete_id, unlocked_at desc);

alter table public.discount_code_unlocks enable row level security;
revoke all on public.discount_code_unlocks from public, anon, authenticated;
grant select, insert, delete on public.discount_code_unlocks to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cálculo del importe: 'offer' cotiza como 'fixed_price'
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
    when p_kind in ('fixed_price', 'offer')
      then greatest(p_base - coalesce(p_fixed_price, p_base), 0)
    else floor(p_base * coalesce(p_percent_off, 0) / 100.0)
  end;
$$;

revoke all on function plu_private.resolve_discount_amount(numeric, text, int, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Evento real de una orden
--
-- La inscripción se crea ANTES de aplicar el código en los tres caminos
-- (create_competition_registration_v3, create_membership_registration_combo_order
-- y el camino de idempotencia del combo), así que para cuando corre el canje ya
-- existe `event_registrations.payment_order_id`. Eso es lo que permite verificar
-- el alcance contra el evento REAL de la orden sin agregarle un parámetro a
-- `apply_discount_code_to_order` — es decir, sin versionar la función ni
-- confiar en un slug que mandó el navegador.
--
-- Una orden de afiliación sola no tiene inscripción y devuelve null: un código
-- con alcance de evento no aplica ahí, que es exactamente lo correcto.
-- ---------------------------------------------------------------------------

create or replace function plu_private.order_event_id(p_order_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select r.event_id
  from public.event_registrations r
  where r.payment_order_id = p_order_id
  limit 1;
$$;

revoke all on function plu_private.order_event_id(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Payload de una oferta desbloqueada
--
-- Un solo lugar que arma lo que la ficha "Oferta exclusiva" necesita para
-- mostrar la oferta y su ahorro: el código, la inscripción, el combo del evento
-- y el plan de afiliación que ese combo empaqueta. Lo consumen el canje y el
-- listado — duplicarlo dejaría las dos pantallas mostrando precios distintos.
--
-- `redeemed` cierra el ciclo: cuando la compra ya se hizo, la ficha tiene que
-- decir "ya la usaste" en vez de desaparecer y dejar al atleta sin registro de
-- lo que canjeó.
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
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'redeemed', exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = p_code.id and r.athlete_id = p_athlete_id
    ),
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
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id
  left join public.membership_plans pl on pl.id = o.membership_plan_id;
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. apply_discount_code_to_order: alcance por inscripción y 'offer'
--
-- Cuerpo idéntico a 20260901100000 salvo el bloque de alcance de evento. El
-- resto de las guardas (vigencia, invitados, cupo, ya usado) corre exactamente
-- igual para las cuatro modalidades.
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
-- 7. athlete_preview_discount_code: devuelve la inscripción del código
--
-- No valida el alcance de evento: no recibe el evento, y agregarle un parámetro
-- crearía un overload. Devuelve `eventId`/`eventSlug`/`eventTitle` y la capa de
-- aplicación (server/routes/athletes.js) compara contra el evento pedido —
-- mismo criterio que el código del combo, que también se valida en Express.
-- La guarda que no se puede eludir sigue siendo la del canje (punto 6).
--
-- Cuerpo idéntico a 20260901100000 salvo la lectura del evento y la rama de
-- 'offer' en el chequeo de ahorro.
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
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. Canje de la llave: athlete_unlock_offer_code
--
-- Devuelve motivos en vez de levantar excepciones (salvo por datos imposibles):
-- la pantalla necesita distinguir "no existe" de "venció" de "ya no queda cupo"
-- para decir algo útil, y un `raise` obligaría a mapear SQLSTATE en Express.
--
-- NO consume cupo: eso pasa al comprar. Sí rechaza un código sin cupo
-- disponible — desbloquear una oferta que ya nadie puede comprar sería mandar
-- al atleta a una ficha que termina en un error de checkout.
--
-- Es idempotente: volver a tipear el mismo código no falla ni duplica el
-- unlock, sólo re-devuelve la oferta.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_unlock_offer_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_candidate text := upper(trim(coalesce(p_code, '')));
  v_redeemed int;
  v_unlock_id uuid;
begin
  if v_candidate = '' then
    return jsonb_build_object('unlocked', false, 'reason', 'not_found');
  end if;

  select * into v_code from public.discount_codes
  where organization_id = p_organization_id
    and code = v_candidate
    and archived_at is null;
  if not found then
    return jsonb_build_object('unlocked', false, 'reason', 'not_found');
  end if;

  -- Sólo las dos modalidades que desbloquean algo. Un porcentaje o un precio
  -- promocional sueltos se aplican en el checkout y no abren ninguna ficha:
  -- ofrecerles un canje sería prometer una pantalla que no existe.
  if v_code.kind not in ('offer', 'access') then
    return jsonb_build_object('unlocked', false, 'reason', 'not_applicable');
  end if;

  -- Un 'access' sin alcance de inscripción es el código legado que destraba
  -- CUALQUIER combo restringido: sirve en el checkout, pero no se puede
  -- convertir en una ficha —no hay evento del que sacar el paquete ni el
  -- precio—. Registrar el unlock dejaría en Mi cuenta una oferta que no se
  -- puede describir ni comprar.
  if v_code.event_id is null then
    return jsonb_build_object('unlocked', false, 'reason', 'not_applicable');
  end if;

  if v_code.starts_at is not null and v_code.starts_at > now() then
    return jsonb_build_object(
      'unlocked', false, 'reason', 'not_started', 'startsAt', v_code.starts_at
    );
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('unlocked', false, 'reason', 'expired');
  end if;
  if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
    return jsonb_build_object('unlocked', false, 'reason', 'not_invited');
  end if;

  -- Ya comprada: el unlock se conserva (la ficha muestra la oferta usada) pero
  -- no se vuelve a evaluar cupo ni estado — la compra ya está hecha.
  if exists (
    select 1 from public.discount_code_redemptions
    where discount_code_id = v_code.id and athlete_id = p_athlete_id
  ) then
    insert into public.discount_code_unlocks(organization_id, discount_code_id, athlete_id)
    values (p_organization_id, v_code.id, p_athlete_id)
    on conflict (discount_code_id, athlete_id) do nothing;
    return jsonb_build_object(
      'unlocked', true,
      'alreadyUnlocked', true,
      'offer', plu_private.offer_code_payload(v_code, p_athlete_id)
    );
  end if;

  if not v_code.active then
    return jsonb_build_object('unlocked', false, 'reason', 'inactive');
  end if;
  if v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = v_code.id;
    if v_redeemed >= v_code.max_redemptions then
      return jsonb_build_object('unlocked', false, 'reason', 'limit_reached');
    end if;
  end if;

  -- Una oferta cuyo combo no está cargado, apagado o fuera de ventana no se
  -- puede comprar: mejor decirlo en el canje que dejar la ficha ofreciendo algo
  -- que el checkout va a rechazar.
  if v_code.kind = 'offer' and not exists (
    select 1 from public.event_combo_offers o
    where o.event_id = v_code.event_id
      and o.active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at >= now())
  ) then
    return jsonb_build_object('unlocked', false, 'reason', 'offer_unavailable');
  end if;

  insert into public.discount_code_unlocks(organization_id, discount_code_id, athlete_id)
  values (p_organization_id, v_code.id, p_athlete_id)
  on conflict (discount_code_id, athlete_id) do nothing
  returning id into v_unlock_id;

  -- Sólo el canje nuevo se audita: re-tipear el código no es un evento.
  if v_unlock_id is not null then
    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.unlocked', 'discount_code', v_code.id::text,
      'athlete', p_athlete_id::text,
      jsonb_build_object(
        'code', v_code.code,
        'kind', v_code.kind,
        'eventId', v_code.event_id,
        'fixedPrice', v_code.fixed_price
      ),
      p_organization_id
    );
  end if;

  return jsonb_build_object(
    'unlocked', true,
    'alreadyUnlocked', v_unlock_id is null,
    'offer', plu_private.offer_code_payload(v_code, p_athlete_id)
  );
end;
$$;

revoke all on function public.athlete_unlock_offer_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.athlete_unlock_offer_code(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 9. Listado de ofertas desbloqueadas
--
-- Una oferta ya comprada sigue apareciendo aunque el código haya quedado
-- inactivo o vencido: es el registro de lo que el atleta canjeó. Una oferta sin
-- comprar desaparece cuando el código deja de servir, para no ofrecer un
-- checkout que va a fallar.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_list_offer_unlocks(
  p_organization_id uuid,
  p_athlete_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select coalesce(
    jsonb_agg(
      plu_private.offer_code_payload(c, p_athlete_id)
      order by u.unlocked_at desc
    ),
    '[]'::jsonb
  )
  from public.discount_code_unlocks u
  join public.discount_codes c on c.id = u.discount_code_id
  where u.athlete_id = p_athlete_id
    and u.organization_id = p_organization_id
    and c.archived_at is null
    -- Sin inscripción no hay ficha que dibujar: ver el guard equivalente en
    -- athlete_unlock_offer_code.
    and c.event_id is not null
    and (
      (
        c.active
        and (c.starts_at is null or c.starts_at <= now())
        and (c.expires_at is null or c.expires_at > now())
      )
      or exists (
        select 1 from public.discount_code_redemptions r
        where r.discount_code_id = c.id and r.athlete_id = p_athlete_id
      )
    );
$$;

revoke all on function public.athlete_list_offer_unlocks(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_list_offer_unlocks(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 10. staff_upsert_discount_code: admite 'offer' y `eventId`
--
-- Cuerpo idéntico a 20260901100000 salvo la validación de kind, el alcance de
-- evento y las reglas propias de 'offer'.
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
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, event_id, max_redemptions, starts_at, expires_at,
        active, manual_channels
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_event_id, v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels
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
-- 11. El panel lee el alcance y cuántos canjearon la llave
--
-- `unlockedCount` junto a `redeemedCount` es lo que hace legible una oferta
-- secreta: cuánta gente tiene el código contra cuánta lo usó. Cuerpo idéntico a
-- 20260828100000 salvo esos campos.
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
          'eventId', c.event_id,
          'eventSlug', ev.slug,
          'eventTitle', ev.title,
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
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_event_id uuid;
  v_code_id uuid;
  v_apply text;
  v_preview text;
begin
  select id into v_event_id from public.events
  where organization_id = v_org order by starts_at limit 1;

  if v_event_id is null then
    raise notice 'Sin eventos cargados: se omiten las verificaciones que necesitan uno.';
  else
    -- La constraint acepta 'offer' completo.
    insert into public.discount_codes (
      organization_id, code, kind, applies_to, audience, fixed_price, event_id, active
    ) values (
      v_org, 'VERIFY-OFFER-KIND', 'offer', 'combo', 'code', 120000, v_event_id, false
    ) returning id into v_code_id;

    if plu_private.resolve_discount_amount(150000, 'offer', null, 120000) <> 30000 then
      raise exception 'resolve_discount_amount no cotiza kind=offer como precio fijo.'
        using errcode = 'PLU01';
    end if;

    -- El payload tiene que resolver la inscripción del código.
    if (
      select plu_private.offer_code_payload(c, '00000000-0000-4000-8000-000000000000'::uuid)
        -> 'event' ->> 'id'
      from public.discount_codes c where c.id = v_code_id
    ) is distinct from v_event_id::text then
      raise exception 'offer_code_payload no resuelve el evento del código.' using errcode = 'PLU01';
    end if;

    delete from public.discount_codes where id = v_code_id;

    -- 'offer' sin event_id no puede existir.
    begin
      insert into public.discount_codes (
        organization_id, code, kind, applies_to, audience, fixed_price, active
      ) values (
        v_org, 'VERIFY-OFFER-NO-EVENT', 'offer', 'combo', 'code', 120000, false
      );
      raise exception 'La constraint no rechazó un offer sin inscripción.' using errcode = 'PLU01';
    exception when check_violation then
      null;
    end;

    -- 'offer' público tampoco.
    begin
      insert into public.discount_codes (
        organization_id, code, kind, applies_to, audience, fixed_price, event_id, active
      ) values (
        v_org, 'VERIFY-OFFER-PUBLIC', 'offer', 'combo', 'public', 120000, v_event_id, false
      );
      raise exception 'La constraint no rechazó un offer público.' using errcode = 'PLU01';
    exception when check_violation then
      null;
    end;

    -- Alcance de evento sobre una afiliación: no tiene sentido.
    begin
      insert into public.discount_codes (
        organization_id, code, kind, applies_to, percent_off, event_id, active
      ) values (
        v_org, 'VERIFY-EVENT-ON-MEMBERSHIP', 'percent', 'membership', 10, v_event_id, false
      );
      raise exception 'La constraint no rechazó alcance de evento en una afiliación.'
        using errcode = 'PLU01';
    exception when check_violation then
      null;
    end;
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'discount_code_unlocks'
  ) then
    raise exception 'Falta la tabla discount_code_unlocks.' using errcode = 'PLU01';
  end if;

  -- El canje tiene que verificar el alcance contra el evento real de la orden.
  select pg_get_functiondef(p.oid) into v_apply
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_discount_code_to_order' limit 1;
  if v_apply is null or v_apply not ilike '%order_event_id%' then
    raise exception 'apply_discount_code_to_order no verifica el alcance por inscripción.'
      using errcode = 'PLU01';
  end if;

  select pg_get_functiondef(p.oid) into v_preview
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_preview_discount_code' limit 1;
  if v_preview is null or v_preview not ilike '%eventSlug%' then
    raise exception 'athlete_preview_discount_code no devuelve la inscripción del código.'
      using errcode = 'PLU01';
  end if;

  -- Ningún overload nuevo de las funciones tocadas.
  if to_regprocedure('public.apply_discount_code_to_order(uuid,uuid,uuid,text,text)') is null
     or to_regprocedure(
       'public.athlete_preview_discount_code(uuid,uuid,text,text,int,text)'
     ) is null
     or to_regprocedure('public.staff_upsert_discount_code(jsonb,text)') is null
     or to_regprocedure('public.staff_get_pricing_configuration()') is null then
    raise exception 'Alguna función perdió su firma vigente.' using errcode = 'PLU01';
  end if;

  if to_regprocedure('public.athlete_unlock_offer_code(uuid,uuid,text)') is null
     or to_regprocedure('public.athlete_list_offer_unlocks(uuid,uuid)') is null then
    raise exception 'Faltan las funciones de canje y listado de ofertas.' using errcode = 'PLU01';
  end if;
end
$verification$;
