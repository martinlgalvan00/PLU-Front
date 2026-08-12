-- Endurecimiento incremental de la RPC combo ya desplegada.
--
-- La implementacion original queda privada como `*_core`. La funcion publica
-- resuelve primero reintentos idempotentes (incluso si la oferta ya vencio) y
-- aplica los guards que impiden cobrar otra afiliacion o reemplazar un pago
-- que ya salio hacia Mercado Pago / tiene comprobante.

alter function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text
) rename to create_membership_registration_combo_order_core;

revoke all on function public.create_membership_registration_combo_order_core(
  uuid, text, text, text, numeric, text, text
) from public, anon, authenticated, service_role;

create function public.create_membership_registration_combo_order(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_plan public.membership_plans;
  v_offer public.event_combo_offers;
  v_event_slug text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;

  -- El reintento depende de los recursos ya creados, no del estado actual de
  -- la oferta. Asi una respuesta de red perdida se puede recuperar aunque la
  -- promo haya cerrado entre ambos requests.
  select * into v_order
  from public.athlete_payment_orders
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    select r.* into v_registration
    from public.event_registrations r
    where r.payment_order_id = v_order.id;

    select e.slug into v_event_slug
    from public.events e
    where e.id = v_registration.event_id;

    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;

    select * into v_plan
    from public.membership_plans
    where id = v_order.plan_id;

    select * into v_offer
    from public.event_combo_offers
    where event_id = v_registration.event_id;

    if v_order.athlete_id <> p_athlete_id
       or v_order.concept <> 'combo'
       or v_order.method <> p_payment_method
       or v_registration.id is null
       or v_membership.id is null
       or v_plan.id is null
       or v_event_slug <> p_event_slug
       or v_registration.division <> p_division
       or v_registration.category <> p_category
       or v_registration.bodyweight_kg is distinct from p_bodyweight_kg then
      raise exception 'La clave de idempotencia pertenece a otra operacion.' using errcode = 'PLU13';
    end if;

    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'plan', to_jsonb(v_plan),
      'comboOffer', case when v_offer.id is null then null else to_jsonb(v_offer) end,
      'duplicate', true
    );
  end if;

  select * into v_athlete
  from public.athletes
  where id = p_athlete_id
  for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;

  if exists (
    select 1
    from public.memberships m
    where m.athlete_id = p_athlete_id
      and m.status = 'activa'
      and (
        m.start_date > current_date
        or coalesce(m.expiration_date, current_date) >= current_date
      )
  ) then
    raise exception 'El atleta ya tiene una afiliacion vigente o programada.'
      using errcode = 'PLU13';
  end if;

  if exists (
    select 1
    from public.athlete_payment_orders o
    join public.membership_order_targets t on t.order_id = o.id
    join public.memberships m on m.id = t.membership_id
    where m.athlete_id = p_athlete_id
      and o.concept = 'membership'
      and o.status in ('pendiente', 'validacion_manual')
      and (
        o.provider_preference_id is not null
        or o.payment_proof_path is not null
        or exists (
          select 1
          from public.embedded_payment_attempts a
          where a.order_kind = 'athlete'
            and a.order_id = o.id
            and a.status in ('processing', 'submitted')
        )
      )
  ) then
    raise exception 'Ya existe un pago de afiliacion en curso; completalo o espera su vencimiento.'
      using errcode = 'PLU13';
  end if;

  return public.create_membership_registration_combo_order_core(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text
) to service_role;
