-- Flujo de pedidos de la tienda contra la base real: reserva de stock, precio
-- desde el catálogo, cupos de cursos, acreditación de Mercado Pago (idempotente
-- y con montos validados), pagos tardíos, operación del staff, vencimiento y
-- permisos. Termina en rollback.

begin;

do $flow$
declare
  v_hoodie uuid;
  v_cap uuid;
  v_course uuid;
  v_order jsonb;
  v_order2 jsonb;
  v_order3 jsonb;
  v_id uuid;
  v_res jsonb;
  v_failed boolean;
  v_hash text := repeat('a', 64);
  v_hash2 text := repeat('b', 64);
  v_stock int;
  v_size_stock int;
begin
  -- Catálogo de prueba
  v_hoodie := (public.upsert_shop_product(null, jsonb_build_object(
    'slug', 'flow-buzo', 'title', 'Buzo flow', 'category', 'apparel', 'price', 40000, 'status', 'published',
    'sizes', jsonb_build_array(jsonb_build_object('label', 'M', 'stock', 3), jsonb_build_object('label', 'L', 'stock', 1))
  ), 'test:admin')->>'id')::uuid;
  v_cap := (public.upsert_shop_product(null, jsonb_build_object(
    'slug', 'flow-gorra', 'title', 'Gorra flow', 'category', 'accessories', 'price', 15000, 'status', 'published', 'stock', 2
  ), 'test:admin')->>'id')::uuid;
  v_course := (public.upsert_shop_product(null, jsonb_build_object(
    'slug', 'flow-curso', 'title', 'Curso flow', 'category', 'course', 'price', 45000, 'status', 'published',
    'courseStartsAt', (now() + interval '30 days')::text, 'courseModality', 'online', 'courseCapacity', 1
  ), 'test:admin')->>'id')::uuid;

  -- 1. El precio sale del catálogo, no del cliente; se descuenta el stock del talle
  v_order := public.create_shop_order(
    jsonb_build_array(
      jsonb_build_object('productId', v_hoodie, 'sizeLabel', 'M', 'quantity', 2, 'unitPrice', 1),
      jsonb_build_object('productId', v_cap, 'quantity', 1)
    ),
    jsonb_build_object('name', 'Lucía Pérez', 'email', 'LUCIA@example.com', 'phone', '1155', 'note', 'retiro'),
    'cash_on_site', v_hash, 60
  );
  if (v_order->>'amount')::int <> 95000 then raise exception 'total inesperado: %', v_order->>'amount'; end if;
  if v_order->>'status' <> 'pendiente' then raise exception 'estado inicial inesperado'; end if;
  if v_order->>'reference' !~ '^TND-[A-Z2-9]{6}$' then raise exception 'referencia inesperada: %', v_order->>'reference'; end if;
  if v_order->>'buyerEmail' <> 'lucia@example.com' then raise exception 'el mail no se normalizó'; end if;
  select coalesce((s->>'stock')::int, -1) into v_size_stock
  from public.shop_products p, jsonb_array_elements(p.sizes) s where p.id = v_hoodie and s->>'label' = 'M';
  if v_size_stock <> 1 then raise exception 'el talle M debería quedar en 1, quedó %', v_size_stock; end if;
  select stock into v_stock from public.shop_products where id = v_cap;
  if v_stock <> 1 then raise exception 'la gorra debería quedar en 1'; end if;

  -- 2. Sin stock, talle inexistente, talle faltante, cantidad inválida
  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(jsonb_build_object('productId', v_hoodie, 'sizeLabel', 'M', 'quantity', 2)),
      jsonb_build_object('name', 'Ana', 'email', 'ana@example.com'), 'cash_on_site', v_hash2, 60);
  exception when sqlstate 'PLU03' then v_failed := true; end;
  if not v_failed then raise exception 'pedir más que el stock debería fallar con PLU03'; end if;

  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(jsonb_build_object('productId', v_hoodie, 'sizeLabel', 'XXL', 'quantity', 1)),
      jsonb_build_object('name', 'Ana', 'email', 'ana@example.com'), 'cash_on_site', v_hash2, 60);
  exception when sqlstate 'PLU03' then v_failed := true; end;
  if not v_failed then raise exception 'un talle inexistente debería fallar con PLU03'; end if;

  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(jsonb_build_object('productId', v_hoodie, 'quantity', 1)),
      jsonb_build_object('name', 'Ana', 'email', 'ana@example.com'), 'cash_on_site', v_hash2, 60);
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'omitir el talle debería fallar con PLU01'; end if;

  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(jsonb_build_object('productId', v_cap, 'quantity', 11)),
      jsonb_build_object('name', 'Ana', 'email', 'ana@example.com'), 'cash_on_site', v_hash2, 60);
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'cantidad 11 debería fallar con PLU01'; end if;

  -- Un pedido que falla a mitad no deja stock descontado
  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(
        jsonb_build_object('productId', v_cap, 'quantity', 1),
        jsonb_build_object('productId', v_hoodie, 'sizeLabel', 'M', 'quantity', 5)),
      jsonb_build_object('name', 'Ana', 'email', 'ana@example.com'), 'cash_on_site', v_hash2, 60);
  exception when sqlstate 'PLU03' then v_failed := true; end;
  if not v_failed then raise exception 'debería fallar por stock'; end if;
  select stock into v_stock from public.shop_products where id = v_cap;
  if v_stock <> 1 then raise exception 'el pedido fallido no revirtió el stock de la gorra (%).', v_stock; end if;

  -- Un producto en borrador no se vende
  update public.shop_products set status = 'draft' where id = v_cap;
  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(jsonb_build_object('productId', v_cap, 'quantity', 1)),
      jsonb_build_object('name', 'Ana', 'email', 'ana@example.com'), 'cash_on_site', v_hash2, 60);
  exception when sqlstate 'PLU03' then v_failed := true; end;
  if not v_failed then raise exception 'un borrador no debería poder venderse'; end if;
  update public.shop_products set status = 'published' where id = v_cap;

  -- 3. Cupos de un curso: el segundo comprador no entra mientras el primero tiene un pedido vivo
  v_order2 := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_course, 'quantity', 1)),
    jsonb_build_object('name', 'Beto', 'email', 'beto@example.com'), 'bank_transfer', v_hash2, 2880);
  if (v_order2->>'amount')::int <> 45000 then raise exception 'precio del curso inesperado'; end if;
  v_failed := false;
  begin
    perform public.create_shop_order(
      jsonb_build_array(jsonb_build_object('productId', v_course, 'quantity', 1)),
      jsonb_build_object('name', 'Caro', 'email', 'caro@example.com'), 'cash_on_site', v_hash, 60);
  exception when sqlstate 'PLU03' then v_failed := true; end;
  if not v_failed then raise exception 'el curso con cupo lleno debería rechazar con PLU03'; end if;
  -- y el catálogo público lo muestra agotado
  if (select (i->>'inStock')::boolean from jsonb_array_elements(public.list_public_shop_products()) i
      where i->>'slug' = 'flow-curso') then
    raise exception 'el curso lleno debería figurar agotado';
  end if;

  -- 4. Transferencia: el comprador registra el comprobante con SU token y solo en su pedido
  v_failed := false;
  begin
    perform public.register_shop_order_proof((v_order2->>'id')::uuid, v_hash, (v_order2->>'id') || '/p.png');
  exception when sqlstate 'PLU02' then v_failed := true; end;
  if not v_failed then raise exception 'un token ajeno no debería poder subir comprobante'; end if;
  v_failed := false;
  begin
    perform public.register_shop_order_proof((v_order2->>'id')::uuid, v_hash2, 'otra-carpeta/p.png');
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'un path fuera de la carpeta del pedido debería fallar'; end if;
  v_res := public.register_shop_order_proof((v_order2->>'id')::uuid, v_hash2, (v_order2->>'id') || '/p.png');
  if (v_res->>'hasProof')::boolean is not true then raise exception 'el comprobante no quedó registrado'; end if;

  -- 5. El staff acredita transferencia/efectivo, pero no Mercado Pago
  v_res := public.staff_approve_shop_order((v_order2->>'id')::uuid, 'test:staff');
  if v_res->>'status' <> 'aprobado' then raise exception 'la transferencia debería quedar aprobada'; end if;
  v_res := public.staff_approve_shop_order((v_order2->>'id')::uuid, 'test:staff');
  if v_res->>'status' <> 'aprobado' then raise exception 'aprobar dos veces debe ser idempotente'; end if;

  v_order3 := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_hoodie, 'sizeLabel', 'L', 'quantity', 1)),
    jsonb_build_object('name', 'Dani', 'email', 'dani@example.com'), 'mercado_pago', v_hash2, 60);
  v_id := (v_order3->>'id')::uuid;
  v_failed := false;
  begin
    perform public.staff_approve_shop_order(v_id, 'test:staff');
  exception when sqlstate 'PLU10' then v_failed := true; end;
  if not v_failed then raise exception 'el staff no debería acreditar un pago de Mercado Pago a mano'; end if;

  -- 6. Mercado Pago: monto distinto = rechazo; pendiente no vence; aprobado acredita una sola vez
  v_failed := false;
  begin
    perform public.apply_shop_mercado_pago_payment(v_id, 'mp-1', 'approved', 1, 'ARS');
  exception when sqlstate 'PLU09' then v_failed := true; end;
  if not v_failed then raise exception 'un monto distinto debería fallar con PLU09'; end if;

  v_res := public.apply_shop_mercado_pago_payment(v_id, 'mp-1', 'in_process', 40000, 'ARS');
  if v_res->>'outcome' <> 'pending' then raise exception 'in_process debería quedar pending'; end if;
  update public.shop_orders set expires_at = now() - interval '1 hour' where id = v_id;
  v_res := public.expire_shop_orders();
  if (select status from public.shop_orders where id = v_id) <> 'pendiente' then
    raise exception 'un pedido con pago en proceso no debería vencer enseguida';
  end if;

  v_res := public.apply_shop_mercado_pago_payment(v_id, 'mp-1', 'approved', 40000, 'ARS');
  if v_res->>'outcome' <> 'approved' then raise exception 'esperaba approved, vino %', v_res->>'outcome'; end if;
  v_res := public.apply_shop_mercado_pago_payment(v_id, 'mp-1', 'approved', 40000, 'ARS');
  if v_res->>'outcome' <> 'already_approved' then raise exception 'el reintento debería ser already_approved'; end if;

  -- Un segundo pago aprobado contra el mismo pedido queda marcado para devolver
  v_res := public.apply_shop_mercado_pago_payment(v_id, 'mp-2', 'approved', 40000, 'ARS');
  if v_res->>'outcome' <> 'duplicate_payment' or (v_res->'order'->>'needsRefund')::boolean is not true then
    raise exception 'el pago duplicado debería marcar needsRefund';
  end if;
  v_res := public.staff_resolve_shop_refund(v_id, 'test:staff');
  if (v_res->>'needsRefund')::boolean then raise exception 'la devolución debería quedar resuelta'; end if;

  -- 7. Entrega solo de pedidos acreditados
  v_res := public.staff_fulfill_shop_order(v_id, 'test:staff');
  if v_res->>'fulfilledAt' is null then raise exception 'debería quedar entregado'; end if;
  v_failed := false;
  begin
    perform public.staff_cancel_shop_order(v_id, 'test:staff', 'x');
  exception when sqlstate 'PLU10' then v_failed := true; end;
  if not v_failed then raise exception 'cancelar un pago de MP acreditado debería fallar con PLU10'; end if;

  -- 8. Cancelar el pedido de efectivo devuelve el stock
  v_res := public.staff_cancel_shop_order((v_order->>'id')::uuid, 'test:staff', 'No retiró');
  if v_res->>'status' <> 'cancelado' then raise exception 'debería quedar cancelado'; end if;
  select coalesce((s->>'stock')::int, -1) into v_size_stock
  from public.shop_products p, jsonb_array_elements(p.sizes) s where p.id = v_hoodie and s->>'label' = 'M';
  if v_size_stock <> 3 then raise exception 'cancelar debería devolver el talle M a 3, está en %', v_size_stock; end if;
  select stock into v_stock from public.shop_products where id = v_cap;
  if v_stock <> 2 then raise exception 'cancelar debería devolver la gorra a 2'; end if;
  -- cancelar dos veces no devuelve el stock dos veces
  perform public.staff_cancel_shop_order((v_order->>'id')::uuid, 'test:staff', 'otra vez');
  select stock into v_stock from public.shop_products where id = v_cap;
  if v_stock <> 2 then raise exception 'cancelar dos veces no debe duplicar el stock'; end if;

  -- 9. Vencimiento: un pedido sin pagar libera el stock y el cupo
  update public.shop_orders set status = 'aprobado', approved_at = now() where id = (v_order2->>'id')::uuid;
  v_order := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_cap, 'quantity', 2)),
    jsonb_build_object('name', 'Eli', 'email', 'eli@example.com'), 'cash_on_site', v_hash, 60);
  select stock into v_stock from public.shop_products where id = v_cap;
  if v_stock <> 0 then raise exception 'la reserva debería dejar la gorra en 0'; end if;
  update public.shop_orders set expires_at = now() - interval '1 minute' where id = (v_order->>'id')::uuid;
  v_res := public.expire_shop_orders();
  if (v_res->>'expired')::int < 1 then raise exception 'debería haber vencido al menos un pedido'; end if;
  select stock into v_stock from public.shop_products where id = v_cap;
  if v_stock <> 2 then raise exception 'vencer debería devolver la gorra a 2, está en %', v_stock; end if;

  -- 10. Pago tardío sobre un pedido vencido: si hay stock se recupera; si no, queda para devolver
  v_order := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_cap, 'quantity', 2)),
    jsonb_build_object('name', 'Fer', 'email', 'fer@example.com'), 'mercado_pago', v_hash, 60);
  v_id := (v_order->>'id')::uuid;
  update public.shop_orders set expires_at = now() - interval '1 minute' where id = v_id;
  perform public.expire_shop_orders();
  v_res := public.apply_shop_mercado_pago_payment(v_id, 'mp-late-1', 'approved', 30000, 'ARS');
  if v_res->>'outcome' <> 'revived' or v_res->'order'->>'status' <> 'aprobado' then
    raise exception 'un pago tardío con stock disponible debería revivir el pedido: %', v_res;
  end if;
