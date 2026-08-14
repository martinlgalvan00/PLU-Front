-- Guarda de transicion monotonica al acreditar un pago de Mercado Pago.
--
-- `apply_mercado_pago_payment`, `apply_ticket_mercado_pago_payment` y
-- `apply_subscription_payment` upsertean la fila de pago por
-- `external_payment_id` con `status = excluded.status` sin comparar contra
-- el estado que ya tenia la fila. El webhook re-consulta siempre el pago
-- real via `mercadoPago.getPayment()` (nunca confia en el payload de la
-- notificacion), pero dos notificaciones del mismo pago (ej. payment.created
-- y payment.updated, cada una con su propio evento y su propio fetch a la
-- API de MP) pueden resolverse fuera de orden si el fetch mas viejo termina
-- de escribir en la base despues del mas nuevo. El estado agregado de la
-- orden se recalcula sobre TODAS las filas de pago del pedido, asi que una
-- escritura tardia con un estado menos avanzado degradaba
-- `athlete_payment_orders.status`/`ticket_orders.status` de 'aprobado' de
-- vuelta a 'pendiente' -- sin revertir la membresia/ticket ya otorgado (esa
-- rama solo actua sobre 'reembolsado'/'cancelado'), pero dejando la orden
-- reportando un estado que ya no era cierto.
--
-- Fix: una vez que la fila de pago llega a 'aprobado' o 'reembolsado', una
-- notificacion tardia con un estado menos definitivo ('pendiente',
-- 'rechazado', 'cancelado') ya no puede pisarla. 'aprobado' -> 'reembolsado'
-- sigue permitido (un reembolso real siempre tiene la ultima palabra). El
-- resto de las columnas (raw_payload, status_detail, payer_email) se sigue
-- refrescando siempre: son metadata de diagnostico, no la señal que decide
-- si la orden se re-evalua a un estado menos avanzado.

