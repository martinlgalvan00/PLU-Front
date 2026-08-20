-- Requisito de afiliación en el control de estado del evento — PLU ARG
--
-- `staff_set_event_state` existe para tocar una columna sin reescribir el
-- evento: el upsert completo (`staff_upsert_event`) recrea días, tandas y
-- tipos de entrada en cada pasada, así que usarlo para prender o apagar un
-- flag es pagar un efecto colateral que la operación no tiene por qué pagar.
--
-- Hasta acá el control cubría `status` y `published`, pero no
-- `requires_membership`. Consecuencia: habilitar o deshabilitar un meet como
-- "solo afiliados" era lo único de la operación diaria que obligaba a abrir el
-- editor completo, entrar a la tercera pestaña y guardar el evento entero —
-- con el riesgo de recrear la grilla de un evento que ya tiene atletas
-- asignados a tandas.
--
-- Se suma `p_requires_membership`. La firma vieja de cuatro argumentos se
-- borra: PostgREST resuelve por nombre de parámetro y con las dos
-- sobrecargas presentes una llamada que trae solo `p_event_slug` + `p_status`
-- queda ambigua (PGRST203). Es el mismo cuidado que ya tomaron
-- 20260824120000 y 20260824130000 con las sobrecargas de combo.
--
-- La auditoría registra el valor anterior y el nuevo: cambiar el requisito de
-- afiliación decide quién pasa por la puerta el día del meet
-- (`plu_private.gate_access`), y un cambio así tiene que poder reconstruirse
-- desde el log de dominio.

drop function if exists public.staff_set_event_state(text, text, boolean, text);

create or replace function public.staff_set_event_state(
  p_event_slug text,
  p_status text default null,
  p_published boolean default null,
  p_requires_membership boolean default null,
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
  if p_status is null and p_published is null and p_requires_membership is null then
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
    requires_membership = coalesce(p_requires_membership, requires_membership),
    updated_at = now()
  where id = v_before.id;

  -- Después del UPDATE: el trigger de capacidad ya pudo haber corregido el estado.
  select * into v_event from public.events where id = v_before.id;

  perform plu_private.record_domain_audit(
    'event.state_changed', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'statusFrom', v_before.status,
      'statusTo', v_event.status,
      'statusRequested', p_status,
      'publishedFrom', v_before.published,
      'publishedTo', v_event.published,
      'requiresMembershipFrom', v_before.requires_membership,
      'requiresMembershipTo', v_event.requires_membership
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'registered', plu_private.event_active_registrations(v_event.id),
    -- El panel necesita distinguir "no se aplicó" de "se aplicó y la base lo
    -- corrigió". Se compara contra lo que el operador esperaba ver: el estado
    -- pedido, o el previo si solo tocó `published` / `requires_membership` — el
    -- trigger corre ante la mención de la columna y puede reescribir el estado
    -- en cualquiera de los casos.
    'statusOverridden', v_event.status <> coalesce(p_status, v_before.status)
  );
end;
$$;

revoke all on function public.staff_set_event_state(text, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_state(text, text, boolean, boolean, text)
  to service_role;
