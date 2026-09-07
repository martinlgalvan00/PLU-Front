-- Plazo de 5 días para pago manual (transferencia/efectivo) + avisos por email
--
-- Hoy una orden de afiliación o inscripción pagada por transferencia/efectivo
-- (`method = 'manual_link'`) vence en 24 horas (`expire_domain_orders`, cron
-- cada 3 minutos) sin que nadie se entere: se cancela en silencio. Se extiende
-- ese plazo a 5 días y se agregan dos emails (recordatorio ~2 días antes,
-- aviso final al cancelarse) reusando el mismo patrón cola+claim+complete que
-- ya usan los recordatorios de vencimiento de afiliación activa
-- (`membership_renewal_notifications`, 20260715000300 / 20260811170000).
--
-- El plazo se centraliza en `plu_private.manual_link_checkout_window()` en vez
-- de repetir el literal `interval '1 day'`: hay CINCO lugares que escriben
-- `athlete_payment_orders.expires_at` para una orden manual, y uno de ellos
-- (`settle_manual_checkout_pricing`, rama `bank_transfer`) corre después de
-- crear la orden y la recorta de vuelta a 1 día sin condición -- si solo se
-- tocaran las funciones de creación, la extensión no tendría ningún efecto en
-- el caso estándar de transferencia bancaria. El helper hace que el próximo
-- ajuste de plazo sea un cambio de una sola línea.
--
-- `cash_pitbull` (efectivo en el evento) no se toca: `cash_checkout_deadline`
-- ya calcula un vencimiento anclado a la fecha del evento, casi siempre más
-- generoso que 5 días, vía `greatest(...)` en `settle_manual_checkout_pricing`.
-- Sí se incluye ese canal en los emails nuevos -- la copia es genérica ("vence
-- el <fecha>"), no asume un plazo fijo desde la creación.

create or replace function plu_private.manual_link_checkout_window()
returns interval
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select interval '5 days';
$$;

revoke all on function plu_private.manual_link_checkout_window()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. create_membership_order_v2 -- cuerpo vigente de 20260817170000, con el
--    literal de la rama manual_link reemplazado por el helper.
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_v2(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_existing public.memberships;
  v_pending public.memberships;
  v_same_year public.memberships;
  v_start date;
  v_end date;
  v_year text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_plan from public.membership_plans where code = p_plan_code and active = true;
  if not found then raise exception 'Plan de afiliacion no encontrado.' using errcode = 'PLU02'; end if;
  if v_plan.collection_mode = 'recurring' and p_payment_method <> 'mercado_pago' then
    raise exception 'Los planes recurrentes requieren Mercado Pago.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select m.* into v_membership from public.membership_order_targets t
      join public.memberships m on m.id = t.membership_id where t.order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', true);
  end if;

  -- Cualquier afiliación impaga del atleta se reusa. Filtrar solo por plan_id
  -- dejaba la fila del año ocupada y el INSERT siguiente chocaba con
  -- memberships_athlete_id_year_key al cambiar anual ↔ automática.
  select m.* into v_pending from public.memberships m
  where m.athlete_id = p_athlete_id and m.status = 'pendiente_pago'
  order by
    case when m.plan_id is not distinct from v_plan.id then 0 else 1 end,
    m.created_at desc
  limit 1 for update;

  -- La renovación se calcula sobre el último período realmente cobrado:
  -- 'cancelada' (orden de MP cancelada antes de acreditarse) y 'reembolsada'
  -- no cuentan, aunque su expiration_date quede en el futuro.
  select m.* into v_existing from public.memberships m
  where m.athlete_id = p_athlete_id and m.status in ('activa', 'vencida')
  order by m.expiration_date desc nulls last limit 1 for update;

  -- Reusar una orden abierta evita dobles cobros aunque el browser haya
  -- perdido su clave original antes de reintentar. El medio de pago forma
  -- parte de la identidad de la orden.
  select o.* into v_order from public.athlete_payment_orders o
  join public.membership_order_targets t on t.order_id = o.id
  join public.memberships m on m.id = t.membership_id
  where m.athlete_id = p_athlete_id and m.plan_id = v_plan.id
    and o.method = p_payment_method
    and o.status in ('pendiente', 'validacion_manual')
    and coalesce(o.expires_at, now() + interval '1 minute') > now()
  order by o.created_at desc limit 1;
  if found then
    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(coalesce(v_membership, v_pending, v_existing)),
      'plan', to_jsonb(v_plan),
      'duplicate', true
    );
  end if;

  -- Cambió de medio: la orden abierta del medio anterior se cancela.
  update public.athlete_payment_orders o
  set status = 'cancelado', updated_at = now()
  from public.membership_order_targets t
  join public.memberships m on m.id = t.membership_id
  where t.order_id = o.id
    and m.athlete_id = p_athlete_id
    and m.plan_id = v_plan.id
    and o.method <> p_payment_method
    and o.status in ('pendiente', 'validacion_manual');

  if v_pending.id is not null then
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

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'membership', v_plan.price, v_plan.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'MORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then plu_private.manual_link_checkout_window() else interval '30 minutes' end
  ) returning * into v_order;

  if v_pending.id is not null then
    update public.memberships
    set payment_order_id = v_order.id,
        plan_id = v_plan.id,
        updated_at = now()
    where id = v_pending.id
    returning * into v_membership;
  else
    select m.* into v_same_year from public.memberships m
    where m.athlete_id = p_athlete_id and m.year = v_year
    for update;

    if v_same_year.id is not null then
      if v_same_year.status = 'activa'
         and v_same_year.start_date <= current_date
         and coalesce(v_same_year.expiration_date, current_date) >= current_date then
        raise exception 'El atleta ya tiene una afiliacion vigente para este periodo.'
          using errcode = 'PLU13';
      end if;
      if v_same_year.status = 'activa' and v_same_year.start_date > current_date then
        raise exception 'El atleta ya tiene una afiliacion programada para este periodo.'
          using errcode = 'PLU13';
      end if;

      -- Cancelada / reembolsada / vencida (o activa ya vencida): se reabre el
      -- mismo año en pendiente_pago en vez de insertar otra fila.
      update public.memberships
      set status = 'pendiente_pago',
          start_date = v_start,
          expiration_date = v_end,
          payment_order_id = v_order.id,
          plan_id = v_plan.id,
          updated_at = now()
      where id = v_same_year.id
      returning * into v_membership;
    else
      begin
        insert into public.memberships (
          athlete_id, year, status, start_date, expiration_date, member_code,
          payment_order_id, plan_id
        ) values (
          p_athlete_id, v_year, 'pendiente_pago', v_start, v_end,
          'PLU-ARG-' || v_year || '-' || lpad(nextval('public.membership_code_seq')::text, 8, '0'),
          v_order.id, v_plan.id
        ) returning * into v_membership;
      exception
        when unique_violation then
          -- Carrera: otra sesión ocupó el año entre el SELECT y el INSERT.
          select m.* into v_same_year from public.memberships m
          where m.athlete_id = p_athlete_id and m.year = v_year
          for update;
          if not found then
            raise;
          end if;
          if v_same_year.status = 'activa'
             and (
               v_same_year.start_date > current_date
               or (
                 v_same_year.start_date <= current_date
                 and coalesce(v_same_year.expiration_date, current_date) >= current_date
               )
             ) then
            raise exception 'El atleta ya tiene una afiliacion vigente o programada para este periodo.'
              using errcode = 'PLU13';
          end if;
          update public.memberships
          set status = 'pendiente_pago',
              start_date = v_start,
              expiration_date = v_end,
              payment_order_id = v_order.id,
              plan_id = v_plan.id,
              updated_at = now()
          where id = v_same_year.id
          returning * into v_membership;
      end;
    end if;
  end if;

  insert into public.membership_order_targets(order_id, membership_id, starts_at, ends_at)
  values (v_order.id, v_membership.id, v_start, v_end);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('membership_order.created', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('membershipId', v_membership.id, 'planCode', v_plan.code));

  return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', false);
