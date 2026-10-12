-- Flujo del catálogo de la tienda contra la base real: alta, edición, reglas de
-- integridad, lectura pública sin cifras de stock y baja. Termina en rollback.

begin;

do $flow$
declare
  v_apparel jsonb;
  v_course jsonb;
  v_public jsonb;
  v_item jsonb;
  v_event uuid;
  v_id uuid;
  v_failed boolean;
  v_version text;
  v_edit jsonb;
begin
  select id into v_event from public.events limit 1;

  -- Alta de una prenda con talles
  v_apparel := public.upsert_shop_product(
    null,
    jsonb_build_object(
      'slug', 'buzo-test', 'title', 'Buzo de prueba', 'category', 'apparel', 'price', 38000,
      'status', 'published', 'featured', true,
      'sizes', jsonb_build_array(jsonb_build_object('label', 'M', 'stock', 2), jsonb_build_object('label', 'L', 'stock', 0)),
      'imagePaths', jsonb_build_array('products/123-buzo.jpg')
    ),
    'test:admin'
  );
  v_id := (v_apparel->>'id')::uuid;
  if v_apparel->>'slug' <> 'buzo-test' then raise exception 'slug inesperado: %', v_apparel->>'slug'; end if;

  -- Un slug repetido se desambigua en vez de romper
  v_apparel := public.upsert_shop_product(
    null,
    jsonb_build_object('slug', 'buzo-test', 'title', 'Buzo de prueba 2', 'category', 'apparel', 'price', 1, 'status', 'draft'),
    'test:admin'
  );
  if v_apparel->>'slug' = 'buzo-test' then raise exception 'el slug repetido no se desambiguó'; end if;

  -- Un curso con fecha
  v_course := public.upsert_shop_product(
    null,
    jsonb_build_object('slug', 'curso-jueces', 'title', 'Curso de jueces', 'category', 'course', 'price', 25000,
      'status', 'published', 'courseStartsAt', '2027-03-20T13:00:00-03:00', 'courseModality', 'presencial',
      'courseLocation', 'Banfield', 'courseCapacity', 20),
    'test:admin'
  );

  -- Una exclusiva atada a un torneo
  if v_event is not null then
    perform public.upsert_shop_product(
      null,
      jsonb_build_object('slug', 'remera-finalista', 'title', 'Remera finalista', 'category', 'exclusive', 'price', 30000,
        'status', 'published', 'eventId', v_event::text, 'editionNote', 'Edición limitada', 'stock', 5),
      'test:admin'
    );
  end if;

  -- Lectura pública: solo publicado, sin números de stock
  v_public := public.list_public_shop_products();
  for v_item in select * from jsonb_array_elements(v_public) loop
    if v_item ? 'stock' then raise exception 'la lectura pública expone el stock'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(v_public) i where i->>'title' = 'Buzo de prueba 2') then
    raise exception 'la lectura pública mostró un borrador';
  end if;
  select i into v_item from jsonb_array_elements(v_public) i where i->>'slug' = 'buzo-test';
  if (v_item->>'inStock')::boolean is not true then raise exception 'M tiene stock: inStock debería ser true'; end if;
  if (v_item->>'lowStock')::boolean is not true then raise exception 'quedan 2 unidades: lowStock debería ser true'; end if;
  if (v_item->'sizes'->1->>'inStock')::boolean is not false then raise exception 'el talle L no tiene stock'; end if;

  -- Edición: el slug no cambia aunque cambie el título
  v_apparel := public.upsert_shop_product(
    v_id,
    jsonb_build_object('slug', 'otro-slug', 'title', 'Buzo renombrado', 'category', 'apparel', 'price', 40000, 'status', 'published',
      'sizes', jsonb_build_array(jsonb_build_object('label', 'M', 'stock', 0), jsonb_build_object('label', 'L', 'stock', 0))),
    'test:admin'
  );
  if v_apparel->>'slug' <> 'buzo-test' then raise exception 'el slug cambió al editar'; end if;
  select i into v_item from jsonb_array_elements(public.list_public_shop_products()) i where i->>'slug' = 'buzo-test';
  if (v_item->>'inStock')::boolean is not false then raise exception 'sin stock en ningún talle: inStock debería ser false'; end if;

  -- Reglas de integridad
  v_failed := false;
  begin
    perform public.upsert_shop_product(null, jsonb_build_object('slug', 'x', 'title', 'Xx', 'category', 'otra'), 'test:admin');
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'aceptó una categoría inválida'; end if;

  v_failed := false;
  begin
    perform public.upsert_shop_product(null, jsonb_build_object('slug', 'x', 'title', 'Xx', 'category', 'apparel',
      'imagePaths', jsonb_build_array('../otro/x.jpg')), 'test:admin');
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'aceptó una ruta de imagen ajena al bucket'; end if;

  v_failed := false;
  begin
    perform public.upsert_shop_product(null, jsonb_build_object('slug', 'x', 'title', 'Xx', 'category', 'apparel',
      'sizes', jsonb_build_array(jsonb_build_object('label', 'M', 'stock', -1))), 'test:admin');
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'aceptó un stock negativo'; end if;

  v_failed := false;
  begin
    perform public.upsert_shop_product(null, jsonb_build_object('slug', 'x', 'title', 'Xx', 'category', 'apparel'), '');
  exception when sqlstate 'PLU01' then v_failed := true; end;
  if not v_failed then raise exception 'aceptó una operación sin actor'; end if;

  v_failed := false;
  begin
    perform public.upsert_shop_product(null, jsonb_build_object('slug', 'x', 'title', 'Xx', 'category', 'exclusive',
      'eventId', '00000000-0000-4000-8000-0000000000ff'), 'test:admin');
  exception when sqlstate 'PLU02' then v_failed := true; end;
  if not v_failed then raise exception 'aceptó un torneo inexistente'; end if;

  -- Control de versión (20261208100000): editar con la versión que abrió el panel
  -- funciona; si el producto cambió en el medio, falla con PLU03 y no pisa nada.
  -- `now()` es fijo dentro de la transacción: el cambio ajeno se simula moviendo
  -- `updated_at`, que es lo que hace el descuento de stock de un pedido.
  v_edit := jsonb_build_object(
    'slug', 'buzo-test', 'title', 'Buzo de prueba', 'category', 'apparel', 'price', 38000,
    'status', 'published', 'sizes', jsonb_build_array(jsonb_build_object('label', 'M', 'stock', 2))
  );
  select i->>'updatedAt' into v_version
  from jsonb_array_elements(public.list_admin_shop_products()) i where i->>'id' = v_id::text;

  perform public.upsert_shop_product(v_id, v_edit || jsonb_build_object('expectedUpdatedAt', v_version), 'test:admin');

  update public.shop_products set stock = 7, updated_at = updated_at + interval '1 second' where id = v_id;
  v_failed := false;
  begin
    perform public.upsert_shop_product(v_id, v_edit || jsonb_build_object('expectedUpdatedAt', v_version, 'stock', 1), 'test:admin');
  exception when sqlstate 'PLU03' then v_failed := true; end;
  if not v_failed then raise exception 'editó con una versión vieja y pisó el cambio'; end if;
  if (select stock from public.shop_products where id = v_id) <> 7 then
    raise exception 'la edición rechazada igual modificó el stock';
  end if;

  select i->>'updatedAt' into v_version
  from jsonb_array_elements(public.list_admin_shop_products()) i where i->>'id' = v_id::text;
  perform public.upsert_shop_product(v_id, v_edit || jsonb_build_object('expectedUpdatedAt', v_version), 'test:admin');
  -- Sin versión (clientes viejos) la edición sigue como antes.
  perform public.upsert_shop_product(v_id, v_edit, 'test:admin');

  -- Auditoría
  if not exists (select 1 from public.domain_audit_logs where action = 'shop.product_created' and actor_id = 'test:admin') then
    raise exception 'el alta no quedó auditada';
  end if;
  if not exists (select 1 from public.domain_audit_logs where action = 'shop.product_updated' and entity_id = v_id::text) then
    raise exception 'la edición no quedó auditada';
  end if;

  -- Baja
  perform public.delete_shop_product(v_id, 'test:admin');
  if exists (select 1 from public.shop_products where id = v_id) then raise exception 'la baja no borró el producto'; end if;
  v_failed := false;
  begin
    perform public.delete_shop_product(v_id, 'test:admin');
  exception when sqlstate 'PLU02' then v_failed := true; end;
  if not v_failed then raise exception 'borrar dos veces debería fallar con PLU02'; end if;

  -- El admin ve el stock real
  if not exists (select 1 from jsonb_array_elements(public.list_admin_shop_products()) i where i ? 'stock') then
    raise exception 'el panel debería ver el stock';
  end if;
end
$flow$;

rollback;
