-- Control operativo del vencimiento de sesiones de pago
--
-- Tres cosas que hoy faltan, en orden de gravedad:
--
-- 1. UNA ORDEN CON UN INTENTO EMBEBIDO COLGADO NO VENCE NUNCA.
--    `expire_domain_orders` (20260910100000) se niega, con razón, a cancelar
--    una orden que tenga un `embedded_payment_attempts` en 'processing' o
--    'submitted': cancelarla mientras hay un pago en vuelo es cobrarle al
--    atleta algo que ya dimos por muerto. El problema es que el único barrido
--    de esos intentos es PEREZOSO -- vive dentro de
--    `claim_embedded_payment_attempt` (20260715000400) y sólo corre si el mismo
--    atleta vuelve a la misma orden. Si abre el checkout y no vuelve nunca, el
--    intento queda 'processing' para siempre y la orden queda 'pendiente' para
--    siempre, con `expires_at` vencido hace meses. La reconciliación tampoco lo
--    rescata: su índice y su `where` exigen `external_payment_id is not null`.
--
--    `expire_stale_payment_attempts` es ese barrido, pero activo: corre en el
--    mismo cron, ANTES de `expire_domain_orders`, y sólo toca intentos que
--    NUNCA llegaron al proveedor (`external_payment_id is null`). Esa condición
--    es la línea de seguridad entera: un intento sin id externo no puede
--    corresponder a un cobro real, así que darlo por muerto no puede perder
--    plata. Los que sí tienen id son trabajo del reconciliador (12 reintentos)
--    y, si éste se rinde, de una persona -- no se cancelan solos.
--
-- 2. EL PLAZO ERA UNA CONSTANTE COMPILADA.
--    `plu_private.manual_link_checkout_window()` (20261105100000) ya centralizó
--    los 5 días en una sola función, que fue la mitad del trabajo. La otra
--    mitad es que cambiarlo -- para una tanda con plazo corto, o para probar el
--    circuito completo en minutos en vez de en días -- exige una migración y un
--    deploy. Pasa a leerse de `platform_feature_toggles`, que es donde ya viven
--    los interruptores de checkout y la matriz de canales, con el mismo
--    default de 5 días si no hay fila.
--
-- 3. LO RETENIDO NO SE VE EN NINGÚN LADO.
--    `expire_domain_orders` ya devuelve `heldForReview`, pero muere en el log
--    del proceso. `staff_payment_expiry_overview` lo publica para el panel,
--    junto con las dos categorías que el cron NO puede cerrar solo y que hoy
--    son invisibles: órdenes con comprobante adjunto vencido, y órdenes
--    trabadas por un intento que sí llegó al proveedor.

-- ---------------------------------------------------------------------------
-- 1. Las ventanas, como configuración
-- ---------------------------------------------------------------------------
--
-- Minutos y no un `interval`: es lo que un formulario del panel puede validar
-- con un `number` y lo que un check de rango puede acotar. El techo de un año
-- y el piso de un minuto no son decorativos -- un cero convertiría el barrido
-- en un cancelador instantáneo de todo lo pendiente, y un nulo haría que
-- `coalesce` en el helper devolviera el default sin que nadie entienda por qué
-- el plazo que cargaron no tiene efecto.

alter table public.platform_feature_toggles
  add column if not exists manual_checkout_window_minutes int not null default 7200,
  add column if not exists stale_attempt_grace_minutes int not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_feature_toggles_manual_window_range'
  ) then
    alter table public.platform_feature_toggles
      add constraint platform_feature_toggles_manual_window_range
      check (manual_checkout_window_minutes between 1 and 525600);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_feature_toggles_stale_grace_range'
  ) then
    alter table public.platform_feature_toggles
      add constraint platform_feature_toggles_stale_grace_range
      check (stale_attempt_grace_minutes between 5 and 1440);
  end if;
end;
$$;

-- El piso de 5 minutos para la gracia no es el mismo tipo de número que el
-- resto: es el que impide configurar el barrido para que mate intentos que
-- todavía están vivos. `claim_embedded_payment_attempt` da por vencido un
-- intento propio a los 5 minutos, así que bajar de ahí sería contradecir al
-- checkout desde el cron.

