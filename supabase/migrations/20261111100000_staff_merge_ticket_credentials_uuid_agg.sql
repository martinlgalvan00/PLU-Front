-- `supabase db lint` falla al validar `staff_merge_ticket_type_credentials`
-- porque `min(uuid)` no existe. Mismo arreglo que en combos/ofertas:
-- `array_agg` + cardinality, sin elegir un id al azar cuando hay más de uno.

create or replace function public.staff_merge_ticket_type_credentials(
  p_event_slug text,
  p_credentials jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_entry jsonb;
  v_credential jsonb;
  v_type_id uuid;
  v_type_ids uuid[];
  v_scopes text[];
  v_index int;
  v_sort_order int;
  v_seen uuid[] := array[]::uuid[];
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if jsonb_typeof(p_credentials) <> 'array' then
    raise exception 'Formato de credenciales inválido.' using errcode = 'PLU01';
  end if;

  for v_entry in select value from jsonb_array_elements(p_credentials)
  loop
    v_type_id := nullif(v_entry ->> 'ticketTypeId', '')::uuid;

    -- Un tipo de entrada recién creado todavía no tiene id: `staff_save_event`
    -- no devuelve los tipos, así que el panel manda el `sortOrder` con el que
    -- lo guardó y lo resolvemos acá. Sin esto, las credenciales de un tipo
    -- nuevo recién se podrían cargar en un segundo guardado.
    if v_type_id is null then
      v_sort_order := nullif(v_entry ->> 'sortOrder', '')::int;
      if v_sort_order is null then
        raise exception 'Falta el tipo de entrada.' using errcode = 'PLU01';
      end if;

      -- `array_agg` y no `min(id)`: uuid no tiene agregado de mínimo, y contar
      -- primero para elegir después repetiría el filtro de posición.
      select array_agg(id) into v_type_ids
      from public.ticket_types
      where event_id = v_event.id and sort_order = v_sort_order;

      if v_type_ids is null or cardinality(v_type_ids) = 0 then
        raise exception 'No se encontró el tipo de entrada en la posición %.', v_sort_order
          using errcode = 'PLU01';
      end if;
      if cardinality(v_type_ids) > 1 then
        raise exception 'Hay más de un tipo de entrada en la posición %.', v_sort_order
          using errcode = 'PLU01';
      end if;
      v_type_id := v_type_ids[1];
    end if;

    if not exists (
      select 1 from public.ticket_types where id = v_type_id and event_id = v_event.id
    ) then
      raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
    end if;
    if v_type_id = any(v_seen) then
      raise exception 'El tipo de entrada está repetido.' using errcode = 'PLU01';
    end if;
    v_seen := array_append(v_seen, v_type_id);

    if jsonb_typeof(v_entry -> 'credentials') <> 'array'
       or jsonb_array_length(v_entry -> 'credentials') < 1 then
      raise exception 'Cada tipo de entrada necesita al menos una credencial.' using errcode = 'PLU01';
    end if;
    -- Un tope bajo a propósito: más de cuatro credenciales por compra no es un
    -- caso real de un meet, y sí sería una forma cómoda de inflar el aforo.
    if jsonb_array_length(v_entry -> 'credentials') > 4 then
      raise exception 'Una entrada no puede emitir más de 4 credenciales.' using errcode = 'PLU01';
    end if;

    delete from public.ticket_type_credentials where ticket_type_id = v_type_id;

    v_index := 0;
    for v_credential in select value from jsonb_array_elements(v_entry -> 'credentials')
    loop
      if coalesce(length(btrim(v_credential ->> 'label')), 0) < 1 then
        raise exception 'Cada credencial necesita un nombre.' using errcode = 'PLU01';
      end if;

      select coalesce(array_agg(distinct scope), array[]::text[])
        into v_scopes
      from jsonb_array_elements_text(coalesce(v_credential -> 'zoneScopes', '[]'::jsonb)) scope;

      if array_length(v_scopes, 1) is null then
        raise exception 'La credencial "%" no abre ninguna zona.', btrim(v_credential ->> 'label')
          using errcode = 'PLU01';
      end if;
      if not (v_scopes <@ array['gate_tickets', 'athletes_only', 'athletes_coaches', 'staff_only']) then
        raise exception 'Zona inválida en la credencial "%".', btrim(v_credential ->> 'label')
          using errcode = 'PLU01';
      end if;

      insert into public.ticket_type_credentials (ticket_type_id, label, zone_scopes, sort_order)
      values (v_type_id, btrim(v_credential ->> 'label'), v_scopes, v_index);

      v_index := v_index + 1;
    end loop;
  end loop;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ticketTypeId', c.ticket_type_id,
      'id', c.id,
      'label', c.label,
      'zoneScopes', to_jsonb(c.zone_scopes),
      'sortOrder', c.sort_order
    ) order by c.ticket_type_id, c.sort_order), '[]'::jsonb)
    from public.ticket_type_credentials c
    join public.ticket_types t on t.id = c.ticket_type_id
    where t.event_id = v_event.id
  );
end;
$$;

revoke all on function public.staff_merge_ticket_type_credentials(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.staff_merge_ticket_type_credentials(text, jsonb)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_ticket_type_credentials(text,jsonb)') is null then
    raise exception 'staff_merge_ticket_type_credentials no quedó instalada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
