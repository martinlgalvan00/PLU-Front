-- El preview de un código también respeta la redención propia — PLU ARG
--
-- `athlete_redeem_promotion_code` y `athlete_unlock_offer_code` ya perdonan a
-- quien tiene su propia redención (20260928100000): "el cupo, la ventana y la
-- pausa del código ya no le aplican a esta persona" -- su trámite está hecho o
-- en curso, no está pidiendo canjear de nuevo. Esa migración no tocó
-- `athlete_preview_discount_code`, que quedó con el chequeo viejo: cualquier
-- fila propia en `discount_code_redemptions` corta con 'already_used' antes de
-- calcular el precio, sin mirar si esa redención es la de una orden PENDIENTE
-- del propio atleta.
--
-- Consecuencia: cambiar de medio de pago sobre una orden ya creada con un
-- cupón recotiza el código para el canal nuevo (`applyDiscountCode`, un solo
-- POST a este preview) -- y ese preview rebota con "Ya usaste ese código"
-- porque la redención que ÉL MISMO generó al crear la orden ya existe. La
-- banda del cupón se cae justo en la pantalla que tiene que sostenerla.
--
-- La redención se escribe al crear la orden y se libera si esa orden muere sin
-- pagarse (20260906100000): que exista una fila propia YA significa "esta es
-- mi compra, viva o pagada", nunca la de otro atleta ni la de un intento
-- muerto. Repreviarla no crea una redención nueva (la función es `stable`) ni
-- sortea el unique (discount_code_id, athlete_id) que sigue protegiendo la
-- creación de una SEGUNDA orden con el mismo código -- ese límite no se toca.

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

    -- Misma redención que mira el canje (se escribe al crear la orden, se
    -- libera si esa orden muere sin pagarse): si ya existe, este atleta no
    -- está pidiendo el código de nuevo, está recotizando SU propia orden para
    -- otro canal. La pausa, la ventana, el cupo y las invitaciones dejan de
    -- aplicarle -- mismo criterio que las otras dos RPC.
    select exists(
      select 1 from public.discount_code_redemptions
      where discount_code_id = v_code.id and athlete_id = p_athlete_id
    ) into v_own_redemption;

    if not v_own_redemption then
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
      if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
        return jsonb_build_object('valid', false, 'reason', 'not_invited');
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

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'athlete_preview_discount_code'
  ) then
    raise exception 'athlete_preview_discount_code no quedo definida.';
  end if;
end;
$$;
