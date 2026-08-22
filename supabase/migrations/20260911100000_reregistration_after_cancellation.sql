-- Reinscripción tras una inscripción cancelada — PLU ARG
--
-- Bug en producción: un atleta cuya inscripción quedó 'cancelada' (la deja el
-- cron de vencimiento cuando la orden de Mercado Pago no se paga en 30 minutos)
-- no puede volver a inscribirse. El checkout devuelve, crudo desde Postgres:
--
--   duplicate key value violates unique constraint
--   "event_registrations_event_id_athlete_id_key"
--
-- Historia de la regresión: 20260815200000/20260815201000 arreglaron esto
-- reactivando la fila cancelada en vez de insertar una nueva. 20260816120000
-- (reanudar checkout pendiente) reescribió `create_competition_registration_v2`
-- y `create_membership_registration_combo_order_core` completas y perdió esa
-- rama: volvieron al INSERT plano. Peor todavía, la rama de "orden muerta" de
-- `resume_pending_event_registration_checkout` cancela la inscripción residual
-- y devuelve null "para que el INSERT posterior pueda recrearla" — con la
-- restricción única de 20260706030000 vigente eso nunca pudo funcionar, así que
-- el reintento choca por los dos caminos.
--
-- Fix estructural, para que la próxima reescritura no vuelva a perderlo:
--
-- 1. `plu_private.athlete_registration_snapshot` — el armado del snapshot de
--    perfil deja de vivir dentro del trigger de INSERT, así la reactivación
--    puede reusarlo en vez de duplicarlo.
-- 2. `plu_private.lock_registration_competition_selection` — el compromiso
--    competitivo (división/categoría/peso fijados al inscribirse,
--    20260823110000) se libera al salir de 'cancelada': el atleta que se
--    reinscribe vuelve a elegir. Sin esta excepción la reactivación quedaría
--    muda — el atleta elige Open y el trigger le devuelve la Masters de la
--    inscripción muerta.
-- 3. `plu_private.place_event_registration` — un único lugar que decide entre
--    reactivar la fila cancelada e insertar una nueva. Las dos RPC de checkout
--    lo llaman en vez de tener cada una su INSERT.
-- 4. Las dos RPC quedan idénticas a su versión de 20260816120000 salvo por ese
--    reemplazo y por el `reactivated` en la auditoría.
--
-- Aplicar esta migración destraba también a los atletas que hoy ya están
-- bloqueados: su fila cancelada se reactiva sola en el próximo intento, sin
-- reparación de datos.

-- ---------------------------------------------------------------------------
-- 1. Snapshot de perfil reutilizable
-- ---------------------------------------------------------------------------

create or replace function plu_private.athlete_registration_snapshot(p_athlete_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'fullName', v_athlete.full_name,
    'documentId', v_athlete.document_id,
    'birthDate', v_athlete.birth_date,
    'sex', v_athlete.sex,
    'team', v_athlete.gym,
    'phone', v_athlete.phone,
    'country', v_athlete.country,
    'province', v_athlete.province,
    'city', v_athlete.city,
    'email', v_athlete.email,
    'emergencyContactName', v_athlete.emergency_contact_name,
    'emergencyContactPhone', v_athlete.emergency_contact_phone,
    'instagramHandle', v_athlete.instagram_handle
  ));
end;
$$;

revoke all on function plu_private.athlete_registration_snapshot(uuid)
  from public, anon, authenticated;

