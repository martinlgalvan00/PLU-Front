-- Fase 6: recuperacion automatica, conciliacion y observabilidad operativa.
-- Los webhooks se registran antes de procesarse y los workers reclaman trabajo
-- con FOR UPDATE SKIP LOCKED para tolerar multiples instancias de la API.

-- Esta es la unica migracion nueva que debe ejecutarse sobre una base que ya
-- tenga aplicadas las fases 1 a 5. Se ejecuta de manera atomica: si falta una
-- dependencia o falla una funcion, PostgreSQL revierte el archivo completo.
begin;

do $migration$
declare
  v_missing text[] := array[]::text[];
  v_relation text;
begin
  foreach v_relation in array array[
    'public.athletes',
    'public.athlete_payment_orders',
    'public.memberships',
    'public.event_registrations',
    'public.ticket_orders',
    'public.tickets',
    'public.membership_plans',
    'public.athlete_payments',
    'public.billing_subscriptions',
    'public.ticket_payments',
    'public.payment_integration_events',
    'public.embedded_payment_attempts'
  ] loop
    if to_regclass(v_relation) is null then
      v_missing := array_append(v_missing, v_relation);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'No se puede instalar la operacion de Mercado Pago. Faltan: %',
      array_to_string(v_missing, ', ')
      using errcode = 'PLU01',
        hint = 'Aplicar primero las migraciones base hasta 20260715000400.';
  end if;
end;
$migration$;

alter table public.payment_integration_events
  add column if not exists next_retry_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists max_attempts int not null default 8 check (max_attempts between 1 and 50);

update public.payment_integration_events
set status = 'failed',
    error = coalesce(error, 'Procesamiento interrumpido antes de habilitar recuperacion.'),
    next_retry_at = now(),
    updated_at = now()
where status = 'processing' and locked_at is null;

create index if not exists payment_integration_events_retry_idx
  on public.payment_integration_events (next_retry_at, received_at)
  where status in ('received', 'failed');

