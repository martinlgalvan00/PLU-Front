-- Pedidos y cobro de la tienda — PLU ARG
--
-- La tienda ya tenía catálogo (20261202100000_shop_catalog.sql) pero ningún
-- pedido cobraba nada. Esta migración agrega el circuito de venta, con tres
-- medios de pago:
--
--   · mercado_pago   Checkout Pro; el pago se acredita SOLO desde el backend
--                    (webhook / retorno firmado), nunca desde el navegador.
--   · bank_transfer  transferencia con comprobante; acredita el staff.
--   · cash_on_site   efectivo en el lugar; acredita el staff al cobrar.
--
-- Es un motor propio y chico, deliberadamente separado de las órdenes de
-- entradas y de atletas: la tienda no comparte estados, expiración ni
-- conciliación con ellas, así que no las toca.
--
-- Reglas que protegen el dinero y el stock:
--   · El precio sale SIEMPRE de `shop_products`; el cliente solo manda
--     producto, talle y cantidad.
--   · El stock se descuenta al crear el pedido (reserva) y se devuelve al
--     cancelarlo o vencer. Los cupos de un curso se cuentan sobre los pedidos
--     vivos (pendientes + aprobados).
--   · Un pago aprobado que llega con el pedido ya vencido intenta recuperar el
--     stock; si no se puede, el pedido queda marcado `needs_refund` para que
--     alguien lo devuelva. Nunca se pierde en silencio.
--   · Todas las tablas con RLS activo y sin policies; escritura solo por RPC
--     `security definer` y ejecutable únicamente por `service_role`.

-- ---------------------------------------------------------------------------
-- Configuración de cobro de la tienda
-- ---------------------------------------------------------------------------
create table public.shop_checkout_settings (
  organization_id uuid primary key default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id),
  mercado_pago_enabled boolean not null default true,
  bank_transfer_enabled boolean not null default false,
  cash_enabled boolean not null default true,
  mercado_pago_profile_id uuid null references public.payment_profiles(id) on delete set null,
  bank_transfer_profile_id uuid null references public.payment_profiles(id) on delete set null,
  -- Dónde y cuándo se paga / retira en efectivo.
  cash_instructions text not null default '' check (length(cash_instructions) <= 500),
  -- Cómo se entrega lo comprado (se muestra a todos, sin importar el medio).
  fulfillment_note text not null default '' check (length(fulfillment_note) <= 500),
  updated_by text null,
  updated_at timestamptz not null default now()
);

alter table public.shop_checkout_settings enable row level security;
revoke all on table public.shop_checkout_settings from public, anon, authenticated;
grant select, insert, update on table public.shop_checkout_settings to service_role;

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id),
  reference text not null unique,
  access_token_hash text not null,
  buyer_name text not null check (length(btrim(buyer_name)) between 2 and 120),
  buyer_email text not null check (buyer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(buyer_email) <= 160),
  buyer_phone text null check (buyer_phone is null or length(buyer_phone) <= 40),
  buyer_note text null check (buyer_note is null or length(buyer_note) <= 500),
  payment_method text not null check (payment_method in ('mercado_pago', 'bank_transfer', 'cash_on_site')),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobado', 'cancelado', 'vencido')),
  amount integer not null check (amount > 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  expires_at timestamptz not null,
  approved_at timestamptz null,
  approved_by text null,
  cancelled_at timestamptz null,
  cancel_reason text null check (cancel_reason is null or length(cancel_reason) <= 300),
  fulfilled_at timestamptz null,
  fulfilled_by text null,
  mercado_pago_profile_id uuid null references public.payment_profiles(id) on delete set null,
  provider_preference_id text null,
  provider_payment_id text null,
  -- Un pago de Mercado Pago en proceso (p. ej. un cupón de pago en efectivo):
  -- el pedido no vence mientras tanto.
  payment_pending_at timestamptz null,
  -- Llegó un pago aprobado que no se pudo asignar a un pedido vivo.
  needs_refund boolean not null default false,
  proof_path text null,
  proof_uploaded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_orders_approved_has_date check (status <> 'aprobado' or approved_at is not null)
);

create unique index shop_orders_provider_payment_uidx
  on public.shop_orders (provider_payment_id)
  where provider_payment_id is not null;

create index shop_orders_status_idx
  on public.shop_orders (organization_id, status, created_at desc);

