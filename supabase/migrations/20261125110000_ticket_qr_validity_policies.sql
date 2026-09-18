-- Políticas configurables de vigencia para QR de entradas.
--
-- Una entrada sigue siendo de un solo check-in. Por eso la duración relativa
-- se cuenta desde la acreditación del pago (momento en que el derecho existe),
-- no desde el escaneo que ya consume la entrada. La ventana resultante queda
-- guardada en tickets y nunca cambia si luego se edita el catálogo.

alter table public.ticket_types
  add column if not exists qr_validity_mode text not null default 'event_days',
  add column if not exists qr_validity_duration_minutes integer null;

update public.ticket_types
set qr_validity_mode = case
  when valid_from is not null or valid_until is not null then 'fixed_window'
  else 'event_days'
end,
qr_validity_duration_minutes = null
where qr_validity_mode not in ('event_days', 'fixed_window', 'from_payment')
   or (qr_validity_mode = 'event_days' and (valid_from is not null or valid_until is not null));

alter table public.ticket_types
  drop constraint if exists ticket_types_qr_validity_policy_check;
alter table public.ticket_types
  add constraint ticket_types_qr_validity_policy_check
  check (
    (qr_validity_mode = 'event_days'
      and valid_from is null and valid_until is null
      and qr_validity_duration_minutes is null)
    or (qr_validity_mode = 'fixed_window'
      and valid_from is not null and valid_until is not null and valid_until > valid_from
      and qr_validity_duration_minutes is null)
    or (qr_validity_mode = 'from_payment'
      and valid_from is null and valid_until is null
      and qr_validity_duration_minutes between 1 and 527040)
  );

comment on column public.ticket_types.qr_validity_mode is
  'event_days, fixed_window o from_payment; define cómo se calcula cada QR nuevo.';
comment on column public.ticket_types.qr_validity_duration_minutes is
  'Sólo from_payment: duración en minutos desde la acreditación del pago.';

alter table public.tickets
  add column if not exists qr_validity_mode text not null default 'fixed_window',
  add column if not exists qr_validity_duration_minutes integer null;

alter table public.tickets
  drop constraint if exists tickets_qr_validity_policy_check;
alter table public.tickets
  add constraint tickets_qr_validity_policy_check
  check (
    (qr_validity_mode in ('event_days', 'fixed_window') and qr_validity_duration_minutes is null)
    or (qr_validity_mode = 'from_payment' and qr_validity_duration_minutes between 1 and 527040)
  );

comment on column public.tickets.qr_validity_mode is
  'Snapshot de la política aplicada al QR; no se reevalúa desde el catálogo.';
comment on column public.tickets.qr_validity_duration_minutes is
  'Snapshot de duración para QR desde pago; permite auditoría sin leer el tipo actual.';

create or replace function plu_private.set_ticket_validity_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_until timestamptz;
  v_mode text;
  v_duration integer;
begin
  -- En cada INSERT se toma una foto del tipo vigente. Ningún update posterior
  -- del tipo puede modificar el QR emitido.
  select tt.qr_validity_mode, tt.qr_validity_duration_minutes
    into v_mode, v_duration
  from public.ticket_types tt
  where tt.id = new.ticket_type_id and tt.event_id = new.event_id;

  if not found then
    raise exception 'No se encontró el tipo de entrada para la vigencia del QR.'
      using errcode = 'PLU01';
  end if;

  select w.valid_from, w.valid_until
    into v_from, v_until
  from plu_private.resolve_ticket_validity_window(new.ticket_type_id, new.event_id) w;

  if v_from is null or v_until is null or v_until <= v_from then
    raise exception 'No se pudo determinar la vigencia del QR de la entrada.'
      using errcode = 'PLU01';
  end if;

  new.qr_validity_mode := coalesce(v_mode, 'event_days');
  new.qr_validity_duration_minutes := v_duration;
  -- Para from_payment queda una ventana provisional e inaccesible: el trigger
  -- de acreditación la reemplaza atómicamente antes de que pase a pagada.
  new.valid_from := v_from;
  new.valid_until := v_until;
  return new;
end;
$$;

create or replace function plu_private.activate_ticket_validity_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz;
begin
  if new.status = 'pagada'
     and old.status is distinct from 'pagada'
     and new.qr_validity_mode = 'from_payment' then
    if new.qr_validity_duration_minutes is null then
      raise exception 'Falta la duración del QR desde acreditación.' using errcode = 'PLU01';
    end if;
    v_now := clock_timestamp();
    new.valid_from := v_now;
    new.valid_until := v_now + make_interval(mins => new.qr_validity_duration_minutes);
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_activate_validity_on_payment on public.tickets;
create trigger tickets_activate_validity_on_payment
before update of status on public.tickets
for each row execute function plu_private.activate_ticket_validity_on_payment();

