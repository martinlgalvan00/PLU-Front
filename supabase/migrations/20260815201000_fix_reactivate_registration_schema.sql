-- Ajuste de compatibilidad: check-in vive en check_ins, no en event_registrations.

create or replace function public.create_competition_registration_v2(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_event public.events;
  v_order public.athlete_payment_orders;
  v_registration public.event_registrations;
  v_cancelled_registration public.event_registrations;
  v_count int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link')
     or p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
     or p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited')
     or (p_bodyweight_kg is not null and (p_bodyweight_kg < 20 or p_bodyweight_kg > 400)) then
    raise exception 'Datos de inscripcion invalidos.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;

  select * into v_event from public.events where slug = p_event_slug for update;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  if v_event.status = 'agotado' then
    raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
  end if;
  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados') then
    raise exception 'La inscripcion no esta abierta.' using errcode = 'PLU03';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at
     or v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'La inscripcion esta fuera de fecha.' using errcode = 'PLU03';
  end if;

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select * into v_registration from public.event_registrations where payment_order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  select * into v_registration from public.event_registrations
    where event_id = v_event.id and athlete_id = p_athlete_id and status <> 'cancelada';
  if found then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  select * into v_cancelled_registration from public.event_registrations
    where event_id = v_event.id and athlete_id = p_athlete_id and status = 'cancelada'
    order by updated_at desc nulls last, created_at desc
    limit 1
    for update;

  if v_event.capacity is not null then
    select count(*) into v_count from public.event_registrations
    where event_id = v_event.id and status in ('pendiente_pago', 'pagada', 'confirmada');
    if v_count >= v_event.capacity then
      raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
    end if;
  end if;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'registration', v_event.price, v_event.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'RORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  if v_cancelled_registration.id is not null then
    update public.event_registrations
       set division = p_division,
           category = p_category,
           bodyweight_kg = p_bodyweight_kg,
           status = 'pendiente_pago',
           payment_order_id = v_order.id,
           updated_at = now()
     where id = v_cancelled_registration.id
     returning * into v_registration;
  else
    insert into public.event_registrations (
      athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id
    ) values (
      p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg,
      'pendiente_pago', v_order.id
    ) returning * into v_registration;
  end if;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values (
    'registration.created',
    'event_registration',
    v_registration.id::text,
    'athlete',
    p_athlete_id::text,
    jsonb_build_object('eventId', v_event.id, 'orderId', v_order.id, 'reactivated', v_cancelled_registration.id is not null)
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  to service_role;
