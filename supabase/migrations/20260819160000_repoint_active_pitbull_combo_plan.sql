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
  -- En un reset limpio el seed se ejecuta despues de las migraciones: todavia
  -- no existen Pitbull ni su oferta. Si una oferta inconsistente ya existe,
  -- se desactiva en vez de abortar todo el historial; el checkout nunca puede
  -- publicar un combo sin un plan one-time anual vigente.
  if exists (
    select 1
    from public.event_combo_offers offer
    join public.events event on event.id = offer.event_id
    where event.slug = 'pitbull-classic-2026'
      and offer.active = true
  ) and not exists (
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
    update public.event_combo_offers offer
    set active = false, updated_at = now()
    from public.events event
    where event.id = offer.event_id
      and event.slug = 'pitbull-classic-2026'
      and offer.active = true;
    raise notice 'La oferta activa de Pitbull no tiene un plan anual vigente; se desactivo hasta configurar uno.';
  end if;
end;
$$;
