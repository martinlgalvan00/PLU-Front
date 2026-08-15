-- Mercado Pago es el único canal de alta inicial para afiliaciones e
-- inscripciones. Transferencia bancaria y efectivo en Pitbull conservan su
-- soporte operativo para una futura apertura desde Administración, pero nunca
-- deben quedar disponibles por omisión.

alter table public.platform_feature_toggles
  alter column membership_manual_enabled set default false,
  alter column registration_manual_enabled set default false;

with closed_manual_channels as (
  update public.platform_feature_toggles
  set membership_manual_enabled = false,
      registration_manual_enabled = false,
      updated_by = 'migration:20260823100000',
      updated_at = now()
  where membership_manual_enabled is distinct from false
     or registration_manual_enabled is distinct from false
  returning organization_id
)
insert into public.domain_audit_logs (
  organization_id,
  action,
  entity_type,
  entity_id,
  actor_type,
  actor_id,
  metadata
)
select
  organization_id,
  'platform_feature_toggle.manual_channels_closed',
  'platform_feature_toggle',
  'membership_manual,registration_manual',
  'system',
  'migration:20260823100000',
  jsonb_build_object(
    'membershipManualEnabled', false,
    'registrationManualEnabled', false,
    'reason', 'mercado_pago_only_launch'
  )
from closed_manual_channels;

-- Una instalación nueva puede todavía no tener fila de toggles. En ese caso el
-- getter es la fuente de verdad: altas abiertas por Mercado Pago, canales
-- manuales cerrados hasta que un administrador los habilite explícitamente.
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
    v_row.ticket_enabled := true;
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
