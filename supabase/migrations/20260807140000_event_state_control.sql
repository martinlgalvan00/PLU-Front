-- Control de estado del evento: habilitar, deshabilitar y cupo lleno — PLU ARG
--
-- Hasta ahora prender o apagar un evento pasaba por `staff_upsert_event`, que
-- reescribe el evento entero: días, tipos de entrada y beneficios incluidos.
-- Para un cambio de una sola columna eso es caro y riesgoso — el bloque de
-- `ticket_types` hace delete + insert en cada pasada, así que despublicar un
-- evento por diez minutos rotaba los ids de todas sus entradas.
--
-- Y el cupo lleno directamente no existía como estado. `capacity` bloquea el
-- alta en `create_competition_registration_v2` (20260717140000:109), pero el
-- sitio público seguía diciendo "Inscripción abierta" con cero lugares y el
-- atleta se enteraba al final del checkout. La advertencia del editor
-- (`slotsFullButOpenStatus`) avisaba al admin, no al que se estaba anotando.
--
-- Esta migración agrega las dos cosas:
--
--   * `agotado` como estado propio, derivado del cupo y mantenido por la base.
--   * `staff_set_event_state`, un cambio quirúrgico de estado/publicación.

-- ---------------------------------------------------------------------------
-- 1. `agotado` entra al vocabulario de estados
-- ---------------------------------------------------------------------------
-- El check es de columna y anónimo en la tabla original (20260706030000:39),
-- así que Postgres le puso un nombre generado. Se busca por definición en vez
-- de asumir el nombre: es lo que deja la migración reejecutable y a salvo de
-- que alguna pasada anterior lo haya renombrado.
do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%proximamente%'
  limit 1;

  if v_name is not null then
    execute format('alter table public.events drop constraint %I', v_name);
  end if;
end $$;

alter table public.events
  add constraint events_status_check
  check (status in (
    'proximamente', 'inscripcion_abierta', 'cupos_limitados',
    'agotado', 'cerrado', 'finalizado'
  ));

-- ---------------------------------------------------------------------------
-- 2. Cuántos ocupan cupo
-- ---------------------------------------------------------------------------
-- Mismo set de estados que usa `create_competition_registration_v2` para
-- bloquear y que `get_event_registration_capacity` para informar. Contar
-- distinto acá sería marcar agotado un evento que el RPC todavía acepta, o al
-- revés — que es exactamente el bug que este estado viene a cerrar.
create or replace function plu_private.event_active_registrations(p_event_id uuid)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.event_registrations r
  where r.event_id = p_event_id
    and r.status in ('pendiente_pago', 'pagada', 'confirmada');
$$;

