-- Copy público del evento: cómo se presenta en su página.
--
-- Hoy el H1 de Pitbull sale de una CONSTANTE de código
-- (`PITBULL_CLASSIC.title` en src/lib/content/es.js), no del evento, y los
-- únicos textos editables de un evento son `title` y `description` -- y
-- `description` no se renderiza en ninguna página pública. Resultado: para
-- cambiar el título, la bajada o el texto del botón de un meet hay que tocar
-- código, y la edición siguiente (2027) obliga a lo mismo.
--
-- Se agregan tres campos, los que de verdad cambian por evento:
--   publicTitle  el título del hero (vacío = cae al `title` del evento)
--   heroLead     la bajada bajo el título
--   ctaLabel     el texto del botón principal
--
-- Los encabezados de cada bloque siguen viniendo del diseño a propósito: son
-- lo que mantiene el sitio coherente entre eventos.
--
-- Va como merge aparte y no dentro de `staff_upsert_event` por la misma razón
-- que `publicSurface` (20261103100000): ese upsert reconstruye `rules` clave
-- por clave con `jsonb_build_object`, así que cualquier clave que no esté
-- listada ahí se pierde en el próximo guardado.

create or replace function public.staff_merge_event_public_copy(
  p_slug text,
  p_copy jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_lead text;
  v_cta text;
  v_copy jsonb;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  v_title := nullif(trim(coalesce(p_copy ->> 'publicTitle', '')), '');
  v_lead := nullif(trim(coalesce(p_copy ->> 'heroLead', '')), '');
  v_cta := nullif(trim(coalesce(p_copy ->> 'ctaLabel', '')), '');

  -- Techos espejo del esquema de zod (cliente y servidor). La base también
  -- los valida porque es la última frontera antes del dato.
  if length(coalesce(v_title, '')) > 120
     or length(coalesce(v_lead, '')) > 240
     or length(coalesce(v_cta, '')) > 40 then
    raise exception 'Copy público demasiado largo.' using errcode = 'PLU01';
  end if;

  -- `jsonb_strip_nulls` deja fuera lo vacío: un campo sin cargar no viaja como
  -- null al público, simplemente no está y el front cae a su default.
  v_copy := jsonb_strip_nulls(
    jsonb_build_object(
      'publicTitle', v_title,
      'heroLead', v_lead,
      'ctaLabel', v_cta
    )
  );

  update public.events
  set
    rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{publicCopy}', v_copy, true),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_public_copy(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_public_copy(text, jsonb)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_public_copy(text,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_public_copy.';
  end if;
end
$verification$;
