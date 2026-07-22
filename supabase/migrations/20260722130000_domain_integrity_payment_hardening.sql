-- Integridad multi-organizacion y endurecimiento final del ledger de pagos.
--
-- Esta migracion mantiene las tablas publicas actuales para no romper la API,
-- pero completa las claves de tenant, conserva el contrato economico de cada
-- suscripcion y hace globalmente unico el payment ID de Mercado Pago.

-- ---------------------------------------------------------------------------
-- RPCs legacy y metadata de funciones
-- ---------------------------------------------------------------------------

-- Las rutas activas usan exclusivamente las variantes v2/v3 server-side.
-- Estas firmas antiguas quedaron invalidas luego de normalizar ticket_type_id
-- y solo agregan superficie expuesta y ruido al linter de Postgres.
drop function if exists public.create_ticket_order(text, jsonb, jsonb);
drop function if exists public.create_membership_order(uuid, text);
drop function if exists public.create_membership_order(uuid, text, text);
drop function if exists public.create_competition_registration(uuid, text, text, text, numeric, text);

-- jsonb_agg y parte de las expresiones usadas por este helper son STABLE.
alter function public.ticket_addons_total_and_snapshot(jsonb, jsonb) stable;

-- ---------------------------------------------------------------------------
-- Tenant key explicita en las entidades operativas
-- ---------------------------------------------------------------------------

alter table public.athletes
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.membership_plans
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.athlete_payment_orders
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict,
  add column if not exists plan_id uuid
    references public.membership_plans(id) on delete restrict;
alter table public.memberships
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.athlete_payments
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.membership_cycles
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.billing_subscriptions
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict,
  add column if not exists amount int,
  add column if not exists currency text,
  add column if not exists billing_frequency text,
  add column if not exists interval_count int;
alter table public.membership_order_targets
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict,
  add column if not exists plan_id uuid
    references public.membership_plans(id) on delete restrict;
alter table public.athlete_credentials
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.athlete_sessions
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.ticket_payments
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.embedded_payment_attempts
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.payment_integration_events
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.domain_audit_logs
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.transactional_email_logs
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid;
alter table public.membership_renewal_notifications
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.check_ins
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.event_capacity_rules
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.event_days
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;
alter table public.ticket_types
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict;

-- Las RPC historicas todavia omiten organization_id en algunos INSERT. El
-- default conserva compatibilidad para la organizacion principal; las nuevas
-- RPC de esta migracion escriben el tenant de manera explicita.
do $organization_defaults$
declare
  v_table text;
begin
  foreach v_table in array array[
    'athletes', 'membership_plans', 'athlete_payment_orders', 'memberships',
    'athlete_payments', 'membership_cycles', 'billing_subscriptions',
    'membership_order_targets', 'athlete_credentials', 'athlete_sessions',
    'ticket_payments', 'embedded_payment_attempts', 'payment_integration_events',
    'domain_audit_logs', 'transactional_email_logs',
    'membership_renewal_notifications', 'check_ins', 'event_capacity_rules',
    'event_days', 'ticket_types'
  ] loop
    execute format(
      'alter table public.%I alter column organization_id set default %L::uuid',
      v_table,
      '00000000-0000-4000-8000-000000000001'
    );
  end loop;
end
$organization_defaults$;

update public.athletes
set organization_id = '00000000-0000-4000-8000-000000000001'::uuid
where organization_id is null;
update public.membership_plans
set organization_id = '00000000-0000-4000-8000-000000000001'::uuid
where organization_id is null;
update public.athlete_payment_orders o
set organization_id = a.organization_id
from public.athletes a
where a.id = o.athlete_id and o.organization_id is null;
update public.memberships m
set organization_id = a.organization_id
from public.athletes a
where a.id = m.athlete_id and m.organization_id is null;
update public.athlete_payments p
set organization_id = o.organization_id
from public.athlete_payment_orders o
where o.id = p.order_id and p.organization_id is null;
update public.membership_cycles c
set organization_id = m.organization_id
from public.memberships m
where m.id = c.membership_id and c.organization_id is null;
update public.billing_subscriptions s
set organization_id = a.organization_id,
    amount = coalesce(s.amount, p.price),
    currency = coalesce(s.currency, p.currency),
    billing_frequency = coalesce(s.billing_frequency, p.billing_frequency),
    interval_count = coalesce(s.interval_count, p.interval_count)
