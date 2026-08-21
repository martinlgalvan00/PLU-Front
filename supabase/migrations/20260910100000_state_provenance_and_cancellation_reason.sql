-- Un estado sin motivo no es un estado, es una afirmación — PLU ARG
--
-- El reporte que abrió esto: Michelle Sofía Correa tiene la afiliación "Activa"
-- y, dos tabs más allá, el pago de esa misma afiliación dice "Cancelado". Las
-- dos cosas son ciertas. Lo que faltaba era el hecho que las une.
--
-- Reconstrucción del caso (orden 321e2026, atleta 734ce483):
--
--   19:06  se emite la orden de afiliación por Mercado Pago.
--   19:36  vence. Nunca hubo un intento de cobro: `athlete_payments` está
--          vacía para esa orden, no es que se rechazó una tarjeta.
--   19:39  el cron la cancela.
--   21:26  un operador revalida contra Mercado Pago: `no_provider_payment`,
--          confirmado, del lado del proveedor no entró plata.
--   23:35  un operador activa la afiliación A MANO. Queda 'activa'. La orden
--          queda 'cancelado' para siempre y nadie escribe por qué.
--
-- No es un caso aislado ni un error de datos. Al escribir esta migración hay
-- 3 afiliaciones activas y 3 inscripciones confirmadas sobre órdenes no
-- aprobadas. En las 3 inscripciones el motivo SÍ existe, porque
-- `staff_set_registration_status` lo exige desde 20260822100000 ("RECIBÍ EL
-- PAGO Y TODA LA INFORMACIÓN CORRECTAMENTE" — plata que entró por transferencia
-- fuera de la plataforma). En las 3 afiliaciones no existe, porque
-- `staff_set_membership_status` es la única puerta manual que nunca pidió
-- motivo. Esa asimetría es el agujero que se cierra acá.
--
-- Tres correcciones, una sola causa:
--
-- 1. La cancelación de una orden deja escrito POR QUÉ se canceló.
--
--    Hasta acá el vencimiento no dejaba rastro propio: el cron movía `status` y
--    `updated_at`, y el frontend adivinaba el motivo comparando `updated_at`
--    contra `expires_at` (ver `cancellationReason` en src/lib/paymentProgress.js).
--    Adivinar funciona hasta que una cancelación manual cae dentro de esa
--    ventana, y ahí miente. El motivo pasa a ser un dato, no una inferencia.
--
-- 2. Un otorgamiento manual exige motivo y canal, y queda en la fila.
--
--    `staff_set_membership_status` sube al mismo estándar que su par de
--    inscripciones: sin motivo, la RPC no corre. Y el motivo deja de vivir sólo
--    en `domain_audit_logs` -- que hay que ir a buscar, con permiso de auditoría
--    y sabiendo que existe -- para vivir también en la fila que la pantalla ya
--    está leyendo. Es lo que permite mostrar "Activa · activada a mano por X"
--    en vez de sólo "Activa".
--
-- 3. La orden cancelada NO se marca aprobada.
--
--    Sería un solo estado coherente y sería mentira: por Mercado Pago no entró
--    un peso, y los ingresos se agregan desde `athlete_payments` con status
--    'aprobado'. Un cobro inventado ahí envenena todo reporte financiero. La
--    plata que entra por fuera se registra con
--    `staff_force_settle_payment_order`, que exige comprobante y hace asiento
--    real. Acá sólo se marca la orden como cerrada-por-otra-vía y se la ata al
--    otorgamiento manual, para que la pantalla explique los dos hechos sin
--    contradecirse.

-- ---------------------------------------------------------------------------
-- 1. Órdenes: motivo de cierre como dato, no como inferencia
-- ---------------------------------------------------------------------------

