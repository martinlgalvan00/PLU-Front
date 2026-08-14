-- La oferta activa del combo debe apuntar a una versión vigente del plan.
-- Las órdenes existentes conservan su propio snapshot/plan; esto sólo corrige
-- las nuevas compras que resolvían PLU01 al haber quedado la oferta en v5.

with active_annual_plan as (
  select id
  from public.membership_plans
  where family_code = 'plu-annual'
    and active = true
    and retired_at is null
    and collection_mode = 'one_time'
  order by version desc
  limit 1
)
update public.event_combo_offers offer
set membership_plan_id = active_annual_plan.id,
    updated_at = now()
from public.events event, active_annual_plan
where offer.event_id = event.id
  and event.slug = 'pitbull-classic-2026'
  and offer.active = true
  and offer.membership_plan_id <> active_annual_plan.id;

do $$
begin
  if not exists (
    select 1
    from public.event_combo_offers offer
    join public.events event on event.id = offer.event_id
    join public.membership_plans plan on plan.id = offer.membership_plan_id
    where event.slug = 'pitbull-classic-2026'
      and offer.active = true
      and plan.active = true
      and plan.retired_at is null
      and plan.collection_mode = 'one_time'
  ) then
    raise exception 'La oferta activa de Pitbull no tiene un plan anual vigente.' using errcode = 'PLU01';
  end if;
end;
$$;
