-- Control operativo de la afiliación desde el panel.
--
-- `MembershipsSection` era una tabla de solo lectura: no había forma de activar
-- una afiliación de cortesía, corregir una mal cargada ni dar de baja a un
-- socio sin editar la fila a mano en la base. Lo único que existía era la
-- aprobación de una orden de pago, que no cubre los casos sin cobro.
--
-- Toda acción manual queda auditada con el responsable: es exactamente lo que
-- hay que poder reconstruir ante un reclamo.

create or replace function public.staff_set_membership_status(
  p_membership_id uuid,
  p_status text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships;
  v_previous text;
  v_plan public.membership_plans;
  v_start date;
  v_end date;
  v_duration int;
begin
  if p_status not in ('activa', 'cancelada') then
    raise exception 'Estado de afiliacion no permitido desde el panel.' using errcode = 'PLU01';
  end if;

  select * into v_membership from public.memberships
  where id = p_membership_id for update;
  if not found then
    raise exception 'Afiliacion no encontrada.' using errcode = 'PLU02';
  end if;

  v_previous := v_membership.status;
  if v_previous = p_status then
    return jsonb_build_object('membership', to_jsonb(v_membership), 'duplicate', true);
  end if;

  if p_status = 'activa' then
    select * into v_plan from public.membership_plans where id = v_membership.plan_id;
    -- Duración del plan; sin plan asociado, un año.
    v_duration := case
      when v_plan.id is null then 365
      when v_plan.billing_frequency = 'monthly' then 30 * coalesce(v_plan.interval_count, 1)
      else 365 * coalesce(v_plan.interval_count, 1)
    end;

    -- Una activación manual sobre un período ya vencido (o sin fechas) abre uno
    -- nuevo desde hoy. Si el período todavía cubre, se respeta: activar a mano
    -- no puede acortar ni correr una vigencia que el socio ya pagó.
    if v_membership.expiration_date is null or v_membership.expiration_date < current_date then
      v_start := current_date;
      v_end := current_date + v_duration;
    else
      v_start := coalesce(v_membership.start_date, current_date);
      v_end := v_membership.expiration_date;
    end if;

    update public.memberships
    set status = 'activa',
        start_date = v_start,
        expiration_date = v_end,
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

    update public.athletes
    set status = 'afiliado_activo', updated_at = now()
    where id = v_membership.athlete_id;
  else
    update public.memberships
    set status = 'cancelada', updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

    -- El atleta solo vuelve a "registrado" si no le queda ninguna otra
    -- afiliación vigente: dar de baja la de 2026 no puede desafiliar a alguien
    -- que ya tiene paga la de 2027.
    if not exists (
      select 1 from public.memberships m
      where m.athlete_id = v_membership.athlete_id
        and m.id <> p_membership_id
        and m.status = 'activa'
        and coalesce(m.expiration_date, current_date - 1) >= current_date
    ) then
      update public.athletes
      set status = 'registrado', updated_at = now()
      where id = v_membership.athlete_id;
    end if;
  end if;

  perform plu_private.record_domain_audit(
    case when p_status = 'activa' then 'membership.activated_manually'
         else 'membership.cancelled_manually' end,
    'membership',
    p_membership_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'memberCode', v_membership.member_code,
      'startDate', v_membership.start_date,
      'expirationDate', v_membership.expiration_date
    ),
    v_membership.organization_id
  );

  return jsonb_build_object('membership', to_jsonb(v_membership), 'duplicate', false);
end;
$$;

revoke all on function public.staff_set_membership_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_membership_status(uuid, text, text)
  to service_role;