end
$flow$;

-- Pago tardío sin stock para recuperar: queda marcado para devolver.
do $late$
declare
  v_cap uuid;
  v_order jsonb;
  v_other jsonb;
  v_res jsonb;
  v_id uuid;
  v_cap2 uuid;
  v_failed boolean;
  v_stock int;
  v_hash text := repeat('c', 64);
begin
  v_cap2 := (public.upsert_shop_product(null, jsonb_build_object(
    'slug', 'flow-refund', 'title', 'Gorra reembolso', 'category', 'accessories', 'price', 10000, 'status', 'published', 'stock', 1
  ), 'test:admin')->>'id')::uuid;
  v_cap := (public.upsert_shop_product(null, jsonb_build_object(
    'slug', 'flow-late', 'title', 'Remera tardía', 'category', 'accessories', 'price', 10000, 'status', 'published', 'stock', 1
  ), 'test:admin')->>'id')::uuid;
  v_order := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_cap, 'quantity', 1)),
    jsonb_build_object('name', 'Hugo', 'email', 'hugo@example.com'), 'mercado_pago', v_hash, 60);
  v_id := (v_order->>'id')::uuid;
  update public.shop_orders set expires_at = now() - interval '1 minute' where id = v_id;
  perform public.expire_shop_orders();
  -- otra persona se lleva la última unidad
  v_other := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_cap, 'quantity', 1)),
    jsonb_build_object('name', 'Ines', 'email', 'ines@example.com'), 'cash_on_site', v_hash, 60);
  v_res := public.apply_shop_mercado_pago_payment(v_id, 'mp-late-2', 'approved', 10000, 'ARS');
  if v_res->>'outcome' <> 'needs_refund' then raise exception 'esperaba needs_refund, vino %', v_res->>'outcome'; end if;
  if v_res->'order'->>'status' = 'aprobado' then raise exception 'no debería aprobarse sin stock'; end if;
  if (v_res->'order'->>'needsRefund')::boolean is not true then raise exception 'debería quedar needsRefund'; end if;

  -- Un pedido de efectivo no se acredita por Mercado Pago
  v_failed := false;
  begin
    perform public.apply_shop_mercado_pago_payment((v_other->>'id')::uuid, 'x', 'approved', 10000, 'ARS');
  exception when sqlstate 'PLU10' then v_failed := true; end;
  if not v_failed then raise exception 'un pedido de efectivo no debería acreditarse por Mercado Pago'; end if;

  -- Un reembolso en Mercado Pago de un pedido acreditado devuelve el stock
  v_order := public.create_shop_order(
    jsonb_build_array(jsonb_build_object('productId', v_cap2, 'quantity', 1)),
    jsonb_build_object('name', 'Jota', 'email', 'jota@example.com'), 'mercado_pago', v_hash, 60);
  perform public.apply_shop_mercado_pago_payment((v_order->>'id')::uuid, 'mp-r-1', 'approved', 10000, 'ARS');
  select stock into v_stock from public.shop_products where id = v_cap2;
  if v_stock <> 0 then raise exception 'esperaba stock 0 tras la compra'; end if;
  v_res := public.apply_shop_mercado_pago_payment((v_order->>'id')::uuid, 'mp-r-1', 'refunded', 10000, 'ARS');
  if v_res->>'outcome' <> 'reversed' or v_res->'order'->>'status' <> 'cancelado' then
    raise exception 'el reembolso debería cancelar el pedido: %', v_res;
  end if;
  select stock into v_stock from public.shop_products where id = v_cap2;
  if v_stock <> 1 then raise exception 'el reembolso debería devolver el stock'; end if;
