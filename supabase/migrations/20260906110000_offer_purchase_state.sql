-- Estado de la compra en la ficha de la oferta exclusiva — PLU ARG
--
-- `offer_code_payload` sólo decía `redeemed: true|false`, y "canjeada" se
-- escribe cuando se CREA la orden, no cuando se cobra. Con eso la pestaña
-- secreta anunciaba "Ya compraste esta oferta. Tu afiliación y tu inscripción
-- quedaron registradas" a alguien que todavía no había pagado nada, y el único
-- botón que le ofrecía era "Ver mi inscripción". No había forma de terminar de
-- pagar desde la pestaña que había desbloqueado la oferta.
--
-- Se agrega `purchase`: la orden que ocupó la redención de este atleta, con su
-- estado. Es lo que le permite a la ficha distinguir tres cosas que antes eran
-- una sola: sin comprar, esperando el pago, y comprada.
--
-- Es la última definición de la función. La anterior es 20260906100000, que
-- agregó campaña y cupo restante; se repite el cuerpo entero porque
-- `create or replace` no admite parches parciales.

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
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'maxRedemptions', p_code.max_redemptions,
    -- Cupo restante del código, no del atleta: es lo que la ficha usa para
    -- decir "quedan N". Null cuando no hay tope.
    'remaining', case
      when p_code.max_redemptions is null then null
      else greatest(
        0,
        p_code.max_redemptions - (
          select count(*) from public.discount_code_redemptions r
          where r.discount_code_id = p_code.id
        )
      )
    end,
    'redeemed', exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = p_code.id and r.athlete_id = p_athlete_id
    ),
    -- La orden que ocupó la redención. Impaga, la ficha ofrece terminar de
    -- pagarla ahí mismo con el mismo importe promocional que ya tiene la orden;
    -- aprobada, la ficha pasa a ser el recibo. Una orden muerta no llega hasta
    -- acá: 20260906100000 libera la redención y `redeemed` vuelve a false.
    -- Alias `po` y no `o`: `o` es la oferta de combo del join externo y el
    -- shadowing dejaba dos tablas distintas con la misma letra en la misma
    -- función.
    'purchase', (
      select jsonb_build_object(
        'orderId', po.id,
        'status', po.status,
        'amount', po.amount,
        'currency', po.currency,
        'concept', po.concept,
        'method', po.method,
        'manualPaymentChannel', po.manual_payment_channel,
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
      'id', ca.id,
      'slug', ca.slug,
      'name', ca.name,
      'description', ca.description,
      'objective', ca.objective,
      'status', ca.status,
      'visibility', ca.visibility
    ) end,
    'event', case when e.id is null then null else jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'startsAt', e.starts_at,
      'status', e.status,
      'registrationPrice', e.price,
      'registrationManualPrice', e.manual_price,
      'currency', e.currency
    ) end,
    'comboOffer', case when o.id is null then null else jsonb_build_object(
      'id', o.id,
      'price', o.price,
      'manualPrice', o.manual_price,
      'currency', o.currency,
      'active', o.active,
      'audience', o.audience,
      'startsAt', o.starts_at,
      'endsAt', o.ends_at
    ) end,
    'membershipPlan', case when pl.id is null then null else jsonb_build_object(
      'id', pl.id,
      'code', pl.code,
      'name', pl.name,
      'price', pl.price,
      'manualPrice', pl.manual_price,
      'currency', pl.currency
    ) end
  )
  from (select 1) as anchor
  left join public.promotion_campaigns ca on ca.id = p_code.campaign_id
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id
  left join public.membership_plans pl on pl.id = o.membership_plan_id;
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Una oferta con la compra abierta tiene que seguir apareciendo
--
-- `athlete_list_offer_unlocks` exige que el código esté activo y vigente, o que
-- ya exista una redención. La redención impaga cumple la segunda condición, así
-- que la ficha sigue existiendo — pero el guard se deja explícito para que un
-- código que vence entre la creación de la orden y el pago no borre de la
-- pantalla la única puerta que tiene el atleta para terminar de pagar.
-- ---------------------------------------------------------------------------

do $verification$
begin
  if to_regprocedure('plu_private.offer_code_payload(discount_codes,uuid)') is null then
    raise exception 'El payload de la oferta exclusiva no quedó instalado.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