from public.athletes a, public.membership_plans p
where a.id = s.athlete_id and p.id = s.plan_id;
update public.membership_order_targets t
set organization_id = m.organization_id,
    plan_id = coalesce(t.plan_id, m.plan_id)
from public.memberships m
where m.id = t.membership_id;
update public.athlete_payment_orders o
set plan_id = coalesce(o.plan_id, t.plan_id)
from public.membership_order_targets t
where t.order_id = o.id;
update public.athlete_payment_orders o
set plan_id = m.plan_id
from public.memberships m
where m.payment_order_id = o.id and o.plan_id is null;
update public.athlete_credentials c
set organization_id = a.organization_id
from public.athletes a
where a.id = c.athlete_id and c.organization_id is null;
update public.athlete_sessions s
set organization_id = a.organization_id
from public.athletes a
where a.id = s.athlete_id and s.organization_id is null;
update public.ticket_payments p
set organization_id = o.organization_id
from public.ticket_orders o
where o.id = p.order_id and p.organization_id is null;
update public.embedded_payment_attempts a
set organization_id = case
  when a.order_kind = 'ticket' then (
    select o.organization_id from public.ticket_orders o where o.id = a.order_id
  )
  else (
    select o.organization_id from public.athlete_payment_orders o where o.id = a.order_id
  )
end
where a.organization_id is null;
update public.membership_renewal_notifications n
set organization_id = m.organization_id
from public.memberships m
where m.id = n.membership_id and n.organization_id is null;
update public.check_ins c
set organization_id = e.organization_id
from public.events e
where e.id = c.event_id and c.organization_id is null;
update public.event_capacity_rules r
set organization_id = e.organization_id
from public.events e
where e.id = r.event_id and r.organization_id is null;
update public.event_days d
set organization_id = e.organization_id
from public.events e
where e.id = d.event_id and d.organization_id is null;
update public.ticket_types t
set organization_id = e.organization_id
from public.events e
where e.id = t.event_id and t.organization_id is null;

alter table public.athletes alter column organization_id set not null;
alter table public.membership_plans alter column organization_id set not null;
alter table public.athlete_payment_orders alter column organization_id set not null;
alter table public.memberships alter column organization_id set not null;
alter table public.athlete_payments alter column organization_id set not null;
alter table public.membership_cycles alter column organization_id set not null;
alter table public.billing_subscriptions
  alter column organization_id set not null,
  alter column amount set not null,
  alter column currency set not null,
  alter column billing_frequency set not null,
  alter column interval_count set not null;
alter table public.membership_order_targets alter column organization_id set not null;
alter table public.athlete_credentials alter column organization_id set not null;
alter table public.athlete_sessions alter column organization_id set not null;
alter table public.ticket_payments alter column organization_id set not null;
alter table public.embedded_payment_attempts alter column organization_id set not null;
alter table public.payment_integration_events alter column organization_id set not null;
alter table public.domain_audit_logs alter column organization_id set not null;
alter table public.transactional_email_logs alter column organization_id set not null;
alter table public.membership_renewal_notifications alter column organization_id set not null;
alter table public.check_ins alter column organization_id set not null;
alter table public.event_capacity_rules alter column organization_id set not null;
alter table public.event_days alter column organization_id set not null;
alter table public.ticket_types alter column organization_id set not null;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_amount_check,
  drop constraint if exists billing_subscriptions_currency_check,
  drop constraint if exists billing_subscriptions_frequency_check,
  drop constraint if exists billing_subscriptions_interval_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_amount_check check (amount > 0),
  add constraint billing_subscriptions_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint billing_subscriptions_frequency_check
    check (billing_frequency in ('monthly', 'annual')),
  add constraint billing_subscriptions_interval_check check (interval_count > 0);

