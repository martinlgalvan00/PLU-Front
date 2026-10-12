-- Tienda: editar un producto ya no pisa en silencio los cambios de otro.
--
-- `upsert_shop_product` reescribe `stock` y `sizes` completos con lo que manda el
-- panel. Con el listado desactualizado, cambiar solo el título pisaba el stock
-- que los pedidos habían descontado en el medio. Ahora el panel puede mandar
-- `expectedUpdatedAt` (el `updatedAt` con el que abrió el producto) y, si el
-- producto cambió desde entonces, la edición falla con PLU03 (409) en vez de
-- sobrescribir. Todo lo que modifica un producto actualiza `updated_at`, incluido
-- el descuento de stock de un pedido (`plu_private.shop_apply_stock_delta`).
--
-- Misma firma que antes: `create or replace`, sin sobrecargas, y la edición sin
-- `expectedUpdatedAt` se comporta igual (compatible con clientes viejos).

create or replace function public.upsert_shop_product(
  p_id uuid,
  p_data jsonb,
  p_actor text,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := nullif(btrim(coalesce(p_data->>'slug', '')), '');
  v_category text := p_data->>'category';
  v_status text := coalesce(p_data->>'status', 'draft');
  v_event_id uuid := nullif(p_data->>'eventId', '')::uuid;
  v_paths text[];
  v_sizes jsonb := coalesce(p_data->'sizes', '[]'::jsonb);
  v_row public.shop_products;
  v_before public.shop_products;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;
  if v_slug is null then
    raise exception 'El producto necesita un nombre.' using errcode = 'PLU01';
  end if;
  if v_category not in ('apparel', 'accessories', 'exclusive', 'course') then
    raise exception 'Categoría de producto inválida.' using errcode = 'PLU01';
  end if;
  if v_status not in ('draft', 'published', 'archived') then
    raise exception 'Estado de producto inválido.' using errcode = 'PLU01';
  end if;
  if jsonb_typeof(v_sizes) <> 'array' then
    raise exception 'Los talles deben ser una lista.' using errcode = 'PLU01';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_sizes) s
    where length(btrim(coalesce(s->>'label', ''))) = 0
       or coalesce((s->>'stock')::int, -1) < 0
  ) then
    raise exception 'Cada talle necesita nombre y un stock mayor o igual a cero.' using errcode = 'PLU01';
  end if;
  if v_event_id is not null and not exists (select 1 from public.events where id = v_event_id) then
    raise exception 'El torneo asociado no existe.' using errcode = 'PLU02';
  end if;

  select coalesce(array_agg(path), '{}'::text[])
  into v_paths
  from jsonb_array_elements_text(coalesce(p_data->'imagePaths', '[]'::jsonb)) as path;
  -- Solo rutas del propio bucket de productos: un path arbitrario no puede
  -- hacer que la tienda muestre archivos de otro bucket.
  if exists (select 1 from unnest(v_paths) path where path !~ '^products/[A-Za-z0-9._()+ -]+$') then
    raise exception 'Ruta de imagen inválida.' using errcode = 'PLU01';
  end if;

  if p_id is null then
    -- Slug único por organización: si ya existe, se desambigua con un sufijo.
    if exists (
      select 1 from public.shop_products where organization_id = p_organization_id and slug = v_slug
    ) then
      v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
    end if;

    insert into public.shop_products (
      organization_id, slug, title, category, description, price, image_paths, sizes, stock,
      event_id, edition_note, course_starts_at, course_modality, course_location, course_capacity,
      status, featured, sort_order, created_by
    ) values (
      p_organization_id, v_slug, btrim(p_data->>'title'), v_category,
      btrim(coalesce(p_data->>'description', '')),
      coalesce((p_data->>'price')::int, 0), v_paths, v_sizes,
      coalesce((p_data->>'stock')::int, 0),
      v_event_id, nullif(btrim(coalesce(p_data->>'editionNote', '')), ''),
      nullif(p_data->>'courseStartsAt', '')::timestamptz,
      nullif(p_data->>'courseModality', ''),
      nullif(btrim(coalesce(p_data->>'courseLocation', '')), ''),
      nullif(p_data->>'courseCapacity', '')::int,
      v_status, coalesce((p_data->>'featured')::boolean, false),
      coalesce((p_data->>'sortOrder')::int, 0), p_actor
    )
    returning * into v_row;

    perform plu_private.record_domain_audit(
      'shop.product_created', 'shop_product', v_row.id::text, 'staff', p_actor,
      jsonb_build_object('title', v_row.title, 'category', v_row.category, 'status', v_row.status,
        'price', v_row.price),
      v_row.organization_id
    );
  else
    select * into v_before from public.shop_products
    where id = p_id and organization_id = p_organization_id for update;
    if not found then
      raise exception 'El producto no existe.' using errcode = 'PLU02';
    end if;

    -- Control de versión: si el panel dice desde qué versión editó y el producto
    -- cambió en el medio (otra persona, o un pedido que descontó stock), no se
    -- pisa en silencio. Sin `expectedUpdatedAt` la edición sigue como antes.
    if nullif(p_data->>'expectedUpdatedAt', '') is not null
       and v_before.updated_at is distinct from (p_data->>'expectedUpdatedAt')::timestamptz then
      raise exception 'El producto cambió mientras lo editabas. Recargá y volvé a intentarlo.'
        using errcode = 'PLU03';
    end if;

    -- El slug se conserva al editar: es parte de la URL pública.
    update public.shop_products set
      title = btrim(p_data->>'title'),
      category = v_category,
      description = btrim(coalesce(p_data->>'description', '')),
      price = coalesce((p_data->>'price')::int, 0),
      image_paths = v_paths,
      sizes = v_sizes,
      stock = coalesce((p_data->>'stock')::int, 0),
      event_id = v_event_id,
      edition_note = nullif(btrim(coalesce(p_data->>'editionNote', '')), ''),
      course_starts_at = nullif(p_data->>'courseStartsAt', '')::timestamptz,
      course_modality = nullif(p_data->>'courseModality', ''),
      course_location = nullif(btrim(coalesce(p_data->>'courseLocation', '')), ''),
      course_capacity = nullif(p_data->>'courseCapacity', '')::int,
      status = v_status,
      featured = coalesce((p_data->>'featured')::boolean, false),
      sort_order = coalesce((p_data->>'sortOrder')::int, 0),
      updated_at = now()
    where id = p_id
    returning * into v_row;

    perform plu_private.record_domain_audit(
      'shop.product_updated', 'shop_product', v_row.id::text, 'staff', p_actor,
      jsonb_build_object(
        'before', jsonb_build_object('title', v_before.title, 'status', v_before.status,
          'price', v_before.price, 'stock', v_before.stock),
        'after', jsonb_build_object('title', v_row.title, 'status', v_row.status,
          'price', v_row.price, 'stock', v_row.stock)
      ),
      v_row.organization_id
    );
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.upsert_shop_product(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.upsert_shop_product(uuid, jsonb, text, uuid) to service_role;

do $verification$
begin
  if to_regprocedure('public.upsert_shop_product(uuid,jsonb,text,uuid)') is null then
    raise exception 'upsert_shop_product no quedó creada.' using errcode = 'PLU01';
  end if;
  if pg_get_functiondef('public.upsert_shop_product(uuid,jsonb,text,uuid)'::regprocedure)
       not like '%expectedUpdatedAt%' then
    raise exception 'upsert_shop_product no incluye el control de versión.' using errcode = 'PLU01';
  end if;
end;
$verification$;
