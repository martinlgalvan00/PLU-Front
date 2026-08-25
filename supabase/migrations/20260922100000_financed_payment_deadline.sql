-- Plazo de pago del financiamiento — PLU ARG
--
-- 20260909100000 y 20260912100000 dejaron el financiamiento habilitando
-- afiliación e inscripción de forma provisional, con la deuda abierta y sin
-- fecha: nada distinguía "recién declaró, todavía a tiempo" de "declaró hace
-- un mes y nunca pagó". El pedido de producto es concreto: el administrador
-- fija cuántos días tiene el atleta para que Finanzas reciba el pago (por
-- código, igual que ya se fija si financia o no) y, vencido ese plazo sin
-- acreditar, la plataforma da de baja sola la afiliación y la inscripción que
-- había otorgado — mismo criterio que ya usa el rechazo manual
-- (`reject_athlete_payment_order`), sólo que lo dispara el reloj y no una
-- persona.
--
-- Cuatro piezas:
--
--   1. El plazo se guarda en el código (y en el combo restringido, que puede
--      financiar sin código propio) y se fotografía en la orden al mismo
--      tiempo que `financing_allowed` — igual que esa bandera, inmutable una
--      vez tomada la foto.
--   2. El vencimiento se calcula al declarar el pago (`financed_payment_due_at`
--      = ese momento + el plazo), no al crear la orden: el reloj de "cuánto
--      falta para pagar" no puede correr mientras el atleta ni siquiera avisó
--      que va a pagar.
--   3. La baja automática reutiliza EXACTAMENTE la lógica de revocación que ya
--      tenía el rechazo manual — se extrae a `plu_private.revoke_financed_order`
--      y las dos vías (persona, reloj) la llaman con un `cancellation_code`
--      distinto. Ninguna reescribe qué significa "revocar".
--   4. El código de cierre nuevo (`financing_term_expired`) hace que el
--      vencimiento automático quede tan explicado en la fila como cualquier
--      otro cierre (20260910100000: "un estado sin motivo no es un estado").

-- ---------------------------------------------------------------------------
-- 1. Esquema: el plazo vive en el código/combo, se fotografía en la orden
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists financing_term_days integer;

alter table public.discount_codes
  drop constraint if exists discount_codes_financing_term_days_check;
alter table public.discount_codes
  add constraint discount_codes_financing_term_days_check
  check (financing_term_days is null or financing_term_days between 1 and 90);

comment on column public.discount_codes.financing_term_days is
  'Dias que tiene el atleta para que Finanzas acredite el pago desde que lo declara. Solo aplica con financed=true; sin valor propio se toma 7.';

alter table public.event_combo_offers
  add column if not exists financing_term_days integer;

alter table public.event_combo_offers
  drop constraint if exists event_combo_offers_financing_term_days_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_financing_term_days_check
  check (financing_term_days is null or financing_term_days between 1 and 90);

-- Los códigos y combos que ya financiaban antes de este plazo heredan el
-- default que pidió el administrador (7 días) en vez de quedar sin vencimiento.
update public.discount_codes
set financing_term_days = 7
where financed and financing_term_days is null;

update public.event_combo_offers
set financing_term_days = 7
where financed and financing_term_days is null;

alter table public.athlete_payment_orders
  add column if not exists financing_term_days integer,
  add column if not exists financed_payment_due_at timestamptz;

comment on column public.athlete_payment_orders.financing_term_days is
  'Snapshot inmutable de los dias de plazo del codigo/combo, tomado junto con financing_allowed.';
comment on column public.athlete_payment_orders.financed_payment_due_at is
  'Vencimiento del plazo de pago: se calcula al declarar el pago manual (financed_entitlements_at + financing_term_days), no al crear la orden.';

-- El cron sólo necesita mirar las que ya vencieron y siguen abiertas: el resto
-- de la tabla no tiene que entrar en el plan.
create index if not exists athlete_payment_orders_financed_due_idx
  on public.athlete_payment_orders (financed_payment_due_at)
  where financing_allowed
    and financed_entitlements_at is not null
    and financed_entitlements_revoked_at is null;

-- ---------------------------------------------------------------------------
-- 2. El motivo de cierre suma el vencimiento del plazo (20260910100000)
-- ---------------------------------------------------------------------------

alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_cancellation_code_check;
alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_cancellation_code_check
  check (cancellation_code is null or cancellation_code in (
    'expired_without_payment',
    'expired_after_failed_attempt',
    'provider_cancelled',
    'cancelled_by_staff',
    'superseded_by_new_order',
    'resolved_off_platform',
    -- Financiamiento declarado, plazo vencido, Finanzas nunca acreditó: la
    -- plataforma dio de baja sola lo que había otorgado.
    'financing_term_expired'
  ));

