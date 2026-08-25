-- Endurecimiento del vencimiento automatico de financiamiento — PLU ARG
--
-- 20260922100000 dejo el plazo funcionando de punta a punta para las ordenes
-- que nacen despues de ella, pero con tres agujeros que solo se ven en
-- produccion:
--
--   1. NINGUNA orden ya declarada vence. El reloj exige
--      `financed_payment_due_at is not null` y esa columna solo se escribe
--      dentro de `athlete_confirm_manual_payment`. Toda orden financiada que
--      declaro el pago ANTES de esa migracion quedo con la columna en null y
--      por lo tanto exenta para siempre: son exactamente los casos que la
--      migracion decia venir a resolver ("declaro hace un mes y nunca pago").
--   2. El reloj se auditaba como si fuera una persona. Las dos vias comparten
--      `revoke_financed_order`, y esa funcion asienta siempre
--      `payment.rejected_manually`: en la bitacora una baja automatica es
--      indistinguible de un rechazo de Finanzas, justo el dato que hace falta
--      para explicarle a un atleta por que perdio la inscripcion.
--   3. Los fallos del barrido eran invisibles. `exception when others then
--      null` descarta el error sin contarlo: una orden que no se puede revocar
--      se reintenta cada 3 minutos para siempre y nadie se entera.
--
-- Se corrigen los tres sin cambiar QUE significa vencer: la regla sigue siendo
-- una sola (`plu_private.revoke_financed_order`) y el codigo de cierre sigue
-- siendo `financing_term_expired`.

-- ---------------------------------------------------------------------------
-- 1. La auditoria dice quien corto: la persona o el reloj
--
-- Mismo cuerpo que 20260922100000 salvo el nombre del asiento y dos campos de
-- metadata (el plazo y su vencimiento), que son lo que permite reconstruir
-- despues por que se corto en esa fecha y no en otra.
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

  -- El asiento se elige por el codigo de cierre, no por el actor: es el mismo
  -- dato que ya distingue las dos vias en la fila de la orden, y asi no hay
  -- forma de que la bitacora y la orden se contradigan.
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
      -- Con que plazo se corto y cuando vencia: sin estos dos, una baja
      -- automatica no se puede explicar ni auditar hacia atras.
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
-- 2. El barrido cuenta y explica lo que no pudo cortar
--
-- `exception when others then null` es correcto en cuanto a que una fila que
-- cambio de estado en el medio no puede tirar el lote abajo, pero descartar el
-- error deja al barrido mintiendo: devolvia `expiredOrders: 0` tanto cuando no
-- habia nada que vencer como cuando fallaron las diez que habia. Ahora cada
-- fallo se cuenta y se asienta con su sqlstate, asi que una orden que no se
-- puede revocar aparece en la bitacora en vez de reintentarse en silencio cada
-- 3 minutos.
-- ---------------------------------------------------------------------------

create or replace function public.expire_financed_payment_orders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order_id uuid;
  v_organization_id uuid;
  v_count int := 0;
  v_failed int := 0;
  v_error text;
  v_state text;
begin
  for v_order_id, v_organization_id in
    select o.id, o.organization_id from public.athlete_payment_orders o
    where o.financing_allowed
      and o.financed_entitlements_at is not null
      and o.financed_entitlements_revoked_at is null
      and o.financed_payment_due_at is not null
      and o.financed_payment_due_at <= p_now
      and o.status in ('pendiente', 'validacion_manual')
    order by o.financed_payment_due_at
    for update of o skip locked
  loop
    -- Una fila que cambio de estado entre el cursor y el revoke (Finanzas la
    -- aprobo o la rechazo en el medio) no puede tirar abajo el resto del
    -- lote: se salta y sigue. Si sigue elegible, la agarra la corrida
    -- siguiente.
    begin
      perform plu_private.revoke_financed_order(
        v_order_id,
        'Vencio el plazo de financiamiento sin que Finanzas acreditara el pago.',
        'system:expire_financed_payment_orders',
        'financing_term_expired',
        'system'
      );
      v_count := v_count + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_error := sqlerrm;
      v_state := sqlstate;
      -- Fuera del bloque que se rollbackeo: el asiento se escribe en la
      -- transaccion del barrido, no en la subtransaccion que fallo.
      perform plu_private.record_domain_audit(
        'payment.financing_expiry_failed', 'athlete_payment_order', v_order_id::text,
        'system', 'system:expire_financed_payment_orders',
        jsonb_build_object('sqlstate', v_state, 'message', v_error),
        v_organization_id
      );
    end;
  end loop;

  return jsonb_build_object('expiredOrders', v_count, 'failedOrders', v_failed);
end;
$$;