alter table public.athlete_payment_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_code text,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'athlete_payment_orders_cancellation_code_check'
  ) then
    alter table public.athlete_payment_orders
      add constraint athlete_payment_orders_cancellation_code_check
      check (cancellation_code is null or cancellation_code in (
        -- Venció sin que nadie llegara a pagar: checkout abandonado, o
        -- transferencia que nunca se hizo. No hay plata en juego.
        'expired_without_payment',
        -- Venció y además hubo intentos que no se acreditaron. Es la diferencia
        -- entre "no llegó a pagar" y "quiso pagar y el medio lo rechazó".
        'expired_after_failed_attempt',
        -- El proveedor reportó el pago como cancelado.
        'provider_cancelled',
        -- La cerró una persona de la organización, con motivo escrito.
        'cancelled_by_staff',
        -- El atleta la reemplazó por otra (cambió de canal, de evento o de plan).
        'superseded_by_new_order',
        -- El cobro murió pero el derecho se otorgó por otra vía. La orden queda
        -- cerrada a propósito: es el asiento de que la plata, si entró, entró
        -- por fuera de este canal.
        'resolved_off_platform'
      ));
  end if;
end
$$;

comment on column public.athlete_payment_orders.cancellation_code is
  'Por qué se cerró la orden. Antes se inferia en el frontend comparando updated_at con expires_at; una cancelacion manual dentro de esa ventana se reportaba como vencimiento.';

-- El backlog de este arreglo es "órdenes cerradas sin motivo". Tiene que poder
-- consultarse sin escanear la tabla entera, y el índice parcial se vacía solo a
-- medida que los caminos de cierre empiezan a sellar el motivo.
create index if not exists athlete_payment_orders_unexplained_closure_idx
  on public.athlete_payment_orders (organization_id, updated_at desc)
  where status in ('cancelado', 'rechazado') and cancellation_code is null;

