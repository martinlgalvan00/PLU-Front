-- El canje universal aprende el combo nuevo — PLU ARG
--
-- 20260918100000 le dio al precio fijo con alcance 'combo' todo lo que hacía
-- falta para vender el paquete sin el objeto `event_combo_offers`: resolvía su
-- afiliación, se podía desbloquear (`athlete_unlock_offer_code`) y el checkout
-- del torneo sabía leer esa llave. Tocó cuatro funciones. Quedó una quinta sin
-- tocar: `athlete_redeem_promotion_code`, el canje universal que usan el campo
-- de Mi cuenta > Beneficios y el auto-canje al llegar a un checkout.
--
-- Su rama de desbloqueo seguía mirando `kind in ('offer', 'access')` -las dos
-- modalidades retiradas- así que un código de combo nuevo caía en el `else`
-- genérico: nunca llamaba a `athlete_unlock_offer_code`, y sin ese desbloqueo
-- ninguna pantalla puede después resolver el paquete por código
-- (`plu_private.athlete_unlocked_offer_code` lee `discount_code_unlocks`, no
-- la tabla de códigos). El operador lo vio así: canjeaba el código, el destino
-- SÍ era el torneo correcto -esa parte ya estaba bien-, pero el checkout no
-- traía nada que pagar, porque la llave nunca se giró.
--
-- Cuerpo idéntico a 20260912100000 salvo la rama nueva, calcada de la de
-- 'offer'/'access' salvo el destino: un precio fijo de combo no abre una ficha
-- aparte (esa pantalla está retirada), aplica dentro del checkout del torneo
-- como cualquier otro código de esa inscripción.
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

do $verification$
begin
  if to_regprocedure('public.athlete_redeem_promotion_code(uuid,uuid,text,jsonb)') is null then
    raise exception 'Falta public.athlete_redeem_promotion_code.';
  end if;
  -- Las modalidades retiradas siguen desbloqueando por su propio camino: esta
  -- migración no las toca.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'athlete_redeem_promotion_code'
      and pg_get_functiondef(p.oid) ilike '%fixed_price%applies_to = ''combo''%'
  ) then
    raise exception 'El canje universal no aprendió el combo nuevo.';
  end if;
end
$verification$;