create or replace function public.claim_payment_integration_event(
  p_event_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.payment_integration_events;
begin
  select * into v_event from public.payment_integration_events
  where id = p_event_id for update;
  if not found or v_event.status in ('processed', 'skipped') then return null; end if;
  if v_event.status = 'processing'
    and v_event.locked_at >= now() - interval '10 minutes' then return null; end if;
  if not p_force and (
    v_event.attempts_count >= v_event.max_attempts or v_event.next_retry_at > now()
  ) then return null; end if;

  update public.payment_integration_events
  set status = 'processing',
      attempts_count = attempts_count + 1,
      locked_at = now(),
      last_attempt_at = now(),
      error = null,
      updated_at = now()
  where id = p_event_id
  returning * into v_event;
  return to_jsonb(v_event);
end;
$$;

revoke all on function public.claim_payment_integration_event(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_payment_integration_event(uuid, boolean)
  to service_role;

create or replace function public.claim_due_payment_integration_events(p_limit int default 20)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_integration_events
  set status = 'failed',
      error = coalesce(error, 'Procesamiento interrumpido.'),
      locked_at = null,
      next_retry_at = now(),
      updated_at = now()
  where status = 'processing'
    and (locked_at is null or locked_at < now() - interval '10 minutes');

  return query
  with candidates as (
    select id
    from public.payment_integration_events
    where status in ('received', 'failed')
      and attempts_count < max_attempts
      and next_retry_at <= now()
    order by next_retry_at, received_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), claimed as (
    update public.payment_integration_events e
    set status = 'processing',
        attempts_count = attempts_count + 1,
        locked_at = now(),
        last_attempt_at = now(),
        error = null,
        updated_at = now()
    from candidates c
    where e.id = c.id
    returning e.*
  )
  select to_jsonb(claimed.*) from claimed;
end;
$$;

revoke all on function public.claim_due_payment_integration_events(int)
  from public, anon, authenticated;
grant execute on function public.claim_due_payment_integration_events(int)
  to service_role;

create or replace function public.complete_payment_integration_event(
  p_event_id uuid,
  p_succeeded boolean,
  p_result jsonb default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.payment_integration_events;
begin
  update public.payment_integration_events
  set status = case when p_succeeded then 'processed' else 'failed' end,
      result = case when p_succeeded then p_result else result end,
      error = case when p_succeeded then null else left(coalesce(p_error, 'Error desconocido'), 2000) end,
      processed_at = case when p_succeeded then now() else processed_at end,
      next_retry_at = case when p_succeeded then next_retry_at else
        now() + make_interval(mins => least(1440, (2 * power(2, greatest(attempts_count - 1, 0)))::int)) end,
      locked_at = null,
      updated_at = now()
  where id = p_event_id
  returning * into v_event;
  return to_jsonb(v_event);
end;
$$;

revoke all on function public.complete_payment_integration_event(uuid, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.complete_payment_integration_event(uuid, boolean, jsonb, text)
  to service_role;

alter table public.embedded_payment_attempts
  add column if not exists operation_kind text not null default 'payment'
    check (operation_kind in ('payment', 'subscription')),
  add column if not exists reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending', 'processing', 'reconciled', 'failed')),
  add column if not exists reconciliation_attempts int not null default 0,
  add column if not exists next_reconcile_at timestamptz not null default now(),
  add column if not exists reconciliation_locked_at timestamptz,
  add column if not exists reconciled_at timestamptz;

update public.embedded_payment_attempts a
set operation_kind = 'subscription'
from public.billing_subscriptions s
where a.external_payment_id = s.provider_subscription_id;

create or replace function public.claim_embedded_subscription_attempt(
  p_order_kind text,
  p_order_id uuid,
  p_token_fingerprint text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_attempt_id uuid;
begin
  v_result := public.claim_embedded_payment_attempt(
    p_order_kind, p_order_id, p_token_fingerprint, p_idempotency_key
  );
  v_attempt_id := (v_result -> 'attempt' ->> 'id')::uuid;
  update public.embedded_payment_attempts
  set operation_kind = 'subscription', updated_at = now()
  where id = v_attempt_id;
  return jsonb_set(v_result, '{attempt,operation_kind}', '"subscription"'::jsonb);
end;
$$;

revoke all on function public.claim_embedded_subscription_attempt(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_embedded_subscription_attempt(text, uuid, text, text)
  to service_role;

create index if not exists embedded_payment_attempts_reconcile_idx
  on public.embedded_payment_attempts (next_reconcile_at, created_at)
  where operation_kind = 'payment' and external_payment_id is not null
    and reconciliation_status in ('pending', 'failed');

create or replace function public.claim_embedded_payment_reconciliations(p_limit int default 20)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.embedded_payment_attempts
  set reconciliation_status = 'failed',
      reconciliation_locked_at = null,
      next_reconcile_at = now(),
      updated_at = now()
  where reconciliation_status = 'processing'
    and (reconciliation_locked_at is null
      or reconciliation_locked_at < now() - interval '10 minutes');

  return query
  with candidates as (
    select id
    from public.embedded_payment_attempts
    where operation_kind = 'payment'
      and external_payment_id is not null
      and reconciliation_status in ('pending', 'failed')
      and reconciliation_attempts < 12
      and next_reconcile_at <= now()
    order by next_reconcile_at, created_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), claimed as (
    update public.embedded_payment_attempts a
    set reconciliation_status = 'processing',
        reconciliation_attempts = reconciliation_attempts + 1,
        reconciliation_locked_at = now(),
        updated_at = now()
    from candidates c
    where a.id = c.id
    returning a.*
  )
  select to_jsonb(claimed.*) from claimed;
end;
$$;

revoke all on function public.claim_embedded_payment_reconciliations(int)
  from public, anon, authenticated;
grant execute on function public.claim_embedded_payment_reconciliations(int)
  to service_role;

create or replace function public.claim_embedded_payment_reconciliation(
  p_attempt_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.embedded_payment_attempts;
begin
  select * into v_attempt from public.embedded_payment_attempts
  where id = p_attempt_id for update;
  if not found or v_attempt.operation_kind <> 'payment'
    or v_attempt.external_payment_id is null
    or v_attempt.reconciliation_status = 'reconciled' then return null; end if;
  if v_attempt.reconciliation_status = 'processing'
    and v_attempt.reconciliation_locked_at >= now() - interval '10 minutes' then return null; end if;
  if not p_force and (
    v_attempt.reconciliation_attempts >= 12 or v_attempt.next_reconcile_at > now()
  ) then return null; end if;

  update public.embedded_payment_attempts
  set reconciliation_status = 'processing',
      reconciliation_attempts = reconciliation_attempts + 1,
      reconciliation_locked_at = now(),
      updated_at = now()
  where id = p_attempt_id
  returning * into v_attempt;
  return to_jsonb(v_attempt);
end;
$$;

revoke all on function public.claim_embedded_payment_reconciliation(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_embedded_payment_reconciliation(uuid, boolean)
  to service_role;

create or replace function public.complete_embedded_payment_reconciliation(
  p_attempt_id uuid,
  p_succeeded boolean,
  p_terminal boolean default false,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.embedded_payment_attempts
  set reconciliation_status = case
        when p_succeeded and p_terminal then 'reconciled'
        when p_succeeded then 'pending'
        else 'failed'
      end,
      reconciled_at = case when p_succeeded and p_terminal then now() else reconciled_at end,
      error = case when p_succeeded then error else left(coalesce(p_error, 'Error de conciliacion'), 2000) end,
      next_reconcile_at = case
        when p_succeeded and p_terminal then next_reconcile_at
        else now() + make_interval(mins => least(1440, (5 * power(2, greatest(reconciliation_attempts - 1, 0)))::int))
      end,
      reconciliation_locked_at = null,
      updated_at = now()
  where id = p_attempt_id;
end;
$$;

revoke all on function public.complete_embedded_payment_reconciliation(uuid, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_embedded_payment_reconciliation(uuid, boolean, boolean, text)
  to service_role;

create or replace function public.get_payment_operations_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'events', jsonb_build_object(
      'processing', count(*) filter (where status = 'processing'),
      'failed', count(*) filter (where status = 'failed'),
      'processed', count(*) filter (where status = 'processed'),
      'exhausted', count(*) filter (where status = 'failed' and attempts_count >= max_attempts)
    ),
    'attempts', (
      select jsonb_build_object(
        'processing', count(*) filter (where status = 'processing'),
        'submitted', count(*) filter (where status = 'submitted'),
        'failed', count(*) filter (where status = 'failed'),
        'reconciliationPending', count(*) filter (
          where operation_kind = 'payment' and external_payment_id is not null
            and reconciliation_status in ('pending', 'failed')
        )
      ) from public.embedded_payment_attempts
    ),
    'subscriptions', (
      select jsonb_build_object(
        'authorized', count(*) filter (where status = 'authorized'),
        'pending', count(*) filter (where status = 'pending'),
        'pastDue', count(*) filter (where status = 'past_due'),
        'paused', count(*) filter (where status = 'paused')
      ) from public.billing_subscriptions
    ),
    'updatedAt', now()
  )
  from public.payment_integration_events;
$$;

revoke all on function public.get_payment_operations_summary()
  from public, anon, authenticated;
grant execute on function public.get_payment_operations_summary()
  to service_role;

-- ---------------------------------------------------------------------
-- Maquina de estados final
-- ---------------------------------------------------------------------
-- Una orden puede tener mas de un intento. Su estado se calcula desde el
-- ledger completo para que un rechazo tardio nunca degrade otro intento que
-- ya fue aprobado. El orden de precedencia es:
-- aprobado > pendiente > reembolsado > rechazado > cancelado.

alter table public.memberships
  drop constraint if exists memberships_status_check;
alter table public.memberships
  add constraint memberships_status_check
  check (status in ('pendiente_pago', 'activa', 'vencida', 'cancelada', 'reembolsada'));

-- PostgreSQL permite multiples NULL en un indice unique. No necesitamos un
-- indice parcial y el indice completo permite que ON CONFLICT infiera la clave
-- usada por los cobros recurrentes.
drop index if exists public.athlete_payment_orders_idempotency_key_uidx;
create unique index athlete_payment_orders_idempotency_key_uidx
  on public.athlete_payment_orders (idempotency_key);

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

  select * into v_existing_payment
  from public.athlete_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> p_order_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;

  insert into public.athlete_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at
  ) values (
    p_order_id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end
  )
  on conflict (external_payment_id) do update set
    status = excluded.status,
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
          membership_id, order_id, payment_id, starts_at, ends_at, status
        ) values (
          v_membership.id, p_order_id, v_entitlement_payment_id,
          coalesce(v_membership.start_date, current_date),
          coalesce(v_membership.expiration_date, (current_date + interval '1 year')::date),
          'active'
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
    status = excluded.status,
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

-- Sincroniza el estado administrativo de una preapproval. Un evento
-- `authorized` no limpia una mora: solamente un cobro recurrente aprobado
-- puede volver la suscripcion a authorized.
create or replace function public.apply_mercado_pago_subscription(
  p_provider_subscription_id text,
  p_external_reference text,
  p_status text,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.billing_subscriptions;
  v_next_status text;
begin
  if p_status not in ('pending', 'authorized', 'paused', 'cancelled') then
    raise exception 'Estado de suscripcion no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_subscription
  from public.billing_subscriptions
  where (p_external_reference is not null and external_reference = p_external_reference)
     or provider_subscription_id = p_provider_subscription_id
  order by case when provider_subscription_id = p_provider_subscription_id then 0 else 1 end
  limit 1
  for update;
  if not found then raise exception 'Suscripcion no encontrada.' using errcode = 'PLU02'; end if;

  v_next_status := case
    when v_subscription.status = 'past_due' and p_status in ('pending', 'authorized')
      then 'past_due'
    else p_status
  end;

  update public.billing_subscriptions
  set provider_subscription_id = coalesce(provider_subscription_id, p_provider_subscription_id),
      status = v_next_status,
      cancelled_at = case when v_next_status = 'cancelled'
        then coalesce(cancelled_at, now()) else cancelled_at end,
      raw_payload = p_payload,
      updated_at = now()
  where id = v_subscription.id
  returning * into v_subscription;

  return to_jsonb(v_subscription);
end;
$$;

revoke all on function public.apply_mercado_pago_subscription(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_mercado_pago_subscription(text, text, text, jsonb)
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
  v_plan public.membership_plans;
  v_membership public.memberships;
  v_order public.athlete_payment_orders;
  v_payment public.athlete_payments;
  v_existing_payment public.athlete_payments;
  v_start date;
  v_end date;
  v_active_until date;
  v_reference text;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago recurrente no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_subscription
  from public.billing_subscriptions
  where provider_subscription_id = p_provider_subscription_id
  for update;
  if not found then raise exception 'Suscripcion no encontrada.' using errcode = 'PLU02'; end if;

  select * into v_plan from public.membership_plans where id = v_subscription.plan_id;
  select * into v_membership from public.memberships where id = v_subscription.membership_id for update;
  if p_amount <> v_plan.price or upper(p_currency) <> upper(v_plan.currency) then
    raise exception 'Monto o moneda no coinciden con el plan.' using errcode = 'PLU11';
  end if;

  v_reference := 'SUB-' || v_subscription.id || '-' || p_external_payment_id;
  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, payer_email
  ) values (
    v_subscription.athlete_id, 'membership', v_plan.price, v_plan.currency,
    'mercado_pago', p_status, v_reference, v_reference, p_payer_email
  )
  on conflict (idempotency_key) do update set updated_at = now()
  returning * into v_order;

  select * into v_existing_payment
  from public.athlete_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> v_order.id then
    raise exception 'El pago recurrente ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;

  insert into public.athlete_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at
  ) values (
    v_order.id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end
  )
  on conflict (external_payment_id) do update set
    status = excluded.status,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.athlete_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  update public.athlete_payment_orders
  set status = p_status,
      approved_at = case when p_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when p_status = 'rechazado' then now() else rejected_at end,
      provider_payload = p_payload,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  if p_status = 'aprobado' then
    select coalesce(max(ends_at), greatest(current_date, coalesce(v_membership.expiration_date, current_date)))
    into v_start
    from public.membership_cycles
    where membership_id = v_membership.id and status in ('active', 'pending');

    if v_plan.billing_frequency = 'monthly' then
      v_end := (v_start + make_interval(months => v_plan.interval_count))::date;
    else
      v_end := (v_start + make_interval(years => v_plan.interval_count))::date;
    end if;

    insert into public.membership_cycles (
      membership_id, order_id, payment_id, starts_at, ends_at, status
    ) values (v_membership.id, v_order.id, v_payment.id, v_start, v_end, 'active')
    on conflict (membership_id, order_id) do update set
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
  elsif p_status in ('rechazado', 'cancelado', 'reembolsado') then
    if p_status = 'reembolsado' then
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

-- Diagnostico post-migracion y monitoreo. No modifica datos y permite detectar
-- drift entre el ledger y las ordenes, locks vencidos o colas agotadas.
create or replace function public.get_payment_system_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with athlete_rollup as (
    select o.id, o.status,
      case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
    from public.athlete_payment_orders o
    join public.athlete_payments p on p.order_id = o.id
    where o.method = 'mercado_pago'
    group by o.id, o.status
  ), ticket_rollup as (
    select o.id, o.status,
      case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
    from public.ticket_orders o
    join public.ticket_payments p on p.order_id = o.id
    where o.provider = 'mercado_pago'
    group by o.id, o.status
  ), checks as (
    select
      (select count(*) from athlete_rollup where status <> expected_status) as athlete_drift,
      (select count(*) from ticket_rollup where status <> expected_status) as ticket_drift,
      (select count(*) from public.payment_integration_events
        where status = 'processing' and (locked_at is null or locked_at < now() - interval '10 minutes')) as stale_event_locks,
      (select count(*) from public.embedded_payment_attempts
        where reconciliation_status = 'processing'
          and (reconciliation_locked_at is null or reconciliation_locked_at < now() - interval '10 minutes')) as stale_reconciliation_locks,
      (select count(*) from public.payment_integration_events
        where status = 'failed' and attempts_count >= max_attempts) as exhausted_events
  )
  select jsonb_build_object(
    'schemaVersion', '20260715000500',
    'healthy', athlete_drift = 0 and ticket_drift = 0
      and stale_event_locks = 0 and stale_reconciliation_locks = 0
      and exhausted_events = 0,
    'athleteOrderDrift', athlete_drift,
    'ticketOrderDrift', ticket_drift,
    'staleEventLocks', stale_event_locks,
    'staleReconciliationLocks', stale_reconciliation_locks,
    'exhaustedEvents', exhausted_events,
    'checkedAt', now()
  ) from checks;
$$;

revoke all on function public.get_payment_system_health()
  from public, anon, authenticated;
grant execute on function public.get_payment_system_health()
  to service_role;

-- Verificacion estructural dentro de la misma transaccion. Si cualquiera de
-- estas funciones no quedo creada, toda la migracion se revierte.
do $verification$
begin
  if to_regprocedure('public.apply_mercado_pago_payment(uuid,text,text,integer,text,text,text,jsonb)') is null
    or to_regprocedure('public.apply_ticket_mercado_pago_payment(uuid,text,text,integer,text,text,text,jsonb)') is null
    or to_regprocedure('public.apply_mercado_pago_subscription(text,text,text,jsonb)') is null
    or to_regprocedure('public.apply_subscription_payment(text,text,text,integer,text,text,text,jsonb)') is null
    or to_regprocedure('public.claim_due_payment_integration_events(integer)') is null
    or to_regprocedure('public.claim_embedded_payment_reconciliations(integer)') is null
    or to_regprocedure('public.get_payment_system_health()') is null then
    raise exception 'La verificacion estructural de Mercado Pago no fue superada.'
      using errcode = 'PLU01';
  end if;
end;
$verification$;

commit;