create or replace function public.apply_mercado_pago_payment(
  p_order_id uuid,
  p_external_payment_id text,
  p_status text,
  p_amount int,
  p_currency text,
  p_payer_email text default null,
  p_status_detail text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_payment public.athlete_payments;
  v_existing_payment public.athlete_payments;
  v_entitlement_payment_id uuid;
  v_order_status text;
  v_previous_status text;
  v_membership public.memberships;
  v_registration public.event_registrations;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_order
  from public.athlete_payment_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'mercado_pago' then
    raise exception 'La orden no pertenece a Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_order.amount or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Monto o moneda no coinciden con la orden.' using errcode = 'PLU11';
  end if;

  v_previous_status := v_order.status;

  select * into v_existing_payment
  from public.athlete_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> p_order_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;

  insert into public.athlete_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at, organization_id
  ) values (
    p_order_id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end,
    v_order.organization_id
  )
  on conflict (external_payment_id) do update set
    status = case
      when public.athlete_payments.status in ('aprobado', 'reembolsado')
        and excluded.status not in ('aprobado', 'reembolsado')
      then public.athlete_payments.status
      else excluded.status
    end,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.athlete_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  select case
    when bool_or(status = 'aprobado') then 'aprobado'
    when bool_or(status = 'pendiente') then 'pendiente'
    when bool_or(status = 'reembolsado') then 'reembolsado'
    when bool_or(status = 'rechazado') then 'rechazado'
    else 'cancelado'
  end into v_order_status
  from public.athlete_payments
  where order_id = p_order_id;

  update public.athlete_payment_orders
  set status = v_order_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when v_order_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when v_order_status = 'rechazado' then now() else rejected_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order_status = 'aprobado' then
    select id into v_entitlement_payment_id
    from public.athlete_payments
    where order_id = p_order_id and status = 'aprobado'
    order by confirmed_at desc nulls last, updated_at desc
    limit 1;

    if v_order.concept in ('membership', 'combo') then
      update public.memberships
      set status = 'activa', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null then
        insert into public.membership_cycles (
          membership_id, order_id, payment_id, starts_at, ends_at, status, organization_id
        ) values (
          v_membership.id, p_order_id, v_entitlement_payment_id,
          coalesce(v_membership.start_date, current_date),
          coalesce(v_membership.expiration_date, (current_date + interval '1 year')::date),
          'active', v_order.organization_id
        )
        on conflict (membership_id, order_id) do update set
          payment_id = excluded.payment_id,
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
  elsif v_order_status in ('reembolsado', 'cancelado') then
    if v_order.concept in ('membership', 'combo') then
      update public.membership_cycles
      set status = case when v_order_status = 'reembolsado' then 'refunded' else 'cancelled' end,
          updated_at = now()
      where order_id = p_order_id;

      update public.memberships
      set status = case when v_order_status = 'reembolsado' then 'reembolsada' else 'cancelada' end,
          updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null and not exists (
        select 1 from public.memberships m
        where m.athlete_id = v_order.athlete_id
          and m.id <> v_membership.id
          and m.status = 'activa'
          and coalesce(m.expiration_date, current_date) >= current_date
      ) then
        update public.athletes
        set status = 'registrado', updated_at = now()
        where id = v_order.athlete_id and status = 'afiliado_activo';
      end if;
    end if;

    if v_order.concept in ('registration', 'combo') then
      update public.event_registrations
      set status = 'cancelada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
    end if;
  end if;

  -- Auditoria: un registro por intento aplicado y uno por derecho afectado.
  -- La clave del reclamo es siempre el external_payment_id, asi que viaja en
  -- la metadata de todos.
  perform plu_private.record_domain_audit(
    'payment.applied',
    'athlete_payment_order',
    p_order_id::text,
    'webhook',
    p_external_payment_id,
    jsonb_build_object(
      'paymentStatus', p_status,
      'orderStatus', v_order_status,
      'previousStatus', v_previous_status,
      'externalPaymentId', p_external_payment_id,
      'amount', p_amount,
      'currency', upper(p_currency),
      'concept', v_order.concept,
      'statusDetail', p_status_detail
    ),
    v_order.organization_id
  );

  if v_membership.id is not null then
    perform plu_private.record_domain_audit(
      case when v_order_status = 'aprobado' then 'membership.activated' else 'membership.revoked' end,
      'membership', v_membership.id::text, 'webhook', p_external_payment_id,
      jsonb_build_object(
        'orderId', p_order_id,
        'memberCode', v_membership.member_code,
        'expirationDate', v_membership.expiration_date,
        'status', v_membership.status,
        'channel', 'mercado_pago'
      ),
      v_order.organization_id
    );
  end if;

  if v_registration.id is not null then
    perform plu_private.record_domain_audit(
      case when v_order_status = 'aprobado' then 'registration.confirmed' else 'registration.cancelled' end,
      'event_registration', v_registration.id::text, 'webhook', p_external_payment_id,
      jsonb_build_object(
        'orderId', p_order_id,
        'eventId', v_registration.event_id,
        'status', v_registration.status,
        'channel', 'mercado_pago'
      ),
      v_order.organization_id
    );
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

revoke all on function public.apply_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  to service_role;

create or replace function public.apply_ticket_mercado_pago_payment(
  p_order_id uuid,
  p_external_payment_id text,
  p_status text,
  p_amount int,
  p_currency text,
  p_payer_email text default null,
  p_status_detail text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_payment public.ticket_payments;
  v_existing_payment public.ticket_payments;
  v_order_status text;
  v_tickets jsonb;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'mercado_pago' then
    raise exception 'La orden no pertenece a Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_order.amount or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Monto o moneda no coinciden con la orden.' using errcode = 'PLU11';
  end if;

  select * into v_existing_payment
  from public.ticket_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> p_order_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;

  insert into public.ticket_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at
  ) values (
    p_order_id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end
  )
  on conflict (external_payment_id) do update set
    status = case
      when public.ticket_payments.status in ('aprobado', 'reembolsado')
        and excluded.status not in ('aprobado', 'reembolsado')
      then public.ticket_payments.status
      else excluded.status
    end,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.ticket_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  select case
    when bool_or(status = 'aprobado') then 'aprobado'
    when bool_or(status = 'pendiente') then 'pendiente'
    when bool_or(status = 'reembolsado') then 'reembolsado'
    when bool_or(status = 'rechazado') then 'rechazado'
    else 'cancelado'
  end into v_order_status
  from public.ticket_payments
  where order_id = p_order_id;

  update public.ticket_orders
  set status = v_order_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when v_order_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when v_order_status = 'rechazado' then now() else rejected_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order_status = 'aprobado' then
    update public.tickets set status = 'pagada', updated_at = now()
    where order_id = p_order_id and status <> 'pagada';
  elsif v_order_status in ('cancelado', 'reembolsado') then
    update public.tickets set status = 'cancelada', updated_at = now()
    where order_id = p_order_id and status <> 'cancelada';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
  into v_tickets from public.tickets t where t.order_id = p_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'tickets', v_tickets
  );
