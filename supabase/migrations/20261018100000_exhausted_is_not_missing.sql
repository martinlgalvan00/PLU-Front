-- Agotado no es inexistente, y recotizar no es volver a comprar — PLU ARG
--
-- Dos cosas que el rechazo de un código le cuenta mal al atleta.
--
-- **1. Un cupo agotado se anuncia como "ese código no existe".**
--
-- `apply_discount_code_to_order` apaga el código en el momento en que se llena
-- el cupo (`active = false`, `quota_closed_at = now()`, 20261001100000). Después
-- el cascade de rechazos de las tres RPC del atleta mira `active` ANTES que
-- `max_redemptions`, así que contesta 'inactive' — y `concealInactiveReason`
-- (server/services/offerCodeService.js) lo colapsa a 'not_found' por
-- antienumeración. Resultado medido: un código repartido a mano que agota su
-- cupo le dice al resto "Ese código no existe.".
--
-- El colapso está bien y no se toca: un código PAUSADO por staff tiene que ser
-- indistinguible de uno que nunca existió. Pero un código agotado es otra cosa,
-- y la cabecera de `concealInactiveReason` ya lo dice: 'limit_reached' es uno de
-- los motivos que se conservan a propósito. Sólo que era inalcanzable, porque el
-- autocierre lo tapaba con su propio apagado.
--
-- El sello distingue los dos casos sin ambigüedad: `quota_closed_at` lo escribe
-- únicamente el autocierre (`apply_discount_code_to_order` y
-- `close_discount_code_on_quota_shrink`), la decisión manual de staff lo borra
-- siempre (`staff_set_discount_code_state`) y la liberación de una orden muerta
-- lo limpia al reabrir (`release_unpaid_discount_redemption`). De ahí sale
-- `plu_private.inactive_code_reason`.
--
-- **2. El preview promete un ahorro sobre una compra ya pagada.**
--
-- 20261017100000 salteó el cascade del preview ante cualquier redención propia,
-- para que cambiar de medio de pago sobre una orden ya creada no rebotara con
-- 'already_used'. Correcto para el caso que venía a arreglar —una orden ABIERTA,
-- que es lo que el atleta está recotizando— y demasiado ancho para el resto:
-- con la compra ya aprobada, el mismo salteo deja el preview en válido sobre
-- OTRA compra. Medido contra la base: código de 20% usado y pagado en el evento
-- A, el atleta va al evento B, la banda anuncia "Ahorrás $24.000" y el alta se
-- cae con PLU22 "Ya usaste este código.".
--
-- El salteo se angosta a lo que era su motivo: una redención propia cuya orden
-- sigue viva ('pendiente' o 'validacion_manual' — 'creado' no existe en el check
-- de `athlete_payment_orders`). Con la orden cerrada vuelve 'already_used', en el
-- mismo lugar del cascade donde lo había puesto 20260928100000: antes del cupo,
-- para que un tope lleno CON la redención propia diga "ya lo usaste" y no "se
-- agotó". Un reembolso queda del lado cerrado a propósito: no libera el canje
-- (20260906100000), así que el código no se puede volver a usar.
--
-- Nada de esto toca la integridad: la puerta dura sigue siendo
-- `apply_discount_code_to_order`, que valida el código entero dentro de la
-- transacción que crea la orden. Acá sólo se corrige lo que se anuncia.

-- ---------------------------------------------------------------------------
-- 0. Por qué está apagado un código apagado
-- ---------------------------------------------------------------------------

create or replace function plu_private.inactive_code_reason(p_code public.discount_codes)
returns text
language sql
stable
set search_path = public, plu_private
as $$
  select case
    -- El sello del autocierre más el cupo efectivamente lleno. Se piden los dos
    -- para que un sello que quedara colgado no convierta una pausa de staff en
    -- un "se agotó" que el contador desmiente.
    when p_code.quota_closed_at is not null
     and p_code.max_redemptions is not null
     and (
       select count(*) from public.discount_code_redemptions r
       where r.discount_code_id = p_code.id
     ) >= p_code.max_redemptions
      then 'limit_reached'
    else 'inactive'
  end;
$$;

