-- Roster público del home: nombre completo del perfil.
--
-- Antes (20260813193000): el feed abreviaba el apellido a inicial
-- ("Joaquin Barbieri" → "Joaquin B.") aunque el renglón tenía ancho libre.
-- Misma decisión que el padrón de últimos inscriptos: mostrar el nombre
-- completo. Sigue sin exponer DNI, mail ni código de socio.

create or replace function public.public_list_community_spotlight(p_limit int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_members jsonb;
  v_stats jsonb;
begin
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'name', q.name,
          'gym', q.gym,
          'province', q.province,
          'affiliatedAt', q.affiliated_at,
          'photoPath', q.photo_path
        )
        order by q.activated_at desc, q.created_at desc
      )
      from (
        select
          m.id,
          coalesce(
            nullif(trim(both from regexp_replace(coalesce(a.full_name, ''), '\s+', ' ', 'g')), ''),
            'Atleta'
          ) as name,
          coalesce(nullif(trim(a.gym), ''), '-') as gym,
          coalesce(nullif(trim(a.province), ''), '-') as province,
          nullif(trim(a.photo_path), '') as photo_path,
          to_char(
            coalesce(m.start_date, (m.created_at at time zone 'utc')::date),
            'YYYY-MM-DD'
          ) as affiliated_at,
          coalesce(
            (
              select max(c.created_at)
              from public.membership_cycles c
              where c.membership_id = m.id
                and c.status = 'activa'
            ),
            m.updated_at,
            m.created_at
          ) as activated_at,
          m.created_at
        from public.memberships m
        join public.athletes a on a.id = m.athlete_id
        where m.status = 'activa'
          and coalesce(nullif(trim(a.full_name), ''), '') <> ''
        order by activated_at desc, m.created_at desc
        limit v_limit
      ) q
    ),
    '[]'::jsonb
  )
  into v_members;

  select jsonb_build_object(
    'memberCount', (
      select count(*)::int from public.memberships where status = 'activa'
    ),
    'activeGymCount', (
      select count(distinct nullif(trim(a.gym), ''))::int
      from public.memberships m
      join public.athletes a on a.id = m.athlete_id
      where m.status = 'activa'
        and nullif(trim(a.gym), '') is not null
    ),
    'provinceCount', (
      select count(distinct nullif(trim(a.province), ''))::int
      from public.memberships m
      join public.athletes a on a.id = m.athlete_id
      where m.status = 'activa'
        and nullif(trim(a.province), '') is not null
    )
  ) into v_stats;

  return jsonb_build_object(
    'members', coalesce(v_members, '[]'::jsonb),
    'stats', v_stats
  );
end;
$$;

revoke all on function public.public_list_community_spotlight(int) from public;
grant execute on function public.public_list_community_spotlight(int) to anon, authenticated, service_role;

comment on function public.public_list_community_spotlight(int) is
  'Feed publico del home: afiliados activos recientes por activacion, nombre completo + foto opcional + stats agregados.';