create index shop_orders_open_expiry_idx
  on public.shop_orders (expires_at)
  where status = 'pendiente';

create index shop_orders_buyer_email_idx
  on public.shop_orders (lower(buyer_email));

alter table public.shop_orders enable row level security;
revoke all on table public.shop_orders from public, anon, authenticated;
grant select on table public.shop_orders to service_role;

create table public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  -- El producto puede borrarse del catálogo; el pedido conserva su foto del
  -- momento de la compra.
  product_id uuid null references public.shop_products(id) on delete set null,
  product_title text not null,
  product_category text not null,
  size_label text null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 10),
  created_at timestamptz not null default now()
);

create index shop_order_items_order_idx on public.shop_order_items (order_id);
create index shop_order_items_product_idx on public.shop_order_items (product_id) where product_id is not null;

alter table public.shop_order_items enable row level security;
revoke all on table public.shop_order_items from public, anon, authenticated;
grant select on table public.shop_order_items to service_role;

-- Comprobantes de transferencia: bucket PRIVADO, solo el backend los firma.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-payment-proofs',
  'shop-payment-proofs',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Helpers de stock (no forman parte del contrato público)
-- ---------------------------------------------------------------------------

-- Suma (o resta, con delta negativo) stock de un talle o del stock único.
create or replace function plu_private.shop_apply_stock_delta(
  p_product_id uuid,
  p_size_label text,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_size_label is null then
    update public.shop_products
    set stock = greatest(stock + p_delta, 0), updated_at = now()
    where id = p_product_id;
    return;
  end if;

  update public.shop_products p
  set
    sizes = coalesce((
      select jsonb_agg(
        case
          when t.s->>'label' = p_size_label then
            jsonb_set(t.s, '{stock}', to_jsonb(greatest(coalesce((t.s->>'stock')::int, 0) + p_delta, 0)))
          else t.s
        end
        order by t.ord
      )
      from jsonb_array_elements(p.sizes) with ordinality as t(s, ord)
    ), '[]'::jsonb),
    updated_at = now()
  where p.id = p_product_id;
end;
$$;

revoke all on function plu_private.shop_apply_stock_delta(uuid, text, integer)
  from public, anon, authenticated, service_role;

-- Cupos ya tomados de un curso: pedidos vivos (pendientes + aprobados).
create or replace function plu_private.shop_course_seats_taken(
  p_product_id uuid,
  p_except_order_id uuid default null
)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(i.quantity), 0)::int
  from public.shop_order_items i
  join public.shop_orders o on o.id = i.order_id
  where i.product_id = p_product_id
    and o.status in ('pendiente', 'aprobado')
    and (p_except_order_id is null or o.id <> p_except_order_id);
$$;

