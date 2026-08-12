-- Reinscripción tras una inscripción cancelada — PLU ARG
--
-- Bug: tanto create_competition_registration_v2 como
-- create_membership_registration_combo_order_core buscan una fila previa en
-- event_registrations por (event_id, athlete_id) SIN filtrar por status, y
-- devuelven PLU08 "Ya estas inscripto en este evento" si encuentran
-- cualquiera, incluida una ya 'cancelada'. La única vía que hoy deja una
-- inscripción en 'cancelada' es el job de vencimiento de órdenes
-- (expire_stale_payment_orders, 20260716000000:658-669) cuando una orden
-- manual_link no se aprueba en 24hs o una de Mercado Pago no se completa en
-- 30 minutos. Resultado real: un atleta que dejó vencer su primer intento de
-- pago queda bloqueado para siempre de volver a inscribirse a ese evento, con
-- un mensaje que además es falso (no está inscripto, canceló). El resto de
-- las consultas del dominio (cupo, schedule, credencial, athlete_visible_
-- registrations, capacidad) ya excluyen 'cancelada' de forma consistente
-- (ver 20260806230000, 20260810120000) — estas dos quedaron afuera de ese
-- patrón.
--
-- Fix: excluir 'cancelada' del chequeo de duplicado en ambas RPC. El resto de
-- cada función queda idéntico a su última versión (create_competition_
-- registration_v2 en 20260809180000; create_membership_registration_combo_
-- order_core, renombrada en 20260812150000, con cuerpo de 20260812120000).

create or replace function public.create_competition_registration_v2(
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
  v_event public.events;
  v_order public.athlete_payment_orders;
  v_registration public.event_registrations;
  v_count int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link')
     or p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
     or p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited')
     or (p_bodyweight_kg is not null and (p_bodyweight_kg < 20 or p_bodyweight_kg > 400)) then
    raise exception 'Datos de inscripcion invalidos.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  -- Cupo lleno es PLU04; cerrado/proximamente/finalizado siguen en PLU03.
  if v_event.status = 'agotado' then
    raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
  end if;
  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados') then
    raise exception 'La inscripcion no esta abierta.' using errcode = 'PLU03';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at
     or v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'La inscripcion esta fuera de fecha.' using errcode = 'PLU03';
  end if;
  -- La afiliación ya no bloquea el alta de inscripción. Si el evento la
  -- exige, el gate vive en check-in (`staff_check_in_registration`).

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select * into v_registration from public.event_registrations where payment_order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  -- 'cancelada' no cuenta como "ya inscripto": es lo que deja el vencimiento
  -- de una orden sin pagar, y hay que poder reintentar la inscripcion.
  select * into v_registration from public.event_registrations
    where event_id = v_event.id and athlete_id = p_athlete_id and status <> 'cancelada';
  if found then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_event.capacity is not null then
    select count(*) into v_count from public.event_registrations
    where event_id = v_event.id and status in ('pendiente_pago', 'pagada', 'confirmada');
    if v_count >= v_event.capacity then
      raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
    end if;
  end if;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'registration', v_event.price, v_event.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'RORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  insert into public.event_registrations (
    athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id
  ) values (
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg,
    'pendiente_pago', v_order.id
  ) returning * into v_registration;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('registration.created', 'event_registration', v_registration.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('eventId', v_event.id, 'orderId', v_order.id));

  return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  to service_role;

