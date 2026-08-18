-- Cupones: habilitación puntual de transferencia, aplicación al combo, y delete.
--
-- Tres cierres explícitos de producto que se reabren acá:
--
--   1. Transferencia arranca apagada globalmente (`assertManualChannelEnabled` en
--      checkoutPricePolicy.js) salvo que Administración prenda el interruptor para
--      todo el mundo. Ahora un cupón puntual, marcado explícitamente por un
--      operador, puede destrabarla sólo para quien lo use — sin tocar el
--      interruptor general. `enables_manual_payment` es opt-in por cupón, default
--      false: la mayoría de los cupones no tocan el canal de pago.
--   2. Los cupones estaban explícitamente fuera de scope para el combo
--      (afiliación + inscripción en la misma orden) — ver el comentario que
--      esto reemplaza en create_membership_registration_combo_order. Ahora un
--      cupón con applies_to = 'both' puede redimirse también ahí.
--   3. No existía delete de cupones, sólo upsert + toggle activo/inactivo.

-- ---------------------------------------------------------------------------
-- Columna nueva
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists enables_manual_payment boolean not null default false;

-- ---------------------------------------------------------------------------
-- CRUD admin de cupones: upsert gana enablesManualPayment, y se agrega delete.
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
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_enables_manual boolean := coalesce((p_code ->> 'enablesManualPayment')::boolean, false);
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_percent is null or v_percent < 1 or v_percent > 100
     or v_applies not in ('membership', 'registration', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código de descuento son inválidos.' using errcode = 'PLU01';
  end if;

  if v_id is not null then
    select * into v_result from public.discount_codes
    where id = v_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El código de descuento no existe.' using errcode = 'PLU02';
    end if;
    v_before := to_jsonb(v_result);

    update public.discount_codes
    set code = v_code_text,
        description = nullif(trim(p_code ->> 'description'), ''),
        percent_off = v_percent,
        applies_to = v_applies,
        max_redemptions = v_max_redemptions,
        expires_at = v_expires,
        active = v_active,
        enables_manual_payment = v_enables_manual,
        updated_at = now()
    where id = v_id
    returning * into v_result;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.updated', 'discount_code', v_result.id::text, 'staff', p_actor,
      jsonb_build_object('before', v_before, 'after', to_jsonb(v_result)), v_organization_id
    );
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, percent_off, applies_to,
        max_redemptions, expires_at, active, enables_manual_payment
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_percent, v_applies, v_max_redemptions, v_expires, v_active, v_enables_manual
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código de descuento con ese nombre.' using errcode = 'PLU13';
    end;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.created', 'discount_code', v_result.id::text, 'staff', p_actor,
      to_jsonb(v_result), v_organization_id
    );
  end if;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

-- Delete real: sólo posible sin canjes. El FK ya lo impediría con un error
-- genérico de integridad referencial (discount_code_redemptions ... on delete
-- restrict); acá se anticipa con un mensaje legible para el panel.
create or replace function public.staff_delete_discount_code(
  p_code_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
begin
  select * into v_code from public.discount_codes where id = p_code_id for update;
  if not found then
    raise exception 'El código de descuento no existe.' using errcode = 'PLU02';
  end if;

  if exists (
    select 1 from public.discount_code_redemptions where discount_code_id = p_code_id
  ) then
    raise exception 'No se puede eliminar un cupón con canjes registrados. Desactivalo en su lugar.'
      using errcode = 'PLU23';
  end if;

  delete from public.discount_codes where id = p_code_id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.deleted', 'discount_code', v_code.id::text, 'staff', p_actor,
    to_jsonb(v_code), v_code.organization_id
  );

  return jsonb_build_object('deleted', true, 'id', v_code.id);
end;
$$;

