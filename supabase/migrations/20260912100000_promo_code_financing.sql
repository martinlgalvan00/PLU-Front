-- Financiamiento por codigo de promocion -- PLU ARG
--
-- 20260828110000 puso `financed` en `event_combo_offers` y 20260909100000 le dio
-- la declaracion de pago del atleta y los derechos provisionales. Faltaba lo que
-- Precios promete: que el financiamiento sea una condicion DEL CODIGO que se
-- reparte. Hoy el panel muestra el interruptor dentro del alta de una oferta
-- exclusiva, pero lo escribe en el combo del evento, y de ahi salen tres
-- agujeros:
--
--   1. Es del evento, no del codigo. Dos codigos sobre el mismo torneo comparten
--      un unico interruptor: financiar ONLY-PITBULL-GOLD financiaba tambien a
--      cualquier otro codigo de ese combo, y editar uno reescribia el contrato
--      del otro.
--   2. Se podia guardar inerte. Nada obligaba a declarar transferencia o
--      efectivo, y el financiamiento solo existe sobre un canal que se liquida
--      a mano (`athlete_confirm_manual_payment`). Con `manual_channels = {}` el
--      atleta veia unicamente la pasarela: canjeaba, pagaba con Mercado Pago y
--      el interruptor no hacia nada. Es el caso que se reporto.
--   3. Solo servia para el combo. La declaracion ya habilita afiliacion e
--      inscripcion por separado, pero la foto `financing_allowed` se tomaba
--      dentro del checkout del combo y ningun otro concepto la escribia.
--
-- Esta migracion mueve la condicion al codigo, la vuelve imposible de guardar
-- inerte y deja UNA regla -- `plu_private.settle_order_financing` -- que los tres
-- checkouts consultan despues de settlear el canal.
--
-- Que NO cambia: quien acredita. `financing_allowed` habilita en forma
-- provisional y deja la deuda abierta; el pago aprobado sigue siendo exclusivo
-- de Finanzas (`docs/BUSINESS_RULES.md`). El combo conserva su `financed`: un
-- combo restringido puede financiar sin que exista un `discount_code`, y las dos
-- fuentes se leen con un OR.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists financed boolean not null default false;

comment on column public.discount_codes.financed is
  'El atleta puede declarar el pago manual y quedar habilitado mientras Finanzas valida. Exige al menos un canal manual declarado.';

-- El agujero 2, cerrado en el piso: financiar es delegar la liquidacion a un
-- canal que se cobra a mano. Sin transferencia ni efectivo declarados el atleta
-- solo ve la pasarela -- que acredita sola -- y el interruptor no significa nada.
alter table public.discount_codes drop constraint if exists discount_codes_financed_channel_check;
alter table public.discount_codes
  add constraint discount_codes_financed_channel_check
  check (not financed or cardinality(manual_channels) > 0);

-- Una promo publica se aplica sola a TODAS las compras del concepto
-- (`plu_private.resolve_public_promo`): financiarla seria abrir deuda para
-- cualquiera que pase por el checkout. El financiamiento se pacta con quien
-- recibe el codigo. Es redundante con `discount_codes_public_channels_check`
-- (20260827105000) y se declara igual: la regla vive donde se lee.
alter table public.discount_codes drop constraint if exists discount_codes_financed_audience_check;
alter table public.discount_codes
  add constraint discount_codes_financed_audience_check
  check (not financed or audience = 'code');

create index if not exists discount_codes_financed_idx
  on public.discount_codes(organization_id)
  where financed and archived_at is null;

-- Backfill: los codigos de oferta cuyo combo ya estaba financiado y que ademas
-- declaran un canal manual heredan la condicion -- es exactamente lo que ya
-- estaba pactado. Los que no declaran canal quedan en false a proposito: eran
-- los inertes, y prenderlos aca abriria un canal de cobro sin que nadie lo
-- decida. El panel ahora los obliga a elegirlo.
update public.discount_codes c
set financed = true,
    updated_at = now()