create or replace function plu_private.checkout_window_minutes(p_key text)
returns int
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select coalesce(
    (
      select case lower(btrim(coalesce(p_key, '')))
        when 'manual' then t.manual_checkout_window_minutes
        when 'stale_attempt' then t.stale_attempt_grace_minutes
        else null
      end
      from public.platform_feature_toggles t
      where t.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ),
    case lower(btrim(coalesce(p_key, '')))
      when 'manual' then 7200
      when 'stale_attempt' then 30
      else null
    end
  );
$$;

revoke all on function plu_private.checkout_window_minutes(text)
  from public, anon, authenticated;

-- Misma firma y mismo contrato que 20261105100000: devuelve un `interval` y
-- los cinco lugares que escriben `expires_at` para una orden manual la siguen
-- llamando sin enterarse de que ahora el número viene de una tabla.
create or replace function plu_private.manual_link_checkout_window()
returns interval
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select make_interval(mins => plu_private.checkout_window_minutes('manual'));
$$;

revoke all on function plu_private.manual_link_checkout_window()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El barrido activo de intentos abandonados
-- ---------------------------------------------------------------------------
--
-- Devuelve el desglose por tipo de orden porque son dos circuitos distintos
-- aguas abajo (`expire_domain_orders` para atletas,
-- `expire_ticket_reservations` para entradas) y cuando uno se traba querés
-- saber cuál.

