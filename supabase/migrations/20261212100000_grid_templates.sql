-- Plantillas de grilla — PLU ARG
--
-- Armar una grilla es siempre la misma decisión: cuántos tablados, cómo se
-- llaman, cuántos atletas por tanda, qué separa a dos tandas y cómo corren los
-- horarios. Una plantilla guarda esa decisión para volver a aplicarla en el
-- próximo evento sin reconstruirla.
--
-- Qué NO guarda: los días (son del evento), ni atletas, ni tandas ya creadas.
-- La plantilla es configuración; el plan que sale de aplicarla se calcula en el
-- cliente sobre los inscriptos de cada evento.
--
-- Por organización y no por evento: es justamente lo que se reutiliza entre
-- eventos. Solo la toca el backend (service_role): el navegador no lee ni
-- escribe plantillas (supabase/tests/schema_posture.sql).

create table if not exists public.grid_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  config jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint grid_templates_name_not_blank check (length(trim(name)) > 0),
  constraint grid_templates_name_length check (length(name) <= 80),
  constraint grid_templates_config_object check (jsonb_typeof(config) = 'object'),
  -- Una plantilla son unas decenas de bytes; el tope evita usar la tabla de depósito.
  constraint grid_templates_config_size check (pg_column_size(config) <= 4096)
);

-- Dos plantillas con el mismo nombre serían indistinguibles en el selector.
create unique index if not exists grid_templates_org_name_uidx
  on public.grid_templates (organization_id, lower(trim(name)));

alter table public.grid_templates enable row level security;

revoke all on public.grid_templates from public, anon, authenticated;
grant select, insert, update, delete on public.grid_templates to service_role;

-- ---------------------------------------------------------------------------
-- Lectura: un solo lugar que arma el JSON de la lista
-- ---------------------------------------------------------------------------
create or replace function plu_private.grid_templates_json(p_organization_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'config', t.config,
      'updatedAt', t.updated_at
    ) order by lower(t.name)
  ), '[]'::jsonb)
  from public.grid_templates t
  where t.organization_id = p_organization_id
$$;

revoke all on function plu_private.grid_templates_json(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.staff_list_grid_templates(p_event_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;
  return plu_private.grid_templates_json(v_event.organization_id);
end;
$$;

revoke all on function public.staff_list_grid_templates(text) from public, anon, authenticated;
grant execute on function public.staff_list_grid_templates(text) to service_role;

-- ---------------------------------------------------------------------------
-- Alta / pisado por nombre
-- ---------------------------------------------------------------------------
-- Guardar con un nombre que ya existe actualiza esa plantilla: es lo que espera
-- quien ajusta la suya y vuelve a guardar. Devuelve la lista completa para que
-- el panel no tenga que pedirla de nuevo.
create or replace function public.staff_save_grid_template(
  p_event_slug text,
  p_name text,
  p_config jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'La plantilla necesita un nombre de hasta 80 caracteres.' using errcode = 'PLU01';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'La configuración de la plantilla no es válida.' using errcode = 'PLU01';
  end if;

  insert into public.grid_templates (organization_id, name, config, created_by)
  values (v_event.organization_id, v_name, p_config, p_actor)
  on conflict (organization_id, lower(trim(name))) do update
    set name = excluded.name,
        config = excluded.config,
        updated_at = now()
  returning id into v_id;

  perform plu_private.record_domain_audit(
    'grid_template.saved', 'grid_template', v_id::text, 'staff', p_actor,
    jsonb_build_object('eventSlug', v_event.slug, 'name', v_name),
    v_event.organization_id
  );

  return plu_private.grid_templates_json(v_event.organization_id);
end;
$$;

revoke all on function public.staff_save_grid_template(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_grid_template(text, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Baja
-- ---------------------------------------------------------------------------
-- Solo borra una plantilla de la organización del evento: el id solo no alcanza
-- (sería borrar la de otra organización conociendo su uuid).
create or replace function public.staff_delete_grid_template(
  p_event_slug text,
  p_template_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_name text;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  delete from public.grid_templates
  where id = p_template_id and organization_id = v_event.organization_id
  returning name into v_name;

  if v_name is null then
    raise exception 'La plantilla ya no existe. Actualizá la lista antes de continuar.'
      using errcode = 'PLU09';
  end if;

  perform plu_private.record_domain_audit(
    'grid_template.deleted', 'grid_template', p_template_id::text, 'staff', p_actor,
    jsonb_build_object('eventSlug', v_event.slug, 'name', v_name),
    v_event.organization_id
  );

  return plu_private.grid_templates_json(v_event.organization_id);
end;
$$;

revoke all on function public.staff_delete_grid_template(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_grid_template(text, uuid, text) to service_role;