revoke all on function plu_private.shop_course_seats_taken(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Devuelve al catálogo lo que un pedido tenía reservado. Los cursos no
-- descuentan stock (sus cupos se cuentan sobre pedidos vivos), así que solo
-- tocan los productos con existencias.
create or replace function plu_private.shop_release_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  for v_item in
    select product_id, size_label, quantity
    from public.shop_order_items
    where order_id = p_order_id
      and product_id is not null
      and product_category <> 'course'
    order by product_id, size_label nulls first
  loop
    perform 1 from public.shop_products where id = v_item.product_id for update;
    if found then
      perform plu_private.shop_apply_stock_delta(v_item.product_id, v_item.size_label, v_item.quantity);
    end if;
  end loop;
end;
$$;

revoke all on function plu_private.shop_release_order_stock(uuid)
  from public, anon, authenticated, service_role;

-- Intenta volver a reservar lo de un pedido vencido o cancelado. Devuelve
-- false (sin tocar nada) si algún renglón ya no se puede satisfacer.
create or replace function plu_private.shop_try_reserve_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_product public.shop_products;
  v_available integer;
begin
  -- Primera pasada: verificar todo bajo lock.
  for v_item in
    select product_id, size_label, quantity, product_category
    from public.shop_order_items
    where order_id = p_order_id
    order by product_id, size_label nulls first
  loop
    if v_item.product_id is null then
      return false;
    end if;
    select * into v_product from public.shop_products where id = v_item.product_id for update;
    if not found then
      return false;
    end if;

    if v_item.product_category = 'course' then
      if v_product.course_capacity is not null
        and plu_private.shop_course_seats_taken(v_product.id, p_order_id) + v_item.quantity
          > v_product.course_capacity then
        return false;
      end if;
    elsif v_item.size_label is not null then
      select coalesce((s->>'stock')::int, 0) into v_available
      from jsonb_array_elements(v_product.sizes) s
      where s->>'label' = v_item.size_label;
      if coalesce(v_available, 0) < v_item.quantity then
        return false;
      end if;
    elsif v_product.stock < v_item.quantity then
      return false;
    end if;
  end loop;

  -- Segunda pasada: descontar.
  for v_item in
    select product_id, size_label, quantity
    from public.shop_order_items
    where order_id = p_order_id and product_category <> 'course'
  loop
    perform plu_private.shop_apply_stock_delta(v_item.product_id, v_item.size_label, -v_item.quantity);
  end loop;
  return true;
end;
$$;

revoke all on function plu_private.shop_try_reserve_order_stock(uuid)
  from public, anon, authenticated, service_role;

-- Proyección de un pedido para el comprador y el panel (con renglones).
create or replace function plu_private.shop_order_json(p_order public.shop_orders)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_order.id,
    'reference', p_order.reference,
    'status', p_order.status,
    'paymentMethod', p_order.payment_method,
    'amount', p_order.amount,
    'currency', p_order.currency,
    'buyerName', p_order.buyer_name,
    'buyerEmail', p_order.buyer_email,
    'buyerPhone', p_order.buyer_phone,
    'buyerNote', p_order.buyer_note,
    'expiresAt', p_order.expires_at,
    'approvedAt', p_order.approved_at,
    'cancelledAt', p_order.cancelled_at,
    'cancelReason', p_order.cancel_reason,
    'fulfilledAt', p_order.fulfilled_at,
    'needsRefund', p_order.needs_refund,
    'paymentPending', p_order.payment_pending_at is not null,
    'proofUploadedAt', p_order.proof_uploaded_at,
    'hasProof', p_order.proof_path is not null,
    'createdAt', p_order.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', i.product_id,
        'title', i.product_title,
        'category', i.product_category,
        'sizeLabel', i.size_label,
        'unitPrice', i.unit_price,
        'quantity', i.quantity
      ) order by i.created_at, i.id)
      from public.shop_order_items i
      where i.order_id = p_order.id
    ), '[]'::jsonb)
  );
$$;

revoke all on function plu_private.shop_order_json(public.shop_orders)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Catálogo público: los cursos con cupo agotado dejan de estar disponibles
-- ---------------------------------------------------------------------------
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
          when p.category = 'course' then
            p.course_capacity is null
            or plu_private.shop_course_seats_taken(p.id) < p.course_capacity
          when jsonb_array_length(p.sizes) > 0 then exists (
            select 1 from jsonb_array_elements(p.sizes) s where coalesce((s->>'stock')::int, 0) > 0
          )
          else p.stock > 0
        end,
        'lowStock', case
          when p.category = 'course' then
            p.course_capacity is not null
            and p.course_capacity - plu_private.shop_course_seats_taken(p.id) between 1 and 3
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

