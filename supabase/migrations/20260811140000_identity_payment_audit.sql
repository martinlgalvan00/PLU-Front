-- Identidad y estados finales de pago en la auditoria operativa.
--
-- La bitacora append-only ya capturaba el inbox de webhooks, las
-- conciliaciones y los emails, pero quedaban dos huecos al reconstruir un
-- incidente: quien abrio/cerro una sesion de atleta y cual fue el estado
-- canonico de cada fila de pago (incluidos rechazo y contracargo).

alter table public.operational_event_logs
  drop constraint if exists operational_event_logs_source_check;
alter table public.operational_event_logs
  add constraint operational_event_logs_source_check
  check (source in ('email', 'payment', 'identity'));

create index if not exists operational_event_logs_actor_idx
  on public.operational_event_logs (
    organization_id, actor_type, actor_id, created_at desc
  );

-- ---------------------------------------------------------------------------
-- Ledger canonico de Mercado Pago
-- ---------------------------------------------------------------------------

create or replace function plu_private.capture_payment_ledger_event()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order_kind text;
  v_severity text;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.status_detail is not distinct from new.status_detail then
    return new;
  end if;

  v_order_kind := case
    when tg_table_name = 'ticket_payments' then 'ticket_order'
    else 'athlete_payment_order'
  end;
  v_severity := case
    when new.status = 'aprobado' then 'success'
    when new.status in ('rechazado', 'reembolsado') then 'danger'
    when new.status = 'cancelado' then 'warning'
    else 'info'
  end;

  insert into public.operational_event_logs (
    organization_id, source, action, entity_type, entity_id,
    actor_type, actor_id, status, severity, metadata, created_at
  ) values (
    new.organization_id,
    'payment',
    'payment.' || new.status,
    v_order_kind,
    new.order_id::text,
    'mercado_pago',
    new.external_payment_id,
    new.status,
    v_severity,
    jsonb_strip_nulls(jsonb_build_object(
      'paymentRecordId', new.id,
      'externalPaymentId', new.external_payment_id,
      'provider', 'mercado_pago',
      'ledger', tg_table_name,
      'amount', new.amount,
      'currency', new.currency,
      'payerEmail', new.payer_email,
      'statusDetail', new.status_detail,
      'confirmedAt', new.confirmed_at
    )),
    coalesce(new.updated_at, new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists athlete_payment_ledger_operational_audit
  on public.athlete_payments;
create trigger athlete_payment_ledger_operational_audit
after insert or update on public.athlete_payments
for each row execute function plu_private.capture_payment_ledger_event();

drop trigger if exists ticket_payment_ledger_operational_audit
  on public.ticket_payments;
create trigger ticket_payment_ledger_operational_audit
after insert or update on public.ticket_payments
for each row execute function plu_private.capture_payment_ledger_event();

-- Snapshot del estado actual. No inventa transiciones historicas: las filas
-- se identifican como snapshot y, desde este punto, el trigger guarda cada
-- cambio real.
insert into public.operational_event_logs (
  organization_id, source, action, entity_type, entity_id,
  actor_type, actor_id, status, severity, metadata, created_at
)
select
  p.organization_id,
  'payment',
  'payment.' || p.status,
  'athlete_payment_order',
  p.order_id::text,
  'mercado_pago',
  p.external_payment_id,
  p.status,
  case
    when p.status = 'aprobado' then 'success'
    when p.status in ('rechazado', 'reembolsado') then 'danger'
    when p.status = 'cancelado' then 'warning'
    else 'info'
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'paymentRecordId', p.id,
    'externalPaymentId', p.external_payment_id,
    'provider', 'mercado_pago',
    'ledger', 'athlete_payments',
    'amount', p.amount,
    'currency', p.currency,
    'payerEmail', p.payer_email,
    'statusDetail', p.status_detail,
    'confirmedAt', p.confirmed_at,
    'historicalSnapshot', true
  )),
  coalesce(p.updated_at, p.created_at)
from public.athlete_payments p
where not exists (
  select 1 from public.operational_event_logs o
  where o.source = 'payment'
    and o.action = 'payment.' || p.status
    and o.actor_id = p.external_payment_id
    and o.metadata ->> 'paymentRecordId' = p.id::text
);

