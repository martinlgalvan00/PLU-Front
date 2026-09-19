-- Diagnóstico: descartar un drift no crítico sin que contamine la vista.
--
-- `get_payment_system_health()` compara bien el estado local de una orden
-- contra sus pagos, pero hasta acá no había forma de sacar de esa vista un
-- hallazgo ya revisado (una orden de prueba, un drift ya resuelto a mano):
-- volvía a aparecer en cada refresh, mezclado con lo que sí es urgente hoy.
--
-- Esto agrega un descarte por orden, no por categoría: si se pudiera
-- descartar "drift de entradas" entero, la próxima orden real que se
-- desalinee quedaría escondida junto con la que ya se revisó -- exactamente
-- lo contrario de lo que pide un diagnóstico. El descarte queda atado a
-- `(order_kind, order_id)`, exige un motivo (mismo piso de 3 caracteres que
-- `staff_set_registration_status` y el resto de los overrides manuales) y
-- nunca borra nada: se guarda en `payment_health_dismissals`, un hallazgo
-- restaurado vuelve a contar, y si la orden se desalinea de nuevo después de
-- restaurarlo, `get_payment_system_health` la vuelve a mostrar.
--
-- Alcance: sólo drift de órdenes (`athleteOrderDrift`/`ticketOrderDrift`),
-- que es lo que reportó el usuario como ruido. Los locks vencidos y los
-- webhooks agotados ya tienen su propia salida operativa ("Recuperar
-- operaciones") -- no son el problema que esto resuelve.

create table public.payment_health_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid,
  order_kind text not null check (order_kind in ('athlete', 'ticket')),
  order_id uuid not null,
  -- Copiada al momento del descarte: la auditoría tiene que poder mostrar
  -- "TORD-ABC123 desalineada" y no un uuid pelado, sin tener que volver a
  -- buscar la orden (que además puede haberse borrado con el evento).
  reference text,
  local_status text not null,
  expected_status text not null,
  reason text not null check (length(btrim(reason)) >= 3),
  dismissed_by text not null,
  dismissed_at timestamptz not null default now(),
  restored_by text,
  restored_at timestamptz,
  created_at timestamptz not null default now()
);

-- Un solo descarte activo por orden: `on conflict` en la RPC apunta acá.
create unique index payment_health_dismissals_active_uidx
  on public.payment_health_dismissals (order_kind, order_id)
  where restored_at is null;

create index payment_health_dismissals_recent_idx
  on public.payment_health_dismissals (dismissed_at desc);

alter table public.payment_health_dismissals enable row level security;
create policy "payment_health_dismissals_staff_read" on public.payment_health_dismissals
  for select to authenticated using (public.can_view_admin_data());
grant select on public.payment_health_dismissals to authenticated;

