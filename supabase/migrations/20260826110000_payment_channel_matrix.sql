-- Matriz de cobro: concepto × canal de pago — PLU ARG
--
-- Hasta acá el canal de pago no existía como dimensión. Había una columna
-- booleana por combinación que alguien necesitó
-- (`membership_manual_enabled`, 20260820130000_manual_channel_validation_toggles.sql),
-- con dos consecuencias:
--
--   1. Transferencia y efectivo quedaron fusionados en un solo interruptor.
--      Abrir solo transferencia era imposible desde el panel: la única
--      granularidad por canal vivía en los cupones (`discount_codes.manual_channels`,
--      20260825110000_promo_code_payment_channels.sql).
--   2. Mercado Pago quedó implícito como "el que siempre está". No había forma
--      de cerrarlo sin cerrar el concepto entero o el maestro `checkout`.
--
-- Esta migración normaliza lo que crece —el canal— y deja como columnas lo que
-- es fijo: un alta y una validación por concepto, más el maestro. Agregar un
-- medio de pago nuevo (MODO, débito automático, otra pasarela) pasa a ser un
-- INSERT y una clave de i18n, no una migración de esquema ni un `if` en el
-- checkout.
--
-- COMPATIBILIDAD. El payload de `staff_get_platform_feature_toggles` conserva
-- `membershipManualEnabled` / `registrationManualEnabled` / `ticketManualEnabled`,
-- ahora derivados (`bank_transfer or cash_pitbull`) en vez de almacenados: una
-- API desplegada antes que esta migración sigue leyendo el mismo booleano sin
-- que exista una segunda fuente de verdad que se pueda desincronizar. Mismo
-- criterio que `discount_codes.enables_manual_payment`. El setter viejo
-- (`staff_set_platform_feature_toggle('membership_manual', false, …)`) sigue
-- funcionando: escribe los dos canales manuales de ese concepto.
--
-- SIEMBRA. Las nueve celdas se derivan del estado actual de la fila, así que
-- aplicar esta migración no cambia el comportamiento de ningún cobro. La
-- apertura de un canal la hace después un administrador desde el panel.

-- ---------------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------------

create table if not exists public.platform_payment_channels (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  concept text not null,
  channel text not null,
  enabled boolean not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, concept, channel)
);

alter table public.platform_payment_channels
  drop constraint if exists platform_payment_channels_concept_check;
alter table public.platform_payment_channels
  add constraint platform_payment_channels_concept_check
  check (concept in ('membership', 'registration', 'ticket'));

alter table public.platform_payment_channels
  drop constraint if exists platform_payment_channels_channel_check;
alter table public.platform_payment_channels
  add constraint platform_payment_channels_channel_check
  check (channel in ('mercado_pago', 'bank_transfer', 'cash_pitbull'));

alter table public.platform_payment_channels enable row level security;
revoke all on public.platform_payment_channels from public, anon, authenticated;
grant select, insert, update, delete on public.platform_payment_channels to service_role;

-- ---------------------------------------------------------------------------
-- 2. Catálogo de la matriz y política por omisión
--
-- Una celda faltante nunca se interpreta en el código que consume el payload:
-- el getter siempre devuelve las nueve. El default preserva exactamente la
-- semántica vigente antes de esta migración -- Mercado Pago abierto, canales
-- manuales de afiliación e inscripción cerrados (opt-in explícito,
-- 20260823100000_mercado_pago_only_membership_registration.sql), transferencia
-- de entradas abierta salvo cierre explícito.
-- ---------------------------------------------------------------------------

create or replace function plu_private.payment_channel_concepts()
returns text[]
language sql
immutable
as $$
  select array['membership', 'registration', 'ticket']::text[];
$$;

create or replace function plu_private.payment_channel_names()
returns text[]
language sql
immutable
as $$
  select array['mercado_pago', 'bank_transfer', 'cash_pitbull']::text[];
$$;

create or replace function plu_private.payment_channel_defaults()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'membership', jsonb_build_object(
      'mercado_pago', true, 'bank_transfer', false, 'cash_pitbull', false
    ),
    'registration', jsonb_build_object(
      'mercado_pago', true, 'bank_transfer', false, 'cash_pitbull', false
    ),
    'ticket', jsonb_build_object(
      'mercado_pago', true, 'bank_transfer', true, 'cash_pitbull', false
    )
  );
$$;

revoke all on function plu_private.payment_channel_concepts() from public, anon, authenticated;
revoke all on function plu_private.payment_channel_names() from public, anon, authenticated;
revoke all on function plu_private.payment_channel_defaults() from public, anon, authenticated;

