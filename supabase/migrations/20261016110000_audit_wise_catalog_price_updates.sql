-- Restaura la auditoria de los cambios administrativos de precios Wise.
-- Las funciones ya recibian p_actor, pero no lo persistian; ademas de perder
-- trazabilidad eso hace fallar `supabase db lint --fail-on warning`.

create or replace function public.staff_set_membership_plan_wise_price(
  p_plan_id uuid,
  p_wise_price int,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans;
begin
  if p_wise_price is not null and (p_wise_price <= 0 or p_wise_price > 100000) then
    raise exception 'El precio Wise es invalido.' using errcode = 'PLU01';
  end if;

  update public.membership_plans
  set wise_price = p_wise_price, updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  if not found then
    raise exception 'Plan no encontrado.' using errcode = 'PLU02';
  end if;

  insert into public.domain_audit_logs (
    action,
    entity_type,
    entity_id,
    actor_type,
    actor_id,
    metadata
  ) values (
    'membership_plan.wise_price_updated',
    'membership_plan',
    v_plan.id::text,
    'staff',
    nullif(trim(p_actor), ''),
    jsonb_build_object('wisePrice', p_wise_price)
  );

  return to_jsonb(v_plan);
end;
$$;

create or replace function public.staff_set_event_registration_wise_price(
  p_event_slug text,
  p_wise_price int,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if p_wise_price is not null and (p_wise_price <= 0 or p_wise_price > 100000) then
    raise exception 'El precio Wise es invalido.' using errcode = 'PLU01';
  end if;

  update public.events
  set wise_price = p_wise_price, updated_at = now()
  where slug = p_event_slug
  returning * into v_event;

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  insert into public.domain_audit_logs (
    action,
    entity_type,
    entity_id,
    actor_type,
    actor_id,
    metadata
  ) values (
    'event.wise_price_updated',
    'event',
    v_event.id::text,
    'staff',
    nullif(trim(p_actor), ''),
    jsonb_build_object('wisePrice', p_wise_price)
  );

  return to_jsonb(v_event);
end;
$$;

revoke all on function public.staff_set_membership_plan_wise_price(uuid, int, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_membership_plan_wise_price(uuid, int, text)
  to service_role;

revoke all on function public.staff_set_event_registration_wise_price(text, int, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_registration_wise_price(text, int, text)
  to service_role;
