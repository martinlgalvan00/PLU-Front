-- La ficha del código-paquete, y el pago que se difiere sin mentir — PLU ARG
--
-- Dos pedidos de producto que comparten la misma persona: la que recibe un
-- código de combo.
--
-- 1. **El paquete abre su propia ficha.** Hasta acá un código de combo se
--    canjeaba y el resolvedor mandaba al checkout del torneo, donde el paquete
--    aparecía como una tarjeta más entre el formulario competitivo, el selector
--    de medio de pago y el brick. Un código secreto trae seis condiciones a la
--    vez —qué afiliación, qué inscripción, qué precio, con qué se paga, si
--    financia y por cuánto tiempo— y ninguna se leía como lo que decide.
--    Ahora el canje devuelve `action = 'open_bundle'` con destino
--    `profile / account-offer`: la ficha se lee entera y el trámite se cierra
--    ahí mismo (`startOfferPayment` ya sabía cobrar desde Mi cuenta desde
--    20260902100000; lo que faltaba era la pantalla).
--
-- 2. **Diferir el pago deja de exigir una declaración falsa.** Con un código
--    financiado, la única forma de quedar habilitado era
--    `athlete_confirm_manual_payment`, o sea apretar "ya pagué". Quien pensaba
--    pagar dentro del plazo —que es exactamente para lo que existe el
--    financiamiento— tenía que declarar un pago que no hizo, y Finanzas recibía
--    una declaración para revisar que no correspondía a ninguna transferencia.
--    `athlete_defer_financed_payment` habilita afiliación e inscripción,
--    arranca el reloj y **no** marca pago declarado: la orden queda en
--    'pendiente' con la deuda abierta y auditada.
--
-- El vencimiento no cambia: sigue siendo `expire_financed_payment_orders` cada
-- tres minutos sobre `financed_payment_due_at`, y sigue revocando por
-- `plu_private.revoke_financed_order`.

-- ---------------------------------------------------------------------------
-- 1. La ficha del paquete necesita el plazo y el vencimiento
--
-- Cuerpo de 20260913100000 + dos campos. `financingTermDays` del código es el
-- plazo pactado (lo que promete la ficha antes de comprar); los de la compra
-- son el reloj real, que sólo existe una vez que el derecho se otorgó.
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
    'financed', p_code.financed,
    -- Por cuántos días se puede delegar el pago (20260922100000). La ficha
    -- del paquete promete habilitación al declarar: sin el plazo, esa promesa
    -- no tiene fecha y el atleta no sabe cuándo se le cae.
    'financingTermDays', p_code.financing_term_days,
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
        -- El reloj de esta compra, que es el que cuenta la pantalla: el del
        -- código es el plazo pactado, este es la fecha real de vencimiento.
        'financingTermDays', po.financing_term_days,
        'financedPaymentDueAt', po.financed_payment_due_at,
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
  -- El plan del código gana sobre el del combo: una oferta autosuficiente
  -- nombra su propio paquete y no necesita que el evento tenga combo cargado.
  -- Con `membership_plan_id` nulo -- un 'access', o una oferta creada antes de
  -- esta migración -- sigue saliendo del combo, exactamente como antes.
  left join public.membership_plans pl
    on pl.id = coalesce(p_code.membership_plan_id, o.membership_plan_id);
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El canje del paquete abre la ficha en vez del checkout del torneo
--
-- Cuerpo de 20260923100000 salvo el destino de la rama del combo. El unlock, la
-- auditoría y el resto de las modalidades no se tocan.
-- ---------------------------------------------------------------------------

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
  elsif v_code.kind = 'fixed_price' and v_code.applies_to = 'combo'
     and v_code.event_id is not null then
    -- El combo vive dentro de un precio fijo desde 20260918100000: la
    -- llave que resuelve el paquete sin el objeto 'event_combo_offers' es el
    -- mismo desbloqueo que usaban 'offer'/'access', y sin este paso
    -- 'plu_private.athlete_unlocked_offer_code' no encuentra nada -- el
    -- checkout del torneo pedía el paquete y no había ninguna llave que
    -- mostrarle.
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
    -- El paquete no se aplica dentro del checkout del torneo: abre su propia
    -- ficha en Mi cuenta. Un código de combo es secreto y trae seis condiciones
    -- juntas (qué afiliación, qué inscripción, qué precio, con qué se paga, si
    -- financia y por cuánto), y contarlas como un cupón más adentro de un
    -- formulario de inscripción las deja como notas al pie. `eventSlug` viaja
    -- igual: la ficha cotiza y cobra contra ese torneo.
    v_action := 'open_bundle';
    v_destination := jsonb_build_object(
      'view', 'profile',
      'tab', 'account-offer',
      'eventSlug', (select slug from public.events where id = v_code.event_id)
    );
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
      -- El plazo viajaba en el preview del checkout pero no en el canje
      -- (20260922100000 solo toco `athlete_preview_discount_code`), asi que
      -- la pantalla que anuncia el codigo podia decir "podés avisar el pago
      -- y quedas habilitado" y callar por cuanto tiempo. Sin plazo propio
      -- son 7 dias, el mismo default que aplica `settle_order_financing`.
      'financingTermDays', case when v_code.financed then coalesce(v_code.financing_term_days, 7) end,
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

