-- Revisión barata de la lista de puerta.
--
-- staff_get_event_checkin_allowlist arma el JSON de todas las entradas.
-- Con varios teléfonos preguntando cada dos minutos, eso es el costo grande
-- aunque no haya entrado nadie. Esta función devuelve un sello (conteos y
-- la última modificación) para que el API responda 304 y no baje el JSON.
--
-- current_date entra en el sello: una membresía que vence por calendario,
-- sin que nadie edite la fila, fuerza una descarga completa al día siguiente.
-- La vigencia del QR (todavía no / ya venció) la recalcula el teléfono con
-- validFrom y validUntil, así un 304 no deja congelado ese veredicto.

create or replace function public.staff_get_event_checkin_allowlist_revision(p_event_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(
    '|',
    e.id::text,
    current_date::text,
    (select count(*)::text from public.tickets t where t.event_id = e.id),
    (select coalesce(max(t.updated_at)::text, '0') from public.tickets t where t.event_id = e.id),
    (select count(*)::text from public.check_ins c where c.event_id = e.id),
    (select coalesce(max(c.scanned_at)::text, '0') from public.check_ins c where c.event_id = e.id),
    (select count(*)::text from public.event_registrations r where r.event_id = e.id and r.status = 'confirmada'),
    (select coalesce(max(r.updated_at)::text, '0') from public.event_registrations r where r.event_id = e.id),
    (select coalesce(max(tt.updated_at)::text, '0') from public.ticket_types tt where tt.event_id = e.id),
    (
      select coalesce(max(a.updated_at)::text, '0')
      from public.athletes a
      where a.id in (
        select r.athlete_id
        from public.event_registrations r
        where r.event_id = e.id and r.status = 'confirmada'
      )
    ),
    (
      select coalesce(max(m.updated_at)::text, '0')
      from public.memberships m
      where m.athlete_id in (
        select r.athlete_id
        from public.event_registrations r
        where r.event_id = e.id and r.status = 'confirmada'
      )
    )
  )
  from public.events e
  where e.slug = p_event_slug;
$$;

revoke all on function public.staff_get_event_checkin_allowlist_revision(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_checkin_allowlist_revision(text) to service_role;
