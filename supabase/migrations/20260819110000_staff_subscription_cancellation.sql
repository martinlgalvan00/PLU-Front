-- Cancelación admin de suscripciones recurrentes — PLU ARG
--
-- `billing_subscriptions.cancelled_at` existe desde 20260715000200 pero nada
-- en el repo lo escribía: se podía dar de alta una suscripción recurrente
-- pero nunca cancelarla desde el producto. Cancelación inmediata y solo desde
-- el panel (decisión de producto explícita: sin autoservicio del atleta, sin
-- "cancelar al final del período" por ahora).
--
-- El cobro en Mercado Pago se cancela primero desde el backend (adapter,
-- `PreApproval.update`) y solo si el proveedor confirma se corre esta RPC
-- para persistir el estado local — mismo criterio que el resto de
-- payments.js, que nunca confía en el estado local sin reconsultar al
-- proveedor.

create or replace function public.staff_cancel_membership_subscription(
  p_subscription_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.billing_subscriptions;
  v_before jsonb;
begin
  select * into v_subscription
  from public.billing_subscriptions
  where id = p_subscription_id
  for update;
  if not found then
    raise exception 'Suscripción no encontrada.' using errcode = 'PLU02';
  end if;
  if v_subscription.status in ('cancelled', 'ended') then
    return to_jsonb(v_subscription);
  end if;
  v_before := to_jsonb(v_subscription);

  update public.billing_subscriptions
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_subscription_id
  returning * into v_subscription;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'billing_subscription.cancelled', 'billing_subscription', v_subscription.id::text,
    'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_subscription)),
    v_subscription.organization_id
  );

  return to_jsonb(v_subscription);
end;
$$;

revoke all on function public.staff_cancel_membership_subscription(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_cancel_membership_subscription(uuid, text)
  to service_role;

create or replace function public.staff_list_billing_subscriptions(
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'athleteId', s.athlete_id,
      'athleteName', a.full_name,
      'athleteEmail', a.email,
      'providerSubscriptionId', s.provider_subscription_id,
      'planId', s.plan_id,
      'planName', p.name,
      'planFamilyCode', p.family_code,
      'status', s.status,
      'amount', s.amount,
      'currency', s.currency,
      'currentPeriodStart', s.current_period_start,
      'currentPeriodEnd', s.current_period_end,
      'nextBillingAt', s.next_billing_at,
      'cancelAtPeriodEnd', s.cancel_at_period_end,
      'cancelledAt', s.cancelled_at,
      'createdAt', s.created_at
    ) order by s.created_at desc
  ), '[]'::jsonb)
  from public.billing_subscriptions s
  join public.athletes a on a.id = s.athlete_id
  join public.membership_plans p on p.id = s.plan_id
  where s.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    and (
      nullif(p_filters ->> 'status', '') is null
      or s.status = p_filters ->> 'status'
    )
    and (
      nullif(p_filters ->> 'athleteId', '') is null
      or s.athlete_id = (p_filters ->> 'athleteId')::uuid
    );
$$;

revoke all on function public.staff_list_billing_subscriptions(jsonb)
  from public, anon, authenticated;
grant execute on function public.staff_list_billing_subscriptions(jsonb) to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_cancel_membership_subscription(uuid,text)') is null
    or to_regprocedure('public.staff_list_billing_subscriptions(jsonb)') is null then
    raise exception 'La verificación de cancelación de suscripciones no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