revoke all on function public.expire_financed_payment_orders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_financed_payment_orders(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Backfill: las ordenes ya declaradas entran al reloj
--
-- El plazo se resuelve con la misma precedencia que `settle_order_financing`
-- (la foto de la orden, si la tiene; despues el codigo; despues el combo
-- restringido; 7 dias como ultimo recurso) para que el backfill no invente una
-- regla propia.
--
-- Piso de gracia: una orden cuyo plazo real ya vencio se cortaria en la
-- corrida siguiente al deploy — la baja seria correcta pero llegaria sin
-- aviso, dentro de los 3 minutos y sobre afiliaciones e inscripciones de gente
-- real. Esas ordenes reciben `now() + 3 dias`, que es la ventana para que
-- Finanzas revise el listado (`payment.financing_term_backfilled` en la
-- bitacora) antes de que el reloj las alcance. Las que todavia estan en plazo
-- conservan su fecha real.
-- ---------------------------------------------------------------------------

do $backfill$
declare
  v_row record;
  v_term int;
  v_real_due timestamptz;
  v_due timestamptz;
  v_grace interval := interval '3 days';
  v_total int := 0;
  v_overdue int := 0;
begin
  for v_row in
    select o.id,
           o.organization_id,
           o.athlete_id,
           o.concept,
           o.financing_term_days,
           o.financed_entitlements_at,
           c.financing_term_days as code_term,
           combo.financing_term_days as combo_term
    from public.athlete_payment_orders o
    left join public.discount_codes c on c.id = o.discount_code_id
    left join lateral (
      select co.financing_term_days
      from public.event_registrations r
      join public.event_combo_offers co
        on co.event_id = r.event_id and co.archived_at is null
      where r.payment_order_id = o.id
      limit 1
    ) combo on true
    where o.financing_allowed
      and o.financed_entitlements_at is not null
      and o.financed_entitlements_revoked_at is null
      and o.financed_payment_due_at is null
      and o.status in ('pendiente', 'validacion_manual')
  loop
    v_term := coalesce(v_row.financing_term_days, v_row.code_term, v_row.combo_term, 7);
    v_real_due := v_row.financed_entitlements_at + (v_term * interval '1 day');
    v_due := v_real_due;

    if v_due <= now() then
      v_overdue := v_overdue + 1;
      v_due := now() + v_grace;
    end if;

    update public.athlete_payment_orders
    set financing_term_days = v_term,
        financed_payment_due_at = v_due,
        updated_at = now()
    where id = v_row.id;

    perform plu_private.record_domain_audit(
      'payment.financing_term_backfilled', 'athlete_payment_order', v_row.id::text,
      'system', 'system:financing_deadline_hardening',
      jsonb_build_object(
        'concept', v_row.concept,
        'athleteId', v_row.athlete_id,
        'financingTermDays', v_term,
        'financedEntitlementsAt', v_row.financed_entitlements_at,
        'financedPaymentDueAt', v_due,
        'alreadyOverdue', v_due <> v_real_due
      ),
      v_row.organization_id
    );

    v_total := v_total + 1;
  end loop;

  raise notice 'Ordenes financiadas incorporadas al reloj: % (ya vencidas, con gracia: %)',
    v_total, v_overdue;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 4. El canje universal tambien dice por cuanto tiempo
--
-- `athlete_redeem_promotion_code` es lo que contesta el campo de Mi cuenta >
-- Beneficios y el auto-canje al entrar a un checkout. Devolvia `financed`
-- pero no el plazo, asi que la pantalla del canje prometia habilitacion sin
-- fecha: la unica que sabia el plazo era la ficha del checkout, dos pasos
-- despues. Cuerpo identico a 20260921100000 salvo ese campo.
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
    v_action := 'apply_to_checkout';
    v_destination := jsonb_build_object(
      'view', 'competition',
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
-- 5. Verificacion
-- ---------------------------------------------------------------------------

do $verification$
begin
  -- Ninguna orden financiada y declarada puede quedar fuera del reloj: es el
  -- agujero que esta migracion existe para cerrar, y tiene que seguir cerrado
  -- despues de correr.
  if exists (
    select 1 from public.athlete_payment_orders
    where financing_allowed
      and financed_entitlements_at is not null
      and financed_entitlements_revoked_at is null
      and financed_payment_due_at is null
      and status in ('pendiente', 'validacion_manual')
  ) then
    raise exception 'Quedaron ordenes financiadas declaradas sin vencimiento de plazo.'
      using errcode = 'PLU01';
  end if;

  if to_regprocedure('public.expire_financed_payment_orders(timestamptz)') is null then
    raise exception 'Falta la baja automatica por vencimiento de plazo.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('plu_private.revoke_financed_order(uuid,text,text,text,text)') is null then
    raise exception 'Falta la regla compartida de revocacion.' using errcode = 'PLU01';
  end if;

  -- El canje tiene que poder decir el plazo: sin este campo la pantalla que
  -- anuncia el codigo vuelve a prometer habilitacion sin fecha.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'athlete_redeem_promotion_code'
      and pg_get_functiondef(p.oid) like '%financingTermDays%'
  ) then
    raise exception 'El canje universal no devuelve el plazo de financiamiento.'
      using errcode = 'PLU01';
  end if;

  -- El barrido tiene que seguir programado por pg_cron: Vercel no garantiza un
  -- proceso residente y el job de Express es un refuerzo, no la fuente.
  if not exists (
    select 1 from cron.job
    where jobname = 'expire-domain-orders-sweep'
      and command like '%expire_financed_payment_orders%'
  ) then
    raise exception 'El barrido de pg_cron no incluye el vencimiento de financiamiento.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