-- Producto cartesiano completo con LEFT JOIN: la matriz sale con las nueve
-- celdas siempre, tenga la tabla las filas o no.
create or replace function plu_private.payment_channel_matrix(p_organization_id uuid)
returns jsonb
language sql
stable
set search_path = public, plu_private
as $$
  select jsonb_object_agg(grouped.concept, grouped.channels)
  from (
    select
      grid.concept,
      jsonb_object_agg(
        grid.channel,
        coalesce(
          cell.enabled,
          (plu_private.payment_channel_defaults() -> grid.concept ->> grid.channel)::boolean
        )
      ) as channels
    from (
      select concept, channel
      from unnest(plu_private.payment_channel_concepts()) as concept
      cross join unnest(plu_private.payment_channel_names()) as channel
    ) grid
    left join public.platform_payment_channels cell
      on cell.organization_id = p_organization_id
     and cell.concept = grid.concept
     and cell.channel = grid.channel
    group by grid.concept
  ) grouped;
$$;

revoke all on function plu_private.payment_channel_matrix(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Siembra desde el estado vigente
-- ---------------------------------------------------------------------------

insert into public.platform_feature_toggles (organization_id)
values ('00000000-0000-4000-8000-000000000001'::uuid)
on conflict (organization_id) do nothing;

insert into public.platform_payment_channels (
  organization_id, concept, channel, enabled, updated_by
)
select
  t.organization_id,
  grid.concept,
  grid.channel,
  case
    -- Mercado Pago nunca estuvo cerrable por concepto: el estado equivalente
    -- es "abierto", y a partir de ahora el panel puede cerrarlo.
    when grid.channel = 'mercado_pago' then true
    -- Transferencia y efectivo heredan el interruptor manual que los cubría a
    -- los dos, leído por nombre de columna para no repetir un CASE por concepto.
    else coalesce((to_jsonb(t) ->> (grid.concept || '_manual_enabled'))::boolean, false)
  end,
  'migration:20260826110000'
from public.platform_feature_toggles t
cross join (
  select concept, channel
  from unnest(plu_private.payment_channel_concepts()) as concept
  cross join unnest(plu_private.payment_channel_names()) as channel
) grid
on conflict (organization_id, concept, channel) do nothing;

insert into public.domain_audit_logs (
  organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
)
select
  organization_id,
  'platform_payment_channel.seeded',
  'platform_payment_channel',
  'matrix',
  'system',
  'migration:20260826110000',
  jsonb_build_object(
    'channels', plu_private.payment_channel_matrix(organization_id),
    'reason', 'concept_channel_matrix_launch'
  )
from public.platform_feature_toggles;

-- ---------------------------------------------------------------------------
-- 4. Las columnas manuales se van: la matriz es la única fuente de verdad
--
-- El payload las sigue exponiendo derivadas (ver cabecera). `drop function`
-- antes del `drop column` porque el armador viejo recibe la fila entera y
-- referencia esas columnas.
-- ---------------------------------------------------------------------------

drop function if exists plu_private.platform_feature_toggles_payload(
  public.platform_feature_toggles
);

alter table public.platform_feature_toggles
  drop column if exists membership_manual_enabled,
  drop column if exists registration_manual_enabled,
  drop column if exists ticket_manual_enabled;

create or replace function plu_private.platform_feature_toggles_payload(
  p_row public.platform_feature_toggles,
  p_organization_id uuid
)
returns jsonb
language sql
stable
set search_path = public, plu_private
as $$
  with matrix as (
    select plu_private.payment_channel_matrix(p_organization_id) as channels
  )
  select jsonb_build_object(
    'checkoutEnabled', p_row.checkout_enabled,
    'membershipEnabled', p_row.membership_enabled,
    'registrationEnabled', p_row.registration_enabled,
    'ticketEnabled', p_row.ticket_enabled,
    -- Derivados: un concepto tiene canal manual si alguno de los dos está
    -- abierto. Existen para los lectores del contrato anterior.
    'membershipManualEnabled',
      (m.channels -> 'membership' ->> 'bank_transfer')::boolean
        or (m.channels -> 'membership' ->> 'cash_pitbull')::boolean,
    'registrationManualEnabled',
      (m.channels -> 'registration' ->> 'bank_transfer')::boolean
        or (m.channels -> 'registration' ->> 'cash_pitbull')::boolean,
    'ticketManualEnabled',
      (m.channels -> 'ticket' ->> 'bank_transfer')::boolean
        or (m.channels -> 'ticket' ->> 'cash_pitbull')::boolean,
    'membershipValidationEnabled', p_row.membership_validation_enabled,
    'registrationValidationEnabled', p_row.registration_validation_enabled,
    'ticketValidationEnabled', p_row.ticket_validation_enabled,
    'paymentChannels', m.channels,
    'updatedBy', p_row.updated_by,
    'updatedAt', p_row.updated_at
  )
  from matrix m;
$$;

revoke all on function plu_private.platform_feature_toggles_payload(
  public.platform_feature_toggles, uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Lista blanca de interruptores por columna
--
-- Los tres `*_manual` salen de la lista de columnas y pasan a resolverse como
-- alias de la matriz dentro del setter.
-- ---------------------------------------------------------------------------

create or replace function plu_private.platform_feature_toggle_column(p_feature text)
returns text
language sql
immutable
set search_path = public, plu_private
as $$
  select case lower(btrim(coalesce(p_feature, '')))
    when 'checkout' then 'checkout_enabled'
    when 'membership' then 'membership_enabled'
    when 'registration' then 'registration_enabled'
    when 'ticket' then 'ticket_enabled'
    when 'membership_validation' then 'membership_validation_enabled'
    when 'registration_validation' then 'registration_validation_enabled'
    when 'ticket_validation' then 'ticket_validation_enabled'
    else null
  end;
$$;

revoke all on function plu_private.platform_feature_toggle_column(text)
  from public, anon, authenticated;

-- Alias del contrato anterior: `<concepto>_manual` -> el concepto cuyos dos
-- canales manuales se escriben juntos.
create or replace function plu_private.platform_manual_feature_concept(p_feature text)
returns text
language sql
immutable
set search_path = public, plu_private
as $$
  select case lower(btrim(coalesce(p_feature, '')))
    when 'membership_manual' then 'membership'
    when 'registration_manual' then 'registration'
    when 'ticket_manual' then 'ticket'
    else null
  end;
$$;

revoke all on function plu_private.platform_manual_feature_concept(text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Getter
-- ---------------------------------------------------------------------------

create or replace function public.staff_get_platform_feature_toggles()
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_row public.platform_feature_toggles;
begin
  select * into v_row from public.platform_feature_toggles
  where organization_id = v_org;

  -- Sin fila todo lo que es alta queda abierto: es el estado por defecto de la
  -- plataforma, no un corte. Los canales los resuelve la matriz con su propio
  -- default (Mercado Pago abierto, manual de afiliación e inscripción cerrado).
  if not found then
    v_row.checkout_enabled := true;
    v_row.membership_enabled := true;
    v_row.registration_enabled := true;
    v_row.ticket_enabled := true;
    v_row.membership_validation_enabled := true;
    v_row.registration_validation_enabled := true;
    v_row.ticket_validation_enabled := true;
  end if;

  return plu_private.platform_feature_toggles_payload(v_row, v_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Setter de canal
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_payment_channel(
  p_concept text,
  p_channel text,
  p_enabled boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_concept text := lower(btrim(coalesce(p_concept, '')));
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_previous boolean;
  v_row public.platform_feature_toggles;
begin
  if not (v_concept = any (plu_private.payment_channel_concepts())) then
    raise exception 'El concepto de cobro indicado no es válido.' using errcode = 'PLU02';
  end if;
  if not (v_channel = any (plu_private.payment_channel_names())) then
    raise exception 'El medio de pago indicado no es válido.' using errcode = 'PLU02';
  end if;
  if p_enabled is null then
    raise exception 'El estado del interruptor es inválido.' using errcode = 'PLU02';
  end if;

  insert into public.platform_feature_toggles (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  select enabled into v_previous from public.platform_payment_channels
  where organization_id = v_org and concept = v_concept and channel = v_channel
  for update;
  if not found then
    v_previous := (plu_private.payment_channel_defaults() -> v_concept ->> v_channel)::boolean;
  end if;

  insert into public.platform_payment_channels (
    organization_id, concept, channel, enabled, updated_by, updated_at
  ) values (v_org, v_concept, v_channel, p_enabled, p_actor, now())
  on conflict (organization_id, concept, channel) do update
  set enabled = excluded.enabled,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  -- La marca de "última edición" del bloque de interruptores es compartida: el
  -- panel muestra un solo `updatedAt` para toda la sección.
  update public.platform_feature_toggles
  set updated_by = p_actor, updated_at = now()
  where organization_id = v_org
  returning * into v_row;

  perform plu_private.record_domain_audit(
    'platform_payment_channel.updated', 'platform_payment_channel',
    v_concept || ':' || v_channel,
    'staff', p_actor,
    jsonb_build_object(
      'concept', v_concept,
      'channel', v_channel,
      'enabled', p_enabled,
      'previousEnabled', v_previous
    ),
    v_org
  );

  return plu_private.platform_feature_toggles_payload(v_row, v_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Setter de interruptor, con el alias manual del contrato anterior
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_platform_feature_toggle(
  p_feature text,
  p_enabled boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_feature text := lower(btrim(coalesce(p_feature, '')));
  v_column text := plu_private.platform_feature_toggle_column(v_feature);
  v_manual_concept text := plu_private.platform_manual_feature_concept(v_feature);
  v_row public.platform_feature_toggles;
  v_previous boolean;
  v_result jsonb;
begin
  if p_enabled is null then
    raise exception 'El estado del interruptor es inválido.' using errcode = 'PLU02';
  end if;

  -- Contrato anterior: un solo interruptor cubría transferencia y efectivo.
  -- Se traduce a las dos celdas de la matriz para que un cliente viejo siga
  -- obteniendo el mismo efecto observable.
  if v_manual_concept is not null then
    perform public.staff_set_payment_channel(v_manual_concept, 'bank_transfer', p_enabled, p_actor);
    v_result := public.staff_set_payment_channel(
      v_manual_concept, 'cash_pitbull', p_enabled, p_actor
    );
    return v_result;
  end if;

  if v_column is null then
    raise exception 'La funcionalidad indicada no es válida.' using errcode = 'PLU02';
  end if;

  insert into public.platform_feature_toggles (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  select * into v_row from public.platform_feature_toggles
  where organization_id = v_org for update;

  v_previous := (to_jsonb(v_row) ->> v_column)::boolean;

  execute format(
    'update public.platform_feature_toggles
     set %I = $1, updated_by = $2, updated_at = now()
     where organization_id = $3',
    v_column
  ) using p_enabled, p_actor, v_org;

  -- Estático a propósito: con `returning * into v_row` el linter pierde el tipo
  -- de `v_row` y deja de chequear de acá para abajo
  -- (20260820140000_fix_platform_feature_toggle_dynamic_sql.sql).
  select * into v_row from public.platform_feature_toggles
  where organization_id = v_org;

  perform plu_private.record_domain_audit(
    'platform_feature_toggle.updated', 'platform_feature_toggle', v_feature,
    'staff', p_actor,
    jsonb_build_object('feature', v_feature, 'enabled', p_enabled, 'previousEnabled', v_previous),
    v_org
  );

  return plu_private.platform_feature_toggles_payload(v_row, v_org);
end;
$$;

revoke all on function public.staff_get_platform_feature_toggles() from public, anon, authenticated;
revoke all on function public.staff_set_platform_feature_toggle(text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.staff_set_payment_channel(text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_get_platform_feature_toggles() to service_role;
grant execute on function public.staff_set_platform_feature_toggle(text, boolean, text)
  to service_role;
grant execute on function public.staff_set_payment_channel(text, text, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_toggles jsonb := public.staff_get_platform_feature_toggles();
  v_channels jsonb := v_toggles -> 'paymentChannels';
  v_concept text;
  v_channel text;
  v_key text;
begin
  -- Las nueve celdas, siempre y como booleano.
  foreach v_concept in array plu_private.payment_channel_concepts() loop
    if v_channels -> v_concept is null then
      raise exception 'Falta el concepto % en la matriz de cobro.', v_concept
        using errcode = 'PLU01';
    end if;
    foreach v_channel in array plu_private.payment_channel_names() loop
      if jsonb_typeof(v_channels -> v_concept -> v_channel) <> 'boolean' then
        raise exception 'La celda %/% no quedó expuesta como booleano.', v_concept, v_channel
          using errcode = 'PLU01';
      end if;
    end loop;
  end loop;

  -- El contrato anterior sigue completo.
  foreach v_key in array array[
    'checkoutEnabled', 'membershipEnabled', 'registrationEnabled', 'ticketEnabled',
    'membershipManualEnabled', 'registrationManualEnabled', 'ticketManualEnabled',
    'membershipValidationEnabled', 'registrationValidationEnabled', 'ticketValidationEnabled'
  ] loop
    if jsonb_typeof(v_toggles -> v_key) <> 'boolean' then
      raise exception 'El interruptor % dejó de estar expuesto.', v_key using errcode = 'PLU01';
    end if;
  end loop;

  -- El derivado tiene que ser el OR de las dos celdas, no un valor guardado.
  foreach v_concept in array plu_private.payment_channel_concepts() loop
    if (v_toggles ->> (v_concept || 'ManualEnabled'))::boolean is distinct from (
      (v_channels -> v_concept ->> 'bank_transfer')::boolean
      or (v_channels -> v_concept ->> 'cash_pitbull')::boolean
    ) then
      raise exception 'El derivado manual de % no coincide con la matriz.', v_concept
        using errcode = 'PLU01';
    end if;
  end loop;

  -- Las columnas viejas no pueden seguir existiendo: serían una segunda fuente
  -- de verdad silenciosa.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_feature_toggles'
      and column_name in (
        'membership_manual_enabled', 'registration_manual_enabled', 'ticket_manual_enabled'
      )
  ) then
    raise exception 'Quedaron columnas de canal manual en platform_feature_toggles.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