-- ---------------------------------------------------------------------------
-- Alta del pedido (reserva de stock + precio desde el catálogo)
-- ---------------------------------------------------------------------------
create or replace function public.create_shop_order(
  p_items jsonb,
  p_buyer jsonb,
  p_payment_method text,
  p_access_token_hash text,
  p_hold_minutes integer,
  p_mercado_pago_profile_id uuid default null,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_product public.shop_products;
  v_lines jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_available integer;
  v_has_sizes boolean;
  v_size_label text;
  v_order public.shop_orders;
  v_reference text;
  v_attempt integer := 0;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if p_payment_method not in ('mercado_pago', 'bank_transfer', 'cash_on_site') then
    raise exception 'Medio de pago inválido.' using errcode = 'PLU01';
  end if;
  if p_access_token_hash is null or length(p_access_token_hash) < 32 then
    raise exception 'Falta el token de acceso del pedido.' using errcode = 'PLU01';
  end if;
  if p_hold_minutes is null or p_hold_minutes < 5 or p_hold_minutes > 60 * 24 * 14 then
    raise exception 'Tiempo de reserva inválido.' using errcode = 'PLU01';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos.' using errcode = 'PLU01';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'El pedido tiene demasiados renglones.' using errcode = 'PLU01';
  end if;

  -- Renglones agrupados por producto y talle, en orden estable para que dos
  -- pedidos concurrentes tomen los locks en el mismo orden.
  for v_line in
    select
      (e->>'productId')::uuid as product_id,
      nullif(btrim(coalesce(e->>'sizeLabel', '')), '') as size_label,
      sum(coalesce((e->>'quantity')::int, 0))::int as quantity
    from jsonb_array_elements(p_items) e
    group by 1, 2
    order by 1, 2 nulls first
  loop
    if v_line.quantity < 1 or v_line.quantity > 10 then
      raise exception 'La cantidad debe estar entre 1 y 10.' using errcode = 'PLU01';
    end if;

    select * into v_product
    from public.shop_products
    where id = v_line.product_id and organization_id = p_organization_id
    for update;
    if not found or v_product.status <> 'published' then
      raise exception 'Uno de los productos ya no está disponible.' using errcode = 'PLU03';
    end if;
    if v_product.price <= 0 then
      raise exception 'El producto "%" no tiene precio para cobrar online.', v_product.title
        using errcode = 'PLU03';
    end if;

    v_size_label := null;

    if v_product.category = 'course' then
      if v_line.quantity <> 1 then
        raise exception 'La inscripción a un curso es de a una persona.' using errcode = 'PLU01';
      end if;
      if v_product.course_starts_at is null or v_product.course_starts_at <= now() then
        raise exception 'El curso "%" ya comenzó.', v_product.title using errcode = 'PLU03';
      end if;
      if v_product.course_capacity is not null
        and plu_private.shop_course_seats_taken(v_product.id) + v_line.quantity
          > v_product.course_capacity then
        raise exception 'No quedan cupos en "%".', v_product.title using errcode = 'PLU03';
      end if;
    else
      v_has_sizes := jsonb_array_length(v_product.sizes) > 0;
      if v_has_sizes then
        if v_line.size_label is null then
          raise exception 'Elegí el talle de "%".', v_product.title using errcode = 'PLU01';
        end if;
        select coalesce((s->>'stock')::int, 0), s->>'label' into v_available, v_size_label
        from jsonb_array_elements(v_product.sizes) s
        where s->>'label' = v_line.size_label;
        if not found then
          raise exception 'El talle elegido de "%" no existe.', v_product.title using errcode = 'PLU03';
        end if;
      else
        v_available := v_product.stock;
      end if;
      if coalesce(v_available, 0) < v_line.quantity then
        raise exception 'No hay stock suficiente de "%".', v_product.title using errcode = 'PLU03';
      end if;
      perform plu_private.shop_apply_stock_delta(v_product.id, v_size_label, -v_line.quantity);
    end if;

    v_total := v_total + (v_product.price::bigint * v_line.quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'title', v_product.title,
      'category', v_product.category,
      'sizeLabel', v_size_label,
      'unitPrice', v_product.price,
      'quantity', v_line.quantity
    ));
  end loop;

  if v_total <= 0 or v_total > 100000000 then
    raise exception 'El total del pedido es inválido.' using errcode = 'PLU01';
  end if;

  -- Referencia legible (se la dicta el comprador al retirar / pagar).
  loop
    v_attempt := v_attempt + 1;
    v_reference := 'TND-' || (
      select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      from generate_series(1, 6)
    );
    begin
      insert into public.shop_orders (
        organization_id, reference, access_token_hash, buyer_name, buyer_email, buyer_phone,
        buyer_note, payment_method, amount, expires_at, mercado_pago_profile_id
      ) values (
        p_organization_id, v_reference, p_access_token_hash,
        btrim(p_buyer->>'name'), lower(btrim(p_buyer->>'email')),
        nullif(btrim(coalesce(p_buyer->>'phone', '')), ''),
        nullif(btrim(coalesce(p_buyer->>'note', '')), ''),
        p_payment_method, v_total::int,
        now() + make_interval(mins => p_hold_minutes),
        case when p_payment_method = 'mercado_pago' then p_mercado_pago_profile_id else null end
      )
      returning * into v_order;
      exit;
    exception when unique_violation then
      if v_attempt >= 6 then
        raise exception 'No se pudo generar la referencia del pedido.' using errcode = 'PLU01';
      end if;
    end;
  end loop;

  insert into public.shop_order_items (
    order_id, product_id, product_title, product_category, size_label, unit_price, quantity
  )
  select
    v_order.id, (l->>'productId')::uuid, l->>'title', l->>'category',
    nullif(l->>'sizeLabel', ''), (l->>'unitPrice')::int, (l->>'quantity')::int
  from jsonb_array_elements(v_lines) l;

  perform plu_private.record_domain_audit(
    'shop.order_created', 'shop_order', v_order.id::text, 'public', null,
    jsonb_build_object('reference', v_order.reference, 'method', v_order.payment_method,
      'amount', v_order.amount, 'items', jsonb_array_length(v_lines)),
    v_order.organization_id
  );

  return plu_private.shop_order_json(v_order);
