-- Cambiar Mercado Pago → transferencia después de abrir el brick
--
-- resume_pending_event_registration_checkout exigía provider_preference_id
-- null. El checkout embebido de inscripción crea (o puede heredar) una
-- preference apenas se abre el brick, así que el atleta que se arrepentía
-- no podía pasar a transferencia: el POST reanudaba la misma orden MP.
--
-- Una preference sin intento embedded en processing/submitted no es un
-- pago. Se permite el switch in-place y se limpia provider_preference_id
-- para no reusar un checkout MP viejo si más tarde vuelve a ese medio.

create or replace function public.resume_pending_event_registration_checkout(
  p_athlete_id uuid,
  p_event_id uuid,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_order public.athlete_payment_orders;
  v_can_switch boolean;
begin
  select * into v_registration
  from public.event_registrations
  where event_id = p_event_id
    and athlete_id = p_athlete_id
    and status <> 'cancelada'
  for update;
  if not found then
    return null;
  end if;

  if v_registration.status <> 'pendiente_pago' then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_registration.payment_order_id is not null then
    select * into v_order
    from public.athlete_payment_orders
    where id = v_registration.payment_order_id
    for update;
  end if;

  if v_order.id is not null and v_order.status = 'aprobado' then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_order.id is null
     or v_order.status not in ('pendiente', 'validacion_manual')
     or coalesce(v_order.expires_at, now() + interval '1 minute') <= now() then
    update public.event_registrations
    set status = 'cancelada', updated_at = now()
    where id = v_registration.id;
    if v_order.id is not null and v_order.status in ('pendiente', 'validacion_manual') then
      update public.athlete_payment_orders
      set status = 'cancelado', updated_at = now()
      where id = v_order.id;
    end if;
    return null;
  end if;

  v_can_switch :=
    v_order.method is distinct from p_payment_method
    and v_order.payment_proof_path is null
    and not exists (
      select 1
      from public.embedded_payment_attempts a
      where a.order_kind = 'athlete'
        and a.order_id = v_order.id
        and a.status in ('processing', 'submitted')
    );

  if v_can_switch then
    update public.athlete_payment_orders
    set method = p_payment_method,
        status = public.athlete_payment_status_for_method(p_payment_method),
        provider_preference_id = null,
        expires_at = now() + case
          when p_payment_method = 'manual_link' then interval '1 day'
          else interval '30 minutes'
        end,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  end if;

  update public.event_registrations
  set division = p_division,
      category = p_category,
      bodyweight_kg = p_bodyweight_kg,
      updated_at = now()
  where id = v_registration.id
  returning * into v_registration;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'registration', to_jsonb(v_registration),
    'duplicate', true
  );
end;
$$;

revoke all on function public.resume_pending_event_registration_checkout(
  uuid, uuid, text, text, numeric, text
) from public, anon, authenticated;