end
$late$;

-- Configuración de cobro y permisos
do $perm$
declare
  v_res jsonb;
  v_failed boolean := false;
begin
  v_res := public.upsert_shop_checkout_settings(
    jsonb_build_object('mercadoPagoEnabled', true, 'bankTransferEnabled', false, 'cashEnabled', true,
      'cashInstructions', 'Sede Banfield, sábados', 'fulfillmentNote', 'Retiro en sede'),
    'test:admin');
  if v_res->>'cash_instructions' <> 'Sede Banfield, sábados' then raise exception 'configuración no guardada'; end if;

  begin
    perform public.upsert_shop_checkout_settings(
      jsonb_build_object('bankTransferProfileId', gen_random_uuid()::text), 'test:admin');
  exception when sqlstate 'PLU02' then v_failed := true; end;
  if not v_failed then raise exception 'un perfil bancario inexistente debería fallar'; end if;

  -- Las funciones de dinero no las ejecuta ni anon ni authenticated
  if has_function_privilege('anon', 'public.create_shop_order(jsonb,jsonb,text,text,integer,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.apply_shop_mercado_pago_payment(uuid,text,text,numeric,text)', 'execute')
    or has_function_privilege('anon', 'public.staff_approve_shop_order(uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.expire_shop_orders()', 'execute') then
    raise exception 'las RPC de pedidos no deben ser ejecutables desde el navegador';
  end if;
  if has_table_privilege('anon', 'public.shop_orders', 'select')
    or has_table_privilege('authenticated', 'public.shop_order_items', 'select') then
    raise exception 'las tablas de pedidos no deben ser legibles desde el navegador';
  end if;
end
$perm$;

rollback;
