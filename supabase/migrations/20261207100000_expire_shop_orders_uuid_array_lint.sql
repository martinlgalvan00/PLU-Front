-- Corrige el warning de plpgsql_check en expire_shop_orders:
-- `v_ids uuid[] := '{}'` inicializa con text; no hay assignment cast a uuid[].
-- Misma convención que el resto del schema: array[]::uuid[].

create or replace function public.expire_shop_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
  v_ids uuid[] := array[]::uuid[];
begin
  for v_order in
    select * from public.shop_orders
    where status = 'pendiente'
      and expires_at < now()
      and (payment_pending_at is null or expires_at + interval '3 days' < now())
    order by expires_at
    limit 200
    for update skip locked
  loop
    perform plu_private.shop_release_order_stock(v_order.id);
    update public.shop_orders
    set status = 'vencido', updated_at = now(),
        cancel_reason = 'El pedido venció sin acreditarse el pago.'
    where id = v_order.id;
    perform plu_private.record_domain_audit(
      'shop.order_expired', 'shop_order', v_order.id::text, 'system', 'expire_shop_orders',
      jsonb_build_object('reference', v_order.reference, 'method', v_order.payment_method),
      v_order.organization_id
    );
    v_ids := v_ids || v_order.id;
  end loop;
  return jsonb_build_object('expired', coalesce(cardinality(v_ids), 0), 'orderIds', to_jsonb(v_ids));
end;
$$;
