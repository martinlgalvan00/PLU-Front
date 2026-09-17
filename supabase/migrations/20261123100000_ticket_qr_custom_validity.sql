-- Vigencia horaria personalizable para QR de entradas.
--
-- El vínculo a jornadas sigue siendo el default operativo. Este override existe
-- para acreditaciones que abren una franja más corta (por ejemplo, pesaje o
-- calentamiento) sin tener que crear una jornada artificial. La ventana se
-- copia a tickets.valid_from/valid_until al emitir: nunca reescribe QR ya
-- entregados.

alter table public.ticket_types
  add column if not exists valid_from timestamptz null,
  add column if not exists valid_until timestamptz null;

alter table public.ticket_types
  drop constraint if exists ticket_types_custom_validity_check;
alter table public.ticket_types
  add constraint ticket_types_custom_validity_check
  check (
    (valid_from is null and valid_until is null)
    or (valid_from is not null and valid_until is not null and valid_until > valid_from)
  );

comment on column public.ticket_types.valid_from is
  'Inicio opcional de vigencia para nuevos QR. Nulo: se deriva de las jornadas.';
comment on column public.ticket_types.valid_until is
  'Fin exclusivo opcional de vigencia para nuevos QR. Nulo: se deriva de las jornadas.';

create or replace function plu_private.resolve_ticket_validity_window(
  p_ticket_type_id uuid,
  p_event_id uuid
)
returns table(valid_from timestamptz, valid_until timestamptz)
language sql
stable
set search_path = public
as $$
  with ticket_type as (
    select valid_from as custom_from, valid_until as custom_until
    from public.ticket_types
    where id = p_ticket_type_id and event_id = p_event_id
  ), day_bounds as (
    select min(d.date) as first_day, max(d.date) as last_day
    from public.ticket_type_days td
    join public.event_days d on d.id = td.event_day_id
    where td.ticket_type_id = p_ticket_type_id
      and d.event_id = p_event_id
      and d.date is not null
  )
  select
    coalesce(t.custom_from, b.first_day::timestamp at time zone 'America/Argentina/Buenos_Aires', e.starts_at),
    coalesce(t.custom_until, (b.last_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires', e.ends_at)
  from public.events e
  cross join ticket_type t
  cross join day_bounds b
  where e.id = p_event_id;
$$;

create or replace function public.staff_merge_ticket_type_validity(
  p_event_slug text,
  p_types jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_type jsonb;
  v_type_id uuid;
  v_from timestamptz;
  v_until timestamptz;
  v_count int := 0;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  if jsonb_typeof(coalesce(p_types, '[]'::jsonb)) <> 'array' then
    raise exception 'Las vigencias de QR son inválidas.' using errcode = 'PLU01';
  end if;

  for v_type in select * from jsonb_array_elements(coalesce(p_types, '[]'::jsonb))
  loop
    v_type_id := null;
    if nullif(v_type ->> 'ticketTypeId', '') is not null then
      select id into v_type_id from public.ticket_types
      where id = (v_type ->> 'ticketTypeId')::uuid and event_id = v_event_id;
    else
      select id into v_type_id from public.ticket_types
      where event_id = v_event_id
        and sort_order = coalesce((v_type ->> 'sortOrder')::int, 0)
      order by created_at desc
      limit 1;
    end if;
    if v_type_id is null then
      raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
    end if;

    begin
      v_from := nullif(trim(v_type ->> 'validFrom'), '')::timestamptz;
      v_until := nullif(trim(v_type ->> 'validUntil'), '')::timestamptz;
    exception when others then
      raise exception 'La fecha de vigencia del QR es inválida.' using errcode = 'PLU01';
    end;
    if (v_from is null) <> (v_until is null) then
      raise exception 'Completá inicio y fin de vigencia del QR, o dejá ambos vacíos.' using errcode = 'PLU01';
    end if;
    if v_from is not null and v_until <= v_from then
      raise exception 'El vencimiento del QR debe ser posterior al inicio.' using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set valid_from = v_from, valid_until = v_until, updated_at = now()
    where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'event.ticket_qr_validity_updated', 'event', v_event_id::text,
    'staff', left(p_actor, 200), jsonb_build_object('ticketTypes', v_count)
  );

  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

revoke all on function public.staff_merge_ticket_type_validity(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_merge_ticket_type_validity(text, jsonb, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_ticket_type_validity(text,jsonb,text)') is null then
    raise exception 'Falta staff_merge_ticket_type_validity.';
  end if;
  if position('custom_from' in pg_get_functiondef(
    'plu_private.resolve_ticket_validity_window(uuid,uuid)'::regprocedure
  )) = 0 then
    raise exception 'La vigencia personalizada no llega al snapshot del QR.';
  end if;
end
$verification$;
