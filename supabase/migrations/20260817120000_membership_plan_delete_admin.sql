-- Borrado administrable de planes de afiliacion.
-- Elimina planes sin uso operativo real y limpia ofertas combo que solo son
-- configuracion comercial del catalogo.

create or replace function public.staff_delete_membership_plan(
  p_plan_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans;
  v_before jsonb;
  v_reference_count int := 0;
  v_combo_count int := 0;
begin
  select * into v_plan
  from public.membership_plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'Plan no encontrado.' using errcode = 'PLU02';
  end if;

  v_before := to_jsonb(v_plan);

  select
    (select count(*) from public.memberships where plan_id = p_plan_id)
    + (select count(*) from public.athlete_payment_orders where plan_id = p_plan_id)
    + (select count(*) from public.billing_subscriptions where plan_id = p_plan_id)
    + (select count(*) from public.membership_order_targets where plan_id = p_plan_id)
  into v_reference_count;

  if v_reference_count > 0 then
    raise exception 'No se puede eliminar un plan con afiliaciones, ordenes o suscripciones asociadas.'
      using errcode = 'PLU03';
  end if;

  delete from public.event_combo_offers
  where membership_plan_id = p_plan_id;
  get diagnostics v_combo_count = row_count;

  delete from public.membership_plans
  where id = p_plan_id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'membership_plan.deleted',
    'membership_plan',
    p_plan_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'before', v_before,
      'referencesChecked', v_reference_count,
      'comboOffersDeleted', v_combo_count
    ),
    v_plan.organization_id
  );

  return jsonb_build_object(
    'deleted', true,
    'planId', p_plan_id,
    'comboOffersDeleted', v_combo_count
  );
end;
$$;

revoke all on function public.staff_delete_membership_plan(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_membership_plan(uuid, text)
  to service_role;