-- ---------------------------------------------------------------------------
-- 3. Revocar no puede exigir un comprobante que el financiamiento no pide
--
-- `revoke_financed_order` cortaba con PLU10 cuando no había comprobante ni
-- declaración. Esa guarda es correcta para un rechazo de Finanzas sobre una
-- transferencia (no se rechaza lo que nadie declaró), pero deja al reloj sin
-- poder vencer justamente las órdenes que difieren el pago: no tienen
-- comprobante ni declaración **a propósito**. Un derecho ya otorgado
-- (`financed_entitlements_at`) es motivo suficiente para revocarlo.
--
-- Cuerpo de 20260923100000 salvo esa condición.
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
  v_action text;
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
  -- `financed_entitlements_at` se suma a los tres motivos que ya habilitaban el
  -- rechazo: una orden que difirio el pago (20260926100000) otorgo afiliacion e
  -- inscripcion sin comprobante ni declaracion, y sin esta condicion el reloj no
  -- podia vencerla -- fallaba con PLU10 en cada corrida y el derecho quedaba
  -- vivo para siempre.
  if v_order.payment_proof_path is null and not v_cash
     and v_order.manual_payment_declared_at is null
     and v_order.financed_entitlements_at is null then
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

  v_action := case
    when p_cancellation_code = 'financing_term_expired' then 'payment.financing_term_expired'
    else 'payment.rejected_manually'
  end;

  perform plu_private.record_domain_audit(
    v_action, 'athlete_payment_order', p_order_id::text,
    p_actor_type, p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'reason', p_reason,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'manualPaymentDeclaredAt', v_order.manual_payment_declared_at,
      'financedEntitlementsRevoked', v_order.financed_entitlements_revoked_at is not null,
      'hasPaymentProof', v_order.payment_proof_path is not null,
      'cancellationCode', p_cancellation_code,
      'financingTermDays', v_order.financing_term_days,
      'financedPaymentDueAt', v_order.financed_payment_due_at
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

revoke all on function plu_private.revoke_financed_order(uuid, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Diferir el pago: habilitar sin declarar
--
-- Espejo de `athlete_confirm_manual_payment` (20260922100000) en todo salvo lo
-- que la distingue:
--
--   * NO escribe `manual_payment_declared_at`: no hubo pago que declarar, y
--     Finanzas no tiene nada que revisar todavía.
--   * NO pasa la orden a 'validacion_manual': queda 'pendiente'. La bandeja de
--     Finanzas la ve igual, por el filtro de financiadas
--     (`financing_allowed` + `financed_entitlements_at`).
--   * SÍ apaga `expires_at`, por el mismo motivo que la declaración: una orden
--     que ya otorgó derechos no es un checkout abandonado que el cron pueda
--     cancelar (`expire_domain_orders`).
--
-- Sólo aplica con financiamiento encendido: sin él no hay nada que diferir, y
-- habilitar sin pagar sería regalar la afiliación.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_defer_financed_payment(
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
    raise exception 'La orden no admite pago diferido.' using errcode = 'PLU10';
  end if;
  if not v_order.financing_allowed then
    raise exception 'Esta orden no tiene financiamiento habilitado.' using errcode = 'PLU10';
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite esta operacion.' using errcode = 'PLU10';
  end if;

  -- Idempotente: volver a tocar el botón no reinicia el reloj ni vuelve a
  -- otorgar nada. El plazo se cuenta desde la primera habilitación.
  if v_order.financed_entitlements_at is not null
     and v_order.financed_entitlements_revoked_at is null then
    select * into v_membership from public.memberships where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'entitlementsGranted', true,
      'duplicate', true
    );
  end if;

  update public.athlete_payment_orders
  set financed_entitlements_at = now(),
      financed_entitlements_revoked_at = null,
      financed_payment_due_at = now() + (coalesce(financing_term_days, 7) * interval '1 day'),
      -- Una orden con derechos otorgados no vence como checkout abandonado: la
      -- da de baja el plazo del financiamiento, no el reloj de los 30 minutos.
      expires_at = null,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  update public.memberships
  set status = 'activa', updated_at = now()
  where payment_order_id = p_order_id
    and status in ('pendiente_pago', 'cancelada')
  returning * into v_membership;

  update public.event_registrations
  set status = 'confirmada', updated_at = now()
  where payment_order_id = p_order_id
    and status in ('pendiente_pago', 'cancelada');

  update public.athletes
  set status = 'afiliado_activo', updated_at = now()
  where id = p_athlete_id
    and status in ('pre_registrado', 'registrado', 'afiliado_vencido')
    and exists (
      select 1 from public.memberships m
      where m.payment_order_id = p_order_id and m.status = 'activa'
    );

  perform plu_private.record_domain_audit(
    'payment.financing_deferred_by_athlete',
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
      'financingTermDays', v_order.financing_term_days,
      'financedPaymentDueAt', v_order.financed_payment_due_at
    ),
    v_order.organization_id
  );

  select * into v_membership from public.memberships where payment_order_id = p_order_id;
  select * into v_registration from public.event_registrations where payment_order_id = p_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'entitlementsGranted', true,
    'duplicate', false
  );
end;
$$;

revoke all on function public.athlete_defer_financed_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_defer_financed_payment(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_def text;
begin
  if to_regprocedure('public.athlete_defer_financed_payment(uuid,uuid)') is null then
    raise exception 'Falta public.athlete_defer_financed_payment.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_defer_financed_payment';
  -- Diferir no es declarar: si esta funcion escribiera la marca de declaracion,
  -- Finanzas volveria a recibir un pago para revisar que nadie hizo.
  if v_def like '%manual_payment_declared_at =%' then
    raise exception 'athlete_defer_financed_payment no puede declarar el pago.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'revoke_financed_order';
  if v_def not like '%financed_entitlements_at is null%' then
    raise exception 'revoke_financed_order sigue exigiendo comprobante para una orden diferida.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_redeem_promotion_code';
  if v_def not like '%open_bundle%' then
    raise exception 'El canje del paquete no abre su ficha.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'offer_code_payload';
  if v_def not like '%financingTermDays%' or v_def not like '%financedPaymentDueAt%' then
    raise exception 'La ficha del paquete no trae el plazo ni su vencimiento.';
  end if;
end
$verification$;
