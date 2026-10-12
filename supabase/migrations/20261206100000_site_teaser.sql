-- Anuncio "Pronto habrá novedades" del sitio público.
--
-- Es un ajuste del sitio, NO un evento: a propósito no hay fecha, sede, slug ni
-- título guardados en ningún lado. El teaser de la página de Eventos avisa que
-- viene otro torneo sin decir cuándo ni dónde, y la única forma de que "no se
-- sepa" sea cierta es que el dato no exista. Un evento real marcado como
-- secreto obligaría a censurar la API pública campo por campo; acá no hay nada
-- que censurar.
--
-- Una fila por organización, una columna por lugar donde puede mostrarse. Hoy
-- sólo la página de Eventos. Nace apagado: nadie ve el anuncio hasta que el
-- panel lo prenda.

create table if not exists public.site_teasers (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  events_enabled boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.site_teasers enable row level security;
revoke all on public.site_teasers from public, anon, authenticated;
grant select, insert, update on public.site_teasers to service_role;

insert into public.site_teasers (organization_id)
values ('00000000-0000-4000-8000-000000000001'::uuid)
on conflict (organization_id) do nothing;

create or replace function public.staff_get_site_teaser()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'eventsEnabled', t.events_enabled,
        'updatedBy', t.updated_by,
        'updatedAt', t.updated_at
      )
      from public.site_teasers t
      where t.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ),
    jsonb_build_object('eventsEnabled', false, 'updatedBy', null, 'updatedAt', null)
  );
$$;

create or replace function public.staff_set_site_teaser(
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
  v_row public.site_teasers;
  v_previous boolean;
begin
  if p_enabled is null then
    raise exception 'El estado del anuncio es inválido.' using errcode = 'PLU02';
  end if;

  insert into public.site_teasers (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  select * into v_row from public.site_teasers where organization_id = v_org for update;
  v_previous := v_row.events_enabled;

  update public.site_teasers
  set events_enabled = p_enabled, updated_by = p_actor, updated_at = now()
  where organization_id = v_org
  returning * into v_row;

  perform plu_private.record_domain_audit(
    'site_teaser.updated', 'site_teaser', 'events',
    'staff', p_actor,
    jsonb_build_object('placement', 'events', 'enabled', p_enabled, 'previousEnabled', v_previous),
    v_org
  );

  return jsonb_build_object(
    'eventsEnabled', v_row.events_enabled,
    'updatedBy', v_row.updated_by,
    'updatedAt', v_row.updated_at
  );
end;
$$;

revoke all on function public.staff_get_site_teaser() from public, anon, authenticated;
revoke all on function public.staff_set_site_teaser(boolean, text) from public, anon, authenticated;
grant execute on function public.staff_get_site_teaser() to service_role;
grant execute on function public.staff_set_site_teaser(boolean, text) to service_role;