create or replace function public.staff_dismiss_payment_drift(
  p_order_kind text,
  p_order_id uuid,
  p_reason text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local text;
  v_expected text;
  v_reference text;
  v_row public.payment_health_dismissals;
begin
  if p_order_kind not in ('athlete', 'ticket') then
    raise exception 'Tipo de orden invalido.' using errcode = 'PLU10';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'El descarte de un hallazgo exige un motivo.' using errcode = 'PLU01';
  end if;

  if p_order_kind = 'athlete' then
    select o.status, o.reference, coalesce(r.expected_status, o.status)
      into v_local, v_reference, v_expected
    from public.athlete_payment_orders o
    left join lateral (
      select case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
      from public.athlete_payments p
      where p.order_id = o.id
    ) r on true
    where o.id = p_order_id and o.method = 'mercado_pago';
  else
    select o.status, o.reference, coalesce(r.expected_status, o.status)
      into v_local, v_reference, v_expected
    from public.ticket_orders o
    left join lateral (
      select case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
      from public.ticket_payments p
      where p.order_id = o.id
    ) r on true
    where o.id = p_order_id and o.provider = 'mercado_pago';
  end if;

  if v_local is null then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_local = v_expected then
    raise exception 'La orden ya no esta desalineada: no hay nada que descartar.'
      using errcode = 'PLU10';
  end if;

  insert into public.payment_health_dismissals (
    order_kind, order_id, reference, local_status, expected_status, reason, dismissed_by
  ) values (
    p_order_kind, p_order_id, v_reference, v_local, v_expected, btrim(p_reason), p_actor
  )
  on conflict (order_kind, order_id) where restored_at is null
  do update set
    reason = excluded.reason,
    dismissed_by = excluded.dismissed_by,
    dismissed_at = now(),
    reference = excluded.reference,
    local_status = excluded.local_status,
    expected_status = excluded.expected_status
  returning * into v_row;

  perform plu_private.record_domain_audit(
    'payment_health.drift_dismissed',
    case when p_order_kind = 'athlete' then 'athlete_payment_order' else 'ticket_order' end,
    p_order_id::text, 'staff', p_actor,
    jsonb_build_object(
      'reason', v_row.reason, 'localStatus', v_local, 'expectedStatus', v_expected
    ),
    '00000000-0000-4000-8000-000000000001'::uuid
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.staff_dismiss_payment_drift(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_dismiss_payment_drift(text, uuid, text, text)
  to service_role;

create or replace function public.staff_restore_payment_drift_dismissal(
  p_dismissal_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_health_dismissals;
begin
  update public.payment_health_dismissals
  set restored_at = now(), restored_by = p_actor
  where id = p_dismissal_id and restored_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'El descarte no existe o ya fue restaurado.' using errcode = 'PLU02';
  end if;

  perform plu_private.record_domain_audit(
    'payment_health.drift_dismissal_restored',
    case when v_row.order_kind = 'athlete' then 'athlete_payment_order' else 'ticket_order' end,
    v_row.order_id::text, 'staff', p_actor,
    jsonb_build_object('reason', v_row.reason),
    '00000000-0000-4000-8000-000000000001'::uuid
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.staff_restore_payment_drift_dismissal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_restore_payment_drift_dismissal(uuid, text)
  to service_role;

create or replace function public.list_payment_drift_dismissals(p_limit int default 50)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(d.*) order by d.dismissed_at desc), '[]'::jsonb)
  from (
    select * from public.payment_health_dismissals
    order by dismissed_at desc
    limit greatest(1, least(p_limit, 200))
  ) d;
$$;

revoke all on function public.list_payment_drift_dismissals(int)
  from public, anon, authenticated;
grant execute on function public.list_payment_drift_dismissals(int) to service_role;

-- get_payment_system_health(): resta de los contadores (y de `healthy`) el
-- drift con un descarte activo, y devuelve el detalle de lo que sigue
-- abierto (`openAthleteDrift`/`openTicketDrift`) para que el panel pueda
-- listar una fila por orden en vez de un conteo ciego.
create or replace function public.get_payment_system_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with athlete_rollup as (
    select o.id, o.status, o.reference,
      case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
    from public.athlete_payment_orders o
    join public.athlete_payments p on p.order_id = o.id
    where o.method = 'mercado_pago'
    group by o.id, o.status, o.reference
  ), ticket_rollup as (
    select o.id, o.status, o.reference,
      case
        when bool_or(p.status = 'aprobado') then 'aprobado'
        when bool_or(p.status = 'pendiente') then 'pendiente'
        when bool_or(p.status = 'reembolsado') then 'reembolsado'
        when bool_or(p.status = 'rechazado') then 'rechazado'
        else 'cancelado'
      end as expected_status
    from public.ticket_orders o
    join public.ticket_payments p on p.order_id = o.id
    where o.provider = 'mercado_pago'
    group by o.id, o.status, o.reference
  ), athlete_open as (
    select ar.* from athlete_rollup ar
    where ar.status <> ar.expected_status
      and not exists (
        select 1 from public.payment_health_dismissals d
        where d.order_kind = 'athlete' and d.order_id = ar.id and d.restored_at is null
      )
  ), ticket_open as (
    select tr.* from ticket_rollup tr
    where tr.status <> tr.expected_status
      and not exists (
        select 1 from public.payment_health_dismissals d
        where d.order_kind = 'ticket' and d.order_id = tr.id and d.restored_at is null
      )
  ), checks as (
    select
      (select count(*) from athlete_open) as athlete_drift,
      (select count(*) from ticket_open) as ticket_drift,
      (select count(*) from public.payment_integration_events
        where status = 'processing' and (locked_at is null or locked_at < now() - interval '10 minutes')) as stale_event_locks,
      (select count(*) from public.embedded_payment_attempts
        where reconciliation_status = 'processing'
          and (reconciliation_locked_at is null or reconciliation_locked_at < now() - interval '10 minutes')) as stale_reconciliation_locks,
      (select count(*) from public.payment_integration_events
        where status = 'failed' and attempts_count >= max_attempts) as exhausted_events,
      (select count(*) from public.payment_health_dismissals where restored_at is null) as dismissed_drift
  )
  select jsonb_build_object(
    'schemaVersion', public.get_payment_schema_version(),
    'healthy', athlete_drift = 0 and ticket_drift = 0
      and stale_event_locks = 0 and stale_reconciliation_locks = 0
      and exhausted_events = 0,
    'athleteOrderDrift', athlete_drift,
    'ticketOrderDrift', ticket_drift,
    'staleEventLocks', stale_event_locks,
    'staleReconciliationLocks', stale_reconciliation_locks,
    'exhaustedEvents', exhausted_events,
    'dismissedDrift', dismissed_drift,
    'openAthleteDrift', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'orderId', a.id, 'reference', a.reference,
        'localStatus', a.status, 'expectedStatus', a.expected_status
      ) order by a.id), '[]'::jsonb)
      from athlete_open a
    ),
    'openTicketDrift', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'orderId', t.id, 'reference', t.reference,
        'localStatus', t.status, 'expectedStatus', t.expected_status
      ) order by t.id), '[]'::jsonb)
      from ticket_open t
    ),
    'checkedAt', now()
  ) from checks;
$$;

revoke all on function public.get_payment_system_health()
  from public, anon, authenticated;
grant execute on function public.get_payment_system_health()
  to service_role;

-- El schema reportado sigue al historial real (mismo criterio que
-- 20260722150000): esta migración cambia qué cuenta `get_payment_system_health`.
create or replace function public.get_payment_schema_version()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select '20261129120000'::text; $$;

revoke all on function public.get_payment_schema_version()
  from public, anon, authenticated;
grant execute on function public.get_payment_schema_version() to service_role;

do $verification$
begin
  if to_regclass('public.payment_health_dismissals') is null
    or to_regprocedure('public.staff_dismiss_payment_drift(text,uuid,text,text)') is null
    or to_regprocedure('public.staff_restore_payment_drift_dismissal(uuid,text)') is null
    or to_regprocedure('public.list_payment_drift_dismissals(int)') is null
    or to_regprocedure('public.get_payment_system_health()') is null then
    raise exception 'La verificación de los descartes de diagnóstico no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
