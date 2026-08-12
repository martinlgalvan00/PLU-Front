-- Corrección idempotente del arancel competitivo de Pitbull Classic 2026.
--
-- La migración 20260812130000 también publica este valor, pero podía omitirlo
-- si el evento todavía no existía en ese ambiente. Esta pasada separada deja
-- explícito que events.price está expresado en pesos ARS (no centavos) y es la
-- fuente que consumen la orden, el checkout y Mercado Pago.

do $$
declare
  v_event_id uuid;
begin
  select id into v_event_id
  from public.events
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    and slug = 'pitbull-classic-2026'
  for update;

  if v_event_id is null then
    raise notice 'Evento pitbull-classic-2026 no encontrado; el seed vigente lo crea en ARS 75000.';
    return;
  end if;

  update public.events
  set price = 75000,
      currency = 'ARS',
      rules = coalesce(rules, '{}'::jsonb) || jsonb_build_object(
        'membershipPrice', 75000,
        'comboPrice', 120000
      ),
      updated_at = now()
  where id = v_event_id;

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'pricing.pitbull_registration_corrected',
    'event',
    v_event_id::text,
    'system',
    'migration:20260812170000',
    jsonb_build_object('registrationPrice', 75000, 'currency', 'ARS')
  );
end;
$$;