revoke all on function plu_private.event_active_registrations(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. El estado sigue al cupo
-- ---------------------------------------------------------------------------
-- Solo se mueve entre los estados que dependen del cupo:
--
--   inscripcion_abierta / cupos_limitados  ->  agotado   (se llenó)
--   agotado                                ->  inscripcion_abierta (se liberó)
--
-- `proximamente`, `cerrado` y `finalizado` son decisiones de la organización y
-- no se tocan nunca: un evento cerrado a mano tiene que quedarse cerrado
-- aunque alguien cancele y sobre un lugar.
--
-- Sin `capacity` no hay nada que derivar — un evento sin tope no se llena.
create or replace function plu_private.sync_event_capacity_status(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_taken int;
  v_next text;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.capacity is null then
    return null;
  end if;

  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados', 'agotado') then
    return v_event.status;
  end if;

  v_taken := plu_private.event_active_registrations(p_event_id);

  if v_taken >= v_event.capacity then
    v_next := 'agotado';
  elsif v_event.status = 'agotado' then
    v_next := 'inscripcion_abierta';
  else
    v_next := v_event.status;
  end if;

  if v_next = v_event.status then
    return v_next;
  end if;

  update public.events
  set status = v_next, updated_at = now()
  where id = p_event_id;

  perform plu_private.record_domain_audit(
    'event.capacity_status_synced', 'event', p_event_id::text, 'system', null,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'from', v_event.status,
      'to', v_next,
      'registered', v_taken,
      'capacity', v_event.capacity
    ),
    v_event.organization_id
  );

  return v_next;
end;
$$;

revoke all on function plu_private.sync_event_capacity_status(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Disparadores
-- ---------------------------------------------------------------------------
-- Una inscripción que entra, cambia de estado o se borra puede cruzar el
-- umbral en cualquiera de las dos direcciones. Va por trigger y no dentro del
-- RPC de alta porque las inscripciones también se cancelan y se aprueban desde
-- otros caminos (aprobación manual de pago, cancelación desde el panel), y
-- todos tienen que mover el cupo igual.
create or replace function plu_private.event_registration_capacity_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform plu_private.sync_event_capacity_status(old.event_id);
    return old;
  end if;

  perform plu_private.sync_event_capacity_status(new.event_id);

  -- Mover una inscripción de evento libera cupo en el de origen.
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform plu_private.sync_event_capacity_status(old.event_id);
  end if;

  return new;
end;
$$;

revoke all on function plu_private.event_registration_capacity_sync()
  from public, anon, authenticated, service_role;

drop trigger if exists event_registrations_capacity_sync on public.event_registrations;
create trigger event_registrations_capacity_sync
  after insert or delete or update of status, event_id on public.event_registrations
  for each row execute function plu_private.event_registration_capacity_sync();

-- El otro lado: el admin guarda el evento desde el editor con un estado que ya
-- no corresponde (abrió el formulario cuando quedaban lugares y guardó cuando
-- ya no quedaban), o le baja el cupo por debajo de los que ya se anotaron.
--
-- `pg_trigger_depth()` corta la recursión: `sync_event_capacity_status` hace su
-- propio UPDATE sobre events y volvería a entrar acá. En esa segunda pasada el
-- estado ya está calculado, así que no hay nada que hacer.
create or replace function plu_private.event_capacity_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  perform plu_private.sync_event_capacity_status(new.id);
  return null;
end;
$$;

revoke all on function plu_private.event_capacity_status_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists events_capacity_status_guard on public.events;
create trigger events_capacity_status_guard
  after insert or update of status, capacity on public.events
  for each row execute function plu_private.event_capacity_status_guard();

-- ---------------------------------------------------------------------------
-- 5. Cambio de estado quirúrgico
-- ---------------------------------------------------------------------------
-- Habilitar, deshabilitar y cambiar el estado público sin pasar por el upsert
-- completo. Los dos parámetros son opcionales e independientes: se puede
-- despublicar sin tocar el estado y al revés.
--
-- Devuelve el evento tal como quedó, no el que se pidió: si la organización
-- reabre un evento que sigue lleno, el sync lo devuelve a `agotado` y el panel
-- tiene que mostrar eso, no la ilusión de que se reabrió.
create or replace function public.staff_set_event_state(
  p_event_slug text,
  p_status text default null,
  p_published boolean default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.events;
  v_event public.events;
begin
  if p_status is null and p_published is null then
    raise exception 'No hay ningún cambio para aplicar.' using errcode = 'PLU01';
  end if;

  if p_status is not null and p_status not in (
    'proximamente', 'inscripcion_abierta', 'cupos_limitados',
    'agotado', 'cerrado', 'finalizado'
  ) then
    raise exception 'Estado de evento inválido.' using errcode = 'PLU01';
  end if;

  select * into v_before from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  update public.events set
    status = coalesce(p_status, status),
    published = coalesce(p_published, published),
    updated_at = now()
  where id = v_before.id;

  -- Después del UPDATE: el trigger de arriba ya pudo haber corregido el estado.
  select * into v_event from public.events where id = v_before.id;

  perform plu_private.record_domain_audit(
    'event.state_changed', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'statusFrom', v_before.status,
      'statusTo', v_event.status,
      'statusRequested', p_status,
      'publishedFrom', v_before.published,
      'publishedTo', v_event.published
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'registered', plu_private.event_active_registrations(v_event.id),
    -- El panel necesita distinguir "no se aplicó" de "se aplicó y la base lo
    -- corrigió": son dos mensajes distintos para el operador.
    'statusOverridden', p_status is not null and p_status <> v_event.status
  );
end;
$$;

revoke all on function public.staff_set_event_state(text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_state(text, text, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Puesta al día de los eventos existentes
-- ---------------------------------------------------------------------------
-- Los que ya estaban llenos con la inscripción abierta pasan a `agotado` ahora,
-- sin esperar a que alguien intente anotarse.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.events
    where capacity is not null
      and status in ('inscripcion_abierta', 'cupos_limitados')
  loop
    perform plu_private.sync_event_capacity_status(v_id);
  end loop;
end $$;