-- ---------------------------------------------------------------------------
-- Indices para FKs, tenant filters y hot paths
-- ---------------------------------------------------------------------------

drop index if exists public.athletes_document_id_idx; -- redundante con UNIQUE
create index if not exists athletes_org_status_idx
  on public.athletes(organization_id, status, created_at desc);
create unique index if not exists athletes_org_email_ci_uidx
  on public.athletes(organization_id, lower(email));
create index if not exists membership_plans_org_active_idx
  on public.membership_plans(organization_id, active, price);
create index if not exists athlete_payment_orders_org_status_idx
  on public.athlete_payment_orders(organization_id, status, created_at desc);
create index if not exists athlete_payment_orders_plan_idx
  on public.athlete_payment_orders(plan_id) where plan_id is not null;
create index if not exists memberships_org_status_expiration_idx
  on public.memberships(organization_id, status, expiration_date);
create index if not exists memberships_plan_idx
  on public.memberships(plan_id);
create index if not exists athlete_payments_org_status_idx
  on public.athlete_payments(organization_id, status, created_at desc);
create index if not exists membership_cycles_order_idx
  on public.membership_cycles(order_id) where order_id is not null;
create index if not exists membership_cycles_payment_idx
  on public.membership_cycles(payment_id) where payment_id is not null;
create index if not exists billing_subscriptions_membership_idx
  on public.billing_subscriptions(membership_id, status);
create index if not exists billing_subscriptions_plan_idx
  on public.billing_subscriptions(plan_id, status);
create index if not exists membership_order_targets_plan_idx
  on public.membership_order_targets(plan_id, starts_at desc);
create index if not exists tickets_order_idx
  on public.tickets(order_id);
create index if not exists event_registrations_athlete_status_idx
  on public.event_registrations(athlete_id, status);
create index if not exists events_org_starts_idx
  on public.events(organization_id, starts_at desc);
create index if not exists check_ins_org_scanned_idx
  on public.check_ins(organization_id, scanned_at desc);
create index if not exists ticket_payments_org_status_idx
  on public.ticket_payments(organization_id, status, created_at desc);
create index if not exists event_days_org_date_idx
  on public.event_days(organization_id, date);
create index if not exists ticket_types_org_active_idx
  on public.ticket_types(organization_id, active, sort_order);
create index if not exists ticket_type_days_event_day_idx
  on public.ticket_type_days(event_day_id, ticket_type_id);
create index if not exists ticket_type_included_addons_addon_idx
  on public.ticket_type_included_addons(addon_id, ticket_type_id);

-- ---------------------------------------------------------------------------
-- Un payment ID de Mercado Pago solo puede pertenecer a una orden global
-- ---------------------------------------------------------------------------

create table if not exists public.payment_provider_registry (
  provider text not null,
  external_payment_id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_kind text not null check (order_kind in ('athlete', 'ticket')),
  order_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(provider, external_payment_id)
);

alter table public.payment_provider_registry enable row level security;
revoke all on public.payment_provider_registry from public, anon, authenticated;
grant select, insert on public.payment_provider_registry to service_role;

do $collision_check$
begin
  if exists (
    select 1
    from public.athlete_payments a
    join public.ticket_payments t using (external_payment_id)
  ) then
    raise exception 'Un payment ID de Mercado Pago ya existe en ambos ledgers.'
      using errcode = 'PLU13';
  end if;
end
$collision_check$;

insert into public.payment_provider_registry(
  provider, external_payment_id, organization_id, order_kind, order_id
)
select 'mercado_pago', external_payment_id, organization_id, 'athlete', order_id
from public.athlete_payments
union all
select 'mercado_pago', external_payment_id, organization_id, 'ticket', order_id
from public.ticket_payments
on conflict(provider, external_payment_id) do nothing;

create or replace function plu_private.register_mercado_pago_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registered public.payment_provider_registry;
  v_kind text := case when tg_table_name = 'athlete_payments' then 'athlete' else 'ticket' end;
