-- Landing: preset de animación "Profundidad" (`depth`).
--
-- Los bloques entran con perspectiva al llegar a la pantalla y el anterior se
-- aleja apenas (ver `src/lib/eventLandingMotion.js`). Solo cambia la lista de
-- presets que acepta la RPC del layout; el resto de la función es idéntico a
-- 20261229100000_event_landing_layout.sql.

create or replace function public.staff_merge_event_landing_layout(
  p_slug text,
  p_layout jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motions constant text[] := array['none', 'soft', 'bold', 'depth'];
  v_core constant text[] := array[
    'hero', 'facts', 'countdown', 'experience', 'categories', 'schedule',
    'weighIns', 'location', 'tickets', 'livestream', 'calendar', 'faq', 'materials'
  ];
  v_custom constant text[] := array['text', 'image', 'cta'];
  v_limits constant jsonb := jsonb_build_object(
    'eyebrow', 60, 'title', 120, 'body', 1200, 'label', 40,
    'href', 300, 'path', 200, 'alt', 140, 'caption', 200
  );
  v_blocks jsonb;
  v_palette jsonb;
  v_block jsonb;
  v_props jsonb;
  v_clean_blocks jsonb := '[]'::jsonb;
  v_clean_palette jsonb := '{}'::jsonb;
  v_seen text[] := array[]::text[];
  v_type text;
  v_id text;
  v_key text;
  v_val text;
  v_motion text;
  v_landing jsonb;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  if p_layout is null or jsonb_typeof(p_layout) <> 'object' then
    raise exception 'Layout de landing inválido.' using errcode = 'PLU01';
  end if;

  v_blocks := coalesce(p_layout -> 'blocks', '[]'::jsonb);
  if jsonb_typeof(v_blocks) <> 'array' then
    raise exception 'Los bloques de la landing deben ser una lista.' using errcode = 'PLU01';
  end if;
  if jsonb_array_length(v_blocks) > 24 then
    raise exception 'La landing admite hasta 24 bloques.' using errcode = 'PLU01';
  end if;

  for v_block in select value from jsonb_array_elements(v_blocks) loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'Bloque de landing inválido.' using errcode = 'PLU01';
    end if;

    v_type := v_block ->> 'type';
    v_id := v_block ->> 'id';

    if v_type is null or not (v_type = any (v_core) or v_type = any (v_custom)) then
      raise exception 'Tipo de bloque inválido.' using errcode = 'PLU01';
    end if;
    if v_id is null or v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'Id de bloque inválido.' using errcode = 'PLU01';
    end if;
    if v_id = any (v_seen) then
      raise exception 'Id de bloque repetido.' using errcode = 'PLU01';
    end if;
    -- Los integrados son uno por tipo y su id es el tipo.
    if v_type = any (v_core) and v_id <> v_type then
      raise exception 'Id de bloque integrado inválido.' using errcode = 'PLU01';
    end if;
    v_seen := v_seen || v_id;

    v_props := '{}'::jsonb;
    if v_type = any (v_custom) then
      for v_key in select jsonb_object_keys(v_limits) loop
        v_val := nullif(trim(coalesce(v_block -> 'props' ->> v_key, '')), '');
        if v_val is null then
          continue;
        end if;
        if length(v_val) > (v_limits ->> v_key)::int then
          raise exception 'Texto de bloque demasiado largo.' using errcode = 'PLU01';
        end if;
        if v_key = 'href' and v_val !~* '^(https://[^[:space:]]+|/[^/[:space:]][^[:space:]]*|/)$' then
          raise exception 'Link de bloque inválido.' using errcode = 'PLU01';
        end if;
        if v_key = 'path' and (v_val like '%..%' or v_val !~ '^[A-Za-z0-9._()+/-]+$') then
          raise exception 'Ruta de imagen inválida.' using errcode = 'PLU01';
        end if;
        v_props := v_props || jsonb_build_object(v_key, v_val);
      end loop;
    end if;

    v_clean_blocks := v_clean_blocks || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', v_id,
          'type', v_type,
          'visible', case
            when jsonb_typeof(v_block -> 'visible') = 'boolean' then (v_block ->> 'visible')::boolean
            else true
          end,
          'props', case when v_props = '{}'::jsonb then null else v_props end
        )
      )
    );
  end loop;

  v_palette := coalesce(p_layout -> 'palette', '{}'::jsonb);
  if jsonb_typeof(v_palette) <> 'object' then
    raise exception 'Paleta de landing inválida.' using errcode = 'PLU01';
  end if;
  foreach v_key in array array['accent', 'action', 'background'] loop
    v_val := nullif(trim(coalesce(v_palette ->> v_key, '')), '');
    if v_val is null then
      continue;
    end if;
    if v_val !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Color de landing inválido.' using errcode = 'PLU01';
    end if;
    v_clean_palette := v_clean_palette || jsonb_build_object(v_key, lower(v_val));
  end loop;

  v_motion := lower(trim(coalesce(p_layout ->> 'motion', 'soft')));
  if not (v_motion = any (v_motions)) then
    raise exception 'Animación de landing inválida.' using errcode = 'PLU01';
  end if;

  select coalesce(rules -> 'landing', '{}'::jsonb)
  into v_landing
  from public.events
  where slug = trim(p_slug)
  for update;

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;

  update public.events
  set
    rules = jsonb_set(
      coalesce(rules, '{}'::jsonb),
      '{landing}',
      v_landing || jsonb_build_object(
        'layout',
        jsonb_build_object('blocks', v_clean_blocks, 'palette', v_clean_palette, 'motion', v_motion)
      ),
      true
    ),
    updated_at = now()
  where slug = trim(p_slug);
end;
$$;

revoke all on function public.staff_merge_event_landing_layout(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_landing_layout(text, jsonb)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_landing_layout(text,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_landing_layout.';
  end if;
end
$verification$;
