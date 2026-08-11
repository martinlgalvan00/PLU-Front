-- Auditoría operativa unificada para afiliación, pagos y notificaciones.
--
-- `domain_audit_logs` registra los efectos de negocio dentro de las RPC, pero
-- los estados técnicos (Brevo, webhooks y conciliaciones) vivían en tablas que
-- el panel de Auditoría no consultaba. Además, esas tablas conservaban solo el
-- estado actual: un cambio `sent -> delivered` pisaba la evidencia anterior.
--
-- Esta migración agrega una bitácora append-only alimentada por triggers, una
-- vista única para el panel y un resumen que detecta huecos del flujo de
-- afiliación sin depender de inspecciones manuales.

create table if not exists public.operational_event_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,
  source text not null check (source in ('email', 'payment')),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor_type text not null,
  actor_id text,
  status text,
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'danger')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_event_logs_created_idx
  on public.operational_event_logs (organization_id, created_at desc);
create index if not exists operational_event_logs_source_status_idx
  on public.operational_event_logs (organization_id, source, status, created_at desc);
create index if not exists operational_event_logs_entity_idx
  on public.operational_event_logs (organization_id, entity_type, entity_id, created_at desc);

-- Índices de las dos comprobaciones de integridad del resumen. Evitan recorrer
-- todo el histórico de emails y órdenes cada vez que se abre Auditoría.
create index if not exists transactional_email_logs_delivery_recovery_idx
  on public.transactional_email_logs (
    organization_id, template_key, entity_type, entity_id, recipient_email, updated_at desc
  ) where status = 'delivered';
create index if not exists athlete_payment_orders_membership_gap_idx
  on public.athlete_payment_orders (organization_id, updated_at desc)
  where status = 'aprobado' and concept in ('membership', 'combo');

alter table public.operational_event_logs enable row level security;
revoke all on public.operational_event_logs from public, anon, authenticated;
grant select, insert on public.operational_event_logs to service_role;

create or replace function plu_private.capture_operational_event()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_actor_type text;
  v_actor_id text;
  v_status text;
  v_source text;
  v_severity text;
  v_metadata jsonb;
  v_created_at timestamptz := now();
begin
  if tg_table_name = 'transactional_email_logs' then
    if tg_op = 'UPDATE' then
      if old.status is not distinct from new.status
         and old.attempts_count is not distinct from new.attempts_count
         and old.error is not distinct from new.error
         and old.error_code is not distinct from new.error_code
         and old.provider_message_id is not distinct from new.provider_message_id
         and old.next_retry_at is not distinct from new.next_retry_at then
        return new;
      end if;
    end if;

    v_source := 'email';
    v_status := new.status;
    v_action := 'email.' || new.status;
    v_entity_type := coalesce(new.entity_type, 'transactional_email');
    v_entity_id := coalesce(new.entity_id, new.id::text);
    v_actor_type := case
      when new.status in ('delivered', 'rejected', 'bounced') then 'brevo'
      else 'system'
    end;
    v_actor_id := new.recipient_email;
    v_severity := case
      when new.status in ('failed', 'rejected', 'bounced', 'skipped') then 'danger'
      when new.status in ('retrying', 'suppressed') then 'warning'
      when new.status in ('sent', 'delivered') then 'success'
      else 'info'
    end;
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'emailLogId', new.id,
      'templateKey', new.template_key,
      'recipientEmail', new.recipient_email,
      'attempt', new.attempts_count,
      'error', new.error,
      'errorCode', new.error_code,
      'nextRetryAt', new.next_retry_at,
      'providerMessageId', new.provider_message_id,
      'sentAt', new.sent_at,
      'deliveredAt', new.delivered_at,
      'bouncedAt', new.bounced_at
    ));
  elsif tg_table_name = 'payment_integration_events' then
    if tg_op = 'UPDATE' then
      if old.status is not distinct from new.status
         and old.attempts_count is not distinct from new.attempts_count
         and old.error is not distinct from new.error then
        return new;
      end if;
    end if;

    v_source := 'payment';
    v_status := new.status;
    v_action := 'payment_webhook.' || new.status;
    v_entity_type := 'payment_integration_event';
    v_entity_id := new.id::text;
    v_actor_type := 'mercado_pago';
    v_actor_id := new.notification_id;
    v_severity := case
      when new.status = 'failed' then 'danger'
      when new.status in ('received', 'processing') then 'warning'
      when new.status = 'processed' then 'success'
      else 'info'
    end;
    v_created_at := coalesce(new.updated_at, new.received_at, now());
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'provider', new.provider,
      'notificationId', new.notification_id,
      'resourceId', new.resource_id,
      'eventType', new.event_type,
      'providerAction', new.action,
      'requestId', new.request_id,
      'attempt', new.attempts_count,
      'error', new.error,
      'processedAt', new.processed_at
    ));
  elsif tg_table_name = 'embedded_payment_attempts' then
    if tg_op = 'UPDATE' then
      if old.status is not distinct from new.status
         and old.reconciliation_status is not distinct from new.reconciliation_status
         and old.reconciliation_attempts is not distinct from new.reconciliation_attempts
         and old.error is not distinct from new.error
         and old.external_payment_id is not distinct from new.external_payment_id then
        return new;
      end if;
    end if;

    v_source := 'payment';
    if tg_op = 'UPDATE' and old.status is not distinct from new.status
       and old.reconciliation_status is distinct from new.reconciliation_status then
      v_status := new.reconciliation_status;
      v_action := 'payment_reconciliation.' || new.reconciliation_status;
    else
      v_status := new.status;
      v_action := case when new.operation_kind = 'subscription'
        then 'subscription_attempt.' else 'payment_attempt.' end || new.status;
    end if;
    v_entity_type := case when new.order_kind = 'ticket' then 'ticket_order' else 'athlete_payment_order' end;
    v_entity_id := new.order_id::text;
    v_actor_type := 'system';
    v_actor_id := new.id::text;
    v_severity := case
      when new.status = 'failed' or new.reconciliation_status = 'failed' then 'danger'
      when new.status = 'submitted' or new.reconciliation_status = 'reconciled' then 'success'
      else 'info'
    end;
    v_created_at := coalesce(new.updated_at, new.created_at, now());
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'attemptId', new.id,
      'operationKind', new.operation_kind,
      'orderKind', new.order_kind,
      'externalPaymentId', new.external_payment_id,
      'reconciliationStatus', new.reconciliation_status,
      'attempt', new.reconciliation_attempts,
      'nextRetryAt', new.next_reconcile_at,
      'error', new.error
    ));
  else
    return new;
  end if;

  insert into public.operational_event_logs (
    organization_id, source, action, entity_type, entity_id,
    actor_type, actor_id, status, severity, metadata, created_at
  ) values (
    new.organization_id, v_source, v_action, v_entity_type, v_entity_id,
    v_actor_type, v_actor_id, v_status, v_severity, coalesce(v_metadata, '{}'::jsonb), v_created_at
  );

  return new;