create or replace function public.create_membership_registration_combo_order_core(
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
  v_event public.events;
  v_offer public.event_combo_offers;
  v_plan public.membership_plans;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_pending public.memberships;
  v_existing public.memberships;
  v_same_year public.memberships;
  v_start date;
  v_end date;
  v_year text;
  v_count int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link')
     or p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
     or p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited')
     or (p_bodyweight_kg is not null and (p_bodyweight_kg < 20 or p_bodyweight_kg > 400)) then
    raise exception 'Datos del combo invalidos.' using errcode = 'PLU01';
  end if;

  -- Orden de locks compartida con las RPC individuales: atleta -> evento ->
  -- oferta/plan. Serializa dos checkouts del mismo atleta y el contador de
  -- cupos del evento sin depender de checks del navegador.
  select * into v_athlete
  from public.athletes
  where id = p_athlete_id
  for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;

  select * into v_event
  from public.events
  where slug = p_event_slug
  for update;
  if not found or v_event.organization_id <> v_athlete.organization_id or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  if v_event.status = 'agotado' then
    raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
  end if;
  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados')
     or (v_event.registration_opens_at is not null and now() < v_event.registration_opens_at)
     or (v_event.registration_closes_at is not null and now() > v_event.registration_closes_at) then
    raise exception 'La inscripcion no esta abierta.' using errcode = 'PLU03';
  end if;

  select * into v_offer
  from public.event_combo_offers
  where event_id = v_event.id
  for update;
  if not found or not v_offer.active
     or (v_offer.starts_at is not null and now() < v_offer.starts_at)
     or (v_offer.ends_at is not null and now() > v_offer.ends_at) then
    raise exception 'El combo no esta disponible para este evento.' using errcode = 'PLU03';
  end if;

  select * into v_plan
  from public.membership_plans
  where id = v_offer.membership_plan_id
  for update;
  if not found
     or v_plan.organization_id <> v_event.organization_id
     or v_plan.collection_mode <> 'one_time'
     or not v_plan.active
     or v_plan.effective_from > now()
     or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
    raise exception 'El plan del combo no esta vigente.' using errcode = 'PLU03';
  end if;
  if upper(v_offer.currency) <> upper(v_plan.currency)
     or upper(v_offer.currency) <> upper(v_event.currency)
     or v_offer.price > v_plan.price + v_event.price then
    raise exception 'La configuracion economica del combo es invalida.' using errcode = 'PLU11';
  end if;

  -- La misma clave devuelve exactamente los tres recursos, pero no puede
  -- reutilizarse para otro atleta, evento, plan o concepto.
  select * into v_order
  from public.athlete_payment_orders
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_order.athlete_id <> p_athlete_id
       or v_order.organization_id <> v_athlete.organization_id
       or v_order.concept <> 'combo'
       or v_order.plan_id <> v_plan.id then
      raise exception 'La clave de idempotencia pertenece a otra operacion.' using errcode = 'PLU13';
    end if;

    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;
    select * into v_registration
    from public.event_registrations
    where payment_order_id = v_order.id;

    if v_membership.id is null or v_registration.id is null
       or v_registration.event_id <> v_event.id
       or v_order.method <> p_payment_method
       or v_registration.division <> p_division
       or v_registration.category <> p_category
       or v_registration.bodyweight_kg is distinct from p_bodyweight_kg then
      raise exception 'La orden combo existente esta incompleta.' using errcode = 'PLU13';
    end if;

    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'plan', to_jsonb(v_plan),
      'comboOffer', to_jsonb(v_offer),
      'duplicate', true
    );
  end if;

  -- 'cancelada' no cuenta como "ya inscripto": es lo que deja el vencimiento
  -- de una orden sin pagar, y hay que poder reintentar el combo.
  select * into v_registration
  from public.event_registrations
  where event_id = v_event.id and athlete_id = p_athlete_id and status <> 'cancelada';
  if found then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_event.capacity is not null then
    select count(*) into v_count
    from public.event_registrations
    where event_id = v_event.id
      and status in ('pendiente_pago', 'pagada', 'confirmada');
    if v_count >= v_event.capacity then
      raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
    end if;
  end if;

  -- Si ya hay un cobro de afiliacion enviado a Mercado Pago no se lo puede
  -- transformar: un checkout viejo podria acreditar el importe anterior.
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
          select 1 from public.embedded_payment_attempts a
          where a.order_kind = 'athlete'
            and a.order_id = o.id
            and a.status in ('processing', 'submitted')
        )
      )
  ) then
    raise exception 'Ya existe un pago de afiliacion en curso; completalo o espera su vencimiento.'
      using errcode = 'PLU13';
  end if;

  select m.* into v_pending
  from public.memberships m
  where m.athlete_id = p_athlete_id and m.status = 'pendiente_pago'
  order by
    case when m.plan_id is not distinct from v_plan.id then 0 else 1 end,
    m.created_at desc
  limit 1
  for update;

  select m.* into v_existing
  from public.memberships m
  where m.athlete_id = p_athlete_id and m.status in ('activa', 'vencida')
  order by m.expiration_date desc nulls last
  limit 1
  for update;

  if v_existing.id is not null
     and v_existing.status = 'activa'
     and (
       v_existing.start_date > current_date
       or coalesce(v_existing.expiration_date, current_date) >= current_date
     ) then
    raise exception 'El atleta ya tiene una afiliacion vigente o programada.'
      using errcode = 'PLU13';
  end if;

  if v_pending.id is not null and v_pending.plan_id is not distinct from v_plan.id then
    v_start := v_pending.start_date;
    v_end := v_pending.expiration_date;
    v_year := v_pending.year;
  else
    v_start := greatest(current_date, coalesce(v_existing.expiration_date + 1, current_date));
    v_end := case when v_plan.billing_frequency = 'monthly'
      then (v_start + make_interval(months => v_plan.interval_count))::date
      else (v_start + make_interval(years => v_plan.interval_count))::date end;
    v_year := extract(year from v_start)::int::text;
  end if;

  -- Solo se reemplazan ordenes que todavia no llegaron al proveedor. El
  -- trigger puede marcar temporalmente la afiliacion como cancelada; mas
  -- abajo se repunta a la nueva orden dentro de esta misma transaccion.
  update public.athlete_payment_orders o
  set status = 'cancelado', updated_at = now()
  from public.membership_order_targets t
  join public.memberships m on m.id = t.membership_id
  where t.order_id = o.id
    and m.athlete_id = p_athlete_id
    and o.concept = 'membership'
    and o.status in ('pendiente', 'validacion_manual');

  insert into public.athlete_payment_orders (
    organization_id, athlete_id, plan_id, concept, amount, currency, method,
    status, reference, idempotency_key, expires_at
  ) values (
    v_athlete.organization_id, p_athlete_id, v_plan.id, 'combo', v_offer.price,
    upper(v_offer.currency), p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'CORD-' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  )
  returning * into v_order;

  if v_pending.id is not null then
    update public.memberships
    set organization_id = v_athlete.organization_id,
        year = v_year,
        status = 'pendiente_pago',
        start_date = v_start,
        expiration_date = v_end,
        payment_order_id = v_order.id,
        plan_id = v_plan.id,
        updated_at = now()
    where id = v_pending.id
    returning * into v_membership;
  else
    select m.* into v_same_year
    from public.memberships m
    where m.athlete_id = p_athlete_id and m.year = v_year
    for update;

    if v_same_year.id is not null then
      if v_same_year.status = 'activa'
         and (
           v_same_year.start_date > current_date
           or coalesce(v_same_year.expiration_date, current_date) >= current_date
         ) then
        raise exception 'El atleta ya tiene una afiliacion vigente o programada para este periodo.'
          using errcode = 'PLU13';
      end if;

      update public.memberships
      set organization_id = v_athlete.organization_id,
          status = 'pendiente_pago',
          start_date = v_start,
          expiration_date = v_end,
          payment_order_id = v_order.id,
          plan_id = v_plan.id,
          updated_at = now()
      where id = v_same_year.id
      returning * into v_membership;
    else
      insert into public.memberships (
        organization_id, athlete_id, year, status, start_date, expiration_date,
        member_code, payment_order_id, plan_id
      ) values (
        v_athlete.organization_id, p_athlete_id, v_year, 'pendiente_pago',
        v_start, v_end,
        'PLU-ARG-' || v_year || '-' || lpad(nextval('public.membership_code_seq')::text, 8, '0'),
        v_order.id, v_plan.id
      )
      returning * into v_membership;
    end if;
  end if;

  insert into public.membership_order_targets (
    organization_id, order_id, membership_id, plan_id, starts_at, ends_at
  ) values (
    v_athlete.organization_id, v_order.id, v_membership.id, v_plan.id, v_start, v_end
  );

  insert into public.event_registrations (
    athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id
  ) values (
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg,
    'pendiente_pago', v_order.id
  )
  returning * into v_registration;

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values
  (
    v_athlete.organization_id,
    'combo_order.created', 'athlete_payment_order', v_order.id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object(
      'eventId', v_event.id,
      'offerId', v_offer.id,
      'planId', v_plan.id,
      'membershipId', v_membership.id,
      'registrationId', v_registration.id,
      'amount', v_order.amount,
      'currency', v_order.currency
    )
  ),
  (
    v_athlete.organization_id,
    'registration.created', 'event_registration', v_registration.id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object('eventId', v_event.id, 'orderId', v_order.id, 'source', 'combo')
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'plan', to_jsonb(v_plan),
    'comboOffer', to_jsonb(v_offer),
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_order_core(
  uuid, text, text, text, numeric, text, text
) from public, anon, authenticated, service_role;
