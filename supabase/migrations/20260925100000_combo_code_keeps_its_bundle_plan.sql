-- El codigo-paquete vuelve a guardar su afiliacion - PLU ARG
--
-- 20260922100000 ("financed_payment_deadline") agrego el plazo de pago sobre
-- una copia del cuerpo de 20260912100000, no del vigente. El plazo quedo bien;
-- lo que se perdio fueron las dos migraciones que habian pasado en el medio,
-- en tres funciones a la vez:
--
--   * staff_upsert_discount_code volvio al cuerpo de 20260912100000. Se fueron
--     20260913100000 (una oferta puede no depender del combo del evento) y
--     20260918100000 (el precio promocional con alcance 'combo' ES el paquete):
--     dejo de leer 'membershipPlanId', de resolverlo solo, de validar el
--     paquete y de escribir 'membership_plan_id' en la fila.
--   * staff_get_pricing_configuration dejo de devolver 'membershipPlanId', asi
--     que el formulario de Tarifas abre cada codigo-paquete con el selector de
--     afiliacion vacio.
--   * athlete_preview_discount_code dejo de devolver 'appliesTo', que es lo
--     unico que distingue un precio promocional que ES el paquete de uno que
--     baja una afiliacion suelta (unlocksComboBundle, en Express).
--
-- El sintoma que llego de operaciones es exacto: "doy de alta el codigo con
-- tipo Inscripcion + Afiliacion y no me reconoce el codigo". Todo codigo de
-- combo guardado desde ese deploy nace con membership_plan_id en null, y
-- entonces:
--
--   * plu_private.athlete_unlocked_offer_code lo filtra (pide plan no nulo),
--   * athlete_event_combo_offer devuelve null y el checkout responde 404,
--   * create_membership_registration_combo_order_core corta con PLU03
--     ("El plan del combo no esta vigente").
--
-- 20260924100000 saco de athlete_unlock_offer_code la exigencia de un
-- event_combo_offers vivo -correcto, el paquete ya no lo necesita- pero el
-- codigo seguia sin plan, asi que el canje pasaba a decir "desbloqueado" y el
-- checkout fallaba igual, una pantalla despues.
--
-- Esta migracion restituye las tres funciones como UNION (nada de
-- 20260922100000 se pierde: el plazo sigue igual), arregla las filas ya
-- guardadas y deja verificaciones que fallan el deploy si alguna vuelve a
-- quedar sin su mitad.

