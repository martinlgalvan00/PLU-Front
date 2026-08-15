-- Corrección manual de cobros y de estados de inscripción — PLU ARG
--
-- Hasta ahora, cuando Mercado Pago daba una orden por rechazada o cancelada
-- pero el dinero sí había entrado (acreditación tardía, webhook perdido, pago
-- resuelto por fuera del checkout), no había ninguna salida operativa:
--
--   1. `approve_athlete_payment_order` rechaza de plano cualquier orden que no
--      sea `manual_link` ("Los pagos de Mercado Pago solo se aprueban por
--      webhook") y además exige que la orden siga abierta.
--   2. `event_registrations.status` no tenía ninguna vía de edición manual: el
--      operador solo podía aprobar el pago o borrar la inscripción entera.
--   3. La única escapatoria era forzar `memberships.status = 'activa'` con
--      `staff_set_membership_status`, que deja la orden en `rechazado` y el
--      dinero fuera del reporte financiero (los ingresos se agregan desde
--      `athlete_payments` con `status = 'aprobado'`).
--
-- Esta migración agrega la corrección manual como operación de primera clase,
-- con asiento contable real y trazabilidad completa. No relaja ninguna de las
-- reglas existentes: `approve_athlete_payment_order` sigue negándose a tocar
-- órdenes de Mercado Pago. Esta es una función distinta, con permiso distinto,
-- que exige motivo y comprobante, y que deja el intento fallido del proveedor
-- intacto para la forense.

-- ---------------------------------------------------------------------------
-- Acreditación manual de una orden que el proveedor dio por perdida
-- ---------------------------------------------------------------------------

create or replace function public.staff_force_settle_payment_order(
  p_order_id uuid,
  p_actor text,
  p_reason text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_payment public.athlete_payments;
  v_plan public.membership_plans;
  v_previous_status text;
  v_external_id text;
  v_duration int;
  v_start date;
  v_end date;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'La correccion manual exige un motivo.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'La correccion manual exige un responsable.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  -- Idempotente: repetir la acción sobre una orden ya acreditada no duplica el
  -- asiento contable ni vuelve a mover los derechos.
  if v_order.status = 'aprobado' then
    select * into v_membership from public.memberships where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
    return jsonb_build_object(
      'order', to_jsonb(v_order), 'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration), 'duplicate', true
    );
  end if;

  -- El comprobante es la evidencia de que el dinero entró de verdad. Sin él
  -- esto sería indistinguible de regalar una afiliación.
  if v_order.payment_proof_path is null then
    raise exception 'Adjunta el comprobante del pago recibido antes de acreditarlo a mano.'
      using errcode = 'PLU10';
  end if;

  v_previous_status := v_order.status;
  v_external_id := 'manual-settlement:' || p_order_id::text;

  -- Asiento contable. Se inserta como pago propio en vez de pisar el intento
  -- fallido del proveedor: el reporte financiero lee `athlete_payments` con
  -- `status = 'aprobado'`, y el registro rechazado de Mercado Pago tiene que
  -- seguir existiendo para poder reconstruir qué pasó.
  insert into public.athlete_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at, organization_id
  ) values (
    p_order_id, v_external_id, 'aprobado', v_order.amount, upper(v_order.currency),
    v_order.payer_email,
    'Acreditacion manual: ' || trim(p_reason),
    jsonb_build_object(
      'source', 'manual_settlement',
      'actor', p_actor,
      'reason', trim(p_reason),
      'providerReference', p_reference,
      'previousOrderStatus', v_previous_status,
      'orderMethod', v_order.method
    ),
    now(), v_order.organization_id
  )
  on conflict (external_payment_id) do update set
    status = 'aprobado',
    amount = excluded.amount,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.athlete_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  update public.athlete_payment_orders
  set status = 'aprobado',
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.concept in ('membership', 'combo') then
    select * into v_membership from public.memberships
    where payment_order_id = p_order_id for update;

    if v_membership.id is not null then
      select * into v_plan from public.membership_plans where id = v_membership.plan_id;
      v_duration := case
        when v_plan.id is null then 365
        when v_plan.billing_frequency = 'monthly' then 30 * coalesce(v_plan.interval_count, 1)
        else 365 * coalesce(v_plan.interval_count, 1)
      end;

      -- Acreditar un pago viejo no puede dejar al socio activo y vencido a la
      -- vez: si el período ya no cubre, se abre uno nuevo desde hoy. Si todavía
      -- cubre se respeta, porque la vigencia ya pagada no se acorta ni se corre.
      -- Mismo criterio que `staff_set_membership_status`.
      if v_membership.expiration_date is null or v_membership.expiration_date < current_date then
        v_start := current_date;
        v_end := current_date + v_duration;
      else
        v_start := coalesce(v_membership.start_date, current_date);
        v_end := v_membership.expiration_date;
      end if;

      update public.memberships
      set status = 'activa',
          start_date = v_start,
          expiration_date = v_end,
          updated_at = now()
      where id = v_membership.id
      returning * into v_membership;

      insert into public.membership_cycles (
        membership_id, order_id, payment_id, starts_at, ends_at, status, organization_id
      ) values (
        v_membership.id, p_order_id, v_payment.id, v_start, v_end, 'active', v_order.organization_id
      )
      on conflict (membership_id, order_id) do update set
        payment_id = excluded.payment_id,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        status = 'active',
        updated_at = now();

      update public.athletes
      set status = 'afiliado_activo', updated_at = now()
      where id = v_order.athlete_id;
    end if;
  end if;

  if v_order.concept in ('registration', 'combo') then
    update public.event_registrations
    set status = 'confirmada', updated_at = now()
    where payment_order_id = p_order_id
    returning * into v_registration;
  end if;

  perform plu_private.record_domain_audit(
    'payment.force_settled_manually',
    'athlete_payment_order',
    p_order_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'concept', v_order.concept,
      'method', v_order.method,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'reference', v_order.reference,
      'previousStatus', v_previous_status,
      'reason', trim(p_reason),
      'providerReference', p_reference,
      'externalPaymentId', v_external_id
    ),
    v_order.organization_id
  );

  if v_membership.id is not null then
    perform plu_private.record_domain_audit(
      'membership.activated_manually',
      'membership',
      v_membership.id::text,
      'staff',
      p_actor,
      jsonb_build_object(
        'via', 'force_settlement',
        'orderId', p_order_id,
        'memberCode', v_membership.member_code,
        'startDate', v_membership.start_date,
        'expirationDate', v_membership.expiration_date
      ),
      v_order.organization_id
    );
  end if;

  if v_registration.id is not null then
    perform plu_private.record_domain_audit(
      'registration.confirmed',
      'event_registration',
      v_registration.id::text,
      'staff',
      p_actor,
      jsonb_build_object('via', 'force_settlement', 'orderId', p_order_id),
      v_order.organization_id
    );
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'payment', to_jsonb(v_payment),
    'duplicate', false
  );
