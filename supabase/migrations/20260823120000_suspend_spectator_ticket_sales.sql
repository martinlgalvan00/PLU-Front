-- Lanzamiento controlado: no se admiten nuevas entradas de espectadores hasta
-- que Administración abra de forma explícita el interruptor global y el evento.
-- Las órdenes y QR emitidos previamente no se modifican.

alter table public.platform_feature_toggles
  alter column ticket_enabled set default false;

with suspended_platform_sales as (
  update public.platform_feature_toggles
  set ticket_enabled = false,
      updated_by = 'migration:20260823120000',
      updated_at = now()
  where ticket_enabled is distinct from false
  returning organization_id
)
insert into public.domain_audit_logs (
  organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
)
select
  organization_id,
  'platform_feature_toggle.ticket_sales_suspended',
  'platform_feature_toggle',
  'ticket',
  'system',
  'migration:20260823120000',
  jsonb_build_object('ticketEnabled', false, 'reason', 'spectator_sales_coming_soon')
from suspended_platform_sales;

-- También se cierran los eventos existentes: así sus páginas no publican
-- precios ni CTAs mientras el corte global esté vigente.
update public.events
set rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{ticketsEnabled}', 'false'::jsonb, true),
    updated_at = now()
where coalesce((rules ->> 'ticketsEnabled')::boolean, true) is distinct from false;

-- En una instalación nueva sin fila de toggles, el getter sigue el mismo
-- criterio seguro: entradas cerradas hasta que un administrador las habilite.
create or replace function public.staff_get_platform_feature_toggles()
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_row public.platform_feature_toggles;
begin
  select * into v_row from public.platform_feature_toggles
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid;

  if not found then
    v_row.checkout_enabled := true;
    v_row.membership_enabled := true;
    v_row.registration_enabled := true;
    v_row.ticket_enabled := false;
    v_row.membership_manual_enabled := false;
    v_row.registration_manual_enabled := false;
    v_row.ticket_manual_enabled := true;
    v_row.membership_validation_enabled := true;
    v_row.registration_validation_enabled := true;
    v_row.ticket_validation_enabled := true;
  end if;

  return plu_private.platform_feature_toggles_payload(v_row);
end;
$$;

revoke all on function public.staff_get_platform_feature_toggles() from public, anon, authenticated;
grant execute on function public.staff_get_platform_feature_toggles() to service_role;