-- ---------------------------------------------------------------------------
-- 1. El alta vuelve a resolver y guardar la afiliacion del paquete
--
-- Cuerpo de 20260918100000 + el plazo de financiamiento de 20260922100000. No
-- hay logica nueva: es exactamente la union de las dos.
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
  -- Default 7 (20260922100000): el plazo que pidió el administrador cuando el
  -- panel no manda uno explícito.
  v_financing_term_days int := coalesce(nullif(p_code ->> 'financingTermDays', '')::int, 7);
  v_invitees text[];
  v_before jsonb;
  v_combo public.event_combo_offers;
  -- Qué afiliación empaqueta la oferta. Es el único dato del combo que un
  -- código no podía deducir, y por eso había que cargar el combo antes.
  v_membership_plan_id uuid := nullif(p_code ->> 'membershipPlanId', '')::uuid;
  v_plan public.membership_plans;
  v_event public.events;
  v_plan_ids uuid[];
  v_ceiling int;
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

  -- El paquete es propiedad de una oferta con precio propio: ninguna otra
  -- modalidad instancia uno, y dejarlo colgado al cambiar de tipo desde el
  -- panel reviviría un plan que nadie eligió.
  if v_kind <> 'offer' and not (v_kind = 'fixed_price' and v_applies = 'combo') then
    v_membership_plan_id := null;
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

  -- La contracara de la oferta autosuficiente: una oferta SIN precio propio
  -- cobra el del combo de su inscripción, así que ahí el combo sigue siendo
  -- obligatorio. Sin él la ficha anunciaría un paquete sin importe y el
  -- checkout lo rechazaría dos pantallas después.
  if v_kind = 'access' and v_event_id is not null and not exists (
    select 1 from public.event_combo_offers
    where event_id = v_event_id and archived_at is null
  ) then
    raise exception 'Sin precio propio la oferta cobra el combo de esa inscripción, y esa inscripción no tiene combo cargado. Poné un precio o cargá el combo.'
      using errcode = 'PLU02';
  end if;

  if v_kind = 'offer' or (v_kind = 'fixed_price' and v_applies = 'combo') then
    if v_applies <> 'combo' then
      raise exception 'El paquete se aplica al combo de afiliación e inscripción.'
        using errcode = 'PLU01';
    end if;
    if v_audience <> 'code' then
      raise exception 'El combo se reparte como código: no puede ser una promoción pública.'
        using errcode = 'PLU01';
    end if;
    if v_event_id is null then
      raise exception 'Elegí a qué inscripción aplica el combo: sin inscripción no hay paquete que armar.'
        using errcode = 'PLU01';
    end if;

    -- QUÉ se está ofertando. Antes lo definía el combo del evento, y por eso
    -- había que cargarlo antes de poder crear el código: tres pantallas para
    -- pactar un precio. Ahora la oferta nombra su propio plan y el combo pasó
    -- a ser una fuente más, en este orden:
    --
    --   1. el plan que eligió el panel,
    --   2. el del combo del evento, si hay combo,
    --   3. el único plan de pago único vigente de la organización.
    --
    -- Con más de un candidato en el paso 3 no se adivina: elegir mal cambia qué
    -- afiliación compra el atleta.
    select * into v_event from public.events where id = v_event_id;
    select * into v_combo from public.event_combo_offers
    where event_id = v_event_id and archived_at is null;

    if v_membership_plan_id is null then
      v_membership_plan_id := v_combo.membership_plan_id;
    end if;
    if v_membership_plan_id is null then
      -- `array_agg` y no `min(id)`: uuid no tiene agregado de mínimo, y contar
      -- primero para elegir después repetiría el filtro de vigencia.
      select array_agg(pl.id) into v_plan_ids
      from public.membership_plans pl
      where pl.organization_id = v_organization_id
        and pl.active
        and pl.collection_mode = 'one_time'
        and pl.effective_from <= now()
        and (pl.retired_at is null or pl.retired_at > now());
      if v_plan_ids is null or cardinality(v_plan_ids) = 0 then
        raise exception 'No hay ninguna afiliación de pago único vigente para empaquetar en el combo.'
          using errcode = 'PLU02';
      end if;
      if cardinality(v_plan_ids) > 1 then
        raise exception 'Hay más de una afiliación de pago único vigente: elegí cuál empaqueta el combo.'
          using errcode = 'PLU01';
      end if;
      v_membership_plan_id := v_plan_ids[1];
    end if;

    select * into v_plan from public.membership_plans
    where id = v_membership_plan_id and organization_id = v_organization_id;
    if not found
       or v_plan.collection_mode <> 'one_time'
       or not v_plan.active
       or v_plan.effective_from > now()
       or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
      raise exception 'La afiliación que empaqueta el combo no está vigente.'
        using errcode = 'PLU01';
    end if;
    -- Mismo criterio que create_membership_registration_combo_order_core: el
    -- paquete cobra un solo importe, así que sus dos partes van en la misma
    -- moneda.
    if upper(v_plan.currency) <> upper(v_event.currency) then
      raise exception 'La afiliación y la inscripción del combo están en monedas distintas.'
        using errcode = 'PLU11';
    end if;

    -- Techo: lo que ese atleta pagaría sin el código. Es el precio del combo
    -- cuando el evento tiene uno encendido -- podría comprarlo igual -- y la
    -- suma de las partes cuando no hay combo o está apagado. Con combo
    -- encendido son el mismo número o el combo es menor
    -- (staff_save_event_combo_offer no deja cargarlo por encima de la suma),
    -- así que la regla anterior queda conservada exactamente.
    if v_combo.id is not null and v_combo.active then
      v_ceiling := least(v_combo.price, v_plan.price + v_event.price);
    else
      v_ceiling := v_plan.price + v_event.price;
    end if;
    -- Una "oferta" que cobra igual o más que eso no es una oferta, y el canje
    -- la rechazaría con PLU24 recién en el checkout.
    if v_fixed_price >= v_ceiling then
      raise exception 'El precio del combo (%) tiene que ser menor a lo que ya cuesta por separado (%).',
        v_fixed_price, v_ceiling using errcode = 'PLU01';
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
        membership_plan_id = v_membership_plan_id,
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, event_id, max_redemptions, starts_at, expires_at,
        active, manual_channels, mercado_pago_enabled, financed, membership_plan_id,
        financing_term_days
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_event_id, v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels,
        v_mercado_pago_enabled, v_financed, v_membership_plan_id,
        v_financing_term_days
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
-- 2. El panel vuelve a leer que afiliacion empaqueta cada codigo
--
-- Cuerpo de 20260922100000 + 'membershipPlanId'. Sin ese campo el formulario no
-- puede mostrar la eleccion guardada, y volver a guardar el codigo desde
-- Tarifas mandaba el campo vacio.
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
          -- Qué afiliación empaqueta el combo. Sin este campo el formulario
          -- de Tarifas abre cada código-paquete con el selector vacío y lo
          -- vuelve a guardar sin elección (20260918100000).
          'membershipPlanId', c.membership_plan_id,
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
-- 3. El preview vuelve a decir el alcance
--
-- Cuerpo de 20260922100000 + 'appliesTo'. Lo consumen unlocksComboBundle (la
-- puerta del combo en Express) y el fallback del checkout de inscripcion, que
-- reintenta el preview contra el combo cuando el alcance no matchea.
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
-- 4. Un codigo-paquete sin afiliacion no se desbloquea
--
-- Cuerpo de 20260924100000 -que saco bien la dependencia de event_combo_offers-
-- mas la rama que faltaba. Con el alta arreglada arriba ningun codigo nuevo
-- puede caer aca; es la red para las filas guardadas mientras estuvo rota, y lo
-- que hace que el motivo llegue en el canje y no como un 404 del checkout.
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
    -- arreglada mas abajo ningun codigo nuevo cae aca: queda de red para las
    -- filas guardadas mientras el alta estuvo rota.
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
-- 5. Las filas que se guardaron sin afiliacion
--
-- Mismo criterio que el backfill de 20260918100000 y que el que aplica la RPC
-- al guardar: primero el plan del combo de su inscripcion, despues la unica
-- afiliacion de pago unico vigente. No corta el deploy si queda alguno sin
-- resolver -esos codigos ya estaban rotos y ahora el panel los arregla al
-- guardarlos- pero si lo avisa.
-- ---------------------------------------------------------------------------

