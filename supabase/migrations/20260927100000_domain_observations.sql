-- Observaciones con historial sobre inscripciones y afiliaciones -- PLU ARG
--
-- Hasta acá una observación era un efecto colateral de mover el estado: el
-- panel escribía `manual_override_reason` en la fila y esa columna guardaba una
-- sola frase, la última. De ahí salían dos límites que la operación venía
-- sufriendo:
--
--   1. No se podía observar algo sin cambiarlo de estado. El diálogo exige un
--      estado distinto al vigente, así que dejar anotado "el pago llegó a
--      nombre del padre" sobre una inscripción confirmada obligaba a sacarla de
--      confirmada. La observación costaba una corrección de estado que nadie
--      quería hacer.
--   2. Cada observación pisaba la anterior. Un caso que pasa por tres manos
--      -- Finanzas anota, la organización responde, alguien cierra -- terminaba
--      con una sola línea y sin forma de saber qué se dijo antes.
--
-- Esta tabla es el hilo. `manual_override_reason` NO se toca ni se deprecia:
-- sigue siendo el motivo del último cambio de estado, que es otra pregunta
-- ("por qué está en este estado") y la contesta bien. Lo que cambia es que ese
-- motivo, además, queda asentado acá como una observación más, para que el hilo
-- esté completo y no haya que leer dos lugares.

create table if not exists public.domain_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,
  -- Inscripción o afiliación. No hay FK porque apunta a dos tablas distintas;
  -- la integridad la sostiene la RPC, que verifica la fila antes de escribir.
  entity_type text not null check (entity_type in ('registration', 'membership')),
  entity_id uuid not null,
  body text not null check (length(trim(body)) >= 3),
  -- El estado que se puso junto con la observación. `null` es una observación
  -- suelta: alguien anotó algo sin mover nada, que es justamente lo que antes
  -- no se podía hacer.
  status_change text,
  author text not null,
  created_at timestamptz not null default now()
);

-- La lectura siempre es "el hilo de esta entidad, del más nuevo al más viejo".
create index if not exists domain_observations_entity_idx
  on public.domain_observations (entity_type, entity_id, created_at desc);

alter table public.domain_observations enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill: lo ya escrito entra al hilo
-- ---------------------------------------------------------------------------
--
-- Sin esto el historial arrancaría vacío y las observaciones que la
-- organización ya cargó -- las que motivaron todo esto -- quedarían fuera del
-- hilo mientras siguen visibles en la celda de estado, que las lee de
-- `manual_override_reason`. Dos superficies contando historias distintas del
-- mismo hecho es exactamente lo que hay que evitar.
--
-- Los motivos de relleno del backfill anterior ("Sin motivo registrado…") se
-- excluyen a propósito: son un hueco declarado, no algo que alguien escribió.

insert into public.domain_observations (
  organization_id, entity_type, entity_id, body, status_change, author, created_at
)
select
  r.organization_id,
  'registration',
  r.id,
  trim(r.manual_override_reason),
  r.manual_override_status,
  coalesce(r.manual_override_by, 'desconocido'),
  coalesce(r.manual_override_at, r.updated_at, now())
from public.event_registrations r
where r.manual_override_reason is not null
  and length(trim(r.manual_override_reason)) >= 3
  and r.manual_override_reason not like 'Sin motivo registrado%'
  and not exists (
    select 1 from public.domain_observations o
    where o.entity_type = 'registration' and o.entity_id = r.id
  );

insert into public.domain_observations (
  organization_id, entity_type, entity_id, body, status_change, author, created_at
)
select
  m.organization_id,
  'membership',
  m.id,
  trim(m.manual_override_reason),
  m.manual_override_status,
  coalesce(m.manual_override_by, 'desconocido'),
  coalesce(m.manual_override_at, m.updated_at, now())
from public.memberships m
where m.manual_override_reason is not null
  and length(trim(m.manual_override_reason)) >= 3
  and m.manual_override_reason not like 'Sin motivo registrado%'
  and not exists (
    select 1 from public.domain_observations o
    where o.entity_type = 'membership' and o.entity_id = m.id
  );

-- ---------------------------------------------------------------------------
-- Escribir una observación sin tocar el estado
-- ---------------------------------------------------------------------------