create or replace function public.expire_stale_payment_attempts(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_grace interval := make_interval(mins => plu_private.checkout_window_minutes('stale_attempt'));
  v_athlete int;
  v_ticket int;
  v_blocked int;
begin
  with reaped as (
    update public.embedded_payment_attempts a
    set status = 'failed',
        error = 'Intento abandonado: se cerró sin llegar al proveedor.',
        updated_at = now()
    where a.status in ('processing', 'submitted')
      -- La condición que hace que esto no pueda perder un cobro: sin id
      -- externo el intento nunca se le mandó a Mercado Pago, así que no hay
      -- nada del otro lado que pueda confirmarse más tarde.
      and a.external_payment_id is null
      and a.updated_at < p_now - v_grace
    returning a.order_kind
  )
  select
    count(*) filter (where order_kind = 'athlete'),
    count(*) filter (where order_kind = 'ticket')
  into v_athlete, v_ticket
  from reaped;

  -- Lo que este barrido decide NO tocar. Un intento con id externo trabando
  -- una orden ya vencida es exactamente el caso que necesita una persona: o el
  -- reconciliador todavía lo está intentando, o se rindió y hay un cobro real
  -- sin acreditar.
  select count(*) into v_blocked
  from public.embedded_payment_attempts a
  join public.athlete_payment_orders o
    on o.id = a.order_id and a.order_kind = 'athlete'
  where a.status in ('processing', 'submitted')
    and a.external_payment_id is not null
    and o.status in ('pendiente', 'validacion_manual')
    and o.expires_at <= p_now;

  return jsonb_build_object(
    'athleteAttempts', coalesce(v_athlete, 0),
    'ticketAttempts', coalesce(v_ticket, 0),
    'blockedByProvider', coalesce(v_blocked, 0),
    'graceMinutes', plu_private.checkout_window_minutes('stale_attempt')
  );
end;
$$;

revoke all on function public.expire_stale_payment_attempts(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_stale_payment_attempts(timestamptz) to service_role;

-- El índice sostiene el `where` del barrido: sin él, cada corrida del cron
-- recorre la tabla entera de intentos para encontrar, casi siempre, ninguno.
create index if not exists embedded_payment_attempts_stale_idx
  on public.embedded_payment_attempts (updated_at)
  where status in ('processing', 'submitted') and external_payment_id is null;

-- ---------------------------------------------------------------------------
-- 3. Qué está trabado, para el panel
-- ---------------------------------------------------------------------------

create or replace function public.staff_payment_expiry_overview()
returns jsonb
language sql
security definer
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'manualWindowMinutes', plu_private.checkout_window_minutes('manual'),
    'staleAttemptGraceMinutes', plu_private.checkout_window_minutes('stale_attempt'),
    -- Vencidas y todavía abiertas: si esto no es ~0, el cron no está corriendo
    -- o algo las está reteniendo. Las dos causas posibles vienen abajo.
    'expiredStillOpen', (
      select count(*) from public.athlete_payment_orders o
      where o.status in ('pendiente', 'validacion_manual') and o.expires_at <= now()
    ),
    -- Retenida por comprobante: la cierra una persona, por diseño.
    'heldForProof', (
      select count(*) from public.athlete_payment_orders o
      where o.status in ('pendiente', 'validacion_manual')
        and o.expires_at <= now()
        and o.payment_proof_uploaded_at is not null
    ),
    -- Trabada por un intento que sí llegó al proveedor.
    'blockedByProvider', (
      select count(*) from public.athlete_payment_orders o
      where o.status in ('pendiente', 'validacion_manual')
        and o.expires_at <= now()
        and o.payment_proof_uploaded_at is null
        and exists (
          select 1 from public.embedded_payment_attempts a
          where a.order_kind = 'athlete' and a.order_id = o.id
            and a.status in ('processing', 'submitted')
            and a.external_payment_id is not null
        )
    ),
    -- Intentos que el próximo barrido va a cerrar. Sirve para verificar que el
    -- cron está vivo: si este número sube y no baja, el job no corre.
    'reapableAttempts', (
      select count(*) from public.embedded_payment_attempts a
      where a.status in ('processing', 'submitted')
        and a.external_payment_id is null
        and a.updated_at < now()
          - make_interval(mins => plu_private.checkout_window_minutes('stale_attempt'))
    ),
    'nextExpiringAt', (
      select min(o.expires_at) from public.athlete_payment_orders o
      where o.status in ('pendiente', 'validacion_manual') and o.expires_at > now()
    )
  );
$$;

revoke all on function public.staff_payment_expiry_overview()
  from public, anon, authenticated;
grant execute on function public.staff_payment_expiry_overview() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Las ventanas en el payload y su setter
-- ---------------------------------------------------------------------------
--
-- Cuerpo vigente de 20260826110000 más `checkoutWindows`. Se agrega anidado y
-- no como dos claves sueltas para que el lector del panel distinga de un
-- vistazo lo que es un interruptor de lo que es un plazo.

create or replace function plu_private.platform_feature_toggles_payload(
  p_row public.platform_feature_toggles,
  p_organization_id uuid
)
returns jsonb
language sql
stable
set search_path = public, plu_private
as $$
  with matrix as (
    select plu_private.payment_channel_matrix(p_organization_id) as channels
  )
  select jsonb_build_object(
    'checkoutEnabled', p_row.checkout_enabled,
    'membershipEnabled', p_row.membership_enabled,
    'registrationEnabled', p_row.registration_enabled,
    'ticketEnabled', p_row.ticket_enabled,
    'membershipManualEnabled',
      (m.channels -> 'membership' ->> 'bank_transfer')::boolean
        or (m.channels -> 'membership' ->> 'cash_pitbull')::boolean,
    'registrationManualEnabled',
      (m.channels -> 'registration' ->> 'bank_transfer')::boolean
        or (m.channels -> 'registration' ->> 'cash_pitbull')::boolean,
    'ticketManualEnabled',
      (m.channels -> 'ticket' ->> 'bank_transfer')::boolean
        or (m.channels -> 'ticket' ->> 'cash_pitbull')::boolean,
    'membershipValidationEnabled', p_row.membership_validation_enabled,
    'registrationValidationEnabled', p_row.registration_validation_enabled,
    'ticketValidationEnabled', p_row.ticket_validation_enabled,
    'paymentChannels', m.channels,
    'checkoutWindows', jsonb_build_object(
      'manualMinutes', coalesce(p_row.manual_checkout_window_minutes, 7200),
      'staleAttemptGraceMinutes', coalesce(p_row.stale_attempt_grace_minutes, 30)
    ),
    'updatedBy', p_row.updated_by,
    'updatedAt', p_row.updated_at
  )
  from matrix m;
$$;

revoke all on function plu_private.platform_feature_toggles_payload(
  public.platform_feature_toggles, uuid
) from public, anon, authenticated;

create or replace function public.staff_set_platform_checkout_window(
  p_window text,
  p_minutes int,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_window text := lower(btrim(coalesce(p_window, '')));
  v_row public.platform_feature_toggles;
  v_previous int;
begin
  if v_window not in ('manual', 'stale_attempt') then
    raise exception 'El plazo indicado no es válido.' using errcode = 'PLU02';
  end if;
  if p_minutes is null then
    raise exception 'El plazo tiene que ser un número de minutos.' using errcode = 'PLU02';
  end if;
  -- El rango se valida acá además de en el check de la tabla: el check
  -- devuelve un 23514 crudo que el panel no puede traducir a un mensaje útil.
  if v_window = 'manual' and p_minutes not between 1 and 525600 then
    raise exception 'El plazo de pago manual va de 1 minuto a 1 año.' using errcode = 'PLU02';
  end if;
  if v_window = 'stale_attempt' and p_minutes not between 5 and 1440 then
    raise exception 'La gracia de intentos abandonados va de 5 minutos a 24 horas.'
      using errcode = 'PLU02';
  end if;

  insert into public.platform_feature_toggles (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  select * into v_row from public.platform_feature_toggles
  where organization_id = v_org for update;

  v_previous := case v_window
    when 'manual' then v_row.manual_checkout_window_minutes
    else v_row.stale_attempt_grace_minutes
  end;

  if v_window = 'manual' then
    update public.platform_feature_toggles
    set manual_checkout_window_minutes = p_minutes, updated_by = p_actor, updated_at = now()
    where organization_id = v_org
    returning * into v_row;
  else
    update public.platform_feature_toggles
    set stale_attempt_grace_minutes = p_minutes, updated_by = p_actor, updated_at = now()
    where organization_id = v_org
    returning * into v_row;
  end if;

  -- Un plazo de cobro que cambia es material para un reclamo posterior: si un
  -- atleta dice "me cancelaron a los 20 minutos", esto es lo que lo responde.
  perform plu_private.record_domain_audit(
    'platform_checkout_window.updated', 'platform_feature_toggle', v_window,
    'staff', p_actor,
    jsonb_build_object('window', v_window, 'minutes', p_minutes, 'previousMinutes', v_previous),
    v_org
  );

  return plu_private.platform_feature_toggles_payload(v_row, v_org);
end;
$$;

revoke all on function public.staff_set_platform_checkout_window(text, int, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_platform_checkout_window(text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. El barrido entra al cron, antes del que depende de él
-- ---------------------------------------------------------------------------
--
-- El orden importa y es la única razón por la que las tres sentencias van en
-- el mismo job en vez de en uno nuevo: `expire_stale_payment_attempts` libera
-- las órdenes que `expire_domain_orders` va a cancelar en la sentencia
-- siguiente, en la misma corrida. En jobs separados, cada orden abandonada
-- esperaría un ciclo de más por nada.

select cron.unschedule(jobid)
from cron.job
where jobname in ('expire-domain-orders-minute', 'expire-domain-orders-sweep');

select cron.schedule(
  'expire-domain-orders-sweep',
  '*/3 * * * *',
  $$
    select public.expire_ticket_reservations(now());
    select public.expire_stale_payment_attempts(now());
    select public.expire_domain_orders(now());
  $$
);

-- ---------------------------------------------------------------------------
-- 6. Guardas
-- ---------------------------------------------------------------------------

do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_stale_payment_attempts';

  if v_src is null then
    raise exception 'expire_stale_payment_attempts no quedó creada.';
  end if;
  if v_src not like '%external_payment_id is null%' then
    raise exception
      'expire_stale_payment_attempts perdió la guarda del id externo: podría cerrar un cobro real.';
  end if;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'manual_link_checkout_window';

  if v_src not like '%checkout_window_minutes%' then
    raise exception 'manual_link_checkout_window volvió a ser una constante compilada.';
  end if;
end;
$$;
