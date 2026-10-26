-- Ventana de inscripción desde el control de venta — PLU ARG
--
-- El estado de la inscripción ya no se elige a mano: el staff decide "abrir
-- ahora", "programar apertura" o "cerrar", y el estado guardado se deriva de
-- eso más la ventana de fechas. "Programar" y "Abrir ahora" mueven la ventana
-- (`registration_opens_at` / `registration_closes_at`) sin pasar por
-- `staff_upsert_event`, que reescribe días y tipos de entrada.
--
-- Cada fecha se toca solo si su flag `p_set_*` viene en true: así `null`
-- significa "borrar la fecha" y no "no tocar". Queda auditado con el antes y
-- el después, igual que `staff_set_event_state`.
--
-- La API (`server/modules/events/eventRegistrationSaleStore.js`) cae a una
-- escritura directa si esta función todavía no existe en la base.

create or replace function public.staff_set_event_registration_window(
  p_event_slug text,
  p_set_opens boolean default false,
  p_opens_at timestamptz default null,
  p_set_closes boolean default false,
  p_closes_at timestamptz default null,
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
  v_opens timestamptz;
  v_closes timestamptz;
begin
  if not coalesce(p_set_opens, false) and not coalesce(p_set_closes, false) then
    raise exception 'No hay ningún cambio para aplicar.' using errcode = 'PLU01';
  end if;

  select * into v_before from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  v_opens := case when coalesce(p_set_opens, false) then p_opens_at else v_before.registration_opens_at end;
  v_closes := case when coalesce(p_set_closes, false) then p_closes_at else v_before.registration_closes_at end;

  if v_opens is not null and v_closes is not null and v_closes < v_opens then
    raise exception 'El cierre de la inscripción tiene que ser posterior a la apertura.'
      using errcode = 'PLU01';
  end if;

  update public.events set
    registration_opens_at = v_opens,
    registration_closes_at = v_closes,
    updated_at = now()
  where id = v_before.id
  returning * into v_event;

  perform plu_private.record_domain_audit(
    'event.registration_window_changed', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'opensAtFrom', v_before.registration_opens_at,
      'opensAtTo', v_event.registration_opens_at,
      'closesAtFrom', v_before.registration_closes_at,
      'closesAtTo', v_event.registration_closes_at
    ),
    v_event.organization_id
  );

  return jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

comment on function public.staff_set_event_registration_window(text, boolean, timestamptz, boolean, timestamptz, text) is
  'Control de venta: fija o borra la apertura/cierre de inscripción (p_set_* = tocar esa fecha). Auditado.';

revoke all on function public.staff_set_event_registration_window(text, boolean, timestamptz, boolean, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_registration_window(text, boolean, timestamptz, boolean, timestamptz, text)
  to service_role;