create or replace function public.staff_merge_ticket_type_validity_policy(
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
  v_mode text;
  v_duration integer;
  v_from timestamptz;
  v_until timestamptz;
  v_count int := 0;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  if jsonb_typeof(coalesce(p_types, '[]'::jsonb)) <> 'array' then
    raise exception 'Las políticas de vigencia QR son inválidas.' using errcode = 'PLU01';
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

    v_mode := coalesce(nullif(trim(v_type ->> 'validityMode'), ''), 'event_days');
    if v_mode not in ('event_days', 'fixed_window', 'from_payment') then
      raise exception 'La política de vigencia QR es inválida.' using errcode = 'PLU01';
    end if;
    begin
      v_duration := nullif(trim(v_type ->> 'validityDurationMinutes'), '')::integer;
    exception when others then
      raise exception 'La duración del QR es inválida.' using errcode = 'PLU01';
    end;

    select valid_from, valid_until into v_from, v_until
    from public.ticket_types where id = v_type_id for update;

    if v_mode = 'fixed_window' and (v_from is null or v_until is null or v_until <= v_from) then
      raise exception 'La ventana fija del QR necesita inicio y fin válidos.' using errcode = 'PLU01';
    end if;
    if v_mode = 'from_payment' and (v_duration is null or v_duration not between 1 and 527040) then
      raise exception 'La duración del QR debe estar entre 1 minuto y 366 días.' using errcode = 'PLU01';
    end if;
    if v_mode in ('event_days', 'from_payment') and (v_from is not null or v_until is not null) then
      raise exception 'Esta política de QR no puede tener una ventana fija.' using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set qr_validity_mode = v_mode,
        qr_validity_duration_minutes = case when v_mode = 'from_payment' then v_duration else null end,
        updated_at = now()
    where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'event.ticket_qr_validity_policy_updated', 'event', v_event_id::text,
    'staff', left(p_actor, 200), jsonb_build_object('ticketTypes', v_count)
  );

  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

-- Reemplaza el merge anterior para guardar la ventana y su política en un
-- único UPDATE. Sin esta atomicidad, pasar de jornadas a ventana fija (o de
-- ventana fija a duración) chocaría de forma transitoria con el CHECK.
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
  v_mode text;
  v_duration integer;
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
      v_duration := nullif(trim(v_type ->> 'validityDurationMinutes'), '')::integer;
    exception when others then
      raise exception 'La vigencia o duración del QR es inválida.' using errcode = 'PLU01';
    end;
    v_mode := coalesce(
      nullif(trim(v_type ->> 'validityMode'), ''),
      case when v_from is not null or v_until is not null then 'fixed_window' else 'event_days' end
    );

    if v_mode not in ('event_days', 'fixed_window', 'from_payment') then
      raise exception 'La política de vigencia QR es inválida.' using errcode = 'PLU01';
    end if;
    if v_mode = 'fixed_window' and (v_from is null or v_until is null or v_until <= v_from) then
      raise exception 'La ventana fija del QR necesita inicio y fin válidos.' using errcode = 'PLU01';
    end if;
    if v_mode in ('event_days', 'from_payment') and (v_from is not null or v_until is not null) then
      raise exception 'Esta política de QR no puede tener una ventana fija.' using errcode = 'PLU01';
    end if;
    if v_mode = 'from_payment' and (v_duration is null or v_duration not between 1 and 527040) then
      raise exception 'La duración del QR debe estar entre 1 minuto y 366 días.' using errcode = 'PLU01';
    end if;

    update public.ticket_types
    set valid_from = case when v_mode = 'fixed_window' then v_from else null end,
        valid_until = case when v_mode = 'fixed_window' then v_until else null end,
        qr_validity_mode = v_mode,
        qr_validity_duration_minutes = case when v_mode = 'from_payment' then v_duration else null end,
        updated_at = now()
    where id = v_type_id;
    v_count := v_count + 1;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'event.ticket_qr_validity_policy_updated', 'event', v_event_id::text,
    'staff', left(p_actor, 200), jsonb_build_object('ticketTypes', v_count)
  );
  return jsonb_build_object('eventId', v_event_id, 'updated', v_count);
end;
$$;

revoke all on function public.staff_merge_ticket_type_validity_policy(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_merge_ticket_type_validity_policy(text, jsonb, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_ticket_type_validity_policy(text,jsonb,text)') is null then
    raise exception 'Falta staff_merge_ticket_type_validity_policy.';
  end if;
  if to_regprocedure('plu_private.activate_ticket_validity_on_payment()') is null then
    raise exception 'Falta el activador de vigencia desde pago.';
  end if;
end
$verification$;
