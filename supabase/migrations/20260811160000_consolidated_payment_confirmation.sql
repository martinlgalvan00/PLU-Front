-- Un pago aprobado ahora produce un solo email (`payment_confirmation`) que
-- incluye comprobante y derechos habilitados. El resumen operativo debe
-- reconocer esa entrega como confirmación de la afiliación; de lo contrario
-- marcaría como incidente cada alta nueva aunque el correo haya llegado.

create or replace function public.get_operational_audit_summary(
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_events_24h int;
  v_delivered_24h int;
  v_email_retrying int;
  v_email_attention int;
  v_payment_attention int;
  v_active_without_confirmation int;
  v_approved_without_membership int;
begin
  select count(*) into v_events_24h
  from public.operational_audit_events e
  where e.organization_id = p_organization_id
    and e.created_at >= now() - interval '24 hours';

  select count(*) into v_delivered_24h
  from public.transactional_email_logs l
  where l.organization_id = p_organization_id
    and l.delivered_at >= now() - interval '24 hours';

  select count(*) filter (where l.status = 'retrying'),
         count(*) filter (
           where (
             l.status in ('failed', 'rejected', 'bounced', 'skipped')
             or (l.status = 'suppressed' and coalesce(l.error_code, '') <> 'SUPPRESSED_UNSUBSCRIBED')
             or (l.status = 'processing' and l.last_attempt_at < now() - interval '15 minutes')
           )
           and not exists (
             select 1 from public.transactional_email_logs recovered
             where recovered.organization_id = l.organization_id
               and recovered.template_key = l.template_key
               and recovered.status = 'delivered'
               and recovered.updated_at > l.updated_at
               and (
                 (l.entity_id is not null
                   and recovered.entity_type is not distinct from l.entity_type
                   and recovered.entity_id = l.entity_id)
                 or (l.entity_id is null and recovered.recipient_email = l.recipient_email)
               )
           )
         )
    into v_email_retrying, v_email_attention
  from public.transactional_email_logs l
  where l.organization_id = p_organization_id;

  select
    (select count(*) from public.payment_integration_events p
      where p.organization_id = p_organization_id and p.status = 'failed')
    +
    (select count(*) from public.embedded_payment_attempts a
      where a.organization_id = p_organization_id
        and (a.status = 'failed' or a.reconciliation_status = 'failed'))
  into v_payment_attention;

  select count(*) into v_active_without_confirmation
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.status = 'activa'
    and coalesce(m.start_date, current_date + 1) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
    and m.updated_at >= now() - interval '30 days'
    and not exists (
      select 1 from public.transactional_email_logs l
      where l.organization_id = m.organization_id
        and l.status = 'delivered'
        and l.delivered_at >= m.updated_at
        and (
          (
            l.template_key = 'affiliation_approved'
            and l.entity_type = 'membership'
            and l.entity_id = m.id::text
          )
          or
          (
            l.template_key = 'payment_confirmation'
            and (
              l.payload ->> 'membershipId' = m.id::text
              or (
                l.entity_type = 'athlete_payment_order'
                and l.entity_id = m.payment_order_id::text
              )
            )
          )
        )
    );

  select count(*) into v_approved_without_membership
  from public.athlete_payment_orders p
  left join public.membership_order_targets t on t.order_id = p.id
  left join public.memberships m on m.id = t.membership_id
  where p.organization_id = p_organization_id
    and p.concept in ('membership', 'combo')
    and p.status = 'aprobado'
    and p.updated_at >= now() - interval '30 days'
    and (
      m.id is null
      or m.status <> 'activa'
      or coalesce(m.start_date, current_date + 1) > current_date
      or coalesce(m.expiration_date, current_date - 1) < current_date
    );

  return jsonb_build_object(
    'generatedAt', now(),
    'status', case
      when v_email_attention + v_payment_attention
        + v_active_without_confirmation + v_approved_without_membership > 0
      then 'attention'
      else 'healthy'
    end,
    'eventsLast24h', v_events_24h,
    'emailsDeliveredLast24h', v_delivered_24h,
    'emailsRetrying', v_email_retrying,
    'emailAttention', v_email_attention,
    'paymentAttention', v_payment_attention,
    'activeMembershipsWithoutConfirmation', v_active_without_confirmation,
    'approvedOrdersWithoutActiveMembership', v_approved_without_membership
  );
end;
$$;

revoke all on function public.get_operational_audit_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_operational_audit_summary(uuid)
  to service_role;
