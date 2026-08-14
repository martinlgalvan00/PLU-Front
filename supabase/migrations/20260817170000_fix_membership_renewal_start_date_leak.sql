-- ---------------------------------------------------------------------------
-- create_membership_order_v2: no arrastrar start_date de ordenes canceladas
--
-- v_existing se calculaba con `status <> 'pendiente_pago'`, lo que incluia
-- 'cancelada' y 'reembolsada'. Una orden de Mercado Pago cancelada deja una
-- fila de membership con expiration_date en el futuro (la fecha que hubiera
-- cubierto de haberse acreditado el pago); si esa fila tenia la
-- expiration_date mas lejana del atleta, la siguiente orden -esta si pagada-
-- heredaba `expiration_date + 1` como start_date, programando una afiliacion
-- ya paga para varios dias despues. El comentario original ("se calcula
-- sobre el ultimo periodo realmente cobrado") ya dejaba claro que solo
-- 'activa'/'vencida' deberian contar; el filtro no lo reflejaba.
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_v2(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_existing public.memberships;
  v_pending public.memberships;
  v_same_year public.memberships;
  v_start date;
  v_end date;
  v_year text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_plan from public.membership_plans where code = p_plan_code and active = true;
  if not found then raise exception 'Plan de afiliacion no encontrado.' using errcode = 'PLU02'; end if;
  if v_plan.collection_mode = 'recurring' and p_payment_method <> 'mercado_pago' then
    raise exception 'Los planes recurrentes requieren Mercado Pago.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select m.* into v_membership from public.membership_order_targets t
      join public.memberships m on m.id = t.membership_id where t.order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', true);
  end if;

  -- Cualquier afiliación impaga del atleta se reusa. Filtrar solo por plan_id
  -- dejaba la fila del año ocupada y el INSERT siguiente chocaba con
  -- memberships_athlete_id_year_key al cambiar anual ↔ automática.
  select m.* into v_pending from public.memberships m
  where m.athlete_id = p_athlete_id and m.status = 'pendiente_pago'
  order by
    case when m.plan_id is not distinct from v_plan.id then 0 else 1 end,
    m.created_at desc
  limit 1 for update;

  -- La renovación se calcula sobre el último período realmente cobrado:
  -- 'cancelada' (orden de MP cancelada antes de acreditarse) y 'reembolsada'
  -- no cuentan, aunque su expiration_date quede en el futuro.
  select m.* into v_existing from public.memberships m
  where m.athlete_id = p_athlete_id and m.status in ('activa', 'vencida')
  order by m.expiration_date desc nulls last limit 1 for update;

  -- Reusar una orden abierta evita dobles cobros aunque el browser haya
  -- perdido su clave original antes de reintentar. El medio de pago forma
  -- parte de la identidad de la orden.
  select o.* into v_order from public.athlete_payment_orders o
  join public.membership_order_targets t on t.order_id = o.id
  join public.memberships m on m.id = t.membership_id
  where m.athlete_id = p_athlete_id and m.plan_id = v_plan.id
    and o.method = p_payment_method
    and o.status in ('pendiente', 'validacion_manual')
    and coalesce(o.expires_at, now() + interval '1 minute') > now()
  order by o.created_at desc limit 1;
  if found then
    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(coalesce(v_membership, v_pending, v_existing)),
      'plan', to_jsonb(v_plan),
      'duplicate', true
    );
  end if;

  -- Cambió de medio: la orden abierta del medio anterior se cancela.
  update public.athlete_payment_orders o
  set status = 'cancelado', updated_at = now()
  from public.membership_order_targets t
  join public.memberships m on m.id = t.membership_id
  where t.order_id = o.id
    and m.athlete_id = p_athlete_id
    and m.plan_id = v_plan.id
    and o.method <> p_payment_method
    and o.status in ('pendiente', 'validacion_manual');

  if v_pending.id is not null then
    v_start := v_pending.start_date;
    v_end := v_pending.expiration_date;
    v_year := v_pending.year;
  else
    v_start := greatest(current_date, coalesce(v_existing.expiration_date + 1, current_date));
    v_end := case when v_plan.billing_frequency = 'monthly'
      then (v_start + make_interval(months => v_plan.interval_count))::date
      else (v_start + make_interval(years => v_plan.interval_count))::date end;
    v_year := extract(year from v_start)::int::text;
  end if;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'membership', v_plan.price, v_plan.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'MORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  if v_pending.id is not null then
    update public.memberships
    set payment_order_id = v_order.id,
        plan_id = v_plan.id,
        updated_at = now()
    where id = v_pending.id
    returning * into v_membership;
  else
    select m.* into v_same_year from public.memberships m
    where m.athlete_id = p_athlete_id and m.year = v_year
    for update;

    if v_same_year.id is not null then
      if v_same_year.status = 'activa'
         and v_same_year.start_date <= current_date
         and coalesce(v_same_year.expiration_date, current_date) >= current_date then
        raise exception 'El atleta ya tiene una afiliacion vigente para este periodo.'
          using errcode = 'PLU13';
      end if;
      if v_same_year.status = 'activa' and v_same_year.start_date > current_date then
        raise exception 'El atleta ya tiene una afiliacion programada para este periodo.'
          using errcode = 'PLU13';
      end if;

      -- Cancelada / reembolsada / vencida (o activa ya vencida): se reabre el
      -- mismo año en pendiente_pago en vez de insertar otra fila.
      update public.memberships
      set status = 'pendiente_pago',
          start_date = v_start,
          expiration_date = v_end,
          payment_order_id = v_order.id,
          plan_id = v_plan.id,
          updated_at = now()
      where id = v_same_year.id
      returning * into v_membership;
    else
      begin
        insert into public.memberships (
          athlete_id, year, status, start_date, expiration_date, member_code,
          payment_order_id, plan_id
        ) values (
          p_athlete_id, v_year, 'pendiente_pago', v_start, v_end,
          'PLU-ARG-' || v_year || '-' || lpad(nextval('public.membership_code_seq')::text, 8, '0'),
          v_order.id, v_plan.id
        ) returning * into v_membership;
      exception
        when unique_violation then
          -- Carrera: otra sesión ocupó el año entre el SELECT y el INSERT.
          select m.* into v_same_year from public.memberships m
          where m.athlete_id = p_athlete_id and m.year = v_year
          for update;
          if not found then
            raise;
          end if;
          if v_same_year.status = 'activa'
             and (
               v_same_year.start_date > current_date
               or (
                 v_same_year.start_date <= current_date
                 and coalesce(v_same_year.expiration_date, current_date) >= current_date
               )
             ) then
            raise exception 'El atleta ya tiene una afiliacion vigente o programada para este periodo.'
              using errcode = 'PLU13';
          end if;
          update public.memberships
          set status = 'pendiente_pago',
              start_date = v_start,
              expiration_date = v_end,
              payment_order_id = v_order.id,
              plan_id = v_plan.id,
              updated_at = now()
          where id = v_same_year.id
          returning * into v_membership;
      end;
    end if;
  end if;

  insert into public.membership_order_targets(order_id, membership_id, starts_at, ends_at)
  values (v_order.id, v_membership.id, v_start, v_end);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('membership_order.created', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('membershipId', v_membership.id, 'planCode', v_plan.code));

  return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', false);
end;
$$;

revoke all on function public.create_membership_order_v2(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_v2(uuid, text, text, text) to service_role;
