-- Declaracion de pago manual y habilitacion financiada — PLU ARG
--
-- El atleta puede avisar que transfirio o entrego efectivo. Ese aviso NO es
-- una acreditacion: la orden sigue en validacion_manual y Finanzas conserva la
-- unica accion que crea el pago aprobado. Cuando el combo restringido por
-- codigo fue configurado con financiamiento, la declaracion habilita en forma
-- provisional afiliacion e inscripcion y deja la deuda abierta y auditable.

alter table public.event_combo_offers
  drop constraint if exists event_combo_offers_financed_code_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_financed_code_check
  check (not financed or audience = 'code');

alter table public.athlete_payment_orders
  add column if not exists financing_allowed boolean not null default false,
  add column if not exists manual_payment_declared_at timestamptz,
  add column if not exists financed_entitlements_at timestamptz,
  add column if not exists financed_entitlements_revoked_at timestamptz;

comment on column public.athlete_payment_orders.financing_allowed is
  'Snapshot inmutable de la condicion financiada del combo al crear la orden.';
comment on column public.athlete_payment_orders.manual_payment_declared_at is
  'Aviso del atleta; no prueba acreditacion ni reemplaza la revision de Finanzas.';
comment on column public.athlete_payment_orders.financed_entitlements_at is
  'Momento en que se habilitaron provisionalmente los derechos por financiamiento.';

create index if not exists athlete_payment_orders_financing_review_idx
  on public.athlete_payment_orders (status, manual_payment_declared_at)
  where financing_allowed and status in ('pendiente', 'validacion_manual');

-- Ordenes abiertas creadas mientras la bandera ya existia: tomar la condicion
-- actual de la oferta solo como backfill. Las nuevas la fotografian dentro del
-- checkout atomico de abajo.
update public.athlete_payment_orders po
set financing_allowed = true,
    updated_at = now()
from public.event_registrations r
join public.event_combo_offers o
  on o.event_id = r.event_id
 and o.archived_at is null
 and o.financed
 and o.audience = 'code'
where r.payment_order_id = po.id
  and po.concept = 'combo'
  and po.method = 'manual_link'
  and coalesce(po.manual_payment_channel, 'bank_transfer') in ('bank_transfer', 'cash_pitbull')
  and po.status in ('pendiente', 'validacion_manual');

-- Misma firma vigente desde 20260827120000. La autorizacion se calcula con la
-- oferta de la inscripcion que la propia transaccion acaba de crear; nunca con
-- un booleano enviado por el navegador.
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
  v_financing_allowed boolean := false;
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

  select coalesce(o.financed and o.audience = 'code', false)
    into v_financing_allowed
  from public.event_registrations r
  join public.event_combo_offers o
    on o.event_id = r.event_id and o.archived_at is null
  where r.payment_order_id = v_order.id
  limit 1;

  v_financing_allowed := coalesce(v_financing_allowed, false)
    and v_order.method = 'manual_link'
    and coalesce(v_order.manual_payment_channel, 'bank_transfer')
      in ('bank_transfer', 'cash_pitbull');

  update public.athlete_payment_orders
  set financing_allowed = financing_allowed or v_financing_allowed,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text
) to service_role;

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

-- Rechazar una declaracion financiada revoca los derechos provisionales. La
-- deuda nunca se convierte en pago por el solo hecho de haber habilitado el
-- acceso.
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
    'staff', p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'reason', p_reason,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'manualPaymentDeclaredAt', v_order.manual_payment_declared_at,
      'financedEntitlementsRevoked', v_order.financed_entitlements_revoked_at is not null,
      'hasPaymentProof', v_order.payment_proof_path is not null
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

revoke all on function public.reject_athlete_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_athlete_payment_order(uuid, text, text)
  to service_role;

-- La ficha de la oferta necesita reanudar la misma declaracion despues de una
-- recarga, por eso incorpora tanto la configuracion como el snapshot de orden.
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

do $verification$
begin
  if to_regprocedure('public.athlete_confirm_manual_payment(uuid,uuid)') is null then
    raise exception 'Falta athlete_confirm_manual_payment.' using errcode = 'PLU01';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_payment_orders'
      and column_name = 'manual_payment_declared_at'
  ) then
    raise exception 'Falta el estado de declaracion manual.' using errcode = 'PLU01';
  end if;
  if exists (select 1 from public.event_combo_offers where financed and audience <> 'code') then
    raise exception 'Hay combos financiados sin codigo.' using errcode = 'PLU01';
  end if;
end;
$verification$;