end;
$$;

revoke all on function public.apply_ticket_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_ticket_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  to service_role;

create or replace function public.apply_subscription_payment(
  p_provider_subscription_id text,
  p_external_payment_id text,
  p_status text,
  p_amount int,
  p_currency text,
  p_payer_email text default null,
  p_status_detail text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.billing_subscriptions;
  v_membership public.memberships;
  v_target public.membership_order_targets;
  v_order public.athlete_payment_orders;
  v_payment public.athlete_payments;
  v_existing_payment public.athlete_payments;
  v_start date;
  v_end date;
  v_active_until date;
  v_reference text;
  v_order_status text;
  v_is_initial boolean := false;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago recurrente no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_subscription
  from public.billing_subscriptions
  where provider_subscription_id = p_provider_subscription_id
  for update;
  if not found then raise exception 'Suscripcion no encontrada.' using errcode = 'PLU02'; end if;

  select * into v_membership from public.memberships
  where id = v_subscription.membership_id for update;
  if not found or v_membership.organization_id <> v_subscription.organization_id
     or v_membership.athlete_id <> v_subscription.athlete_id then
    raise exception 'Contrato de suscripcion inconsistente.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_subscription.amount
     or upper(p_currency) <> upper(v_subscription.currency) then
    raise exception 'Monto o moneda no coinciden con la suscripcion.' using errcode = 'PLU11';
  end if;

  select * into v_existing_payment
  from public.athlete_payments
  where external_payment_id = p_external_payment_id
  for update;

  if found then
    select * into v_order from public.athlete_payment_orders
    where id = v_existing_payment.order_id for update;
    if not found or v_order.organization_id <> v_subscription.organization_id
       or v_order.athlete_id <> v_subscription.athlete_id
       or (
         v_order.id <> v_subscription.initial_order_id
         and v_order.reference not like 'SUB-' || v_subscription.id::text || '-%'
       ) then
      raise exception 'El pago recurrente ya pertenece a otra orden.' using errcode = 'PLU13';
    end if;
    v_is_initial := v_order.id = v_subscription.initial_order_id;
  else
    select * into v_order from public.athlete_payment_orders
    where id = v_subscription.initial_order_id for update;
    if not found then raise exception 'Orden inicial no encontrada.' using errcode = 'PLU02'; end if;

    v_is_initial := not exists (
      select 1 from public.membership_cycles c where c.order_id = v_order.id
    );
    if not v_is_initial then
      v_reference := 'SUB-' || v_subscription.id::text || '-' || p_external_payment_id;
      insert into public.athlete_payment_orders(
        organization_id, athlete_id, concept, plan_id, amount, currency, method,
        status, reference, idempotency_key, payer_email
      ) values (
        v_subscription.organization_id, v_subscription.athlete_id, 'membership',
        v_subscription.plan_id, v_subscription.amount, v_subscription.currency,
        'mercado_pago', p_status, v_reference, v_reference, p_payer_email
      )
      on conflict(idempotency_key) do update set updated_at = now()
      returning * into v_order;
    end if;
  end if;

  insert into public.athlete_payments(
    organization_id, order_id, external_payment_id, status, amount, currency,
    payer_email, status_detail, raw_payload, confirmed_at
  ) values (
    v_subscription.organization_id, v_order.id, p_external_payment_id, p_status,
    p_amount, upper(p_currency), p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end
  )
  on conflict(external_payment_id) do update set
    status = case
      when public.athlete_payments.status in ('aprobado', 'reembolsado')
        and excluded.status not in ('aprobado', 'reembolsado')
      then public.athlete_payments.status
      else excluded.status
    end,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.athlete_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  select case
    when bool_or(status = 'aprobado') then 'aprobado'
    when bool_or(status = 'pendiente') then 'pendiente'
    when bool_or(status = 'reembolsado') then 'reembolsado'
    when bool_or(status = 'rechazado') then 'rechazado'
    else 'cancelado'
  end into v_order_status
  from public.athlete_payments where order_id = v_order.id;

  update public.athlete_payment_orders
  set status = v_order_status,
      approved_at = case when v_order_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when v_order_status = 'rechazado' then now() else rejected_at end,
      provider_payload = p_payload,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  if p_status = 'aprobado' then
    if v_is_initial then
      select * into v_target from public.membership_order_targets
      where order_id = v_order.id for update;
      if not found or v_target.plan_id <> v_subscription.plan_id then
        raise exception 'La orden inicial no tiene un ciclo valido.' using errcode = 'PLU10';
      end if;
      v_start := v_target.starts_at;
      v_end := v_target.ends_at;
    else
      select coalesce(
        max(ends_at),
        greatest(current_date, coalesce(v_membership.expiration_date, current_date))
      ) into v_start
      from public.membership_cycles
      where membership_id = v_membership.id and status in ('active', 'pending');
      if v_subscription.billing_frequency = 'monthly' then
        v_end := (v_start + make_interval(months => v_subscription.interval_count))::date;
      else
        v_end := (v_start + make_interval(years => v_subscription.interval_count))::date;
      end if;
    end if;

    insert into public.membership_cycles(
      organization_id, membership_id, order_id, payment_id, starts_at, ends_at, status
    ) values (
      v_subscription.organization_id, v_membership.id, v_order.id, v_payment.id,
      v_start, v_end, 'active'
    )
    on conflict(membership_id, order_id) do update set
      payment_id = excluded.payment_id,
      status = 'active',
      updated_at = now();

    update public.memberships
    set status = 'activa',
        start_date = least(coalesce(start_date, v_start), v_start),
        expiration_date = greatest(coalesce(expiration_date, v_end), v_end),
        updated_at = now()
    where id = v_membership.id returning * into v_membership;

    update public.athletes set status = 'afiliado_activo', updated_at = now()
    where id = v_subscription.athlete_id;

    update public.billing_subscriptions
    set status = 'authorized',
        current_period_start = v_start,
        current_period_end = v_end,
        next_billing_at = v_end,
        raw_payload = p_payload,
        updated_at = now()
    where id = v_subscription.id returning * into v_subscription;
  elsif v_order_status in ('rechazado', 'cancelado', 'reembolsado') then
    -- Los efectos de dominio siguen el agregado de la orden. Un rechazo o
    -- reembolso tardio no degrada un ciclo si queda otro intento aprobado.
    if v_order_status = 'reembolsado' then
      update public.membership_cycles
      set status = 'refunded', updated_at = now()
      where order_id = v_order.id;

      select max(ends_at) into v_active_until
      from public.membership_cycles
      where membership_id = v_membership.id and status = 'active';

      update public.memberships
      set expiration_date = coalesce(v_active_until, expiration_date),
          status = case when v_active_until is not null and v_active_until >= current_date
            then 'activa' else 'reembolsada' end,
          updated_at = now()
      where id = v_membership.id returning * into v_membership;

      if v_membership.status = 'reembolsada' and not exists (
        select 1 from public.memberships m
        where m.athlete_id = v_subscription.athlete_id
          and m.id <> v_membership.id
          and m.status = 'activa'
          and coalesce(m.expiration_date, current_date) >= current_date
      ) then
        update public.athletes set status = 'registrado', updated_at = now()
        where id = v_subscription.athlete_id and status = 'afiliado_activo';
      end if;
    end if;

    update public.billing_subscriptions
    set status = 'past_due', raw_payload = p_payload, updated_at = now()
    where id = v_subscription.id returning * into v_subscription;
  end if;

  return jsonb_build_object(
    'subscription', to_jsonb(v_subscription),
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'membership', to_jsonb(v_membership)
  );
end;
$$;

revoke all on function public.apply_subscription_payment(text, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_payment(text, text, text, int, text, text, text, jsonb)
  to service_role;
