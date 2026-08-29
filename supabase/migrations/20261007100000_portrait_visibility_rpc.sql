-- Ciclo D: una sola lectura para validar retratos públicos + índice de
-- membresías activas (el proxy consultaba 2–3 tablas por miss de visibilidad).

create index if not exists memberships_athlete_activa_idx
  on public.memberships (athlete_id)
  where status = 'activa';

create or replace function public.is_athlete_portrait_public(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.athletes a
    where a.photo_path = nullif(trim(p_path), '')
      and (
        exists (
          select 1
          from public.memberships m
          where m.athlete_id = a.id
            and m.status = 'activa'
        )
        or exists (
          select 1
          from public.event_registrations er
          where er.athlete_id = a.id
            and er.public_visible is true
        )
      )
  );
$$;

revoke all on function public.is_athlete_portrait_public(text) from public;
grant execute on function public.is_athlete_portrait_public(text) to service_role;

comment on function public.is_athlete_portrait_public(text) is
  'True si el photo_path pertenece a un atleta con afiliación activa o inscripción public_visible. Usado por /api/community/portrait.';