-- ---------------------------------------------------------------------------
-- 2. Derechos: procedencia de una decisión manual
-- ---------------------------------------------------------------------------
--
-- Mismo juego de columnas en las dos tablas a propósito: la pregunta que
-- contestan es idéntica ("¿este estado lo puso el cobro o lo puso una
-- persona?") y la pantalla las lee con el mismo código.

alter table public.memberships
  add column if not exists manual_override_status text,
  add column if not exists manual_override_channel text,
  add column if not exists manual_override_reason text,
  add column if not exists manual_override_by text,
  add column if not exists manual_override_at timestamptz;

alter table public.event_registrations
  add column if not exists manual_override_status text,
  add column if not exists manual_override_channel text,
  add column if not exists manual_override_reason text,
  add column if not exists manual_override_by text,
  add column if not exists manual_override_at timestamptz;

-- Catálogo cerrado a propósito: 'other' con nota libre cubre lo imprevisto sin
-- volver la columna un campo de texto que después no se puede agregar por canal
-- en un reporte de Finanzas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'memberships_manual_override_channel_check'
  ) then
    alter table public.memberships
      add constraint memberships_manual_override_channel_check
      check (manual_override_channel is null or manual_override_channel in (
        'bank_transfer', 'wise_transfer', 'cash', 'courtesy',
        'error_correction', 'sponsor', 'other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_registrations_manual_override_channel_check'
  ) then
    alter table public.event_registrations
      add constraint event_registrations_manual_override_channel_check
      check (manual_override_channel is null or manual_override_channel in (
        'bank_transfer', 'wise_transfer', 'cash', 'courtesy',
        'error_correction', 'sponsor', 'other'
      ));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. El cron de vencimiento sella el motivo
-- ---------------------------------------------------------------------------
--
-- Se conserva íntegra la regla de 20260907100000 (una orden con comprobante
-- adjunto no la cancela el cron, la cierra una persona) y la de los intentos
-- embebidos en vuelo. Lo único que se agrega es el sello del motivo, y la
-- distinción entre vencer con y sin intentos: para el reclamo no son lo mismo.

create or replace function public.expire_domain_orders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders int;
  v_registrations int;
  v_held int;
begin
  with expired as (
    update public.athlete_payment_orders o
    set status = 'cancelado',
        updated_at = now(),
        cancelled_at = now(),
        cancellation_code = case
          when exists (
            select 1 from public.athlete_payments p where p.order_id = o.id
          ) then 'expired_after_failed_attempt'
          else 'expired_without_payment'
        end,
        cancelled_by = 'system:expire_domain_orders'
    where o.status in ('pendiente', 'validacion_manual') and o.expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'athlete' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
      -- Hay comprobante adjunto: esa orden la cierra una persona, no el cron.
      and o.payment_proof_uploaded_at is null
    returning o.id
  ), cancelled as (
    update public.event_registrations r set status = 'cancelada', updated_at = now()
    where r.payment_order_id in (select id from expired) and r.status = 'pendiente_pago'
    returning r.id
  )
  select (select count(*) from expired), (select count(*) from cancelled)
    into v_orders, v_registrations;

  -- Lo retenido se informa: una orden que el cron decide no tocar tiene que ser
  -- un número visible en el job, no un silencio.
  select count(*) into v_held
  from public.athlete_payment_orders o
  where o.status in ('pendiente', 'validacion_manual')
    and o.expires_at <= p_now
    and o.payment_proof_uploaded_at is not null;

  return jsonb_build_object(
    'orders', coalesce(v_orders, 0),
    'registrations', coalesce(v_registrations, 0),
    'heldForReview', coalesce(v_held, 0)
  );
end;
$$;

revoke all on function public.expire_domain_orders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_domain_orders(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Activación manual de afiliación: motivo y canal obligatorios
-- ---------------------------------------------------------------------------
--
-- La firma vieja de 3 argumentos queda, pero sólo para negarse: si se dejara
-- funcionando seguiría siendo la puerta por la que entran los estados sin
-- explicación, y un caller viejo la elegiría sin que nadie se enterara. Falla
-- ruidosa y con instrucción, en vez de éxito silencioso.

create or replace function public.staff_set_membership_status(
  p_membership_id uuid,
  p_status text,
  p_actor text
)
returns jsonb
language plpgsql
as $$
begin
  raise exception 'Usa staff_set_membership_status(uuid, text, text, text, text): la activacion o baja manual exige motivo y canal.'
    using errcode = 'PLU01';
end;
$$;

create or replace function public.staff_set_membership_status(
  p_membership_id uuid,
  p_status text,
  p_actor text,
  p_reason text,
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships;
  v_previous text;
  v_plan public.membership_plans;
  v_order public.athlete_payment_orders;
  v_start date;
  v_end date;
  v_duration int;
begin
  if p_status not in ('activa', 'cancelada') then
    raise exception 'Estado de afiliacion no permitido desde el panel.' using errcode = 'PLU01';
  end if;
  -- Mismo umbral que `staff_set_registration_status`: tres caracteres no hacen
  -- una explicación, pero cortan el motivo vacío y el punto suelto.
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'El cambio manual de la afiliacion exige un motivo.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'El cambio manual de la afiliacion exige un responsable.' using errcode = 'PLU01';
  end if;
  if p_channel is not null and p_channel not in (
    'bank_transfer', 'wise_transfer', 'cash', 'courtesy', 'error_correction', 'sponsor', 'other'
  ) then
    raise exception 'Canal de otorgamiento manual no reconocido.' using errcode = 'PLU01';
  end if;
  -- Activar exige decir de dónde salió el derecho. Dar de baja no: ahí el
  -- motivo escrito alcanza, no hay plata que atribuir a ningún canal.
  if p_status = 'activa' and p_channel is null then
    raise exception 'Activar a mano exige declarar el canal por el que se resolvio.'
      using errcode = 'PLU01';
  end if;

  select * into v_membership from public.memberships
  where id = p_membership_id for update;
  if not found then
    raise exception 'Afiliacion no encontrada.' using errcode = 'PLU02';
  end if;

  v_previous := v_membership.status;
  if v_previous = p_status then
    return jsonb_build_object('membership', to_jsonb(v_membership), 'duplicate', true);
  end if;

  if p_status = 'activa' then
    select * into v_plan from public.membership_plans where id = v_membership.plan_id;
    -- Duración del plan; sin plan asociado, un año.
    v_duration := case
      when v_plan.id is null then 365
      when v_plan.billing_frequency = 'monthly' then 30 * coalesce(v_plan.interval_count, 1)
      else 365 * coalesce(v_plan.interval_count, 1)
    end;

    -- Una activación manual sobre un período ya vencido (o sin fechas) abre uno
    -- nuevo desde hoy. Si el período todavía cubre, se respeta: activar a mano
    -- no puede acortar ni correr una vigencia que el socio ya pagó.
    if v_membership.expiration_date is null or v_membership.expiration_date < current_date then
      v_start := current_date;
      v_end := current_date + v_duration;
    else
      v_start := coalesce(v_membership.start_date, current_date);
      v_end := v_membership.expiration_date;
    end if;

    update public.memberships
    set status = 'activa',
        start_date = v_start,
        expiration_date = v_end,
        manual_override_status = 'activa',
        manual_override_channel = p_channel,
        manual_override_reason = trim(p_reason),
        manual_override_by = p_actor,
        manual_override_at = now(),
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

    update public.athletes
    set status = 'afiliado_activo', updated_at = now()
    where id = v_membership.athlete_id;
  else
    update public.memberships
    set status = 'cancelada',
        manual_override_status = 'cancelada',
        manual_override_channel = p_channel,
        manual_override_reason = trim(p_reason),
        manual_override_by = p_actor,
        manual_override_at = now(),
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

    -- El atleta solo vuelve a "registrado" si no le queda ninguna otra
    -- afiliación vigente: dar de baja la de 2026 no puede desafiliar a alguien
    -- que ya tiene paga la de 2027.
    if not exists (
      select 1 from public.memberships m
      where m.athlete_id = v_membership.athlete_id
        and m.id <> p_membership_id
        and m.status = 'activa'
        and coalesce(m.expiration_date, current_date - 1) >= current_date
    ) then
      update public.athletes
      set status = 'registrado', updated_at = now()
      where id = v_membership.athlete_id;
    end if;
  end if;

  -- La orden que quedó muerta se marca como resuelta por fuera. No se acredita
  -- (eso es `staff_force_settle_payment_order`, con comprobante y asiento): se
  -- deja escrito que el derecho se otorgó por otra vía, que es exactamente lo
  -- que la pantalla necesita para no contradecirse.
  if p_status = 'activa' and v_membership.payment_order_id is not null then
    update public.athlete_payment_orders
    set cancellation_code = case
          when status = 'aprobado' then cancellation_code
          else 'resolved_off_platform'
        end,
        cancellation_reason = case
          when status = 'aprobado' then cancellation_reason
          else trim(p_reason)
        end,
        cancelled_by = case when status = 'aprobado' then cancelled_by else p_actor end,
        cancelled_at = case
          when status = 'aprobado' then cancelled_at
          else coalesce(cancelled_at, now())
        end,
        updated_at = case when status = 'aprobado' then updated_at else now() end
    where id = v_membership.payment_order_id
    returning * into v_order;
  end if;

  perform plu_private.record_domain_audit(
    case when p_status = 'activa' then 'membership.activated_manually'
         else 'membership.cancelled_manually' end,
    'membership',
    p_membership_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'memberCode', v_membership.member_code,
      'startDate', v_membership.start_date,
      'expirationDate', v_membership.expiration_date,
      'reason', trim(p_reason),
      'channel', p_channel,
      'orderId', v_membership.payment_order_id,
      -- Queda registrado que la orden siguió cerrada: es la prueba de que esta
      -- activación no fabricó un ingreso.
      'orderStatusAfter', v_order.status
    ),
    v_membership.organization_id
  );

  return jsonb_build_object(
    'membership', to_jsonb(v_membership),
    'order', to_jsonb(v_order),
    'duplicate', false
  );
end;
$$;

revoke all on function public.staff_set_membership_status(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.staff_set_membership_status(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_membership_status(uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Estado manual de inscripción: el motivo ya se exigía, ahora se guarda
-- ---------------------------------------------------------------------------
--
-- `staff_set_registration_status` pedía motivo desde 20260822100000 y lo
-- escribía sólo en la bitácora. Los tres casos de inscripción incoherentes de
-- hoy tienen su motivo ahí y aun así la pantalla mostraba un "Cancelado" pelado,
-- porque leer la bitácora exige otro permiso y otra consulta. El motivo baja a
-- la fila, y se suma el canal para que Finanzas pueda agregarlo.

create or replace function public.staff_set_registration_status(
  p_registration_id uuid,
  p_status text,
  p_actor text,
  p_reason text,
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_previous text;
  v_organization_id uuid;
  v_order public.athlete_payment_orders;
begin
  if p_status not in ('confirmada', 'observada', 'cancelada') then
    raise exception 'Estado de inscripcion no permitido desde el panel.' using errcode = 'PLU01';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'El cambio manual exige un motivo.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'El cambio manual exige un responsable.' using errcode = 'PLU01';
  end if;
  if p_channel is not null and p_channel not in (
    'bank_transfer', 'wise_transfer', 'cash', 'courtesy', 'error_correction', 'sponsor', 'other'
  ) then
    raise exception 'Canal de otorgamiento manual no reconocido.' using errcode = 'PLU01';
  end if;

  select * into v_registration from public.event_registrations
  where id = p_registration_id for update;
  if not found then
    raise exception 'Inscripcion no encontrada.' using errcode = 'PLU02';
  end if;

  v_previous := v_registration.status;
  if v_previous = p_status then
    return jsonb_build_object('registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  update public.event_registrations
  set status = p_status,
      manual_override_status = p_status,
      manual_override_channel = p_channel,
      manual_override_reason = trim(p_reason),
      manual_override_by = p_actor,
      manual_override_at = now(),
      updated_at = now()
  where id = p_registration_id
  returning * into v_registration;

  if p_status = 'confirmada' and v_registration.payment_order_id is not null then
    update public.athlete_payment_orders
    set cancellation_code = case
          when status = 'aprobado' then cancellation_code
          else 'resolved_off_platform'
        end,
        cancellation_reason = case
          when status = 'aprobado' then cancellation_reason
          else trim(p_reason)
        end,
        cancelled_by = case when status = 'aprobado' then cancelled_by else p_actor end,
        cancelled_at = case
          when status = 'aprobado' then cancelled_at
          else coalesce(cancelled_at, now())
        end,
        updated_at = case when status = 'aprobado' then updated_at else now() end
    where id = v_registration.payment_order_id
    returning * into v_order;
  end if;

  -- `event_registrations` no lleva organization_id propio; se toma del evento
  -- para que el asiento de auditoría quede en el tenant correcto.
  select organization_id into v_organization_id
  from public.events where id = v_registration.event_id;

  perform plu_private.record_domain_audit(
    'registration.status_changed_manually',
    'event_registration',
    p_registration_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'status', p_status,
      'reason', trim(p_reason),
      'channel', p_channel,
      'eventId', v_registration.event_id,
      'athleteId', v_registration.athlete_id,
      'orderId', v_registration.payment_order_id,
      'orderStatusAfter', v_order.status
    ),
    v_organization_id
  );

  return jsonb_build_object(
    'registration', to_jsonb(v_registration),
    'order', to_jsonb(v_order),
    'duplicate', false
  );
end;
$$;

revoke all on function public.staff_set_registration_status(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.staff_set_registration_status(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_registration_status(uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Backfill: los estados que ya divergen quedan explicados
-- ---------------------------------------------------------------------------
--
-- Decisión tomada con el responsable del proyecto: los derechos otorgados se
-- conservan (hay plata que entró por transferencia detrás de varios de ellos).
-- Lo que se agrega es la explicación, reconstruida de `domain_audit_logs`, que
-- es donde quedó lo que efectivamente pasó.
--
-- Las inscripciones traen su motivo real. Las afiliaciones no tienen ninguno
-- que recuperar -- la RPC no lo pedía -- así que se marcan explícitamente como
-- sin motivo registrado en vez de inventarle uno. Un hueco honesto es un
-- pendiente accionable; un motivo fabricado es una mentira permanente.

with last_manual as (
  select
    l.entity_id::uuid as registration_id,
    (l.metadata ->> 'reason') as reason,
    l.actor_id as actor,
    l.created_at,
    row_number() over (partition by l.entity_id order by l.created_at desc) as rn
  from public.domain_audit_logs l
  where l.action = 'registration.status_changed_manually'
    and l.entity_type = 'event_registration'
)
update public.event_registrations r
set manual_override_status = r.status,
    manual_override_reason = coalesce(nullif(trim(m.reason), ''), 'Sin motivo registrado (anterior a 20260910100000).'),
    manual_override_by = m.actor,
    manual_override_at = m.created_at
from last_manual m
where m.registration_id = r.id
  and m.rn = 1
  and r.manual_override_at is null;

with last_manual as (
  select
    l.entity_id::uuid as membership_id,
    (l.metadata ->> 'reason') as reason,
    l.actor_id as actor,
    l.created_at,
    row_number() over (partition by l.entity_id order by l.created_at desc) as rn
  from public.domain_audit_logs l
  where l.action in ('membership.activated_manually', 'membership.cancelled_manually')
    and l.entity_type = 'membership'
)
update public.memberships mem
set manual_override_status = mem.status,
    manual_override_reason = coalesce(nullif(trim(m.reason), ''), 'Sin motivo registrado (anterior a 20260910100000).'),
    manual_override_by = m.actor,
    manual_override_at = m.created_at
from last_manual m
where m.membership_id = mem.id
  and m.rn = 1
  and mem.manual_override_at is null;

-- Órdenes que quedaron cerradas debajo de un derecho otorgado: se sellan como
-- resueltas por fuera, que es literalmente lo que pasó.
update public.athlete_payment_orders o
set cancellation_code = 'resolved_off_platform',
    cancellation_reason = coalesce(o.cancellation_reason, d.reason),
    cancelled_at = coalesce(o.cancelled_at, o.updated_at),
    cancelled_by = coalesce(o.cancelled_by, d.actor)
from (
  select m.payment_order_id as order_id, m.manual_override_reason as reason, m.manual_override_by as actor
  from public.memberships m
  where m.status = 'activa' and m.payment_order_id is not null
  union all
  select r.payment_order_id, r.manual_override_reason, r.manual_override_by
  from public.event_registrations r
  where r.status in ('confirmada', 'pagada') and r.payment_order_id is not null
) d
where o.id = d.order_id
  and o.status <> 'aprobado'
  and o.cancellation_code is null;

-- El resto de las órdenes cerradas sin motivo se sellan con lo que se puede
-- afirmar: vencieron. La distinción con/sin intento sale del libro de cobros,
-- no de una suposición.
update public.athlete_payment_orders o
set cancellation_code = case
      when exists (select 1 from public.athlete_payments p where p.order_id = o.id)
        then 'expired_after_failed_attempt'
      else 'expired_without_payment'
    end,
    cancelled_at = coalesce(o.cancelled_at, o.updated_at)
where o.status = 'cancelado'
  and o.cancellation_code is null
  and o.expires_at is not null
  and o.updated_at >= o.expires_at;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_source text;
  v_unexplained int;
  v_legacy_ok boolean;
begin
  -- La firma de 3 argumentos tiene que negarse. Si sigue activando afiliaciones,
  -- todo lo de arriba es decorativo: el back door sigue abierto.
  begin
    perform public.staff_set_membership_status(
      '00000000-0000-0000-0000-000000000000'::uuid, 'activa', 'verificacion'
    );
    v_legacy_ok := false;
  exception when others then
    v_legacy_ok := true;
  end;
  if not v_legacy_ok then
    raise exception 'staff_set_membership_status(uuid,text,text) sigue aceptando cambios sin motivo.'
      using errcode = 'PLU01';
  end if;

  select prosrc into v_source
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_domain_orders';
  if v_source is null or v_source not like '%expired_without_payment%' then
    raise exception 'expire_domain_orders no esta sellando el motivo de cancelacion.'
      using errcode = 'PLU01';
  end if;
  -- La guarda del comprobante de 20260907100000 no puede haberse perdido en el
  -- reemplazo de la función.
  if v_source not like '%payment_proof_uploaded_at is null%' then
    raise exception 'expire_domain_orders perdio la guarda del comprobante sin revisar.'
      using errcode = 'PLU01';
  end if;

  -- Después del backfill no puede quedar un derecho otorgado sobre una orden
  -- cerrada sin explicación: es exactamente el estado que abrió este arreglo.
  select count(*) into v_unexplained
  from public.memberships m
  join public.athlete_payment_orders o on o.id = m.payment_order_id
  where m.status = 'activa' and o.status <> 'aprobado' and o.cancellation_code is null;
  if v_unexplained > 0 then
    raise exception 'Quedan % afiliaciones activas sobre ordenes cerradas sin motivo.', v_unexplained
      using errcode = 'PLU01';
  end if;

  select count(*) into v_unexplained
  from public.event_registrations r
  join public.athlete_payment_orders o on o.id = r.payment_order_id
  where r.status in ('confirmada', 'pagada')
    and o.status <> 'aprobado' and o.cancellation_code is null;
  if v_unexplained > 0 then
    raise exception 'Quedan % inscripciones confirmadas sobre ordenes cerradas sin motivo.', v_unexplained
      using errcode = 'PLU01';
  end if;
end
$verification$;
