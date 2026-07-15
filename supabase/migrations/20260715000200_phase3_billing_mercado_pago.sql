-- Fase 3: ledger productivo de cobros, ciclos de membresia, suscripciones y
-- eventos idempotentes de Mercado Pago. Esta migracion es aditiva sobre la
-- fase 2 y deja la aprobacion automatica exclusivamente en manos del backend
-- con service_role.

alter table public.athlete_payment_orders
  add column if not exists idempotency_key text,
  add column if not exists provider_preference_id text,
  add column if not exists provider_init_point text,
  add column if not exists payer_email text,
  add column if not exists provider_payload jsonb,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz;

create unique index if not exists athlete_payment_orders_idempotency_key_uidx
  on public.athlete_payment_orders (idempotency_key)
  where idempotency_key is not null;
create unique index if not exists athlete_payment_orders_preference_uidx
  on public.athlete_payment_orders (provider_preference_id)
  where provider_preference_id is not null;

alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_status_check;
alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_status_check
  check (status in ('pendiente', 'validacion_manual', 'aprobado', 'rechazado', 'cancelado', 'reembolsado'));

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price int not null check (price > 0),
  currency text not null default 'ARS',
  billing_frequency text not null check (billing_frequency in ('monthly', 'annual')),
  collection_mode text not null check (collection_mode in ('one_time', 'recurring')),
  interval_count int not null default 1 check (interval_count > 0),
  grace_days int not null default 0 check (grace_days >= 0),
  provider_plan_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.membership_plans (
  code, name, description, price, billing_frequency, collection_mode
)
values (
  'plu-annual', 'Afiliacion PLU anual', 'Afiliacion anual Powerlifting Union Argentina',
  38000, 'annual', 'one_time'
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

alter table public.memberships
  add column if not exists plan_id uuid references public.membership_plans (id) on delete restrict;

update public.memberships
set plan_id = (select id from public.membership_plans where code = 'plu-annual')
where plan_id is null;

create table if not exists public.athlete_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.athlete_payment_orders (id) on delete restrict,
  external_payment_id text not null unique,
  status text not null check (status in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado')),
  amount int not null check (amount >= 0),
  currency text not null default 'ARS',
  payer_email text,
  status_detail text,
  raw_payload jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athlete_payments_order_idx on public.athlete_payments (order_id);
create index if not exists athlete_payments_status_idx on public.athlete_payments (status, created_at desc);

create table if not exists public.membership_cycles (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete restrict,
  order_id uuid references public.athlete_payment_orders (id) on delete set null,
  payment_id uuid references public.athlete_payments (id) on delete set null,
  starts_at date not null,
  ends_at date not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'cancelled', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_cycles_valid_range check (ends_at > starts_at),
  unique (membership_id, order_id)
);

create index if not exists membership_cycles_membership_idx
  on public.membership_cycles (membership_id, starts_at desc);
create index if not exists membership_cycles_expiration_idx
  on public.membership_cycles (status, ends_at);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete restrict,
  membership_id uuid not null references public.memberships (id) on delete restrict,
  plan_id uuid not null references public.membership_plans (id) on delete restrict,
  initial_order_id uuid not null unique references public.athlete_payment_orders (id) on delete restrict,
  provider_subscription_id text unique,
  external_reference text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paused', 'past_due', 'cancelled', 'ended')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_athlete_idx
  on public.billing_subscriptions (athlete_id, status);
create index if not exists billing_subscriptions_due_idx
  on public.billing_subscriptions (status, next_billing_at);

create table if not exists public.payment_integration_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago',
  notification_id text not null,
  resource_id text,
  event_type text not null,
  action text,
  request_id text,
  signature_valid boolean not null default false,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed', 'skipped')),
  payload jsonb,
  result jsonb,
  error text,
  attempts_count int not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, notification_id)
);

create index if not exists payment_integration_events_resource_idx
  on public.payment_integration_events (provider, resource_id);
create index if not exists payment_integration_events_pending_idx
  on public.payment_integration_events (status, received_at);

alter table public.membership_plans enable row level security;
alter table public.athlete_payments enable row level security;
alter table public.membership_cycles enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.payment_integration_events enable row level security;

create policy "membership_plans_public_read"
  on public.membership_plans for select
  to anon, authenticated
  using (active = true);

