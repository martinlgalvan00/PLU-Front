-- Descartes de la cola de trabajo del dashboard admin.
-- Los ítems de la cola (`buildPendingActions`) se recalculan en vivo desde
-- pagos/inscripciones/afiliaciones -- nunca se guardan como filas propias.
-- Esta tabla solo registra qué `item_key` sintético (ej. "action-gate-42")
-- el equipo ya revisó y no quiere seguir viendo, sin tocar el registro de
-- negocio subyacente. Es compartida: lo que descarta un admin lo dejan de
-- ver todos.

create table if not exists public.admin_queue_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id) on delete cascade,
  item_key text not null check (char_length(btrim(item_key)) between 1 and 120),
  item_type text not null check (char_length(btrim(item_type)) between 1 and 60),
  dismissed_by text,
  dismissed_at timestamptz not null default now(),
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_queue_dismissals_org_item_key_unique
  on public.admin_queue_dismissals (organization_id, item_key);

alter table public.admin_queue_dismissals enable row level security;
revoke all on public.admin_queue_dismissals from public, anon, authenticated;
grant select, insert, delete on public.admin_queue_dismissals to service_role;

create or replace function public.staff_get_dismissed_queue_items()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'itemKey', item_key,
      'itemType', item_type,
      'dismissedBy', dismissed_by,
      'dismissedAt', dismissed_at
    )
    order by dismissed_at desc
  ), '[]'::jsonb)
  from public.admin_queue_dismissals
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid;
$$;

-- Idempotente a propósito: dos admins pueden descartar el mismo ítem casi al
-- mismo tiempo. Solo se audita cuando efectivamente se crea la fila, para no
-- ensuciar la bitácora con reintentos del mismo descarte.
create or replace function public.staff_dismiss_queue_item(
  p_item_key text,
  p_item_type text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_item_key text := btrim(coalesce(p_item_key, ''));
  v_item_type text := btrim(coalesce(p_item_type, ''));
  v_row public.admin_queue_dismissals;
  v_inserted boolean := false;
begin
  if char_length(v_item_key) < 1 or char_length(v_item_key) > 120 then
    raise exception 'El ítem a descartar es inválido.' using errcode = 'PLU02';
  end if;
  if char_length(v_item_type) < 1 or char_length(v_item_type) > 60 then
    raise exception 'El tipo de ítem es inválido.' using errcode = 'PLU02';
  end if;

  insert into public.admin_queue_dismissals(organization_id, item_key, item_type, dismissed_by)
  values (v_org, v_item_key, v_item_type, p_actor)
  on conflict (organization_id, item_key) do nothing
  returning * into v_row;

  v_inserted := found;

  if not v_inserted then
    select * into v_row
    from public.admin_queue_dismissals
    where organization_id = v_org and item_key = v_item_key;
  end if;

  if v_inserted then
    insert into public.domain_audit_logs(
      organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
    ) values (
      v_org, 'action_queue_item.dismissed', 'action_queue_item', v_item_key, 'staff', p_actor,
      jsonb_build_object('itemType', v_item_type)
    );
  end if;

  return jsonb_build_object(
    'itemKey', v_row.item_key,
    'itemType', v_row.item_type,
    'dismissedBy', v_row.dismissed_by,
    'dismissedAt', v_row.dismissed_at
  );
end;
$$;

create or replace function public.staff_undismiss_queue_item(
  p_item_key text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_item_key text := btrim(coalesce(p_item_key, ''));
  v_row public.admin_queue_dismissals;
begin
  delete from public.admin_queue_dismissals
  where organization_id = v_org and item_key = v_item_key
  returning * into v_row;

  if not found then
    return jsonb_build_object('itemKey', v_item_key, 'restored', false);
  end if;

  insert into public.domain_audit_logs(
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_org, 'action_queue_item.restored', 'action_queue_item', v_row.item_key, 'staff', p_actor,
    jsonb_build_object('itemType', v_row.item_type)
  );

  return jsonb_build_object('itemKey', v_row.item_key, 'restored', true);
end;
$$;

revoke all on function public.staff_get_dismissed_queue_items() from public, anon, authenticated;
revoke all on function public.staff_dismiss_queue_item(text, text, text) from public, anon, authenticated;
revoke all on function public.staff_undismiss_queue_item(text, text) from public, anon, authenticated;
grant execute on function public.staff_get_dismissed_queue_items() to service_role;
grant execute on function public.staff_dismiss_queue_item(text, text, text) to service_role;
grant execute on function public.staff_undismiss_queue_item(text, text) to service_role;
