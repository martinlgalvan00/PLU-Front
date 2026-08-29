-- Alerta de financiamiento por vencer: la bandeja de Finanzas ya pinta el
-- vencimiento fila por fila (financingDueInfo), pero nadie mira la bandeja a
-- las 3 de la mañana. El club tiene derechos otorgados y plata sin cobrar, y
-- si el plazo vence sin acreditación `expire_financed_payment_orders` revoca
-- sola — esta alerta es la ventana para evitarlo.
--
-- Dos ramas: por vencer (<= 72 h) y vencido con derechos todavía activos. La
-- segunda en condiciones normales es un instante — el barrido de pg_cron
-- corre cada 3 minutos —, así que verla sostenida en el tiempo significa que
-- el reloj dejó de correr y es exactamente cuando Operación necesita saberlo.
create or replace function public.get_operational_alerts(
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(alert) order by alert.priority desc, alert.occurred_at), '[]'::jsonb)
  from (
    select 'transfer_overdue'::text as kind, 'high'::text as priority,
      o.id::text as entity_id, o.reference as subject,
      'Comprobante pendiente de validación por más de 48 horas'::text as detail,
      o.payment_proof_uploaded_at as occurred_at
    from public.athlete_payment_orders o
    where o.organization_id=p_organization_id and o.status='validacion_manual'
      and o.payment_proof_uploaded_at < now() - interval '48 hours'
    union all
    select 'membership_activation_drift', 'high', o.id::text, o.reference,
      'Pago aprobado sin afiliación activa asociada', o.updated_at
    from public.athlete_payment_orders o
    join public.membership_order_targets t on t.order_id=o.id
    join public.memberships m on m.id=t.membership_id
    where o.organization_id=p_organization_id and o.status='aprobado'
      and m.status <> 'activa'
    union all
    select 'financing_due_soon', 'high', o.id::text, o.reference,
      'Financiamiento habilitado vence en menos de 72 horas sin acreditación',
      o.financed_payment_due_at
    from public.athlete_payment_orders o
    where o.organization_id=p_organization_id
      and o.status in ('pendiente','validacion_manual')
      and o.financed_entitlements_at is not null
      and o.financed_payment_due_at is not null
      and o.financed_payment_due_at between now() and now() + interval '72 hours'
    union all
    select 'financing_overdue', 'high', o.id::text, o.reference,
      'Plazo de financiamiento vencido con derechos aún activos: el barrido no está corriendo',
      o.financed_payment_due_at
    from public.athlete_payment_orders o
    where o.organization_id=p_organization_id
      and o.status in ('pendiente','validacion_manual')
      and o.financed_entitlements_at is not null
      and o.financed_entitlements_revoked_at is null
      and o.financed_payment_due_at < now()
  ) alert;
$$;
revoke all on function public.get_operational_alerts(uuid) from public,anon,authenticated;
grant execute on function public.get_operational_alerts(uuid) to service_role;
