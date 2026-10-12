-- Catálogo de la tienda — PLU ARG
--
-- Hasta ahora los productos de la tienda vivían solo en el localStorage del
-- navegador de quien los cargaba en el panel: lo que un admin "publicaba" no lo
-- veía nadie más, y se perdía al limpiar el navegador. Esta migración los pasa
-- a la base, con el mismo camino que el resto del dominio: RLS activo sin
-- policies, escritura solo por RPC `security definer` y cada alta / edición /
-- baja en `domain_audit_logs`.
--
-- Cuatro familias de producto, un solo catálogo:
--   · apparel     ropa y buzos (con talles y stock por talle)
--   · accessories accesorios
--   · exclusive   piezas exclusivas atadas a un torneo (`event_id`)
--   · course      cursos: fecha, modalidad, lugar y cupo
--
-- Esto NO cobra ni descuenta stock por compra: acá solo vive el catálogo. El
-- cobro de la tienda es una etapa aparte porque exige un tipo de orden propio
-- dentro del motor de pagos; hasta entonces ningún pedido confirma un pago.
--
-- Las fotos van a un bucket PÚBLICO de solo lectura (son material de
-- marketing); subir exige una URL firmada que emite el backend.

create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 2 and 120),
  category text not null check (category in ('apparel', 'accessories', 'exclusive', 'course')),
  description text not null default '' check (length(description) <= 4000),
  price integer not null default 0 check (price >= 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 8),
  -- Talles: [{ "label": "M", "stock": 4 }, ...]. Vacío = producto sin talles
  -- (usa `stock`).
  sizes jsonb not null default '[]'::jsonb check (jsonb_typeof(sizes) = 'array'),
  stock integer not null default 0 check (stock >= 0),
  event_id uuid null references public.events(id) on delete set null,
  edition_note text null check (edition_note is null or length(edition_note) <= 120),
  course_starts_at timestamptz null,
  course_modality text null check (course_modality in ('presencial', 'online', 'hibrido')),
  course_location text null check (course_location is null or length(course_location) <= 160),
  course_capacity integer null check (course_capacity is null or course_capacity >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index shop_products_public_idx
  on public.shop_products (organization_id, status, category, featured desc, sort_order, created_at desc);

create index shop_products_event_idx
  on public.shop_products (event_id)
  where event_id is not null;

alter table public.shop_products enable row level security;
revoke all on table public.shop_products from public, anon, authenticated;
grant select, insert, update, delete on table public.shop_products to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-products',
  'shop-products',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública del catálogo: solo lo publicado y SIN cifras de stock. La
-- tienda necesita saber si hay o no hay (y si quedan pocos), no cuántos tiene
-- PLU en depósito.
create or replace function public.list_public_shop_products(
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by featured desc, sort_order asc, created_at desc), '[]'::jsonb)
  from (
    select
      p.featured,
      p.sort_order,
      p.created_at,
      jsonb_build_object(
        'id', p.id,
        'slug', p.slug,
        'title', p.title,
        'category', p.category,
        'description', p.description,
        'price', p.price,
        'currency', p.currency,
        'imagePaths', to_jsonb(p.image_paths),
        'sizes', coalesce(
          (
            select jsonb_agg(jsonb_build_object(
              'label', s->>'label',
              'inStock', coalesce((s->>'stock')::int, 0) > 0
            ))
            from jsonb_array_elements(p.sizes) s
          ),
          '[]'::jsonb
        ),
        'inStock', case
          when p.category = 'course' then true
          when jsonb_array_length(p.sizes) > 0 then exists (
            select 1 from jsonb_array_elements(p.sizes) s where coalesce((s->>'stock')::int, 0) > 0
          )
          else p.stock > 0
        end,
        'lowStock', case
          when p.category = 'course' then false
          when jsonb_array_length(p.sizes) > 0 then
            coalesce((select sum(coalesce((s->>'stock')::int, 0)) from jsonb_array_elements(p.sizes) s), 0) between 1 and 3
          else p.stock between 1 and 3
        end,
        'featured', p.featured,
        'editionNote', p.edition_note,
        'event', case when e.id is null then null else jsonb_build_object(
          'id', e.id, 'slug', e.slug, 'title', e.title, 'startsAt', e.starts_at, 'venue', e.venue
        ) end,
        'course', case when p.category = 'course' then jsonb_build_object(
          'startsAt', p.course_starts_at,
          'modality', p.course_modality,
          'location', p.course_location,
          'capacity', p.course_capacity
        ) else null end,
        'createdAt', p.created_at
      ) as item
    from public.shop_products p
    left join public.events e on e.id = p.event_id
    where p.organization_id = p_organization_id
      and p.status = 'published'
  ) q;