revoke all on function plu_private.inactive_code_reason(public.discount_codes)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. El preview: el salteo es para una compra viva, y el agotado se nombra
--
-- Cuerpo de 20261017100000 con el salteo atado a una orden abierta, el
-- 'already_used' de vuelta en su lugar y el motivo del apagado resuelto.
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
  v_own_redemption boolean;
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

    -- La recotización es una compra VIVA, no cualquier redención propia.
    --
    -- 20261017100000 salteaba el cascade ante cualquier fila propia en
    -- `discount_code_redemptions`, para que cambiar de medio de pago sobre una
    -- orden ya creada no rebotara con 'already_used'. Esa orden está abierta:
    -- es la única situación donde el atleta está recotizando lo suyo. Con la
    -- compra ya pagada la misma puerta anunciaba un ahorro sobre OTRA compra
    -- que `apply_discount_code_to_order` después rechaza con PLU22 -- la banda
    -- prometía "Ahorrás $X" y el alta se caía.
    --
    -- Un reembolso no libera el canje (20260906100000), así que también queda
    -- afuera: la redención sobrevive como registro contable y el código ya no
    -- se puede volver a usar.
    select exists(
      select 1
      from public.discount_code_redemptions r
      join public.athlete_payment_orders o on o.id = r.payment_order_id
      where r.discount_code_id = v_code.id
        and r.athlete_id = p_athlete_id
        and o.status in ('pendiente', 'validacion_manual')
    ) into v_own_redemption;

    if not v_own_redemption then
      if not v_code.active then
        return jsonb_build_object(
          'valid', false, 'reason', plu_private.inactive_code_reason(v_code)
        );
      end if;
      if v_code.starts_at is not null and v_code.starts_at > now() then
        return jsonb_build_object(
          'valid', false, 'reason', 'not_started', 'startsAt', v_code.starts_at
        );
      end if;
      if v_code.expires_at is not null and v_code.expires_at < now() then
        return jsonb_build_object('valid', false, 'reason', 'expired');
      end if;
      if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
        return jsonb_build_object('valid', false, 'reason', 'not_invited');
      end if;

      -- Redención propia que no es una compra viva: la usó de verdad. Va antes
      -- que el cupo (20260928100000): si el tope está lleno CON su propia
      -- redención, "ya lo usaste" es la respuesta correcta, no "se agotó".
      if exists(
        select 1 from public.discount_code_redemptions
        where discount_code_id = v_code.id and athlete_id = p_athlete_id
      ) then
        return jsonb_build_object('valid', false, 'reason', 'already_used');
      end if;

      if v_code.max_redemptions is not null
         and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
             >= v_code.max_redemptions then
        return jsonb_build_object('valid', false, 'reason', 'limit_reached');
      end if;
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
    -- Alcance del código, que el checkout necesita para distinguir un precio
    -- promocional que ES el paquete (alcance 'combo') de uno que sólo baja el
    -- precio de una afiliación o una inscripción sueltas (20260918100000).
    'appliesTo', v_code.applies_to,
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
    -- pago, antes incluso de crear la orden. Sólo con `financed` encendido —
    -- misma condición que el canje (20260926100000): un código que no financia
    -- no tiene ningún plazo que anunciar, aunque la columna guarde el default.
    'financingTermDays', case when v_code.financed then coalesce(v_code.financing_term_days, 7) end,
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. El canje universal: mismo motivo, mismo lugar
--
-- Cuerpo de 20260928100000 con el motivo del apagado resuelto. El salteo del
-- cascade para quien vuelve a su ficha NO se angosta: ahí la compra pagada es
-- justamente lo que hay que devolver, no rechazar.
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
  v_bundle_surface boolean;
  v_own_redemption boolean;
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

  -- ¿El código abre una ficha? Son las mismas dos ramas que más abajo llaman a
  -- athlete_unlock_offer_code: las modalidades legadas con inscripción y el
  -- código-paquete vivo (fixed_price con alcance de combo).
  v_bundle_surface :=
    (v_code.kind in ('offer', 'access') and v_code.event_id is not null)
    or (v_code.kind = 'fixed_price' and v_code.applies_to = 'combo'
        and v_code.event_id is not null);

  -- La redención es la compra (se escribe al crear la orden y se libera si esa
  -- orden muere sin pagarse, 20260906100000). Si existe, el cupo, la ventana y
  -- la pausa del código ya no le aplican a esta persona: su trámite está hecho
  -- o en curso, y el canje tiene que devolverla a la ficha, no rechazarla.
  select exists (
    select 1 from public.discount_code_redemptions
    where discount_code_id = v_code.id and athlete_id = p_athlete_id
  ) into v_own_redemption;

  -- El conteo se calcula siempre que haya tope: el benefit lo publica aunque el
  -- cascade no corra.
  if v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = v_code.id;
  end if;

  if not (v_bundle_surface and v_own_redemption) then
    if not v_code.active then
      v_result := jsonb_build_object(
        'status', 'rejected', 'reason', plu_private.inactive_code_reason(v_code)
      );
    elsif v_code.starts_at is not null and v_code.starts_at > now() then
      v_result := jsonb_build_object('status', 'rejected', 'reason', 'not_started', 'startsAt', v_code.starts_at);
    elsif v_code.expires_at is not null and v_code.expires_at < now() then
      v_result := jsonb_build_object('status', 'rejected', 'reason', 'expired');
    elsif not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
      v_result := jsonb_build_object('status', 'rejected', 'reason', 'not_invited');
    elsif v_code.max_redemptions is not null and v_redeemed >= v_code.max_redemptions then
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
-- 3. El unlock: la tercera puerta que decía lo mismo
--
-- Cuerpo de 20260928100000 con el motivo del apagado resuelto. Hoy su respuesta
-- no llega a ninguna pantalla viva —el checkout del combo la usa para registrar
-- la llave y descarta el motivo—, pero es el mismo cascade y dejarlo distinto
-- sería una trampa para el próximo que lo lea.
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
  if v_code.kind not in ('offer', 'access')
     and not (v_code.kind = 'fixed_price' and v_code.applies_to = 'combo') then
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

  -- Ya comprada: el unlock se conserva (la ficha muestra la oferta usada) pero
  -- no se vuelve a evaluar nada más — ni cupo, ni ventana, ni invitaciones, ni
  -- estado. La compra ya está hecha o en curso, y esta llamada tiene que
  -- devolverla, no juzgar si hoy se podría volver a hacer.
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

  if not v_code.active then
    return jsonb_build_object(
      'unlocked', false, 'reason', plu_private.inactive_code_reason(v_code)
    );
  end if;
  if v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = v_code.id;
    if v_redeemed >= v_code.max_redemptions then
      return jsonb_build_object('unlocked', false, 'reason', 'limit_reached');
    end if;
  end if;

  -- Una oferta que no se puede comprar no se desbloquea: mejor decirlo en el
  -- canje que dejar la ficha ofreciendo algo que el checkout va a rechazar.
  --
  -- De dónde sale el paquete decide qué se valida. Una oferta autosuficiente
  -- nombra su plan y su vigencia es la del código, ya chequeada arriba: alcanza
  -- con que ese plan siga vigente. El código-paquete (`fixed_price` +
  -- `applies_to = 'combo'`) es igual de autosuficiente: su precio es el suyo
  -- propio (`offer_code_payload` lo arma desde `fixed_price`/`fixed_price_manual`,
  -- nunca desde `event_combo_offers`), así que no le queda nada más que pedirle
  -- a una tabla retirada. Sólo la modalidad legada `kind = 'offer'` sigue
  -- cobrando el precio del combo del evento, y sólo ella sigue exigiendo ese
  -- combo cargado, encendido y en ventana — `archived_at` incluido, porque uno
  -- archivado no se puede vender.
  if v_code.membership_plan_id is not null
     and (v_code.kind = 'offer' or (v_code.kind = 'fixed_price' and v_code.applies_to = 'combo')) then
    if not exists (
      select 1 from public.membership_plans pl
      where pl.id = v_code.membership_plan_id
        and pl.organization_id = p_organization_id
        and pl.active
        and pl.collection_mode = 'one_time'
        and pl.effective_from <= now()
        and (pl.retired_at is null or pl.retired_at > now())
    ) then
      return jsonb_build_object('unlocked', false, 'reason', 'offer_unavailable');
    end if;
  elsif v_code.kind = 'offer' and not exists (
    select 1 from public.event_combo_offers o
    where o.event_id = v_code.event_id
      and o.archived_at is null
      and o.active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at >= now())
  ) then
    return jsonb_build_object('unlocked', false, 'reason', 'offer_unavailable');
  elsif v_code.kind = 'fixed_price' and v_code.applies_to = 'combo' then
    -- Un codigo-paquete sin afiliacion propia no se puede comprar por ningun
    -- camino: la llave que lee el checkout
    -- (plu_private.athlete_unlocked_offer_code) exige membership_plan_id, y el
    -- core del combo la necesita para saber que afiliacion otorgar. Sin esta
    -- rama el canje contestaba "desbloqueado" y el atleta chocaba dos pantallas
    -- despues con "El combo no esta disponible para este evento". Con el alta
    -- arreglada en 20260925100000 ningun codigo nuevo cae aca: queda de red
    -- para las filas guardadas mientras el alta estuvo rota.
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
-- 4. Que las cuatro quedaron definidas
-- ---------------------------------------------------------------------------

do $definitions$
declare
  v_missing text;
begin
  select string_agg(name, ', ')
    into v_missing
  from unnest(array[
    'inactive_code_reason',
    'athlete_preview_discount_code',
    'athlete_redeem_promotion_code',
    'athlete_unlock_offer_code'
  ]) as name
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'plu_private') and p.proname = name
  );

  if v_missing is not null then
    raise exception 'Quedaron sin definir: %.', v_missing;
  end if;
end
$definitions$;