end;
$$;

-- ---------------------------------------------------------------------------
-- Acreditación de un pago de Mercado Pago (solo backend)
-- ---------------------------------------------------------------------------
-- El backend ya verificó firma, referencia, monto y moneda contra la API de MP;
-- acá se vuelven a comprobar monto y moneda por si algún llamador futuro olvida
-- hacerlo. Es idempotente por `provider_payment_id`.
create or replace function public.apply_shop_mercado_pago_payment(
  p_order_id uuid,
  p_provider_payment_id text,
  p_status text,
  p_amount numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
  v_outcome text;
begin
  if p_provider_payment_id is null or length(btrim(p_provider_payment_id)) = 0 then
    raise exception 'Falta el id del pago.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  if v_order.payment_method <> 'mercado_pago' then
    raise exception 'Este pedido no se paga con Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount is distinct from v_order.amount::numeric or p_currency is distinct from v_order.currency then
    raise exception 'El monto del pago no coincide con el pedido.' using errcode = 'PLU09';
  end if;

  -- Un pago de otro intento ya acreditó este pedido: no se acredita dos veces.
  if v_order.status = 'aprobado' and v_order.provider_payment_id is distinct from p_provider_payment_id then
    if p_status = 'approved' then
      perform plu_private.record_domain_audit(
        'shop.duplicate_payment', 'shop_order', v_order.id::text, 'system', 'mercado_pago',
        jsonb_build_object('paymentId', p_provider_payment_id, 'acceptedPaymentId', v_order.provider_payment_id),
        v_order.organization_id
      );
      update public.shop_orders set needs_refund = true, updated_at = now() where id = v_order.id
      returning * into v_order;
      return jsonb_build_object('outcome', 'duplicate_payment', 'order', plu_private.shop_order_json(v_order));
    end if;
    return jsonb_build_object('outcome', 'ignored', 'order', plu_private.shop_order_json(v_order));
  end if;

  if p_status = 'approved' then
    if v_order.status = 'aprobado' then
      return jsonb_build_object('outcome', 'already_approved', 'order', plu_private.shop_order_json(v_order));
    end if;

    if v_order.status = 'pendiente' then
      v_outcome := 'approved';
    elsif plu_private.shop_try_reserve_order_stock(v_order.id) then
      -- Pagó con el pedido vencido o cancelado y todavía hay con qué cumplirlo.
      v_outcome := 'revived';
    else
      update public.shop_orders
      set needs_refund = true, provider_payment_id = p_provider_payment_id, updated_at = now()
      where id = v_order.id
      returning * into v_order;
      perform plu_private.record_domain_audit(
        'shop.late_payment_unfulfillable', 'shop_order', v_order.id::text, 'system', 'mercado_pago',
        jsonb_build_object('paymentId', p_provider_payment_id, 'orderStatus', v_order.status),
        v_order.organization_id
      );
      return jsonb_build_object('outcome', 'needs_refund', 'order', plu_private.shop_order_json(v_order));
    end if;

    update public.shop_orders
    set status = 'aprobado', approved_at = now(), approved_by = 'mercado_pago',
        provider_payment_id = p_provider_payment_id, payment_pending_at = null,
        needs_refund = false, cancelled_at = null, cancel_reason = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;

    perform plu_private.record_domain_audit(
      case when v_outcome = 'revived' then 'shop.order_revived' else 'shop.order_approved' end,
      'shop_order', v_order.id::text, 'system', 'mercado_pago',
      jsonb_build_object('paymentId', p_provider_payment_id, 'amount', v_order.amount),
      v_order.organization_id
    );
    return jsonb_build_object('outcome', v_outcome, 'order', plu_private.shop_order_json(v_order));
  end if;

  if p_status in ('pending', 'in_process', 'authorized') then
    if v_order.status = 'pendiente' then
      update public.shop_orders
      set payment_pending_at = coalesce(payment_pending_at, now()), updated_at = now()
      where id = v_order.id
      returning * into v_order;
    end if;
    return jsonb_build_object('outcome', 'pending', 'order', plu_private.shop_order_json(v_order));
  end if;

  if p_status in ('refunded', 'charged_back') and v_order.status = 'aprobado'
    and v_order.provider_payment_id = p_provider_payment_id then
    perform plu_private.shop_release_order_stock(v_order.id);
    update public.shop_orders
    set status = 'cancelado', cancelled_at = now(), updated_at = now(),
        cancel_reason = case when p_status = 'refunded'
          then 'Pago reembolsado en Mercado Pago.' else 'Contracargo en Mercado Pago.' end
    where id = v_order.id
    returning * into v_order;
    perform plu_private.record_domain_audit(
      'shop.order_payment_reversed', 'shop_order', v_order.id::text, 'system', 'mercado_pago',
      jsonb_build_object('paymentId', p_provider_payment_id, 'status', p_status),
      v_order.organization_id
    );
    return jsonb_build_object('outcome', 'reversed', 'order', plu_private.shop_order_json(v_order));
  end if;

  -- rejected / cancelled: el pedido sigue vivo hasta que venza; el comprador
  -- puede reintentar con otro medio dentro de la misma preferencia.
  return jsonb_build_object('outcome', 'not_approved', 'order', plu_private.shop_order_json(v_order));
end;
$$;

-- ---------------------------------------------------------------------------
-- Comprobante de transferencia (lo registra el comprador con su token)
-- ---------------------------------------------------------------------------
create or replace function public.register_shop_order_proof(
  p_order_id uuid,
  p_access_token_hash text,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
begin
  select * into v_order from public.shop_orders
  where id = p_order_id and access_token_hash = p_access_token_hash
  for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  if v_order.payment_method <> 'bank_transfer' then
    raise exception 'Este pedido no se paga por transferencia.' using errcode = 'PLU10';
  end if;
  if v_order.status <> 'pendiente' then
    raise exception 'El pedido ya no admite comprobante.' using errcode = 'PLU03';
  end if;
  if p_proof_path is null or p_proof_path !~ ('^' || v_order.id::text || '/[A-Za-z0-9._()+ -]+$') then
    raise exception 'Ruta de comprobante inválida.' using errcode = 'PLU01';
  end if;

  update public.shop_orders
  set proof_path = p_proof_path, proof_uploaded_at = now(), updated_at = now()
  where id = v_order.id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'shop.order_proof_uploaded', 'shop_order', v_order.id::text, 'public', null,
    jsonb_build_object('reference', v_order.reference), v_order.organization_id
  );
  return plu_private.shop_order_json(v_order);
end;
$$;

-- ---------------------------------------------------------------------------
-- Operación del staff
-- ---------------------------------------------------------------------------
create or replace function public.staff_approve_shop_order(p_order_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
  v_previous text;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  if v_order.payment_method = 'mercado_pago' then
    raise exception 'Los pagos de Mercado Pago se acreditan solos desde el webhook.'
      using errcode = 'PLU10';
  end if;
  if v_order.status = 'aprobado' then
    return plu_private.shop_order_json(v_order);
  end if;

  v_previous := v_order.status;
  if v_order.status <> 'pendiente' then
    -- Venció o se canceló, pero la plata llegó: se recupera el stock si se puede.
    if not plu_private.shop_try_reserve_order_stock(v_order.id) then
      raise exception 'El pedido venció y ya no hay stock para cumplirlo.' using errcode = 'PLU03';
    end if;
  end if;

  update public.shop_orders
  set status = 'aprobado', approved_at = now(), approved_by = p_actor,
      cancelled_at = null, cancel_reason = null, needs_refund = false, updated_at = now()
  where id = v_order.id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'shop.order_approved', 'shop_order', v_order.id::text, 'staff', p_actor,
    jsonb_build_object('reference', v_order.reference, 'method', v_order.payment_method,
      'previousStatus', v_previous, 'amount', v_order.amount),
    v_order.organization_id
  );
  return plu_private.shop_order_json(v_order);
end;
$$;

create or replace function public.staff_cancel_shop_order(
  p_order_id uuid,
  p_actor text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  if v_order.status in ('cancelado', 'vencido') then
    return plu_private.shop_order_json(v_order);
  end if;
  if v_order.status = 'aprobado' and v_order.payment_method = 'mercado_pago' then
    raise exception 'Un pago acreditado por Mercado Pago se devuelve desde Mercado Pago.'
      using errcode = 'PLU10';
  end if;
  if v_order.fulfilled_at is not null then
    raise exception 'El pedido ya fue entregado.' using errcode = 'PLU03';
  end if;

  perform plu_private.shop_release_order_stock(v_order.id);
  update public.shop_orders
  set status = 'cancelado', cancelled_at = now(), updated_at = now(),
      cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
  where id = v_order.id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'shop.order_cancelled', 'shop_order', v_order.id::text, 'staff', p_actor,
    jsonb_build_object('reference', v_order.reference, 'reason', v_order.cancel_reason),
    v_order.organization_id
  );
  return plu_private.shop_order_json(v_order);
end;
$$;

create or replace function public.staff_fulfill_shop_order(p_order_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  if v_order.status <> 'aprobado' then
    raise exception 'Solo se entregan pedidos con el pago acreditado.' using errcode = 'PLU03';
  end if;
  if v_order.fulfilled_at is not null then
    return plu_private.shop_order_json(v_order);
  end if;

  update public.shop_orders
  set fulfilled_at = now(), fulfilled_by = p_actor, updated_at = now()
  where id = v_order.id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'shop.order_fulfilled', 'shop_order', v_order.id::text, 'staff', p_actor,
    jsonb_build_object('reference', v_order.reference), v_order.organization_id
  );
  return plu_private.shop_order_json(v_order);
end;
$$;

-- Marca como resuelto un pedido que quedó con `needs_refund` (la devolución se
-- hace fuera del sistema, en Mercado Pago o por transferencia).
create or replace function public.staff_resolve_shop_refund(p_order_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  if not v_order.needs_refund then
    return plu_private.shop_order_json(v_order);
  end if;

  update public.shop_orders set needs_refund = false, updated_at = now()
  where id = v_order.id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'shop.refund_resolved', 'shop_order', v_order.id::text, 'staff', p_actor,
    jsonb_build_object('reference', v_order.reference), v_order.organization_id
  );
  return plu_private.shop_order_json(v_order);
end;
$$;

-- Vence los pedidos sin pagar y devuelve su stock. Un pedido de Mercado Pago
-- con un pago en proceso (p. ej. un cupón de pago en efectivo) espera 3 días
-- más antes de vencer.
create or replace function public.expire_shop_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
  v_ids uuid[] := '{}';
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

create or replace function public.list_admin_shop_orders(
  p_status text default null,
  p_limit integer default 100,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(plu_private.shop_order_json(o) order by o.created_at desc), '[]'::jsonb)
  from public.shop_orders o
  where o.id in (
    select id from public.shop_orders
    where organization_id = p_organization_id
      and (p_status is null or status = p_status)
    order by created_at desc
    limit greatest(least(coalesce(p_limit, 100), 200), 1)
  );
$$;

create or replace function public.get_shop_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
begin
  select * into v_order from public.shop_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PLU02';
  end if;
  return plu_private.shop_order_json(v_order);
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuración de cobro (panel)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_shop_checkout_settings(
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
  v_bank uuid := nullif(p_data->>'bankTransferProfileId', '')::uuid;
  v_mp uuid := nullif(p_data->>'mercadoPagoProfileId', '')::uuid;
  v_row public.shop_checkout_settings;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la operación.' using errcode = 'PLU01';
  end if;
  if v_bank is not null and not exists (
    select 1 from public.payment_profiles
    where id = v_bank and organization_id = p_organization_id and kind = 'bank_transfer' and active
  ) then
    raise exception 'La cuenta bancaria elegida no existe o está inactiva.' using errcode = 'PLU02';
  end if;
  if v_mp is not null and not exists (
    select 1 from public.payment_profiles
    where id = v_mp and organization_id = p_organization_id and kind = 'mercado_pago' and active
  ) then
    raise exception 'La cuenta de Mercado Pago elegida no existe o está inactiva.' using errcode = 'PLU02';
  end if;

  insert into public.shop_checkout_settings (
    organization_id, mercado_pago_enabled, bank_transfer_enabled, cash_enabled,
    mercado_pago_profile_id, bank_transfer_profile_id, cash_instructions, fulfillment_note,
    updated_by, updated_at
  ) values (
    p_organization_id,
    coalesce((p_data->>'mercadoPagoEnabled')::boolean, true),
    coalesce((p_data->>'bankTransferEnabled')::boolean, false),
    coalesce((p_data->>'cashEnabled')::boolean, true),
    v_mp, v_bank,
    btrim(coalesce(p_data->>'cashInstructions', '')),
    btrim(coalesce(p_data->>'fulfillmentNote', '')),
    p_actor, now()
  )
  on conflict (organization_id) do update set
    mercado_pago_enabled = excluded.mercado_pago_enabled,
    bank_transfer_enabled = excluded.bank_transfer_enabled,
    cash_enabled = excluded.cash_enabled,
    mercado_pago_profile_id = excluded.mercado_pago_profile_id,
    bank_transfer_profile_id = excluded.bank_transfer_profile_id,
    cash_instructions = excluded.cash_instructions,
    fulfillment_note = excluded.fulfillment_note,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  perform plu_private.record_domain_audit(
    'shop.checkout_settings_updated', 'shop_checkout_settings', v_row.organization_id::text,
    'staff', p_actor,
    jsonb_build_object('mercadoPago', v_row.mercado_pago_enabled, 'bankTransfer', v_row.bank_transfer_enabled,
      'cash', v_row.cash_enabled),
    v_row.organization_id
  );
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: todo es del backend
-- ---------------------------------------------------------------------------
revoke all on function public.list_public_shop_products(uuid) from public, anon, authenticated;
revoke all on function public.create_shop_order(jsonb, jsonb, text, text, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_shop_mercado_pago_payment(uuid, text, text, numeric, text)
  from public, anon, authenticated;
revoke all on function public.register_shop_order_proof(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.staff_approve_shop_order(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_cancel_shop_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.staff_fulfill_shop_order(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_resolve_shop_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.expire_shop_orders() from public, anon, authenticated;
revoke all on function public.list_admin_shop_orders(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_shop_order(uuid) from public, anon, authenticated;
revoke all on function public.upsert_shop_checkout_settings(jsonb, text, uuid) from public, anon, authenticated;

grant execute on function public.list_public_shop_products(uuid) to service_role;
grant execute on function public.create_shop_order(jsonb, jsonb, text, text, integer, uuid, uuid) to service_role;
grant execute on function public.apply_shop_mercado_pago_payment(uuid, text, text, numeric, text) to service_role;
grant execute on function public.register_shop_order_proof(uuid, text, text) to service_role;
grant execute on function public.staff_approve_shop_order(uuid, text) to service_role;
grant execute on function public.staff_cancel_shop_order(uuid, text, text) to service_role;
grant execute on function public.staff_fulfill_shop_order(uuid, text) to service_role;
grant execute on function public.staff_resolve_shop_refund(uuid, text) to service_role;
grant execute on function public.expire_shop_orders() to service_role;
grant execute on function public.list_admin_shop_orders(text, integer, uuid) to service_role;
grant execute on function public.get_shop_order(uuid) to service_role;
grant execute on function public.upsert_shop_checkout_settings(jsonb, text, uuid) to service_role;

do $verification$
begin
  if to_regclass('public.shop_orders') is null
    or to_regclass('public.shop_order_items') is null
    or to_regclass('public.shop_checkout_settings') is null then
    raise exception 'Las tablas de pedidos de la tienda no quedaron creadas.' using errcode = 'PLU01';
  end if;
  if not exists (select 1 from storage.buckets where id = 'shop-payment-proofs' and public = false) then
    raise exception 'El bucket de comprobantes de la tienda no quedó privado.' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.create_shop_order(jsonb,jsonb,text,text,integer,uuid,uuid)') is null
    or to_regprocedure('public.apply_shop_mercado_pago_payment(uuid,text,text,numeric,text)') is null
    or to_regprocedure('public.expire_shop_orders()') is null then
    raise exception 'La verificación de los pedidos de la tienda no fue superada.' using errcode = 'PLU01';
  end if;
end
$verification$;