begin
  insert into public.payment_provider_registry(
    provider, external_payment_id, organization_id, order_kind, order_id
  ) values (
    'mercado_pago', new.external_payment_id, new.organization_id, v_kind, new.order_id
  )
  on conflict(provider, external_payment_id) do nothing;

  select * into v_registered
  from public.payment_provider_registry
  where provider = 'mercado_pago'
    and external_payment_id = new.external_payment_id
  for update;

  if v_registered.order_kind <> v_kind
     or v_registered.order_id <> new.order_id
     or v_registered.organization_id <> new.organization_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;
  return new;
end;
$$;

revoke all on function plu_private.register_mercado_pago_payment()
  from public, anon, authenticated, service_role;

drop trigger if exists athlete_payments_register_provider_id on public.athlete_payments;
create trigger athlete_payments_register_provider_id
before insert or update of external_payment_id, order_id, organization_id
on public.athlete_payments
for each row execute function plu_private.register_mercado_pago_payment();

drop trigger if exists ticket_payments_register_provider_id on public.ticket_payments;
create trigger ticket_payments_register_provider_id
before insert or update of external_payment_id, order_id, organization_id
on public.ticket_payments
for each row execute function plu_private.register_mercado_pago_payment();

-- ---------------------------------------------------------------------------
-- Contrato de plan persistente y preparacion atomica de suscripciones
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_v3(
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
  v_existing public.athlete_payment_orders;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_result jsonb;
begin
  select * into v_athlete from public.athletes
  where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_plan from public.membership_plans
  where organization_id = v_athlete.organization_id
    and code = p_plan_code and active = true;
  if not found then
    raise exception 'Plan de afiliacion no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_existing from public.athlete_payment_orders
  where idempotency_key = p_idempotency_key for update;
  if found and (
    v_existing.athlete_id <> p_athlete_id
    or v_existing.organization_id <> v_athlete.organization_id
    or (v_existing.plan_id is not null and v_existing.plan_id <> v_plan.id)
  ) then
    raise exception 'La clave de idempotencia pertenece a otra orden o plan.'
      using errcode = 'PLU13';
  end if;

  v_result := public.create_membership_order_v2(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key
  );

  select * into v_order from public.athlete_payment_orders
  where id = (v_result -> 'order' ->> 'id')::uuid for update;
  if v_order.plan_id is not null and v_order.plan_id <> v_plan.id then
    raise exception 'La orden fue creada para otro plan.' using errcode = 'PLU13';
  end if;

  update public.athlete_payment_orders
  set organization_id = v_athlete.organization_id,
      plan_id = v_plan.id,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  update public.membership_order_targets
  set organization_id = v_athlete.organization_id,
      plan_id = v_plan.id
  where order_id = v_order.id;

  select m.* into v_membership
  from public.membership_order_targets t
  join public.memberships m on m.id = t.membership_id
  where t.order_id = v_order.id;

  update public.memberships
  set organization_id = v_athlete.organization_id,
      plan_id = v_plan.id,
      updated_at = now()
  where id = v_membership.id
  returning * into v_membership;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'plan', to_jsonb(v_plan),
    'duplicate', coalesce((v_result ->> 'duplicate')::boolean, false)
  );
end;
$$;

