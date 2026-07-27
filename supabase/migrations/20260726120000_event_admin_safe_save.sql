-- Guardado seguro del editor de eventos.
-- Separa alta de edición, conserva el slug estable y evita que dos operadores
-- pisen cambios entre sí. La escritura efectiva y la auditoría siguen viviendo
-- en staff_upsert_event.

create or replace function public.staff_save_event(p_event jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.events;
  v_requested_id uuid;
  v_requested_slug text;
  v_expected_updated_at timestamptz;
begin
  v_requested_id := nullif(p_event ->> 'id', '')::uuid;
  v_requested_slug := nullif(trim(p_event ->> 'slug'), '');
  v_expected_updated_at := nullif(p_event ->> 'expectedUpdatedAt', '')::timestamptz;

  if v_requested_slug is null then
    raise exception 'Falta el identificador público del evento.'
      using errcode = 'PLU01';
  end if;

  -- Serializa altas/ediciones del mismo slug. Así dos altas concurrentes no
  -- pueden atravesar juntas el chequeo y convertir la segunda en un update.
  perform pg_advisory_xact_lock(
    hashtextextended('staff_save_event:' || v_requested_slug, 0)
  );

  if v_requested_id is not null then
    select *
    into v_existing
    from public.events
    where id = v_requested_id
    for update;

    if not found then
      raise exception 'El evento ya no existe. Actualizá el listado antes de continuar.'
        using errcode = 'PLU02';
    end if;

    if v_existing.slug <> v_requested_slug then
      raise exception 'El identificador público del evento cambió. Actualizá el listado antes de continuar.'
        using errcode = 'PLU09';
    end if;

    if v_expected_updated_at is not null
       and v_existing.updated_at <> v_expected_updated_at then
      raise exception 'Otra persona modificó este evento. Actualizá el listado y revisá los cambios antes de guardar.'
        using errcode = 'PLU09';
    end if;
  elsif exists (
    select 1
    from public.events
    where slug = v_requested_slug
  ) then
    raise exception 'Ya existe un evento con ese título y año.'
      using errcode = 'PLU03';
  end if;

  return public.staff_upsert_event(p_event, p_actor);
end;
$$;

revoke all on function public.staff_save_event(jsonb, text)
from public, anon, authenticated;

grant execute on function public.staff_save_event(jsonb, text)
to service_role;