create or replace function public.staff_add_observation(
  p_entity_type text,
  p_entity_id uuid,
  p_body text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_observation public.domain_observations;
  v_organization_id uuid;
begin
  if p_entity_type not in ('registration', 'membership') then
    raise exception 'Tipo de entidad no observable.' using errcode = 'PLU01';
  end if;
  if p_body is null or length(trim(p_body)) < 3 then
    raise exception 'La observacion no puede estar vacia.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'La observacion exige un responsable.' using errcode = 'PLU01';
  end if;

  -- La entidad tiene que existir: una observación colgando de un id que no
  -- existe es ruido que nadie vuelve a mirar, y sin FK esto es lo único que lo
  -- impide.
  if p_entity_type = 'registration' then
    select organization_id into v_organization_id
    from public.event_registrations where id = p_entity_id;
  else
    select organization_id into v_organization_id
    from public.memberships where id = p_entity_id;
  end if;
  if v_organization_id is null then
    raise exception 'No existe la entidad observada.' using errcode = 'PLU02';
  end if;

  insert into public.domain_observations (
    organization_id, entity_type, entity_id, body, status_change, author
  )
  values (
    v_organization_id, p_entity_type, p_entity_id, trim(p_body), null, trim(p_actor)
  )
  returning * into v_observation;

  perform plu_private.record_domain_audit(
    'observation.added', p_entity_type, p_entity_id::text,
    'staff', p_actor,
    jsonb_build_object('observationId', v_observation.id),
    v_organization_id
  );

  return jsonb_build_object('observation', to_jsonb(v_observation));
end;
$$;

revoke all on function public.staff_add_observation(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_add_observation(text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Borrar una observación propia del hilo
-- ---------------------------------------------------------------------------
--
-- Sin baja, un error de tipeo queda para siempre a la vista de todo el equipo.
-- Se borra de verdad y no con un `deleted_at`: el hilo es una nota operativa,
-- no un asiento contable, y la auditoría de dominio ya guarda que existió y
-- quién la sacó.

create or replace function public.staff_delete_observation(
  p_observation_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_observation public.domain_observations;
begin
  select * into v_observation from public.domain_observations
  where id = p_observation_id for update;
  if not found then
    raise exception 'Observacion no encontrada.' using errcode = 'PLU02';
  end if;

  delete from public.domain_observations where id = p_observation_id;

  perform plu_private.record_domain_audit(
    'observation.deleted', v_observation.entity_type, v_observation.entity_id::text,
    'staff', p_actor,
    jsonb_build_object('observationId', p_observation_id, 'body', v_observation.body),
    v_observation.organization_id
  );

  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.staff_delete_observation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_observation(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- El cambio de estado deja su motivo también en el hilo
-- ---------------------------------------------------------------------------
--
-- Se reescriben las dos RPC de corrección manual conservando su comportamiento
-- entero (mismas validaciones, mismos efectos sobre la orden, misma auditoría)
-- y agregando el asiento en `domain_observations`. Así el hilo queda completo
-- sin que el panel tenga que escribir dos veces ni recordar hacerlo.

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

  v_organization_id := v_registration.organization_id;

  -- El motivo entra al hilo con el estado que lo motivó. `status_change` es lo
  -- que distingue "esto lo escribió alguien al mover el estado" de una
  -- observación suelta.
  insert into public.domain_observations (
    organization_id, entity_type, entity_id, body, status_change, author
  )
  values (
    v_organization_id, 'registration', p_registration_id, trim(p_reason), p_status, p_actor
  );

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
        updated_at = now()
    where id = v_registration.payment_order_id
    returning * into v_order;
  end if;

  perform plu_private.record_domain_audit(
    'registration.status_changed', 'event_registration', p_registration_id::text,
    'staff', p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'status', p_status,
      'reason', trim(p_reason),
      'channel', p_channel
    ),
    v_organization_id
  );

  return jsonb_build_object('registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.staff_set_registration_status(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_registration_status(uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Lectura del hilo
-- ---------------------------------------------------------------------------
--
-- Devuelve las observaciones de un lote de entidades en una sola consulta: la
-- lista del panel muestra 200 filas y pedir el hilo de cada una sería 200
-- roundtrips. `p_limit_per_entity` acota lo que viaja para la celda (que sólo
-- necesita la última y el total); la ficha pide el hilo entero con un límite
-- alto.

create or replace function public.list_domain_observations(
  p_entity_type text,
  p_entity_ids uuid[],
  p_limit_per_entity int default 50
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(ranked) - 'row_number' order by ranked.created_at desc),
    '[]'::jsonb
  )
  from (
    select
      o.*,
      row_number() over (partition by o.entity_id order by o.created_at desc) as row_number
    from public.domain_observations o
    where o.entity_type = p_entity_type
      and o.entity_id = any(p_entity_ids)
  ) ranked
  where ranked.row_number <= greatest(p_limit_per_entity, 1);
$$;

revoke all on function public.list_domain_observations(text, uuid[], int)
  from public, anon, authenticated;
grant execute on function public.list_domain_observations(text, uuid[], int) to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_source text;
begin
  if to_regclass('public.domain_observations') is null then
    raise exception 'La tabla de observaciones no se creo.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.staff_add_observation(text,uuid,text,text)') is null
     or to_regprocedure('public.staff_delete_observation(uuid,text)') is null
     or to_regprocedure('public.list_domain_observations(text,uuid[],int)') is null then
    raise exception 'Faltan funciones del hilo de observaciones.' using errcode = 'PLU01';
  end if;

  -- El cambio de estado tiene que seguir dejando su motivo en el hilo: si
  -- alguien reescribe la RPC más adelante sin este insert, el historial se
  -- corta en silencio y nadie se entera hasta que falta una observación.
  --
  -- Se busca por firma y no por nombre: conviven dos `staff_set_registration_status`
  -- (la real y el tombstone de 20260917100000, que sólo lanza la excepción que
  -- explica cómo llamarla). Buscar por nombre devolvía cualquiera de las dos y
  -- esta verificación fallaba contra el tombstone, que obviamente no escribe
  -- ninguna observación.
  select prosrc into v_source
  from pg_proc
  where oid = to_regprocedure('public.staff_set_registration_status(uuid,text,text,text,text)');
  if v_source is null or v_source not like '%domain_observations%' then
    raise exception 'staff_set_registration_status ya no asienta la observacion.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
