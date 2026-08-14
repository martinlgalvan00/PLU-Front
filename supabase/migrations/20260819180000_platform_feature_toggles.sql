-- Interruptores generales de cobro, afiliación e inscripción.
-- A diferencia de `registration_access_gates` (que exige un código para
-- entrar durante una tanda privada), esto es un corte total: con el
-- interruptor apagado nadie puede crear una orden nueva de ese tipo, tenga
-- o no el código. Sirve para pausar altas sin tocar variables de entorno ni
-- redeploys.
--
-- `checkout_enabled` reemplaza en la operación diaria a la variable de
-- entorno `PAID_CHECKOUT_ENABLED` (server/lib/featureAvailability.js): esa
-- variable sigue existiendo en el código como freno de emergencia si
-- Supabase no respondiera, pero el panel es la fuente de verdad para
-- pausar y reabrir cobros.

create table if not exists public.platform_feature_toggles (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  checkout_enabled boolean not null default true,
  membership_enabled boolean not null default true,
  registration_enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.platform_feature_toggles enable row level security;
revoke all on public.platform_feature_toggles from public, anon, authenticated;
grant select, insert, update on public.platform_feature_toggles to service_role;

insert into public.platform_feature_toggles (organization_id)
values ('00000000-0000-4000-8000-000000000001'::uuid)
on conflict (organization_id) do nothing;

create or replace function public.staff_get_platform_feature_toggles()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'checkoutEnabled', t.checkout_enabled,
        'membershipEnabled', t.membership_enabled,
        'registrationEnabled', t.registration_enabled,
        'updatedBy', t.updated_by,
        'updatedAt', t.updated_at
      )
      from public.platform_feature_toggles t
      where t.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ),
    jsonb_build_object(
      'checkoutEnabled', true, 'membershipEnabled', true, 'registrationEnabled', true,
      'updatedBy', null, 'updatedAt', null
    )
  );
$$;

create or replace function public.staff_set_platform_feature_toggle(
  p_feature text,
  p_enabled boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_feature text := lower(btrim(coalesce(p_feature, '')));
  v_row public.platform_feature_toggles;
  v_previous boolean;
begin
  if v_feature not in ('checkout', 'membership', 'registration') then
    raise exception 'La funcionalidad indicada no es válida.' using errcode = 'PLU02';
  end if;
  if p_enabled is null then
    raise exception 'El estado del interruptor es inválido.' using errcode = 'PLU02';
  end if;

  insert into public.platform_feature_toggles (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  select * into v_row from public.platform_feature_toggles where organization_id = v_org for update;
  v_previous := case v_feature
    when 'checkout' then v_row.checkout_enabled
    when 'membership' then v_row.membership_enabled
    else v_row.registration_enabled
  end;

  if v_feature = 'checkout' then
    update public.platform_feature_toggles
    set checkout_enabled = p_enabled, updated_by = p_actor, updated_at = now()
    where organization_id = v_org
    returning * into v_row;
  elsif v_feature = 'membership' then
    update public.platform_feature_toggles
    set membership_enabled = p_enabled, updated_by = p_actor, updated_at = now()
    where organization_id = v_org
    returning * into v_row;
  else
    update public.platform_feature_toggles
    set registration_enabled = p_enabled, updated_by = p_actor, updated_at = now()
    where organization_id = v_org
    returning * into v_row;
  end if;

  perform plu_private.record_domain_audit(
    'platform_feature_toggle.updated', 'platform_feature_toggle', v_feature,
    'staff', p_actor,
    jsonb_build_object('feature', v_feature, 'enabled', p_enabled, 'previousEnabled', v_previous),
    v_org
  );

  return jsonb_build_object(
    'checkoutEnabled', v_row.checkout_enabled,
    'membershipEnabled', v_row.membership_enabled,
    'registrationEnabled', v_row.registration_enabled,
    'updatedBy', v_row.updated_by,
    'updatedAt', v_row.updated_at
  );
end;
$$;

revoke all on function public.staff_get_platform_feature_toggles() from public, anon, authenticated;
revoke all on function public.staff_set_platform_feature_toggle(text, boolean, text) from public, anon, authenticated;
grant execute on function public.staff_get_platform_feature_toggles() to service_role;
grant execute on function public.staff_set_platform_feature_toggle(text, boolean, text) to service_role;
