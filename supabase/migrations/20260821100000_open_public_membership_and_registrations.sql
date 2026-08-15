-- Apertura pública de afiliaciones e inscripciones.
--
-- Las tandas privadas se conservan como capacidad operativa para futuras
-- aperturas, pero ninguna puede seguir pidiendo un código cuando el calendario
-- está abierto al público. También se reafirman los tres interruptores de alta
-- necesarios para iniciar un checkout de atleta.

with closed_gates as (
  update public.registration_access_gates
  set active = false,
      code_hash = null,
      ends_at = now(),
      updated_by = 'migration:20260821100000',
      updated_at = now()
  where active = true
  returning id, organization_id, scope, event_id, label
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
  'registration_access_gate.closed',
  'registration_access_gate',
  id::text,
  'system',
  'migration:20260821100000',
  jsonb_build_object(
    'scope', scope,
    'eventId', event_id,
    'label', label,
    'reason', 'public_registration_open'
  )
from closed_gates;

with opened_toggles as (
  insert into public.platform_feature_toggles as current (
    organization_id,
    checkout_enabled,
    membership_enabled,
    registration_enabled,
    updated_by,
    updated_at
  )
  values (
    '00000000-0000-4000-8000-000000000001'::uuid,
    true,
    true,
    true,
    'migration:20260821100000',
    now()
  )
  on conflict (organization_id) do update
  set checkout_enabled = true,
      membership_enabled = true,
      registration_enabled = true,
      updated_by = 'migration:20260821100000',
      updated_at = now()
  where current.checkout_enabled is distinct from true
     or current.membership_enabled is distinct from true
     or current.registration_enabled is distinct from true
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
  'platform_feature_toggle.opened_for_public_registration',
  'platform_feature_toggle',
  'checkout,membership,registration',
  'system',
  'migration:20260821100000',
  jsonb_build_object(
    'checkoutEnabled', true,
    'membershipEnabled', true,
    'registrationEnabled', true,
    'reason', 'public_registration_open'
  )
from opened_toggles;