-- ---------------------------------------------------------------------------
-- 3. `settle_order_financing` fotografía el plazo junto con la bandera
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
  v_term_days int;
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

  -- 1. La condicion del codigo aplicado a ESTA orden, y el plazo que trae.
  select coalesce(c.financed, false), c.financing_term_days into v_financed, v_term_days
  from public.discount_codes c
  where c.id = v_order.discount_code_id;

  -- 2. El combo restringido del evento, que puede financiar sin codigo propio
  --    (20260828110000), con su propio plazo.
  if not coalesce(v_financed, false) and v_order.concept = 'combo' then
    select coalesce(o.financed and o.audience = 'code', false), o.financing_term_days
      into v_financed, v_term_days
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
      -- Sin plazo propio cargado (codigos de antes de esta migracion que no
      -- pasaron por el backfill), 7 dias es el default que pidio el
      -- administrador.
      financing_term_days = coalesce(v_term_days, 7),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_order_financing(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. `athlete_confirm_manual_payment` calcula el vencimiento al declarar
-- ---------------------------------------------------------------------------

create or replace function public.athlete_confirm_manual_payment(
  p_order_id uuid,
  p_athlete_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_entitlements_granted boolean := false;
begin
  select * into v_order
  from public.athlete_payment_orders
  where id = p_order_id
  for update;

  if not found or v_order.athlete_id <> p_athlete_id then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link'
     or coalesce(v_order.manual_payment_channel, 'bank_transfer')
       not in ('bank_transfer', 'cash_pitbull') then
    raise exception 'La orden no admite declaracion de pago manual.' using errcode = 'PLU10';
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite esta declaracion.' using errcode = 'PLU10';
  end if;

  if v_order.manual_payment_declared_at is not null then
    select * into v_membership from public.memberships where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'financed', v_order.financing_allowed,
      'entitlementsGranted', v_order.financed_entitlements_at is not null
        and v_order.financed_entitlements_revoked_at is null,
      'duplicate', true
    );
  end if;

  update public.athlete_payment_orders
  set status = 'validacion_manual',
      manual_payment_declared_at = now(),
      -- Una declaracion espera una decision humana; no es un checkout
      -- abandonado que el cron pueda cancelar por vencimiento.
      expires_at = null,
      financed_entitlements_at = case
        when financing_allowed then coalesce(financed_entitlements_at, now())
        else financed_entitlements_at
      end,
      financed_entitlements_revoked_at = case
        when financing_allowed then null else financed_entitlements_revoked_at
      end,
      -- El reloj del plazo arranca ACA, no cuando se creo la orden: no puede
      -- correr mientras el atleta ni siquiera aviso que va a pagar.
      financed_payment_due_at = case
        when financing_allowed then coalesce(
          financed_payment_due_at,
          now() + (coalesce(financing_term_days, 7) * interval '1 day')
        )
        else financed_payment_due_at
      end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.financing_allowed then
    if v_order.concept in ('membership', 'combo') then
      update public.memberships
      set status = 'activa', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null then
        update public.athletes
        set status = 'afiliado_activo', updated_at = now()
        where id = v_order.athlete_id;
        v_entitlements_granted := true;
      end if;
    end if;

    if v_order.concept in ('registration', 'combo') then
      update public.event_registrations
      set status = 'confirmada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
      v_entitlements_granted := v_entitlements_granted or v_registration.id is not null;
    end if;
  end if;

  perform plu_private.record_domain_audit(
    'payment.manual_declared_by_athlete',
    'athlete_payment_order',
    p_order_id::text,
    'athlete',
    p_athlete_id::text,
    jsonb_build_object(
      'concept', v_order.concept,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'reference', v_order.reference,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'financingAllowed', v_order.financing_allowed,
      'financedPaymentDueAt', v_order.financed_payment_due_at,
      'entitlementsGranted', v_entitlements_granted,
      'hasPaymentProof', v_order.payment_proof_path is not null
    ),
    v_order.organization_id
  );

  select * into v_membership from public.memberships where payment_order_id = p_order_id;
  select * into v_registration from public.event_registrations where payment_order_id = p_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'financed', v_order.financing_allowed,
    'entitlementsGranted', v_entitlements_granted,
    'duplicate', false
  );
end;
$$;

