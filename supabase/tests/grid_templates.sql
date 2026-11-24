-- Plantillas de grilla (20261212100000). No deja datos: termina en rollback.
--
-- Se afirma lo que se rompería en silencio:
--   * guardar con un nombre existente pisa (sin importar mayúsculas ni espacios);
--   * una organización no ve ni borra las plantillas de otra;
--   * el navegador no toca la tabla;
--   * los límites (nombre, config) fallan con un mensaje que se puede leer.

begin;

do $templates$
declare
  v_slug text := 'tpl-smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_other_slug text := 'tpl-other-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_other_org uuid := gen_random_uuid();
  v_list jsonb;
  v_id uuid;
  v_config jsonb := jsonb_build_object(
    'platforms', jsonb_build_array('Tablado 1', 'Tablado 2'),
    'maxPerSession', 12, 'groupBy', jsonb_build_array('sex', 'category'));
begin
  insert into public.organizations(id, name, slug)
  values (v_other_org, 'Otra org', 'otra-' || replace(v_other_org::text, '-', ''));

  perform public.staff_upsert_event(
    jsonb_build_object('slug', v_slug, 'title', 'Templates smoke', 'venue', 'S', 'location', 'BA',
      'startsAt', '2026-11-13T12:00:00Z', 'endsAt', '2026-11-14T22:00:00Z'),
    'tpl-smoke');
  perform public.staff_upsert_event(
    jsonb_build_object('slug', v_other_slug, 'title', 'Otro evento', 'venue', 'S', 'location', 'BA',
      'startsAt', '2026-11-13T12:00:00Z', 'endsAt', '2026-11-14T22:00:00Z'),
    'tpl-smoke');
  update public.events set organization_id = v_other_org where slug = v_other_slug;

  assert public.staff_list_grid_templates(v_slug) = '[]'::jsonb, 'arranca sin plantillas';

  -- Alta
  v_list := public.staff_save_grid_template(v_slug, '  Doble tablado  ', v_config, 'tpl-smoke');
  assert jsonb_array_length(v_list) = 1, 'queda una plantilla';
  assert v_list -> 0 ->> 'name' = 'Doble tablado', 'el nombre se recorta';
  assert v_list -> 0 -> 'config' -> 'platforms' ->> 1 = 'Tablado 2', 'guarda la configuración';
  v_id := (v_list -> 0 ->> 'id')::uuid;

  -- Guardar con el mismo nombre (otra capitalización, con espacios) pisa, no duplica.
  v_list := public.staff_save_grid_template(
    v_slug, 'DOBLE TABLADO ', jsonb_build_object('maxPerSession', 8), 'tpl-smoke');
  assert jsonb_array_length(v_list) = 1, 'el mismo nombre no duplica';
  assert (v_list -> 0 ->> 'id')::uuid = v_id, 'conserva el id';
  assert (v_list -> 0 -> 'config' ->> 'maxPerSession')::int = 8, 'pisa la configuración';
  assert v_list -> 0 ->> 'name' = 'DOBLE TABLADO', 'toma el nombre nuevo';

  -- Otra plantilla, el orden es alfabético sin distinguir mayúsculas.
  v_list := public.staff_save_grid_template(v_slug, 'a primera', v_config, 'tpl-smoke');
  assert v_list -> 0 ->> 'name' = 'a primera', 'ordena sin distinguir mayúsculas';

  -- Aislamiento entre organizaciones.
  assert public.staff_list_grid_templates(v_other_slug) = '[]'::jsonb,
    'otra organización no ve las plantillas';
  begin
    perform public.staff_delete_grid_template(v_other_slug, v_id, 'tpl-smoke');
    assert false, 'tendría que haber fallado';
  exception when sqlstate 'PLU09' then
    null;
  end;
  assert exists (select 1 from public.grid_templates where id = v_id), 'no se borró la ajena';

  -- Límites legibles.
  begin
    perform public.staff_save_grid_template(v_slug, '   ', v_config, 'tpl-smoke');
    assert false, 'nombre vacío';
  exception when sqlstate 'PLU01' then null; end;
  begin
    perform public.staff_save_grid_template(v_slug, repeat('x', 81), v_config, 'tpl-smoke');
    assert false, 'nombre largo';
  exception when sqlstate 'PLU01' then null; end;
  begin
    perform public.staff_save_grid_template(v_slug, 'mala', '[]'::jsonb, 'tpl-smoke');
    assert false, 'config que no es objeto';
  exception when sqlstate 'PLU01' then null; end;
  begin
    perform public.staff_save_grid_template(
      v_slug, 'gorda', jsonb_build_object('x', repeat('y', 6000)), 'tpl-smoke');
    assert false, 'config enorme';
  exception when check_violation then null; end;

  -- Baja
  v_list := public.staff_delete_grid_template(v_slug, v_id, 'tpl-smoke');
  assert jsonb_array_length(v_list) = 1, 'queda una';
  begin
    perform public.staff_delete_grid_template(v_slug, v_id, 'tpl-smoke');
    assert false, 'borrar dos veces';
  exception when sqlstate 'PLU09' then null; end;

  -- Evento inexistente
  begin
    perform public.staff_list_grid_templates('no-existe-' || v_slug);
    assert false, 'evento inexistente';
  exception when sqlstate 'PLU02' then null; end;

  -- El navegador no toca la tabla ni las RPC.
  assert not has_table_privilege('anon', 'public.grid_templates', 'select')
    and not has_table_privilege('authenticated', 'public.grid_templates', 'select')
    and not has_table_privilege('authenticated', 'public.grid_templates', 'insert'),
    'el navegador no accede a grid_templates';
  assert not has_function_privilege('authenticated',
    'public.staff_save_grid_template(text, text, jsonb, text)', 'execute'),
    'el navegador no ejecuta las RPC de plantillas';
end
$templates$;

rollback;
