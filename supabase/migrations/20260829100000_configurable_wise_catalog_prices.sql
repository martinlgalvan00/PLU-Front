-- Precios de Wise configurables por el panel de administracion.
-- Wise usa USD; los otros canales conservan los importes ARS existentes.

alter table public.membership_plans
  add column if not exists wise_price int null
    check (wise_price is null or (wise_price > 0 and wise_price <= 100000));

alter table public.events
  add column if not exists wise_price int null
    check (wise_price is null or (wise_price > 0 and wise_price <= 100000));

-- Valores iniciales solicitados para el catalogo vigente. Las ordenes
-- historicas no se modifican: solo se actualizan planes activos y eventos
-- publicables que aun aceptan inscripciones.
update public.membership_plans
set price = 92500, manual_price = 85000, wise_price = null, updated_at = now()
where active = true
  and family_code = 'plu-annual'
  and effective_from <= now()
  and (retired_at is null or retired_at > now());

update public.events
set price = 100000, manual_price = 92500, wise_price = 70, updated_at = now()
where published = true
  and status in ('proximamente', 'inscripcion_abierta', 'cupos_limitados');

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
  if not found then raise exception 'Plan no encontrado.' using errcode = 'PLU02'; end if;
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
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;
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
