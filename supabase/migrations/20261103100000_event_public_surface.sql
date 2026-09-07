-- Superficie pública del evento: qué bloques ve el sitio.
-- staff_upsert_event reconstruye `rules`; este merge escribe publicSurface
-- después del save para no perder el flag ni exigir reescribir toda la RPC.

create or replace function public.staff_merge_event_public_surface(
  p_slug text,
  p_surface jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface jsonb;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  v_surface := jsonb_build_object(
    'calendar', coalesce((p_surface ->> 'calendar')::boolean, true),
    'weighIns', coalesce((p_surface ->> 'weighIns')::boolean, true),
    'livestream', coalesce((p_surface ->> 'livestream')::boolean, true),
    'experience', coalesce((p_surface ->> 'experience')::boolean, true),
    'categories', coalesce((p_surface ->> 'categories')::boolean, true),
    'location', coalesce((p_surface ->> 'location')::boolean, true)
  );

  update public.events
  set
    rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{publicSurface}', v_surface, true),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_public_surface(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_public_surface(text, jsonb)
to service_role;
