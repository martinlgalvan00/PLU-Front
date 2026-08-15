-- El efectivo de una afiliación se cobra presencialmente en el torneo que
-- publica su mismo plan. `cash_checkout_deadline` elegía antes el primer
-- evento publicado de toda la organización; si quedaba un evento menor antes
-- de Pitbull, la afiliación vencía allí aunque se hubiese creado para pagar en
-- Pitbull. El cron de vencimientos podía cancelarla antes del meet.
--
-- Una inscripción ya trae su `event_registration` y conserva prioridad. Para
-- afiliaciones sueltas se sigue el vínculo orden -> membership -> plan ->
-- combo offer -> evento. El fallback se mantiene para planes sin oferta.
create or replace function plu_private.cash_checkout_deadline(p_order_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select greatest(
    now() + interval '1 day',
    coalesce(
      (
        select e.ends_at + interval '1 day'
        from public.event_registrations r
        join public.events e on e.id = r.event_id
        where r.payment_order_id = p_order_id
        order by e.starts_at
        limit 1
      ),
      (
        select e.ends_at + interval '1 day'
        from public.memberships m
        join public.event_combo_offers o on o.membership_plan_id = m.plan_id
        join public.events e on e.id = o.event_id
        where m.payment_order_id = p_order_id
          and o.active
          and e.published
          and e.ends_at >= now()
        order by e.starts_at
        limit 1
      ),
      (
        select e.ends_at + interval '1 day'
        from public.events e
        where e.published and e.ends_at >= now()
        order by e.starts_at
        limit 1
      ),
      now() + interval '30 days'
    )
  );
$$;

revoke all on function plu_private.cash_checkout_deadline(uuid)
  from public, anon, authenticated;

-- También repara órdenes abiertas creadas antes de esta corrección. Las
-- órdenes canceladas no se reviven: podrían haber sido reemplazadas.
do $$
declare
  v_touched int;
begin
  with extended as (
    update public.athlete_payment_orders o
    set expires_at = plu_private.cash_checkout_deadline(o.id),
        updated_at = now()
    where o.method = 'manual_link'
      and o.manual_payment_channel = 'cash_pitbull'
      and o.status in ('pendiente', 'validacion_manual')
      and o.expires_at < plu_private.cash_checkout_deadline(o.id)
    returning o.id
  )
  select count(*) into v_touched from extended;

  raise notice 'Órdenes de efectivo recalculadas por torneo vinculado: %', v_touched;
end;
$$;

do $verification$
begin
  if to_regprocedure('plu_private.cash_checkout_deadline(uuid)') is null then
    raise exception 'El vencimiento de efectivo no fue actualizado.' using errcode = 'PLU01';
  end if;
end
$verification$;