-- El trigger de INSERT (20260819140000) pasa a delegar: mismo comportamiento,
-- una sola definición del snapshot.
create or replace function plu_private.capture_registration_athlete_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.athlete_profile_snapshot := plu_private.athlete_registration_snapshot(new.athlete_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. El compromiso competitivo se libera al cancelar
-- ---------------------------------------------------------------------------

create or replace function plu_private.lock_registration_competition_selection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Una inscripción cancelada dejó de ser un compromiso: no ocupa cupo, no
  -- entra al padrón ni al cronograma y no tiene cobro vivo. Si el atleta la
  -- revive con un checkout nuevo vuelve a elegir división, categoría y peso,
  -- igual que si se inscribiera por primera vez.
  if old.status = 'cancelada' and new.status <> 'cancelada' then
    return new;
  end if;

  -- Conserva la selección original incluso si una RPC histórica de reintento
  -- recibe valores distintos. Así, una edición de perfil o un retry no puede
  -- mover al atleta de categoría ni cambiar su peso comprometido.
  if old.division is distinct from new.division
     or old.category is distinct from new.category
     or old.bodyweight_kg is distinct from new.bodyweight_kg then
    new.division := old.division;
    new.category := old.category;
    new.bodyweight_kg := old.bodyweight_kg;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reactivar-o-insertar, en un solo lugar
-- ---------------------------------------------------------------------------

create or replace function plu_private.place_event_registration(
  p_athlete_id uuid,
  p_event_id uuid,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.event_registrations;
  v_registration public.event_registrations;
begin
  -- unique (event_id, athlete_id): como mucho hay una fila y hay que tomarla
  -- bloqueada antes de decidir.
  select * into v_existing
  from public.event_registrations
  where event_id = p_event_id and athlete_id = p_athlete_id
  for update;

  -- Defensa en profundidad: las dos RPC que llaman acá ya reanudaron la orden
  -- impaga o levantaron PLU08. Si igual sobrevive una fila viva, la respuesta
  -- correcta es el conflicto de negocio, nunca una violación de constraint
  -- filtrada al navegador.
  if v_existing.id is not null and v_existing.status <> 'cancelada' then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_existing.id is not null then
    update public.event_registrations
       set division = p_division,
           category = p_category,
           bodyweight_kg = p_bodyweight_kg,
           status = 'pendiente_pago',
           payment_order_id = p_order_id,
           -- La asignación de día y tanda pertenecía a la inscripción muerta.
           event_day_id = null,
           event_session_id = null,
           -- El estado vuelve a estar gobernado por el cobro; el sello de
           -- "esto lo puso una persona" (20260910100000) ya no describe nada.
           manual_override_status = null,
           manual_override_channel = null,
           manual_override_reason = null,
           manual_override_by = null,
           manual_override_at = null,
           -- El trigger de snapshot es BEFORE INSERT: en una reactivación hay
           -- que refrescarlo a mano o quedaría el perfil de meses atrás.
           athlete_profile_snapshot = plu_private.athlete_registration_snapshot(p_athlete_id),
           updated_at = now()
     where id = v_existing.id
    returning * into v_registration;
  else
    insert into public.event_registrations (
      athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id
    ) values (
      p_athlete_id, p_event_id, p_division, p_category, p_bodyweight_kg,
      'pendiente_pago', p_order_id
    )
    returning * into v_registration;
  end if;

  return jsonb_build_object(
    'registration', to_jsonb(v_registration),
    'reactivated', v_existing.id is not null
  );
end;
$$;

revoke all on function plu_private.place_event_registration(uuid, uuid, text, text, numeric, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_competition_registration_v2 — cuerpo de 20260816120000, sin INSERT
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
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
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
-- 5. create_membership_registration_combo_order_core — mismo reemplazo
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
      'comboOffer', to_jsonb(v_offer),
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
    'comboOffer', to_jsonb(v_offer),
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_order_core(
  uuid, text, text, text, numeric, text, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_source text;
begin
  if to_regprocedure('plu_private.place_event_registration(uuid,uuid,text,text,numeric,uuid)') is null
     or to_regprocedure('plu_private.athlete_registration_snapshot(uuid)') is null then
    raise exception 'Faltan los helpers de reinscripción.' using errcode = 'PLU01';
  end if;

  -- Ninguna de las dos RPC de checkout puede volver a tener su propio INSERT
  -- contra event_registrations: es exactamente la regresión que se está
  -- corrigiendo, y sólo se nota en producción con una fila cancelada delante.
  for v_source in
    select prosrc from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_competition_registration_v2',
        'create_membership_registration_combo_order_core'
      )
  loop
    if v_source !~ 'place_event_registration' then
      raise exception 'Una RPC de checkout no usa plu_private.place_event_registration.'
        using errcode = 'PLU01';
    end if;
    if v_source ~ 'insert into public\.event_registrations' then
      raise exception 'Una RPC de checkout volvió a insertar en event_registrations.'
        using errcode = 'PLU01';
    end if;
  end loop;

  -- El trigger de compromiso tiene que dejar pasar la reactivación.
  select prosrc into v_source from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private'
    and p.proname = 'lock_registration_competition_selection';
  if v_source !~ 'cancelada' then
    raise exception 'El trigger de compromiso competitivo no exceptúa la reinscripción.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