end;
$$;

drop trigger if exists transactional_email_operational_audit on public.transactional_email_logs;
create trigger transactional_email_operational_audit
after insert or update on public.transactional_email_logs
for each row execute function plu_private.capture_operational_event();

drop trigger if exists payment_integration_operational_audit on public.payment_integration_events;
create trigger payment_integration_operational_audit
after insert or update on public.payment_integration_events
for each row execute function plu_private.capture_operational_event();

drop trigger if exists embedded_payment_operational_audit on public.embedded_payment_attempts;
create trigger embedded_payment_operational_audit
after insert or update on public.embedded_payment_attempts
for each row execute function plu_private.capture_operational_event();

-- Snapshot inicial. A partir de esta migración, los triggers guardan cada
-- transición; para filas históricas solo puede recuperarse su último estado.
insert into public.operational_event_logs (
  organization_id, source, action, entity_type, entity_id,
  actor_type, actor_id, status, severity, metadata, created_at
)
select
  l.organization_id,
  'email',
  'email.' || l.status,
  coalesce(l.entity_type, 'transactional_email'),
  coalesce(l.entity_id, l.id::text),
  case when l.status in ('delivered', 'rejected', 'bounced') then 'brevo' else 'system' end,
  l.recipient_email,
  l.status,
  case
    when l.status in ('failed', 'rejected', 'bounced', 'skipped') then 'danger'
    when l.status in ('retrying', 'suppressed') then 'warning'
    when l.status in ('sent', 'delivered') then 'success'
    else 'info'
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'emailLogId', l.id,
    'templateKey', l.template_key,
    'recipientEmail', l.recipient_email,
    'attempt', l.attempts_count,
    'error', l.error,
    'errorCode', l.error_code,
    'nextRetryAt', l.next_retry_at,
    'providerMessageId', l.provider_message_id,
    'sentAt', l.sent_at,
    'deliveredAt', l.delivered_at,
    'bouncedAt', l.bounced_at,
    'historicalSnapshot', true
  )),
  coalesce(l.updated_at, l.created_at)
from public.transactional_email_logs l;

create or replace view public.operational_audit_events
with (security_invoker = true)
as
select
  d.id,
  d.organization_id,
  'domain'::text as source,
  d.action,
  d.entity_type,
  d.entity_id,
  d.actor_type,
  d.actor_id,
  null::text as status,
  case
    when d.action like '%.revoked%' or d.action like '%.cancelled%' then 'danger'
    when d.action like '%.expired%' then 'warning'
    when d.action like '%.activated%' or d.action like '%.approved%'
      or d.action like '%.confirmed' or d.action like '%.checked_in' then 'success'
    else 'info'
  end::text as severity,
  d.metadata,
  d.created_at
from public.domain_audit_logs d
union all
select
  o.id,
  o.organization_id,
  o.source,
  o.action,
  o.entity_type,
  o.entity_id,
  o.actor_type,
  o.actor_id,
  o.status,
  o.severity,
  o.metadata,
  o.created_at
from public.operational_event_logs o;

revoke all on public.operational_audit_events from public, anon, authenticated;
grant select on public.operational_audit_events to service_role;

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

  -- Solo el período reciente: las afiliaciones importadas antes del dispatcher
  -- no deben aparecer como incidentes históricos imposibles de corregir.
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
        and l.template_key = 'affiliation_approved'
        and l.entity_type = 'membership'
        and l.entity_id = m.id::text
        and l.status = 'delivered'
        and l.delivered_at >= m.updated_at
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