update public.discount_codes c
set membership_plan_id = o.membership_plan_id,
    updated_at = now()
from public.event_combo_offers o
where o.event_id = c.event_id
  and o.membership_plan_id is not null
  and c.kind = 'fixed_price'
  and c.applies_to = 'combo'
  and c.membership_plan_id is null
  and c.archived_at is null;

update public.discount_codes c
set membership_plan_id = pl.id,
    updated_at = now()
from public.membership_plans pl
where pl.organization_id = c.organization_id
  and pl.active
  and pl.collection_mode = 'one_time'
  and pl.effective_from <= now()
  and (pl.retired_at is null or pl.retired_at > now())
  and c.kind = 'fixed_price'
  and c.applies_to = 'combo'
  and c.membership_plan_id is null
  and c.archived_at is null
  and (
    select count(*) from public.membership_plans p2
    where p2.organization_id = c.organization_id
      and p2.active
      and p2.collection_mode = 'one_time'
      and p2.effective_from <= now()
      and (p2.retired_at is null or p2.retired_at > now())
  ) = 1;

do $backfill$
declare
  v_fixed int;
  v_pending text;
begin
  select count(*) into v_fixed
  from public.discount_codes
  where kind = 'fixed_price' and applies_to = 'combo'
    and archived_at is null and membership_plan_id is not null;

  select string_agg(code, ', ' order by code) into v_pending
  from public.discount_codes
  where kind = 'fixed_price'
    and applies_to = 'combo'
    and archived_at is null
    and (membership_plan_id is null or event_id is null);

  raise notice 'Codigos-paquete con afiliacion resuelta: %.', v_fixed;
  if v_pending is not null then
    raise notice 'Estos codigos-paquete siguen sin afiliacion o sin inscripcion y no se van a poder canjear hasta editarlos desde Tarifas: %.', v_pending;
  end if;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 6. Verificacion: que ninguna de las tres vuelva a perder su mitad
--
-- Esta migracion existe porque un "create or replace" copiado de una version
-- vieja no falla: aplica limpio y se lleva puesta la logica del medio. Las
-- assertions comparan el cuerpo desplegado contra las dos mitades que tiene que
-- tener a la vez, asi que el proximo rebase accidental corta el deploy.
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'staff_upsert_discount_code';
  if v_def is null then
    raise exception 'Falta public.staff_upsert_discount_code.';
  end if;
  if v_def not like '%membershipPlanId%' or v_def not like '%membership_plan_id%' then
    raise exception 'staff_upsert_discount_code no guarda la afiliacion del paquete (20260918100000).';
  end if;
  if v_def not like '%financing_term_days%' then
    raise exception 'staff_upsert_discount_code no guarda el plazo de financiamiento (20260922100000).';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'staff_get_pricing_configuration';
  if v_def not like '%membershipPlanId%' then
    raise exception 'staff_get_pricing_configuration no devuelve la afiliacion del paquete.';
  end if;
  if v_def not like '%financingTermDays%' then
    raise exception 'staff_get_pricing_configuration no devuelve el plazo de financiamiento.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_preview_discount_code';
  if v_def not like '%appliesTo%' then
    raise exception 'athlete_preview_discount_code no devuelve el alcance del codigo.';
  end if;
  if v_def not like '%financingTermDays%' then
    raise exception 'athlete_preview_discount_code no devuelve el plazo de financiamiento.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'athlete_unlock_offer_code';
  if v_def not like '%applies_to = ''combo'' then%' then
    raise exception 'athlete_unlock_offer_code no rechaza un codigo-paquete sin afiliacion.';
  end if;
end
$verification$;