end;
$$;

revoke all on function public.create_membership_order_v2(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_v2(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. create_competition_registration_v2 -- cuerpo vigente de 20260911100000,
--    mismo reemplazo.
-- ---------------------------------------------------------------------------

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
  v_resume jsonb;
  v_placed jsonb;
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

  -- Impaga: reanudar (y cambiar el medio si todavía no llegó al proveedor).
  -- pagada/confirmada/observada siguen en PLU08.
  v_resume := public.resume_pending_event_registration_checkout(
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, p_payment_method
  );
  if v_resume is not null then
    select * into v_order
    from public.athlete_payment_orders
    where id = (v_resume->'order'->>'id')::uuid;
    select * into v_registration
    from public.event_registrations
    where id = (v_resume->'registration'->>'id')::uuid;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'registration', to_jsonb(v_registration),
      'duplicate', true
    );
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
    now() + case when p_payment_method = 'manual_link' then plu_private.manual_link_checkout_window() else interval '30 minutes' end
  ) returning * into v_order;

  -- Reactiva la fila cancelada si existe; inserta sólo cuando no hay ninguna.
  v_placed := plu_private.place_event_registration(
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, v_order.id
  );
  select * into v_registration
  from public.event_registrations
  where id = (v_placed->'registration'->>'id')::uuid;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'registration.created',
    'event_registration',
    v_registration.id::text,
    'athlete',
    p_athlete_id::text,
    jsonb_build_object(
      'eventId', v_event.id,
      'orderId', v_order.id,
      'reactivated', (v_placed->>'reactivated')::boolean
    )
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. create_membership_registration_combo_order_core -- cuerpo vigente de
--    20260913100000 (no el de 20260911100000, que quedó pisado), mismo
--    reemplazo. Nota: esta función se revoca de TODOS los roles, incluido
--    service_role, en el archivo fuente -- solo se llama desde otras
--    funciones security definer, nunca directo por RPC -- así que la
--    reemisión conserva exactamente esa misma revocación, sin agregar grant.
-- ---------------------------------------------------------------------------

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
  -- La llave que ya canjeó el atleta, cuando el evento no tiene combo vigente.
  v_offer_code public.discount_codes;
  v_has_combo boolean := false;
  v_bundle_price int;
  v_bundle_currency text;
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
  v_resume jsonb;
  v_placed jsonb;
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
  where event_id = v_event.id and archived_at is null
  for update;
  v_has_combo := found and v_offer.active
    and (v_offer.starts_at is null or now() >= v_offer.starts_at)
    and (v_offer.ends_at is null or now() <= v_offer.ends_at);

  -- Sin combo vigente el paquete lo define la llave que el atleta ya canjeó:
  -- una oferta autosuficiente nombra su afiliación y se cotiza contra la suma
  -- de las partes. El unlock es la unica prueba que el navegador no puede
  -- falsificar -- lo escribe `athlete_unlock_offer_code` contra el evento REAL
  -- del codigo -- y sin el no hay combo que vender, igual que antes.
  if not v_has_combo then
    v_offer_code := plu_private.athlete_unlocked_offer_code(p_athlete_id, v_event.id);
    if v_offer_code.id is null then
      raise exception 'El combo no esta disponible para este evento.' using errcode = 'PLU03';
    end if;
  end if;

  select * into v_plan
  from public.membership_plans
  where id = case
    when v_has_combo then v_offer.membership_plan_id
    else v_offer_code.membership_plan_id
  end
  for update;
  if not found
     or v_plan.organization_id <> v_event.organization_id
     or v_plan.collection_mode <> 'one_time'
     or not v_plan.active
     or v_plan.effective_from > now()
     or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
    raise exception 'El plan del combo no esta vigente.' using errcode = 'PLU03';
  end if;
  -- Importe y moneda del paquete. El combo los trae cargados; sin combo son
  -- los del catalogo -- la suma de las partes -- y el importe promocional lo
  -- aplica despues `apply_discount_code_to_order`, exactamente como sobre un
  -- combo. La orden nunca nace por debajo del precio de lista sin un codigo.
  v_bundle_price := case
    when v_has_combo then v_offer.price
    else v_plan.price + v_event.price
  end;
  v_bundle_currency := case
    when v_has_combo then v_offer.currency
    else v_event.currency
  end;
  if upper(v_bundle_currency) <> upper(v_plan.currency)
     or upper(v_bundle_currency) <> upper(v_event.currency)
     or v_bundle_price > v_plan.price + v_event.price then
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
      'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end,
      'duplicate', true
    );
  end if;

  -- Impaga: reanudar la orden (combo o solo) en vez de PLU08.
  v_resume := public.resume_pending_event_registration_checkout(
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, p_payment_method
  );
  if v_resume is not null then
    select * into v_order
    from public.athlete_payment_orders
    where id = (v_resume->'order'->>'id')::uuid;
    select * into v_registration
    from public.event_registrations
    where id = (v_resume->'registration'->>'id')::uuid;
    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'plan', to_jsonb(v_plan),
      'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end,
      'duplicate', true
    );
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
    v_athlete.organization_id, p_athlete_id, v_plan.id, 'combo', v_bundle_price,
    upper(v_bundle_currency), p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'CORD-' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then plu_private.manual_link_checkout_window() else interval '30 minutes' end
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

  -- Reactiva la fila cancelada si existe; inserta sólo cuando no hay ninguna.
  v_placed := plu_private.place_event_registration(
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, v_order.id
  );
  select * into v_registration
  from public.event_registrations
  where id = (v_placed->'registration'->>'id')::uuid;

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values
  (
    v_athlete.organization_id,
    'combo_order.created', 'athlete_payment_order', v_order.id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object(
      'eventId', v_event.id,
      'offerId', case when v_has_combo then v_offer.id else null end,
      'offerCodeId', v_offer_code.id,
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
    jsonb_build_object(
      'eventId', v_event.id,
      'orderId', v_order.id,
      'source', 'combo',
      'reactivated', (v_placed->>'reactivated')::boolean
    )
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'plan', to_jsonb(v_plan),
    'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end,
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_order_core(
  uuid, text, text, text, numeric, text, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. resume_pending_event_registration_checkout -- cuerpo vigente de
--    20260817120000, mismo reemplazo en la rama manual_link.
-- ---------------------------------------------------------------------------

create or replace function public.resume_pending_event_registration_checkout(
  p_athlete_id uuid,
  p_event_id uuid,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_order public.athlete_payment_orders;
  v_can_switch boolean;
begin
  select * into v_registration
  from public.event_registrations
  where event_id = p_event_id
    and athlete_id = p_athlete_id
    and status <> 'cancelada'
  for update;
  if not found then
    return null;
  end if;

  if v_registration.status <> 'pendiente_pago' then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_registration.payment_order_id is not null then
    select * into v_order
    from public.athlete_payment_orders
    where id = v_registration.payment_order_id
    for update;
  end if;

  if v_order.id is not null and v_order.status = 'aprobado' then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_order.id is null
     or v_order.status not in ('pendiente', 'validacion_manual')
     or coalesce(v_order.expires_at, now() + interval '1 minute') <= now() then
    update public.event_registrations
    set status = 'cancelada', updated_at = now()
    where id = v_registration.id;
    if v_order.id is not null and v_order.status in ('pendiente', 'validacion_manual') then
      update public.athlete_payment_orders
      set status = 'cancelado', updated_at = now()
      where id = v_order.id;
    end if;
    return null;
  end if;

  v_can_switch :=
    v_order.method is distinct from p_payment_method
    and v_order.payment_proof_path is null
    and not exists (
      select 1
      from public.embedded_payment_attempts a
      where a.order_kind = 'athlete'
        and a.order_id = v_order.id
        and a.status in ('processing', 'submitted')
    );

  if v_can_switch then
    update public.athlete_payment_orders
    set method = p_payment_method,
        status = public.athlete_payment_status_for_method(p_payment_method),
        provider_preference_id = null,
        expires_at = now() + case
          when p_payment_method = 'manual_link' then plu_private.manual_link_checkout_window()
          else interval '30 minutes'
        end,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  end if;

  update public.event_registrations
  set division = p_division,
      category = p_category,
      bodyweight_kg = p_bodyweight_kg,
      updated_at = now()
  where id = v_registration.id
  returning * into v_registration;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'registration', to_jsonb(v_registration),
    'duplicate', true
  );
end;
$$;

revoke all on function public.resume_pending_event_registration_checkout(
  uuid, uuid, text, text, numeric, text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. plu_private.settle_manual_checkout_pricing -- cuerpo vigente de
--    20260828100000. Es el punto crítico: corre después de las 4 funciones de
--    arriba en cada checkout y, para `bank_transfer`, recortaba `expires_at`
--    de vuelta a 1 día sin condición. Se cambia solo esa rama; la de
--    `cash_pitbull` sigue con su propio mecanismo, sin tocar.
-- ---------------------------------------------------------------------------

create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_default_price numeric,
  p_manual_price numeric,
  p_currency text default null
)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_code public.discount_codes;
  v_base numeric;
  v_discount numeric := 0;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden de checkout no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.status not in ('pendiente', 'creado', 'validacion_manual')
     or v_order.method is distinct from p_payment_method then
    return v_order;
  end if;

  if v_order.payment_proof_path is not null or v_order.provider_preference_id is not null then
    return v_order;
  end if;

  -- Wise: precio propio en USD, sin cupón ni resolve_channel_price -- no hay
  -- equivalente ARS y los cupones no aplican a este canal.
  if p_manual_payment_channel = 'wise_transfer' then
    update public.athlete_payment_orders
    set amount = coalesce(p_default_price, amount),
        currency = coalesce(p_currency, currency),
        manual_payment_channel = p_manual_payment_channel,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
    return v_order;
  end if;

  v_base := coalesce(
    plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price),
    v_order.amount + coalesce(v_order.discount_amount, 0)
  );

  if v_order.discount_code_id is not null then
    select * into v_code from public.discount_codes where id = v_order.discount_code_id;
    if found then
      v_discount := least(
        plu_private.resolve_discount_amount(
          v_base, v_code.kind, v_code.percent_off,
          plu_private.effective_fixed_price(
            p_payment_method, v_code.fixed_price, v_code.fixed_price_manual
          )
        ),
        greatest(v_base - 1, 0)
      );
    else
      v_discount := least(coalesce(v_order.discount_amount, 0), greatest(v_base - 1, 0));
    end if;
  end if;

  update public.athlete_payment_orders
  set amount = v_base - v_discount,
      discount_amount = case when v_order.discount_code_id is null then discount_amount
        else v_discount::int end,
      manual_payment_channel = p_manual_payment_channel,
      expires_at = case
        when p_manual_payment_channel = 'cash_pitbull' then
          greatest(coalesce(expires_at, now()), plu_private.cash_checkout_deadline(v_order.id))
        when p_manual_payment_channel = 'bank_transfer' then
          least(
            coalesce(expires_at, now() + plu_private.manual_link_checkout_window()),
            now() + plu_private.manual_link_checkout_window()
          )
        else expires_at
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  if v_order.discount_code_id is not null then
    update public.discount_code_redemptions
    set discount_amount = v_discount::int
    where payment_order_id = v_order.id
      and discount_amount is distinct from v_discount::int;
  end if;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cola de avisos por email: recordatorio previo + aviso final de
--    vencimiento, mismo patrón que membership_renewal_notifications
--    (20260715000300 / 20260811170000).
-- ---------------------------------------------------------------------------

create table if not exists public.payment_order_expiry_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.athlete_payment_orders(id) on delete cascade,
  notification_key text not null check (notification_key in ('reminder', 'expired')),
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts_count int not null default 0,
  next_retry_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, notification_key)
);