revoke all on function public.create_membership_order_v3(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_v3(uuid, text, text, text)
  to service_role;

create or replace function public.prepare_mercado_pago_subscription(
  p_order_id uuid,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_plan public.membership_plans;
  v_target public.membership_order_targets;
  v_membership public.memberships;
  v_subscription public.billing_subscriptions;
  v_reference text := 'SUB-' || p_order_id::text;
  v_created boolean := false;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.concept <> 'membership' or v_order.method <> 'mercado_pago'
     or v_order.status not in ('pendiente', 'creado') then
    raise exception 'La orden no admite una suscripcion.' using errcode = 'PLU10';
  end if;

  select * into v_plan from public.membership_plans
  where id = v_order.plan_id
    and organization_id = v_order.organization_id
    and code = p_plan_code and active = true
  for update;
  if not found or v_plan.collection_mode <> 'recurring' then
    raise exception 'La orden no pertenece al plan recurrente informado.' using errcode = 'PLU10';
  end if;
  if v_order.amount <> v_plan.price or upper(v_order.currency) <> upper(v_plan.currency) then
    raise exception 'Monto o moneda no coinciden con el plan.' using errcode = 'PLU11';
  end if;

  select * into v_target from public.membership_order_targets
  where order_id = v_order.id for update;
  if not found or v_target.plan_id <> v_plan.id
     or v_target.organization_id <> v_order.organization_id then
    raise exception 'El destino de la orden no coincide con el plan.' using errcode = 'PLU10';
  end if;

  select * into v_membership from public.memberships
  where id = v_target.membership_id for update;
  if not found or v_membership.athlete_id <> v_order.athlete_id
     or v_membership.organization_id <> v_order.organization_id then
    raise exception 'La afiliacion no pertenece a la orden.' using errcode = 'PLU10';
  end if;

  select * into v_subscription from public.billing_subscriptions
  where external_reference = v_reference for update;
  if not found then
    insert into public.billing_subscriptions(
      organization_id, athlete_id, membership_id, plan_id, initial_order_id,
      external_reference, status, amount, currency, billing_frequency, interval_count
    ) values (
      v_order.organization_id, v_order.athlete_id, v_membership.id, v_plan.id,
      v_order.id, v_reference, 'pending', v_order.amount, upper(v_order.currency),
      v_plan.billing_frequency, v_plan.interval_count
    ) returning * into v_subscription;
    v_created := true;
  elsif v_subscription.organization_id <> v_order.organization_id
     or v_subscription.initial_order_id <> v_order.id
     or v_subscription.plan_id <> v_plan.id then
    raise exception 'La referencia de suscripcion pertenece a otro contrato.' using errcode = 'PLU13';
  end if;

  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'membership', to_jsonb(v_membership),
    'subscription', to_jsonb(v_subscription),
    'created', v_created
  );
end;
$$;

revoke all on function public.prepare_mercado_pago_subscription(uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_mercado_pago_subscription(uuid, text)
  to service_role;

create or replace function plu_private.prevent_bound_plan_contract_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.provider_plan_id is not null and (
    new.price is distinct from old.price
    or new.currency is distinct from old.currency
    or new.billing_frequency is distinct from old.billing_frequency
    or new.collection_mode is distinct from old.collection_mode
    or new.interval_count is distinct from old.interval_count
  ) then
    raise exception 'Un plan asociado a Mercado Pago es inmutable; crea una nueva version.'
      using errcode = 'PLU10';
  end if;
  return new;
end;
$$;

drop trigger if exists membership_plans_bound_contract_immutable on public.membership_plans;
create trigger membership_plans_bound_contract_immutable
before update of price, currency, billing_frequency, collection_mode, interval_count
on public.membership_plans
for each row execute function plu_private.prevent_bound_plan_contract_change();

-- ---------------------------------------------------------------------------
-- Cobro recurrente: primer pago usa la orden/ciclo ya reservados
-- ---------------------------------------------------------------------------

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

-- Actualiza health sin depender de que el cliente conozca el ultimo archivo.
create or replace function public.get_payment_schema_version()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select '20260722130000'::text; $$;
revoke all on function public.get_payment_schema_version()
  from public, anon, authenticated;
grant execute on function public.get_payment_schema_version() to service_role;

do $verification$
begin
  if to_regprocedure('public.create_membership_order_v3(uuid,text,text,text)') is null
    or to_regprocedure('public.prepare_mercado_pago_subscription(uuid,text)') is null
    or to_regprocedure('public.apply_subscription_payment(text,text,text,integer,text,text,text,jsonb)') is null
    or to_regclass('public.payment_provider_registry') is null then
    raise exception 'La verificacion de integridad de dominio/pagos no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