insert into public.operational_event_logs (
  organization_id, source, action, entity_type, entity_id,
  actor_type, actor_id, status, severity, metadata, created_at
)
select
  p.organization_id,
  'payment',
  'payment.' || p.status,
  'ticket_order',
  p.order_id::text,
  'mercado_pago',
  p.external_payment_id,
  p.status,
  case
    when p.status = 'aprobado' then 'success'
    when p.status in ('rechazado', 'reembolsado') then 'danger'
    when p.status = 'cancelado' then 'warning'
    else 'info'
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'paymentRecordId', p.id,
    'externalPaymentId', p.external_payment_id,
    'provider', 'mercado_pago',
    'ledger', 'ticket_payments',
    'amount', p.amount,
    'currency', p.currency,
    'payerEmail', p.payer_email,
    'statusDetail', p.status_detail,
    'confirmedAt', p.confirmed_at,
    'historicalSnapshot', true
  )),
  coalesce(p.updated_at, p.created_at)
from public.ticket_payments p
where not exists (
  select 1 from public.operational_event_logs o
  where o.source = 'payment'
    and o.action = 'payment.' || p.status
    and o.actor_id = p.external_payment_id
    and o.metadata ->> 'paymentRecordId' = p.id::text
);

-- ---------------------------------------------------------------------------
-- Alta y sesiones de atletas
-- ---------------------------------------------------------------------------

create or replace function plu_private.capture_athlete_identity_event()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_organization_id uuid;
  v_action text;
  v_status text;
  v_metadata jsonb;
  v_created_at timestamptz;
begin
  if tg_table_name = 'athletes' then
    v_organization_id := new.organization_id;
    v_action := 'account.created';
    v_status := 'succeeded';
    v_created_at := new.created_at;
    v_metadata := jsonb_build_object('accountKind', 'athlete', 'channel', 'self_service');
  elsif tg_table_name = 'athlete_sessions' and tg_op = 'INSERT' then
    select a.organization_id into v_organization_id
    from public.athletes a where a.id = new.athlete_id;
    v_action := 'auth.session_started';
    v_status := 'succeeded';
    v_created_at := new.created_at;
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'sessionId', new.id,
      'method', 'password',
      'ipHash', new.ip_hash,
      'userAgent', left(new.user_agent, 240),
      'expiresAt', new.expires_at
    ));
  elsif tg_table_name = 'athlete_sessions'
        and tg_op = 'UPDATE'
        and old.revoked_at is null
        and new.revoked_at is not null then
    select a.organization_id into v_organization_id
    from public.athletes a where a.id = new.athlete_id;
    v_action := 'auth.session_ended';
    v_status := 'succeeded';
    v_created_at := new.revoked_at;
    v_metadata := jsonb_build_object('sessionId', new.id, 'reason', 'logout');
  else
    return new;
  end if;

  insert into public.operational_event_logs (
    organization_id, source, action, entity_type, entity_id,
    actor_type, actor_id, status, severity, metadata, created_at
  ) values (
    v_organization_id,
    'identity',
    v_action,
    'athlete',
    case when tg_table_name = 'athletes' then new.id::text else new.athlete_id::text end,
    'athlete',
    case when tg_table_name = 'athletes' then new.id::text else new.athlete_id::text end,
    v_status,
    'success',
    coalesce(v_metadata, '{}'::jsonb),
    coalesce(v_created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists athlete_account_operational_audit on public.athletes;
create trigger athlete_account_operational_audit
after insert on public.athletes
for each row execute function plu_private.capture_athlete_identity_event();

drop trigger if exists athlete_session_operational_audit on public.athlete_sessions;
create trigger athlete_session_operational_audit
after insert or update on public.athlete_sessions
for each row execute function plu_private.capture_athlete_identity_event();

-- Alta historica de atleta. Las sesiones no se retrocargan: sin el contexto
-- del request no se puede afirmar si fueron login, alta automatica o reset.
insert into public.operational_event_logs (
  organization_id, source, action, entity_type, entity_id,
  actor_type, actor_id, status, severity, metadata, created_at
)
select
  a.organization_id,
  'identity',
  'account.created',
  'athlete',
  a.id::text,
  'athlete',
  a.id::text,
  'succeeded',
  'success',
  jsonb_build_object('accountKind', 'athlete', 'historicalSnapshot', true),
  a.created_at
from public.athletes a
where not exists (
  select 1 from public.operational_event_logs o
  where o.source = 'identity'
    and o.action = 'account.created'
    and o.entity_type = 'athlete'
    and o.entity_id = a.id::text
);
