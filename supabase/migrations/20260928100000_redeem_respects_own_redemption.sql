-- El canje respeta la redención propia, y el financiamiento el canal pactado — PLU ARG
--
-- Cuatro reportes del mismo QA sobre el rol del atleta con un código-paquete:
--
-- 1. **Quien ya canjeó no puede volver a entrar por el QR.** Un código personal
--    (max_redemptions = 1) se canjea, la compra crea la redención y el cupo
--    queda lleno — con la redención DEL PROPIO atleta. Si vuelve a escanear el
--    QR para retomar el trámite, `athlete_redeem_promotion_code` corta con
--    'limit_reached' ("alcanzó el máximo de usos") antes de mirar de quién es
--    esa redención. Lo mismo con 'inactive' si staff pausó el código después de
--    la compra, y con 'expired' si venció con la orden abierta. La ficha en Mi
--    cuenta seguía existiendo; el camino natural —el QR— decía que no.
--    `athlete_unlock_offer_code` ya tenía la precedencia correcta ("ya
--    comprada: el unlock se conserva"), pero el canje universal nunca llegaba a
--    llamarla: el cascade de rechazos corría primero. Ahora, si el código es de
--    ficha y el atleta ya tiene su redención, el cascade se saltea y el canje
--    delega en el unlock, que responde con la ficha y su compra.
--
-- 2. **La ficha desaparecía con la compra en curso adentro.** `athlete_list_offer_unlocks`
--    exigía `c.active` y un plan vigente para listar. Correcto para un unlock
--    que nunca se compró (no se ofrece lo que el checkout va a rechazar), pero
--    una compra EN CURSO vive en esa ficha: los datos de la transferencia, el
--    botón de diferir, la cuenta regresiva. Si staff apagaba el código —o el
--    plan del paquete se retiraba por una nueva versión de precio— la ficha se
--    esfumaba con la orden pendiente adentro. Ahora la redención propia
--    mantiene la fila listada: el frontend ya distingue solo qué mostrar según
--    el estado de la compra. Archivar o borrar el código sigue siendo la baja
--    dura, esa no cambia.
--
-- 3. **El unlock rechazaba por ventana antes de mirar la compra hecha.** Mismo
--    principio que (1) dentro de `athlete_unlock_offer_code`: la rama "ya
--    comprada" corría después de starts_at/expires_at/invitaciones, así que un
--    código vencido con compra abierta contestaba 'expired' en vez de devolver
--    la ficha. La rama sube: la compra hecha manda.
--
-- 4. **El financiamiento se otorgaba por canales que el código no declaró.**
--    `settle_order_financing` aceptaba cualquier canal manual liquidable
--    (transferencia o efectivo) aunque el código hubiera pactado uno solo. Con
--    el efectivo abierto por Administración, un código financiado "sólo por
--    transferencia" terminaba financiando una compra en efectivo. La bandera
--    del código ahora sólo prende sobre un canal que ese código declaró — que
--    es exactamente lo que la ficha y el reveal anuncian
--    (`promotionPaymentPresentation` cruza financed con manualChannels desde
--    20260912100000). La fuente 2 (el combo restringido del evento) no declara
--    canales y queda igual.
--
-- De paso, dos consistencias del preview (`athlete_preview_discount_code`):
--   * `financingTermDays` sólo viaja con `financed = true`, igual que en el
--     canje (20260926100000). Un código no financiado anunciaba "7 días" de un
--     plazo que no corre.
--   * 'already_used' se evalúa antes que 'limit_reached': si el cupo está lleno
--     CON la redención de quien pregunta, la respuesta correcta es "ya lo
--     usaste", no "se agotó".

-- ---------------------------------------------------------------------------
-- 1. El canje universal: la redención propia manda
--
-- Cuerpo de 20260926100000 con dos cambios: el conteo del cupo se calcula
-- siempre (el benefit lo publica), y el cascade de rechazos no corre cuando el
-- código abre ficha y el atleta ya tiene su redención — esa persona no está
-- pidiendo canjear de nuevo, está volviendo a su trámite.
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
      v_result := jsonb_build_object('status', 'rejected', 'reason', 'inactive');
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
-- 2. El unlock: la compra hecha se responde antes que la ventana
--
-- Cuerpo de 20260925100000 con la rama "ya comprada" movida arriba de
-- starts_at / expires_at / invitaciones. Un código vencido, pausado o cuya
-- lista de invitados cambió no le quita la ficha a quien ya lo compró.
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
    return jsonb_build_object('unlocked', false, 'reason', 'inactive');
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
-- 3. El listado: la redención propia mantiene la ficha viva
--
-- Cuerpo de 20260916100000 más la rama de la redención. `c.active` y el plan
-- vigente siguen decidiendo si un unlock TODAVÍA NO COMPRADO se lista — eso no
-- cambia. Lo que cambia es que apagar el código o retirar el plan ya no borra
-- la ficha de quien tiene una compra hecha o en curso: ahí viven los datos
-- bancarios, el botón de diferir y la cuenta regresiva. El frontend decide qué
-- mostrar según `purchase`, no según esta lista.
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
  left join public.event_combo_offers o
    on o.event_id = c.event_id
   and o.archived_at is null
   and o.active
   and (o.starts_at is null or o.starts_at <= now())
   and (o.ends_at is null or o.ends_at >= now())
  where u.athlete_id = p_athlete_id
    and u.organization_id = p_organization_id
    and c.archived_at is null
    and (
      -- Un código apagado no alimenta ninguna vidriera: ni el desbloqueo previo
      -- necesita que siga listado acá para explicarse…
      (
        c.active
        and (
          o.id is not null
          or exists (
            select 1 from public.membership_plans pl
            where pl.id = c.membership_plan_id
              and pl.active
              and pl.collection_mode = 'one_time'
              and pl.effective_from <= now()
              and (pl.retired_at is null or pl.retired_at > now())
          )
        )
      )
      -- …pero una compra hecha o en curso sí: la redención se escribe al crear
      -- la orden y se libera si esa orden muere sin pagarse (20260906100000),
      -- así que esta rama sólo mantiene fichas con una orden abierta, aprobada
      -- o reembolsada. Sin ella, pausar el código o retirar el plan dejaba al
      -- atleta sin la pantalla donde declara o difiere su propio pago.
      or exists (
        select 1 from public.discount_code_redemptions r
        where r.discount_code_id = c.id
          and r.athlete_id = p_athlete_id
      )
    );
$$;

revoke all on function public.athlete_list_offer_unlocks(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_list_offer_unlocks(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. El financiamiento sólo prende sobre un canal que el código declaró
--
-- Cuerpo de 20260922100000 con la condición del canal en la fuente 1. La
-- fuente 2 (el combo restringido del evento, 20260828110000) no declara
-- canales y queda como estaba.
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
  --    El financiamiento es parte del acuerdo del codigo, y el acuerdo nombra
  --    sus canales: un codigo financiado "solo por transferencia" no financia
  --    una compra en efectivo aunque Administracion tenga el efectivo abierto.
  --    Es la misma lectura que anuncian la ficha y el reveal
  --    (promotionPaymentPresentation cruza financed con manualChannels).
  select coalesce(c.financed, false)
           and coalesce(v_order.manual_payment_channel, 'bank_transfer') = any(coalesce(c.manual_channels, '{}'::text[])),
         c.financing_term_days
    into v_financed, v_term_days
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
      -- Sin plazo propio cargado (codigos de antes de 20260922100000 que no
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
-- 5. El preview: plazo sólo si financia, y "ya lo usaste" antes que "se agotó"
--
-- Cuerpo de 20260925100000 con esos dos ajustes.
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

    -- La redención propia se mira ANTES que el cupo: si el tope está alcanzado
    -- con la redención de quien pregunta, la respuesta correcta es "ya lo
    -- usaste" — "se agotó" sugiere que otros se lo llevaron.
    select exists(
      select 1 from public.discount_code_redemptions
      where discount_code_id = v_code.id and athlete_id = p_athlete_id
    ) into v_already_redeemed;
    if v_already_redeemed then
      return jsonb_build_object('valid', false, 'reason', 'already_used');
    end if;

    if v_code.max_redemptions is not null
       and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
           >= v_code.max_redemptions then
      return jsonb_build_object('valid', false, 'reason', 'limit_reached');
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
-- 6. Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_redeem_promotion_code';
  if v_def not like '%v_own_redemption%' or v_def not like '%v_bundle_surface%' then
    raise exception 'El canje universal sigue rechazando a quien ya canjeó.';
  end if;
  if v_def not like '%open_bundle%' then
    raise exception 'El canje del paquete dejó de abrir su ficha.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_list_offer_unlocks';
  if v_def not like '%discount_code_redemptions%' then
    raise exception 'El listado sigue borrando la ficha de una compra en curso.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'settle_order_financing';
  if v_def not like '%any(coalesce(c.manual_channels%' then
    raise exception 'El financiamiento sigue prendiendo sobre canales no declarados.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_preview_discount_code';
  if v_def not like '%case when v_code.financed then coalesce(v_code.financing_term_days, 7) end%' then
    raise exception 'El preview sigue anunciando plazo en códigos no financiados.';
  end if;
end
$verification$;