-- Sin policy de lectura: se accede únicamente vía las RPC security definer de
-- abajo / service_role, mismo criterio que `domain_observations`
-- (20260927100000), la tabla de notificaciones más reciente del repo.
alter table public.payment_order_expiry_notifications enable row level security;

create or replace function public.claim_payment_order_expiry_notifications(
  p_limit int default 100
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recordatorio: todavía esperando que el atleta pague, a ~2 días del
  -- vencimiento (con una ventana de 5 días, day 3). `expires_at is not null`
  -- es explícito y no incidental: `athlete_confirm_manual_payment` deja
  -- `expires_at = null` al declarar un pago financiado, y esa orden no debe
  -- entrar acá aunque la resta con NULL ya la excluya por propagación.
  insert into public.payment_order_expiry_notifications (
    order_id, notification_key, recipient_email, organization_id
  )
  select o.id, 'reminder', a.email, o.organization_id
  from public.athlete_payment_orders o
  join public.athletes a on a.id = o.athlete_id
  where o.method = 'manual_link'
    and o.status in ('pendiente', 'validacion_manual')
    and o.payment_proof_uploaded_at is null
    and o.expires_at is not null
    and now() >= o.expires_at - interval '2 days'
  on conflict (order_id, notification_key) do nothing;

  -- Vencimiento: la orden ya fue cancelada por `expire_domain_orders`.
  insert into public.payment_order_expiry_notifications (
    order_id, notification_key, recipient_email, organization_id
  )
  select o.id, 'expired', a.email, o.organization_id
  from public.athlete_payment_orders o
  join public.athletes a on a.id = o.athlete_id
  where o.method = 'manual_link'
    and o.status = 'cancelado'
    and o.cancellation_code in ('expired_without_payment', 'expired_after_failed_attempt')
    and o.cancelled_at is not null
  on conflict (order_id, notification_key) do nothing;

  return query
  with candidates as (
    select n.id
    from public.payment_order_expiry_notifications n
    where n.status in ('pending', 'failed')
      and n.attempts_count < 5
      and n.next_retry_at <= now()
    order by n.created_at
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  ), claimed as (
    update public.payment_order_expiry_notifications n
    set status = 'processing', attempts_count = attempts_count + 1, updated_at = now()
    from candidates c
    where n.id = c.id
    returning n.*
  )
  select jsonb_build_object(
    'id', c.id,
    'notificationKey', c.notification_key,
    'recipientEmail', c.recipient_email,
    'attemptsCount', c.attempts_count,
    'orderId', o.id,
    'concept', o.concept,
    'reference', o.reference,
    'expiresAt', o.expires_at,
    'athleteId', a.id,
    'athleteName', a.full_name
  )
  from claimed c
  join public.athlete_payment_orders o on o.id = c.order_id
  join public.athletes a on a.id = o.athlete_id;
end;
$$;

revoke all on function public.claim_payment_order_expiry_notifications(int)
  from public, anon, authenticated;
grant execute on function public.claim_payment_order_expiry_notifications(int)
  to service_role;

create or replace function public.complete_payment_order_expiry_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_order_expiry_notifications
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else sent_at end,
      error = case when p_sent then null else left(coalesce(p_error, 'Error desconocido'), 2000) end,
      next_retry_at = case when p_sent then next_retry_at
        else now() + make_interval(mins => least(1440, (15 * power(2, greatest(attempts_count - 1, 0)))::int)) end,
      updated_at = now()
  where id = p_notification_id;
end;
$$;

revoke all on function public.complete_payment_order_expiry_notification(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_payment_order_expiry_notification(uuid, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_def text;
begin
  if to_regprocedure('plu_private.manual_link_checkout_window()') is null then
    raise exception 'Falta plu_private.manual_link_checkout_window().';
  end if;
  if (select plu_private.manual_link_checkout_window()) <> interval '5 days' then
    raise exception 'manual_link_checkout_window() no devuelve 5 dias.';
  end if;

  -- Ninguna de las 5 funciones que escriben expires_at para una orden manual
  -- puede seguir con el literal viejo -- ese fue el bug que hubiera anulado
  -- la extensión en silencio si solo se tocaban las funciones de creación.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_membership_order_v2';
  if v_def like '%manual_link'' then interval ''1 day''%' then
    raise exception 'create_membership_order_v2 sigue con el plazo viejo de 1 dia.';
  end if;
  if v_def not like '%manual_link_checkout_window()%' then
    raise exception 'create_membership_order_v2 no llama a manual_link_checkout_window().';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_competition_registration_v2';
  if v_def like '%manual_link'' then interval ''1 day''%' then
    raise exception 'create_competition_registration_v2 sigue con el plazo viejo de 1 dia.';
  end if;
  if v_def not like '%manual_link_checkout_window()%' then
    raise exception 'create_competition_registration_v2 no llama a manual_link_checkout_window().';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_membership_registration_combo_order_core';
  if v_def like '%manual_link'' then interval ''1 day''%' then
    raise exception 'create_membership_registration_combo_order_core sigue con el plazo viejo de 1 dia.';
  end if;
  if v_def not like '%manual_link_checkout_window()%' then
    raise exception 'create_membership_registration_combo_order_core no llama a manual_link_checkout_window().';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resume_pending_event_registration_checkout';
  if v_def like '%manual_link'' then interval ''1 day''%' then
    raise exception 'resume_pending_event_registration_checkout sigue con el plazo viejo de 1 dia.';
  end if;
  if v_def not like '%manual_link_checkout_window()%' then
    raise exception 'resume_pending_event_registration_checkout no llama a manual_link_checkout_window().';
  end if;

  -- El call site crítico: si esto no cambió, la extensión no tiene efecto en
  -- el caso estándar de transferencia bancaria (ver comentario de cabecera).
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'settle_manual_checkout_pricing';
  if v_def like '%now() + interval ''1 day''), now() + interval ''1 day''%' then
    raise exception 'settle_manual_checkout_pricing sigue recortando bank_transfer a 1 dia.';
  end if;
  if v_def not like '%manual_link_checkout_window()%' then
    raise exception 'settle_manual_checkout_pricing no llama a manual_link_checkout_window().';
  end if;
  -- La rama cash_pitbull no debe tocarse: sigue anclada al evento.
  if v_def not like '%cash_checkout_deadline%' then
    raise exception 'settle_manual_checkout_pricing perdio la rama de cash_pitbull.';
  end if;

  if to_regprocedure('public.claim_payment_order_expiry_notifications(int)') is null then
    raise exception 'Falta public.claim_payment_order_expiry_notifications(int).';
  end if;
  if to_regprocedure('public.complete_payment_order_expiry_notification(uuid,boolean,text)') is null then
    raise exception 'Falta public.complete_payment_order_expiry_notification(uuid,boolean,text).';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_order_expiry_notifications'
  ) then
    raise exception 'Falta la tabla payment_order_expiry_notifications.';
  end if;
end
$verification$;