from public.event_combo_offers o
where o.event_id = c.event_id
  and o.archived_at is null
  and o.financed
  and o.audience = 'code'
  and c.kind = 'offer'
  and c.archived_at is null
  and cardinality(c.manual_channels) > 0
  and not c.financed;

-- ---------------------------------------------------------------------------
-- 2. Una sola regla de financiamiento, despues de settlear el canal
--
-- Se calcula aca y no en `apply_discount_code_to_order` porque el canal se
-- escribe DESPUES de aplicar el cupon: `settle_manual_checkout_pricing` es la
-- que guarda `manual_payment_channel`, asi que dentro del cupon la orden
-- todavia no sabe si se va a liquidar por transferencia, en efectivo o por
-- Wise. Los tres checkouts la llaman al final, con el canal ya escrito.
--
-- Monotonica a proposito: prende `financing_allowed` y nunca lo apaga. Quitarlo
-- despues de que el atleta declaro el pago le sacaria derechos ya otorgados sin
-- que ninguna persona lo decida; revocar es potestad de Finanzas al rechazar
-- (`reject_athlete_payment_order`, 20260909100000).
-- ---------------------------------------------------------------------------

create or replace function plu_private.settle_order_financing(p_order_id uuid)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_financed boolean := false;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden de checkout no encontrada.' using errcode = 'PLU02';
  end if;

  -- Mercado Pago acredita solo y Wise cotiza en USD con su propia validacion:
  -- en ninguno de los dos hay una declaracion del atleta que habilitar por
  -- adelantado. Financiar solo tiene sentido sobre transferencia o efectivo.
  if v_order.method <> 'manual_link'
     or coalesce(v_order.manual_payment_channel, 'bank_transfer')
       not in ('bank_transfer', 'cash_pitbull') then
    return v_order;
  end if;

  -- 1. La condicion del codigo aplicado a ESTA orden. Sirve para cualquier
  --    concepto: afiliacion, inscripcion y combo.
  select coalesce(c.financed, false) into v_financed
  from public.discount_codes c
  where c.id = v_order.discount_code_id;

  -- 2. El combo restringido del evento, que puede financiar sin codigo propio
  --    (20260828110000). Se lee la inscripcion que la misma transaccion creo,
  --    nunca un booleano enviado por el navegador.
  if not coalesce(v_financed, false) and v_order.concept = 'combo' then
    select coalesce(o.financed and o.audience = 'code', false) into v_financed
    from public.event_registrations r
    join public.event_combo_offers o
      on o.event_id = r.event_id and o.archived_at is null
    where r.payment_order_id = v_order.id
    limit 1;
  end if;

  if not coalesce(v_financed, false) then
    return v_order;
  end if;

  update public.athlete_payment_orders
  set financing_allowed = true,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_order_financing(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Los tres checkouts. Misma firma vigente desde 20260827120000; la unica
--    diferencia es la linea que consulta la regla con el canal ya settleado.
--    El combo pierde su calculo propio: era la misma regla escrita dos veces.
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_checkout(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  if p_manual_payment_channel is distinct from 'wise_transfer' then
    perform plu_private.configure_atomic_checkout_pricing(
      'membership', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
    );
  end if;
  v_result := public.create_membership_order_v4(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price,
    case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end
  );
  v_order := plu_private.settle_order_financing(v_order.id);
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_order_checkout(
  uuid, text, text, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_order_checkout(
  uuid, text, text, text, text, numeric, numeric, text, text
) to service_role;

create or replace function public.create_competition_registration_checkout(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  if p_manual_payment_channel is distinct from 'wise_transfer' then
    perform plu_private.configure_atomic_checkout_pricing(
      'registration', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
    );
  end if;
  v_result := public.create_competition_registration_v3(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price,
    case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end
  );
  v_order := plu_private.settle_order_financing(v_order.id);
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text
) to service_role;

create or replace function public.create_membership_registration_combo_checkout(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_discount_code text default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  if p_manual_payment_channel is distinct from 'wise_transfer' then
    perform plu_private.configure_atomic_checkout_pricing(
      'combo', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
    );
  end if;

  v_result := public.create_membership_registration_combo_order(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price,
    case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end
  );
  v_order := plu_private.settle_order_financing(v_order.id);

  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Alta y edicion desde el panel
--
-- Cuerpo identico a 20260908100000 salvo la lectura de `financed` y las dos
-- validaciones que acompanan a los checks del punto 1 con un mensaje que el
-- operador pueda accionar.
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
  -- Default false: ningun codigo ya cargado empieza a financiar porque una
  -- API vieja no mande el campo.
  v_financed boolean := coalesce((p_code ->> 'financed')::boolean, false);
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

  -- Financiar es delegar la liquidación a un canal que se cobra a mano: sin
  -- transferencia ni efectivo, el atleta sólo ve la pasarela —que acredita
  -- sola— y el interruptor queda inerte. Era el agujero que reportó Precios.
  if v_financed and cardinality(v_manual_channels) = 0 then
    raise exception 'Para financiar el código habilitá transferencia o efectivo: son los canales que el atleta puede declarar.'
      using errcode = 'PLU01';
  end if;

  -- Una promo pública se aplica sola a todas las compras: financiarla sería
  -- abrir deuda para cualquiera que pase por el checkout.
  if v_financed and v_audience = 'public' then
    raise exception 'Una promoción pública no puede financiar: el financiamiento se pacta con quien recibe el código.'
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
        financed = v_financed,
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, event_id, max_redemptions, starts_at, expires_at,
        active, manual_channels, mercado_pago_enabled, financed
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_event_id, v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels,
        v_mercado_pago_enabled, v_financed
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
-- 5. Lo que la celda tiene que contar en cada pantalla
--
-- Misma decision que 20260908100000 para `mercadoPagoEnabled`: la condicion
-- viaja al panel (configuracion), al canje (para que el redeemer diga con que
-- se paga y que se puede delegar) y a la ficha secreta (que la anuncia antes de
-- crear la orden, no despues).
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
          'financed', c.financed,
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
    -- Si el código deja delegar el pago, el checkout lo dice ANTES de crear
    -- la orden: es lo que cambia la decisión de quien todavía no juntó la plata.
    -- La foto autoritativa la sigue tomando
    -- `plu_private.settle_order_financing` dentro de la transacción.
    'financed', v_code.financed,
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  to service_role;

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
    'financed', p_code.financed,
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'maxRedemptions', p_code.max_redemptions,
    'remaining', case
      when p_code.max_redemptions is null then null
      else greatest(0, p_code.max_redemptions - (
        select count(*) from public.discount_code_redemptions r
        where r.discount_code_id = p_code.id
      ))
    end,
    'redeemed', exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = p_code.id and r.athlete_id = p_athlete_id
    ),
    'purchase', (
      select jsonb_build_object(
        'orderId', po.id,
        'status', po.status,
        'amount', po.amount,
        'currency', po.currency,
        'concept', po.concept,
        'method', po.method,
        'manualPaymentChannel', po.manual_payment_channel,
        'financingAllowed', po.financing_allowed,
        'manualPaymentDeclaredAt', po.manual_payment_declared_at,
        'financedEntitlementsAt', po.financed_entitlements_at,
        'financedEntitlementsRevokedAt', po.financed_entitlements_revoked_at,
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
      'id', ca.id, 'slug', ca.slug, 'name', ca.name,
      'description', ca.description, 'objective', ca.objective,
      'status', ca.status, 'visibility', ca.visibility
    ) end,
    'event', case when e.id is null then null else jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title,
      'startsAt', e.starts_at, 'status', e.status,
      'registrationPrice', e.price,
      'registrationManualPrice', e.manual_price,
      'currency', e.currency
    ) end,
    'comboOffer', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'price', o.price, 'manualPrice', o.manual_price,
      'currency', o.currency, 'active', o.active, 'audience', o.audience,
      'financed', o.financed, 'startsAt', o.starts_at, 'endsAt', o.ends_at
    ) end,
    'membershipPlan', case when pl.id is null then null else jsonb_build_object(
      'id', pl.id, 'code', pl.code, 'name', pl.name,
      'price', pl.price, 'manualPrice', pl.manual_price, 'currency', pl.currency
    ) end
  )
  from (select 1) as anchor
  left join public.promotion_campaigns ca on ca.id = p_code.campaign_id
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id and o.archived_at is null
  left join public.membership_plans pl on pl.id = o.membership_plan_id;
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

create or replace function public.athlete_redeem_promotion_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_campaign public.promotion_campaigns;
  v_candidate text := upper(trim(coalesce(p_code, '')));
  v_surface text := nullif(trim(coalesce(p_context->>'surface', '')), '');
  v_redeemed int := 0;
  v_unlock jsonb;
  v_action text;
  v_destination jsonb;
  v_result jsonb;
begin
  select * into v_code
  from public.discount_codes
  where organization_id = p_organization_id
    and code = v_candidate
    and archived_at is null;

  if not found then
    insert into public.promotion_campaign_events(
      organization_id, athlete_id, event_type, surface, reason
    ) values (p_organization_id, p_athlete_id, 'rejected', v_surface, 'not_found');
    return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'code', v_candidate);
  end if;

  select * into v_campaign from public.promotion_campaigns where id = v_code.campaign_id;

  if not v_code.active then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'inactive');
  elsif v_code.starts_at is not null and v_code.starts_at > now() then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'not_started', 'startsAt', v_code.starts_at);
  elsif v_code.expires_at is not null and v_code.expires_at < now() then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'expired');
  elsif not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'not_invited');
  else
    if v_code.max_redemptions is not null then
      select count(*) into v_redeemed
      from public.discount_code_redemptions where discount_code_id = v_code.id;
    end if;
    if v_code.max_redemptions is not null and v_redeemed >= v_code.max_redemptions then
      v_result := jsonb_build_object('status', 'rejected', 'reason', 'limit_reached');
    end if;
  end if;

  if v_result is not null then
    insert into public.promotion_campaign_events(
      organization_id, campaign_id, discount_code_id, athlete_id,
      event_type, surface, reason
    ) values (
      p_organization_id, v_code.campaign_id, v_code.id, p_athlete_id,
      'rejected', v_surface, v_result->>'reason'
    );
    return v_result || jsonb_build_object('code', v_code.code);
  end if;

  if v_code.kind in ('offer', 'access') and v_code.event_id is not null then
    v_unlock := public.athlete_unlock_offer_code(p_organization_id, p_athlete_id, v_code.code);
    if not coalesce((v_unlock->>'unlocked')::boolean, false) then
      insert into public.promotion_campaign_events(
        organization_id, campaign_id, discount_code_id, athlete_id,
        event_type, surface, reason
      ) values (
        p_organization_id, v_code.campaign_id, v_code.id, p_athlete_id,
        'rejected', v_surface, coalesce(v_unlock->>'reason', 'not_applicable')
      );
      return jsonb_build_object(
        'status', 'rejected', 'reason', coalesce(v_unlock->>'reason', 'not_applicable'),
        'code', v_code.code
      );
    end if;
    v_action := 'open_exclusive_offer';
    v_destination := jsonb_build_object('view', 'profile', 'tab', 'account-offer');
  else
    v_action := 'apply_to_checkout';
    v_destination := case
      when v_code.applies_to = 'membership' then jsonb_build_object('view', 'profile', 'tab', 'account-membership')
      when v_code.applies_to in ('registration', 'combo') and v_code.event_id is not null then jsonb_build_object(
        'view', 'competition',
        'eventSlug', (select slug from public.events where id = v_code.event_id)
      )
      else jsonb_build_object('view', 'current')
    end;
  end if;

  insert into public.promotion_campaign_events(
    organization_id, campaign_id, discount_code_id, athlete_id,
    event_type, surface, metadata
  ) values (
    p_organization_id, v_code.campaign_id, v_code.id, p_athlete_id,
    'resolved', v_surface,
    jsonb_build_object('action', v_action, 'appliesTo', v_code.applies_to)
  );

  return jsonb_build_object(
    'status', 'accepted',
    'action', v_action,
    'code', v_code.code,
    'kind', v_code.kind,
    'appliesTo', v_code.applies_to,
    'destination', v_destination,
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'slug', v_campaign.slug,
      'name', v_campaign.name,
      'description', v_campaign.description,
      'objective', v_campaign.objective,
      'visibility', v_campaign.visibility,
      'status', v_campaign.status
    ),
    'benefit', jsonb_build_object(
      'percentOff', v_code.percent_off,
      'fixedPrice', v_code.fixed_price,
      'fixedPriceManual', v_code.fixed_price_manual,
      -- Con qué se paga lo que se acaba de canjear. Antes el canje contaba el
      -- beneficio y callaba el medio, así que el atleta descubría que podía
      -- pagar en efectivo —o que no podía usar la pasarela— recién dentro del
      -- checkout.
      'manualChannels', to_jsonb(coalesce(v_code.manual_channels, '{}'::text[])),
      'mercadoPagoEnabled', v_code.mercado_pago_enabled,
      'financed', v_code.financed,
      'eventId', v_code.event_id,
      'maxRedemptions', v_code.max_redemptions,
      'redeemedCount', v_redeemed,
      'remaining', case when v_code.max_redemptions is null then null else greatest(0, v_code.max_redemptions - v_redeemed) end,
      'expiresAt', v_code.expires_at
    ),
    'offer', v_unlock->'offer'
  );
