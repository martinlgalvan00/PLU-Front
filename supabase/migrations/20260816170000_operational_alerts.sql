-- Alertas agregadas y de solo lectura para que Operación no deba detectar
-- desvíos revisando filas manualmente. No modifica pagos ni derechos.
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
  ) alert;
$$;
revoke all on function public.get_operational_alerts(uuid) from public,anon,authenticated;
grant execute on function public.get_operational_alerts(uuid) to service_role;
