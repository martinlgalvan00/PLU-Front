-- Infraestructura de emails transaccionales — reintentos, supresión y entrega
--
-- `transactional_email_logs` ya existía (fase 4) pero era un registro terminal:
-- un envío que fallaba quedaba en 'failed' para siempre. La columna
-- `attempts_count` estaba declarada y nunca se incrementaba, porque no había
-- quién reintentara. Tampoco había forma de enterarse de un rebote: sin webhook
-- de Brevo, una dirección muerta se seguía intentando en cada ciclo y erosionaba
-- la reputación del dominio remitente.
--
-- Esta migración agrega:
--   1. Estados de cola ('pending', 'retrying', 'bounced', 'suppressed') y las
--      columnas de programación del reintento.
--   2. `email_suppressions`: direcciones que no se deben volver a tocar.
--   3. `claim_retryable_emails`: reserva atómica del lote, con skip locked, para
--      que dos instancias no manden el mismo email dos veces.
--   4. `record_email_delivery_event`: entrada del webhook de Brevo.

-- ---------------------------------------------------------------- 1. columnas

alter table public.transactional_email_logs
  add column if not exists category text,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists error_code text,
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz;

alter table public.transactional_email_logs
  drop constraint if exists transactional_email_logs_status_check;

alter table public.transactional_email_logs
  add constraint transactional_email_logs_status_check
  check (status in (
    'pending',     -- en cola, todavía sin intento
    'processing',  -- reservado por una instancia
    'retrying',    -- falló con error transitorio, espera next_retry_at
    'sent',        -- aceptado por Brevo (201). NO garantiza entrega
    'delivered',   -- confirmado en el buzón por webhook
    'rejected',    -- Brevo lo aceptó y después lo rechazó (remitente sin validar)
    'failed',      -- error permanente o se agotaron los intentos
    'bounced',     -- rebotó (webhook)
    'skipped',     -- sin configuración de Brevo o sin contenido
    'suppressed'   -- destinatario en la lista de supresión
  ));

-- Índice del claim: solo las filas que el job puede llegar a tomar.
create index if not exists transactional_email_logs_retry_idx
  on public.transactional_email_logs (next_retry_at)
  where status in ('retrying', 'pending');

create index if not exists transactional_email_logs_recipient_idx
  on public.transactional_email_logs (recipient_email, created_at desc);

create index if not exists transactional_email_logs_message_idx
  on public.transactional_email_logs (provider_message_id)
  where provider_message_id is not null;

-- El panel admin lista por estado y fecha.
create index if not exists transactional_email_logs_status_idx
  on public.transactional_email_logs (status, created_at desc);

-- ------------------------------------------------------------- 2. supresiones

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null
    check (reason in ('hard_bounce', 'soft_bounce', 'spam', 'blocked', 'invalid', 'unsubscribed')),
  -- 'brevo_webhook' | 'manual' | 'system'
  source text not null default 'brevo_webhook',
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;

-- Idempotente: la tabla/policy pueden existir de un push parcial previo
-- (columnas e índices ya usaban IF NOT EXISTS; CREATE POLICY no).
drop policy if exists "email_suppressions_staff_read" on public.email_suppressions;
create policy "email_suppressions_staff_read" on public.email_suppressions
  for select to authenticated using (public.can_view_admin_data());

grant select on public.email_suppressions to authenticated;

-- --------------------------------------------------- 3. reserva de reintentos

create or replace function public.claim_retryable_emails(p_limit int default 50)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rescate de filas colgadas. Una fila entra en 'processing' cuando este
  -- claim la reserva, y también cuando `beginEmail` la inserta para un envío
  -- sincrónico. Si el proceso muere entre medio (deploy, timeout de la
  -- function, crash), nadie la vuelve a mirar: el filtro de abajo solo levanta
  -- 'retrying' y 'pending'. Pasados 15 minutos se asume abandonada.
  update public.transactional_email_logs
  set status = 'retrying',
      next_retry_at = now(),
      updated_at = now()
  where status = 'processing'
    and last_attempt_at is not null
    and last_attempt_at < now() - interval '15 minutes'
    and attempts_count < 6;

  return query
  with candidates as (
    select l.id
    from public.transactional_email_logs l
    where l.status in ('retrying', 'pending')
      and l.next_retry_at is not null
      and l.next_retry_at <= now()
      and l.attempts_count < 6
      -- Nunca reintentar contra una dirección ya suprimida.
      and not exists (
        select 1 from public.email_suppressions s
        where s.email = l.recipient_email
          and s.reason in ('hard_bounce', 'spam', 'blocked', 'invalid')
      )
    order by l.next_retry_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  ), claimed as (
    update public.transactional_email_logs l
    set status = 'processing',
        last_attempt_at = now(),
        updated_at = now()
    from candidates c
    where l.id = c.id
    returning l.*
  )
  select jsonb_build_object(
    'id', c.id,
    'templateKey', c.template_key,
    'recipientEmail', c.recipient_email,
    'attemptsCount', c.attempts_count,
    'payload', coalesce(c.payload, '{}'::jsonb),
    'entityType', c.entity_type,
    'entityId', c.entity_id,
    'category', c.category
  )
  from claimed c;
end;
$$;

revoke all on function public.claim_retryable_emails(int) from public, anon, authenticated;
grant execute on function public.claim_retryable_emails(int) to service_role;

-- --------------------------------------------- 4. eventos de entrega (webhook)

create or replace function public.record_email_delivery_event(
  p_message_id text,
  p_event text,
  p_email text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  -- 'delivered' cierra el ciclo feliz; el resto marcan la dirección.
  --
  -- 'error' es el caso traicionero: Brevo devuelve 201 al enviar y rechaza
  -- después. Sin esta rama el log queda en 'sent' para siempre y el problema
  -- (típicamente un remitente sin validar) pasa inadvertido.
  update public.transactional_email_logs
  set status = case
        when p_event = 'delivered' then 'delivered'
        when p_event = 'error' then 'rejected'
        when p_event in ('hard_bounce', 'soft_bounce', 'blocked') then 'bounced'
        when p_event = 'spam' then 'bounced'
        else status
      end,
      delivered_at = case when p_event = 'delivered' then now() else delivered_at end,
      bounced_at = case
        when p_event in ('hard_bounce', 'soft_bounce', 'blocked', 'spam') then now()
        else bounced_at
      end,
      error = case
        when p_event in ('hard_bounce', 'soft_bounce', 'blocked', 'spam', 'error')
          then left(coalesce(p_reason, p_event), 2000)
        else error
      end,
      updated_at = now()
  where provider_message_id = p_message_id;

  -- Un rebote blando aislado no suprime: puede ser un buzón lleno pasajero.
  -- Solo lo hace el rebote duro, el bloqueo y la denuncia de spam.
  if p_event in ('hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed')
     and v_normalized_email <> '' then
    insert into public.email_suppressions (email, reason, source, detail)
    values (
      v_normalized_email,
      case
        when p_event = 'invalid_email' then 'invalid'
        when p_event = 'unsubscribed' then 'unsubscribed'
        when p_event = 'hard_bounce' then 'hard_bounce'
        when p_event = 'blocked' then 'blocked'
        else 'spam'
      end,
      'brevo_webhook',
      left(p_reason, 500)
    )
    on conflict (email) do update
      set reason = excluded.reason,
          detail = excluded.detail,
          updated_at = now();
  end if;
end;
$$;

revoke all on function public.record_email_delivery_event(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_email_delivery_event(text, text, text, text)
  to service_role;