end;
$$;

revoke all on function public.athlete_redeem_promotion_code(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.athlete_redeem_promotion_code(uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.staff_simulate_promotion_code(p_code_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'status', case when c.archived_at is not null or not c.active then 'unavailable' else 'ready' end,
    'code', c.code,
    'kind', c.kind,
    'appliesTo', c.applies_to,
    'financed', c.financed,
    'manualChannels', to_jsonb(coalesce(c.manual_channels, '{}'::text[])),
    'mercadoPagoEnabled', c.mercado_pago_enabled,
    'campaign', jsonb_build_object(
      'id', pc.id, 'name', pc.name, 'objective', pc.objective,
      'visibility', pc.visibility, 'status', pc.status
    ),
    'destination', jsonb_build_object(
      'kind', pc.destination_kind,
      'eventSlug', e.slug,
      'tab', case when pc.destination_kind = 'account_offer' then 'account-offer' when pc.destination_kind = 'membership_checkout' then 'account-membership' else null end
    ),
    'checks', jsonb_build_object(
      'active', c.active,
      'withinWindow', (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at >= now()),
      'restrictedCombo', case when c.kind = 'offer' then coalesce(o.active and o.audience = 'code', false) else true end,
      'hasEvent', case when c.kind = 'offer' then c.event_id is not null else true end,
      'hasPrice', case when c.kind in ('offer', 'fixed_price') then c.fixed_price is not null else true end,
      -- Un código sin ningún medio no se puede pagar, y un financiamiento sin
      -- canal manual no se puede declarar. Los checks del punto 1 ya los
      -- impiden al guardar; el simulador los muestra para los códigos que
      -- quedaron cargados antes.
      'payable', c.mercado_pago_enabled or cardinality(c.manual_channels) > 0,
      'financingDeclarable', not c.financed or cardinality(c.manual_channels) > 0
    )
  )
  from public.discount_codes c
  left join public.promotion_campaigns pc on pc.id = c.campaign_id
  left join public.events e on e.id = c.event_id
  left join public.event_combo_offers o on o.event_id = c.event_id and o.archived_at is null
  where c.id = p_code_id;
$$;

revoke all on function public.staff_simulate_promotion_code(uuid) from public, anon, authenticated;
grant execute on function public.staff_simulate_promotion_code(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Campana
--
-- La campana describe la experiencia: si el codigo financia, el beneficio lo
-- dice. `financed` y `mercado_pago_enabled` se agregan ademas a las columnas
-- que disparan el trigger -- sin eso, cambiar solo el medio de pago o el
-- financiamiento dejaba la campana contando la version anterior.
-- ---------------------------------------------------------------------------

create or replace function plu_private.sync_discount_code_campaign()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_campaign_id uuid := coalesce(new.campaign_id, new.id);
  v_objective text;
  v_benefit_type text;
  v_status text;
  v_visibility text;
  v_destination text;
begin
  v_objective := case new.kind
    when 'offer' then 'exclusive_offer'
    when 'access' then 'access'
    when 'fixed_price' then 'fixed_price'
    else 'discount'
  end;
  v_benefit_type := case new.kind
    when 'offer' then 'membership_registration'
    when 'access' then 'combo_access'
    when 'fixed_price' then 'fixed_price'
    else 'percent_discount'
  end;
  v_status := case
    when new.archived_at is not null then 'archived'
    when not new.active then 'paused'
    when new.expires_at is not null and new.expires_at < now() then 'expired'
    when new.starts_at is not null and new.starts_at > now() then 'scheduled'
    else 'active'
  end;
  v_visibility := case when new.audience = 'public' then 'public' else 'secret' end;
  v_destination := case
    when new.kind = 'offer' then 'account_offer'
    when new.applies_to = 'membership' then 'membership_checkout'
    when new.applies_to in ('registration', 'combo') then 'event_checkout'
    else 'stay'
  end;

  insert into public.promotion_campaigns(
    id, organization_id, slug, name, description, objective, status,
    visibility, destination_kind, event_id, starts_at, expires_at
  ) values (
    v_campaign_id,
    new.organization_id,
    lower(new.code) || '-' || left(new.id::text, 8),
    coalesce(nullif(trim(new.description), ''), new.code),
    new.description,
    v_objective,
    v_status,
    v_visibility,
    v_destination,
    new.event_id,
    new.starts_at,
    new.expires_at
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    objective = excluded.objective,
    status = excluded.status,
    visibility = excluded.visibility,
    destination_kind = excluded.destination_kind,
    event_id = excluded.event_id,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    updated_at = now();

  insert into public.promotion_campaign_benefits(
    organization_id, campaign_id, benefit_type, event_id, percent_off,
    fixed_price, fixed_price_manual, currency, metadata
  ) values (
    new.organization_id,
    v_campaign_id,
    v_benefit_type,
    new.event_id,
    new.percent_off,
    new.fixed_price,
    new.fixed_price_manual,
    'ARS',
    jsonb_build_object(
      'appliesTo', new.applies_to,
      'manualChannels', to_jsonb(coalesce(new.manual_channels, '{}'::text[])),
      'mercadoPagoEnabled', new.mercado_pago_enabled,
      'financed', new.financed
    )
  )
  on conflict (campaign_id) do update set
    benefit_type = excluded.benefit_type,
    event_id = excluded.event_id,
    percent_off = excluded.percent_off,
    fixed_price = excluded.fixed_price,
    fixed_price_manual = excluded.fixed_price_manual,
    metadata = excluded.metadata,
    updated_at = now();

  new.campaign_id := v_campaign_id;
  return new;
end;
$$;

drop trigger if exists discount_codes_campaign_sync on public.discount_codes;
create trigger discount_codes_campaign_sync
before insert or update of code, description, kind, audience, applies_to, event_id,
  percent_off, fixed_price, fixed_price_manual, manual_channels, mercado_pago_enabled,
  financed, starts_at, expires_at, active, archived_at
on public.discount_codes
for each row execute function plu_private.sync_discount_code_campaign();

-- ---------------------------------------------------------------------------
-- 7. Verificacion
-- ---------------------------------------------------------------------------

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'financed'
  ) then
    raise exception 'Falta la columna financed del codigo de promocion.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('plu_private.settle_order_financing(uuid)') is null then
    raise exception 'Falta la regla unica de financiamiento.' using errcode = 'PLU01';
  end if;
  if exists (
    select 1 from public.discount_codes
    where financed and (cardinality(manual_channels) = 0 or audience <> 'code')
  ) then
    raise exception 'Hay codigos financiados sin canal manual o publicos.' using errcode = 'PLU01';
  end if;
end;
$verification$;