revoke all on function public.staff_delete_discount_code(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_discount_code(uuid, text)
  to service_role;

-- staff_get_pricing_configuration gana enablesManualPayment por cupón.
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
          'currency', e.currency,
          'status', e.status,
          'published', e.published,
          'comboOffer', case when o.id is null then null else
            jsonb_build_object(
              'id', o.id,
              'membershipPlanId', o.membership_plan_id,
              'price', o.price,
              'currency', o.currency,
              'active', o.active,
              'startsAt', o.starts_at,
              'endsAt', o.ends_at,
              'updatedAt', o.updated_at
            )
          end
        ) order by e.starts_at
      )
      from public.events e
      left join public.event_combo_offers o on o.event_id = e.id
      where e.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'discountCodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'code', c.code,
          'description', c.description,
          'percentOff', c.percent_off,
          'appliesTo', c.applies_to,
          'maxRedemptions', c.max_redemptions,
          'expiresAt', c.expires_at,
          'active', c.active,
          'enablesManualPayment', c.enables_manual_payment,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'redeemedCount', (
            select count(*) from public.discount_code_redemptions r
            where r.discount_code_id = c.id
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

-- athlete_preview_discount_code informa enablesManualPayment para que el
-- checkout, apenas se aplica el cupón, sepa si tiene que destrabar
-- transferencia/efectivo antes de que exista una orden.
create or replace function public.athlete_preview_discount_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_applies_to text,
  p_base_amount int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_discount int;
  v_already_redeemed boolean;
begin
  select * into v_code from public.discount_codes
  where organization_id = p_organization_id and code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if not v_code.active then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_code.applies_to not in (p_applies_to, 'both') then
    return jsonb_build_object('valid', false, 'reason', 'not_applicable');
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

  v_discount := floor(p_base_amount * v_code.percent_off / 100.0)::int;
  return jsonb_build_object(
    'valid', true,
    'code', v_code.code,
    'percentOff', v_code.percent_off,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount,
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- Cupón aplicable al combo (applies_to = 'both'). Se redime en el wrapper
-- create_membership_registration_combo_order, no dentro de *_core: mismo
-- criterio que create_membership_order_v4 / create_competition_registration_v3,
-- que aplican el descuento después de crear la orden, no en la función que
-- hace el INSERT. Se cubren los dos caminos de salida del wrapper (orden
-- encontrada por idempotencia, y orden recién creada vía *_core) porque
-- apply_discount_code_to_order es idempotente por sí sola (no vuelve a redimir
-- si la orden ya tiene discount_code_id).
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_registration_combo_order(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text default null
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
  v_result jsonb;
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

    perform public.apply_discount_code_to_order(
      v_order.organization_id, p_athlete_id, v_order.id, 'combo', p_discount_code
    );
    select * into v_order from public.athlete_payment_orders where id = v_order.id;

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

  v_result := public.create_membership_registration_combo_order_core(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key
  );

  perform public.apply_discount_code_to_order(
    v_athlete.organization_id, p_athlete_id, (v_result -> 'order' ->> 'id')::uuid, 'combo', p_discount_code
  );
  select * into v_order from public.athlete_payment_orders where id = (v_result -> 'order' ->> 'id')::uuid;

  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_order(
  uuid, text, text, text, numeric, text, text, text
) to service_role;

-- Wrapper de checkout: ahora reenvía p_discount_code al wrapper de arriba.
create or replace function public.create_membership_registration_combo_checkout(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_order_amount numeric,
  p_manual_payment_channel text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  perform plu_private.configure_atomic_checkout_pricing(
    'combo', p_payment_method, p_manual_payment_channel, p_order_amount
  );
  v_result := public.create_membership_registration_combo_order(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_order_amount
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text, text
) to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_delete_discount_code(uuid,text)') is null
    or to_regprocedure(
      'public.create_membership_registration_combo_order(uuid,text,text,text,numeric,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.create_membership_registration_combo_checkout(uuid,text,text,text,numeric,text,text,numeric,text,text)'
    ) is null then
    raise exception 'La verificación de cupones (transferencia/combo/delete) no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