create policy "athlete_payments_staff_read"
  on public.athlete_payments for select
  to authenticated
  using (public.can_view_admin_data());
create policy "membership_cycles_staff_read"
  on public.membership_cycles for select
  to authenticated
  using (public.can_view_admin_data());
create policy "billing_subscriptions_staff_read"
  on public.billing_subscriptions for select
  to authenticated
  using (public.can_view_admin_data());
create policy "payment_integration_events_staff_read"
  on public.payment_integration_events for select
  to authenticated
  using (public.can_view_admin_data());

grant select on public.membership_plans to anon, authenticated;
grant select on public.athlete_payments, public.membership_cycles,
  public.billing_subscriptions, public.payment_integration_events to authenticated;

-- Aplica el estado canonico consultado en Mercado Pago. La funcion valida
-- orden, monto y moneda y activa todos los destinos dentro de la misma
-- transaccion PostgreSQL.
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

  update public.athlete_payment_orders
  set status = p_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when p_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when p_status = 'rechazado' then now() else rejected_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if p_status = 'aprobado' and v_order.concept in ('membership', 'combo') then
    update public.memberships
    set status = 'activa', updated_at = now()
    where payment_order_id = p_order_id
    returning * into v_membership;

    if v_membership.id is not null then
      insert into public.membership_cycles (
        membership_id, order_id, payment_id, starts_at, ends_at, status
      ) values (
        v_membership.id, p_order_id, v_payment.id,
        coalesce(v_membership.start_date, current_date),
        coalesce(v_membership.expiration_date, current_date + interval '1 year'),
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

  if p_status = 'aprobado' and v_order.concept in ('registration', 'combo') then
    update public.event_registrations
    set status = 'confirmada', updated_at = now()
    where payment_order_id = p_order_id
    returning * into v_registration;
  end if;

  if p_status = 'reembolsado' then
    update public.membership_cycles
    set status = 'refunded', updated_at = now()
    where payment_id = v_payment.id;
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
  v_start date;
  v_end date;
  v_reference text;
begin
  select * into v_subscription
  from public.billing_subscriptions
  where provider_subscription_id = p_provider_subscription_id
  for update;
  if not found then
    raise exception 'Suscripcion no encontrada.' using errcode = 'PLU02';
  end if;

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
  elsif p_status = 'rechazado' then
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

-- La aprobacion manual deja de ser una simulacion publica. Solo staff con
-- permiso operativo puede aprobar una orden manual y nunca una orden MP.
create or replace function public.approve_athlete_payment_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin_maximal', 'admin_plu_arg', 'operador_plu_arg')
  ) then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se aprueban por webhook.' using errcode = 'PLU10';
  end if;

  update public.athlete_payment_orders
  set status = 'aprobado', approved_at = coalesce(approved_at, now()), updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.concept in ('membership', 'combo') then
    update public.memberships set status = 'activa', updated_at = now()
    where payment_order_id = p_order_id returning * into v_membership;
    update public.athletes set status = 'afiliado_activo', updated_at = now()
    where id = v_order.athlete_id;
  end if;
  if v_order.concept in ('registration', 'combo') then
    update public.event_registrations set status = 'confirmada', updated_at = now()
    where payment_order_id = p_order_id returning * into v_registration;
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

revoke all on function public.approve_athlete_payment_order(uuid) from public, anon;
grant execute on function public.approve_athlete_payment_order(uuid) to authenticated;

create or replace function public.expire_memberships(p_now date default current_date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.membership_cycles
  set status = 'expired', updated_at = now()
  where status = 'active' and ends_at <= p_now;

  update public.memberships m
  set status = 'vencida', updated_at = now()
  where status = 'activa'
    and expiration_date <= p_now
    and not exists (
      select 1 from public.membership_cycles c
      where c.membership_id = m.id and c.status = 'active'
        and c.starts_at <= p_now and c.ends_at > p_now
    );
  get diagnostics v_count = row_count;

  update public.athletes a
  set status = 'afiliado_vencido', updated_at = now()
  where status = 'afiliado_activo'
    and not exists (
      select 1 from public.memberships m
      where m.athlete_id = a.id and m.status = 'activa'
        and m.expiration_date > p_now
    );

  return v_count;
end;
$$;

revoke all on function public.expire_memberships(date) from public, anon, authenticated;
grant execute on function public.expire_memberships(date) to service_role;