revoke all on function public.athlete_confirm_manual_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_confirm_manual_payment(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Una sola regla de revocación, dos disparadores (persona, reloj)
--
-- Antes vivía entera dentro de `reject_athlete_payment_order`. Se extrae acá
-- para que el vencimiento automático la reutilice sin reescribirla: la
-- pregunta que contestan las dos vías es idéntica ("¿qué pasa cuando esta
-- orden financiada se cierra sin que Finanzas haya acreditado?").
-- ---------------------------------------------------------------------------

create or replace function plu_private.revoke_financed_order(
  p_order_id uuid,
  p_reason text,
  p_actor text,
  p_cancellation_code text,
  p_actor_type text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_cash boolean;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se rechazan por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'rechazado' then
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true);
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite rechazo.' using errcode = 'PLU10';
  end if;

  v_cash := coalesce(v_order.manual_payment_channel, 'bank_transfer') = 'cash_pitbull';
  if v_order.payment_proof_path is null and not v_cash
     and v_order.manual_payment_declared_at is null then
    raise exception 'No hay comprobante ni declaracion para rechazar.' using errcode = 'PLU10';
  end if;

  update public.athlete_payment_orders
  set status = 'rechazado',
      rejected_at = now(),
      rejected_by = coalesce(p_actor, 'staff:desconocido'),
      rejection_reason = p_reason,
      financed_entitlements_revoked_at = case
        when financed_entitlements_at is not null then now()
        else financed_entitlements_revoked_at
      end,
      cancellation_code = p_cancellation_code,
      cancellation_reason = p_reason,
      cancelled_by = coalesce(p_actor, 'staff:desconocido'),
      cancelled_at = now(),
      updated_at = now()
  where id = p_order_id returning * into v_order;

  update public.event_registrations
  set status = 'cancelada', updated_at = now()
  where payment_order_id = p_order_id
    and status in ('pendiente_pago', 'confirmada');

  if v_order.financed_entitlements_at is not null then
    update public.memberships
    set status = 'cancelada', updated_at = now()
    where payment_order_id = p_order_id
    returning * into v_membership;

    if v_membership.id is not null and not exists (
      select 1 from public.memberships m
      where m.athlete_id = v_order.athlete_id
        and m.id <> v_membership.id
        and m.status = 'activa'
        and coalesce(m.expiration_date, current_date - 1) >= current_date
    ) then
      update public.athletes
      set status = 'registrado', updated_at = now()
      where id = v_order.athlete_id and status = 'afiliado_activo';
    end if;
  end if;

  perform plu_private.record_domain_audit(
    'payment.rejected_manually', 'athlete_payment_order', p_order_id::text,
    p_actor_type, p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'reason', p_reason,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'manualPaymentDeclaredAt', v_order.manual_payment_declared_at,
      'financedEntitlementsRevoked', v_order.financed_entitlements_revoked_at is not null,
      'hasPaymentProof', v_order.payment_proof_path is not null,
      'cancellationCode', p_cancellation_code
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

revoke all on function plu_private.revoke_financed_order(uuid, text, text, text, text)
  from public, anon, authenticated;

-- Misma firma de siempre: sigue siendo la puerta manual del panel, ahora
-- delegando en la regla compartida con el codigo de cierre de siempre.
create or replace function public.reject_athlete_payment_order(
  p_order_id uuid,
  p_reason text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
begin
  return plu_private.revoke_financed_order(
    p_order_id, p_reason, p_actor, 'cancelled_by_staff', 'staff'
  );
end;
$$;

revoke all on function public.reject_athlete_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_athlete_payment_order(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. El reloj: da de baja sola lo que el plazo dejó vencido
--
-- Mismo patron que `expire_domain_orders` (cron -> RPC -> jsonb con el
-- recuento), pero sobre financiamiento declarado en vez de checkout
-- abandonado: acá la orden no está huérfana, otorgó derechos de verdad, y
-- por eso pasa por la misma revocación que un rechazo humano en vez de un
-- simple `status = 'cancelado'`.
-- ---------------------------------------------------------------------------

create or replace function public.expire_financed_payment_orders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order_id uuid;
  v_count int := 0;
begin
  for v_order_id in
    select o.id from public.athlete_payment_orders o
    where o.financing_allowed
      and o.financed_entitlements_at is not null
      and o.financed_entitlements_revoked_at is null
      and o.financed_payment_due_at is not null
      and o.financed_payment_due_at <= p_now
      and o.status in ('pendiente', 'validacion_manual')
    order by o.financed_payment_due_at
    for update of o skip locked
  loop
    -- Una fila que cambió de estado entre el cursor y el revoke (Finanzas la
    -- aprobó o la rechazó en el medio) no puede tirar abajo el resto del
    -- lote: se salta y sigue. Si sigue elegible, la agarra la corrida de
    -- mañana.
    begin
      perform plu_private.revoke_financed_order(
        v_order_id,
        'Venció el plazo de financiamiento sin que Finanzas acreditara el pago.',
        'system:expire_financed_payment_orders',
        'financing_term_expired',
        'system'
      );
      v_count := v_count + 1;
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('expiredOrders', v_count);
end;
$$;

revoke all on function public.expire_financed_payment_orders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_financed_payment_orders(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. El panel: guardar y leer el plazo del código
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
  -- Default 7 (20260922100000): el plazo que pidio el administrador cuando el
  -- panel no manda uno explicito.
  v_financing_term_days int := coalesce(nullif(p_code ->> 'financingTermDays', '')::int, 7);
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

  -- El plazo sólo significa algo con financiamiento encendido, pero se valida
  -- siempre que venga cargado: un valor fuera de rango no se guarda nunca,
  -- financie o no.
  if v_financing_term_days < 1 or v_financing_term_days > 90 then
    raise exception 'El plazo de pago tiene que ser de entre 1 y 90 días.' using errcode = 'PLU01';
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
        financing_term_days = v_financing_term_days,
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, event_id, max_redemptions, starts_at, expires_at,
        active, manual_channels, mercado_pago_enabled, financed, financing_term_days
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_event_id, v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels,
        v_mercado_pago_enabled, v_financed, v_financing_term_days
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

-- `staff_get_pricing_configuration` suma el plazo a lo que ya devolvía para
-- cada código y para el combo restringido del evento, para que el panel lo
-- pueda mostrar y editar sin una consulta aparte.
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
              'financingTermDays', o.financing_term_days,
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
          'financingTermDays', c.financing_term_days,
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
-- 8. El reloj corre en pg_cron, no en el proceso de Express
--
-- Mismo motivo que 20260724000000: Vercel Functions no garantiza un proceso
-- residente, así que el vencimiento tiene que dispararse desde el propio
-- Postgres. Se suma a la MISMA corrida de 3 minutos en vez de programar un
-- job aparte — es el barrido de vencimientos, uno más.
-- ---------------------------------------------------------------------------

select cron.unschedule(jobid)
from cron.job
where jobname = 'expire-domain-orders-sweep';

select cron.schedule(
  'expire-domain-orders-sweep',
  '*/3 * * * *',
  $$
    select public.expire_ticket_reservations(now());
    select public.expire_domain_orders(now());
    select public.expire_financed_payment_orders(now());
  $$
);

-- ---------------------------------------------------------------------------
-- 9. El plazo también viaja en el preview, antes de crear la orden
--
-- `athlete_preview_discount_code` ya avisaba "este código habilita al
-- avisar el pago" en la ficha del código, antes de elegir transferencia o
-- efectivo — es lo que cambia la decisión de quien todavía no juntó la
-- plata. Faltaba decir POR CUÁNTO TIEMPO: sin el plazo, esa promesa sonaba
-- indefinida. Mismo cuerpo que 20260912100000, sólo con `financingTermDays`
-- sumado al resultado.
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
    -- Si el código deja delegar el pago, el checkout lo dice ANTES de crear
    -- la orden: es lo que cambia la decisión de quien todavía no juntó la plata.
    -- La foto autoritativa la sigue tomando
    -- `plu_private.settle_order_financing` dentro de la transacción.
    'financed', v_code.financed,
    -- Cuántos días tiene para que Finanzas acredite una vez que declare el
    -- pago, antes incluso de crear la orden: es la otra mitad de la promesa
    -- de arriba, y sin esto sonaba indefinida.
    'financingTermDays', v_code.financing_term_days,
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 10. Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_payment_orders'
      and column_name = 'financed_payment_due_at'
  ) then
    raise exception 'Falta el vencimiento del plazo de financiamiento.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.expire_financed_payment_orders(timestamptz)') is null then
    raise exception 'Falta la baja automatica por vencimiento de plazo.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('plu_private.revoke_financed_order(uuid,text,text,text,text)') is null then
    raise exception 'Falta la regla compartida de revocacion.' using errcode = 'PLU01';
  end if;
  if exists (
    select 1 from public.discount_codes
    where financed and financing_term_days is null
  ) then
    raise exception 'Hay codigos financiados sin plazo de pago.' using errcode = 'PLU01';
  end if;
  if not exists (
    select 1 from cron.job
    where jobname = 'expire-domain-orders-sweep'
      and command like '%expire_financed_payment_orders%'
  ) then
    raise exception 'El barrido de pg_cron no quedo actualizado con el vencimiento de financiamiento.'
      using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.athlete_preview_discount_code(uuid,uuid,text,text,int,text)') is null then
    raise exception 'Falta athlete_preview_discount_code.' using errcode = 'PLU01';
  end if;
end;
$verification$;