$$;

-- Lectura del panel: todo, con stock real.
create or replace function public.list_admin_shop_products(
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  from (
    select
      p.created_at,
      jsonb_build_object(
        'id', p.id,
        'slug', p.slug,
        'title', p.title,
        'category', p.category,
        'description', p.description,
        'price', p.price,
        'currency', p.currency,
        'imagePaths', to_jsonb(p.image_paths),
        'sizes', p.sizes,
        'stock', p.stock,
        'eventId', p.event_id,
        'eventTitle', e.title,
        'editionNote', p.edition_note,
        'courseStartsAt', p.course_starts_at,
        'courseModality', p.course_modality,
        'courseLocation', p.course_location,
        'courseCapacity', p.course_capacity,
        'status', p.status,
        'featured', p.featured,
        'sortOrder', p.sort_order,
        'createdAt', p.created_at,
        'updatedAt', p.updated_at
      ) as item
    from public.shop_products p
    left join public.events e on e.id = p.event_id
    where p.organization_id = p_organization_id
  ) q;
$$;

-- Alta y edición en una sola RPC: el payload viaja como jsonb para no repetir
-- veinte parámetros posicionales. La validación fina (formatos, rangos) ya la
-- hizo el backend; acá quedan las reglas que protegen la integridad.
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

create or replace function public.delete_shop_product(
  p_id uuid,
  p_actor text,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shop_products;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;

  delete from public.shop_products
  where id = p_id and organization_id = p_organization_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'El producto no existe.' using errcode = 'PLU02';
  end if;

  perform plu_private.record_domain_audit(
    'shop.product_deleted', 'shop_product', v_row.id::text, 'staff', p_actor,
    jsonb_build_object('title', v_row.title, 'category', v_row.category),
    v_row.organization_id
  );

  return jsonb_build_object('id', v_row.id);
end;
$$;

revoke all on function public.list_public_shop_products(uuid) from public, anon, authenticated;
revoke all on function public.list_admin_shop_products(uuid) from public, anon, authenticated;
revoke all on function public.upsert_shop_product(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_shop_product(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.list_public_shop_products(uuid) to service_role;
grant execute on function public.list_admin_shop_products(uuid) to service_role;
grant execute on function public.upsert_shop_product(uuid, jsonb, text, uuid) to service_role;
grant execute on function public.delete_shop_product(uuid, text, uuid) to service_role;

do $verification$
begin
  if to_regclass('public.shop_products') is null then
    raise exception 'La tabla del catálogo de la tienda no quedó creada.' using errcode = 'PLU01';
  end if;
  if not exists (select 1 from storage.buckets where id = 'shop-products') then
    raise exception 'El bucket de productos no quedó creado.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.list_public_shop_products(uuid)') is null
    or to_regprocedure('public.list_admin_shop_products(uuid)') is null
    or to_regprocedure('public.upsert_shop_product(uuid,jsonb,text,uuid)') is null
    or to_regprocedure('public.delete_shop_product(uuid,text,uuid)') is null then
    raise exception 'La verificación del catálogo de la tienda no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