end;
$$;

revoke all on function public.staff_force_settle_payment_order(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_force_settle_payment_order(uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Corrección manual del estado de una inscripción
-- ---------------------------------------------------------------------------
--
-- `event_registrations.status` admite seis valores pero solo el webhook y la
-- aprobación de pago lo escribían: `observada` no tenía forma de setearse desde
-- ningún lado, y volver atrás una cancelación equivocada obligaba a borrar la
-- inscripción y pedirle al atleta que se anotara de nuevo (perdiendo división,
-- categoría y horario asignado).

create or replace function public.staff_set_registration_status(
  p_registration_id uuid,
  p_status text,
  p_actor text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_previous text;
  v_organization_id uuid;
begin
  if p_status not in ('confirmada', 'observada', 'cancelada') then
    raise exception 'Estado de inscripcion no permitido desde el panel.' using errcode = 'PLU01';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'El cambio manual exige un motivo.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'El cambio manual exige un responsable.' using errcode = 'PLU01';
  end if;

  select * into v_registration from public.event_registrations
  where id = p_registration_id for update;
  if not found then
    raise exception 'Inscripcion no encontrada.' using errcode = 'PLU02';
  end if;

  v_previous := v_registration.status;
  if v_previous = p_status then
    return jsonb_build_object('registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  update public.event_registrations
  set status = p_status, updated_at = now()
  where id = p_registration_id
  returning * into v_registration;

  -- `event_registrations` no lleva organization_id propio; se toma del evento
  -- para que el asiento de auditoría quede en el tenant correcto.
  select organization_id into v_organization_id
  from public.events where id = v_registration.event_id;

  perform plu_private.record_domain_audit(
    'registration.status_changed_manually',
    'event_registration',
    p_registration_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'status', p_status,
      'reason', trim(p_reason),
      'eventId', v_registration.event_id,
      'athleteId', v_registration.athlete_id
    ),
    v_organization_id
  );

  return jsonb_build_object('registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.staff_set_registration_status(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_registration_status(uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if to_regprocedure('public.staff_force_settle_payment_order(uuid, text, text, text)') is null then
    raise exception 'Falta staff_force_settle_payment_order.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.staff_set_registration_status(uuid, text, text, text)') is null then
    raise exception 'Falta staff_set_registration_status.' using errcode = 'PLU01';
  end if;
end;
$verification$;
