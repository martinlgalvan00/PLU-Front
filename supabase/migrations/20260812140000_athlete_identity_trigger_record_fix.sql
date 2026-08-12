-- El trigger compartido corre sobre `athletes` y `athlete_sessions`.
-- Referenciar `new.athlete_id` dentro de un CASE para una fila de `athletes`
-- falla antes de que PostgreSQL pueda elegir la rama: ese record no tiene la
-- columna. Resolver el id en cada rama mantiene el trigger polimorfico.

create or replace function plu_private.capture_athlete_identity_event()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_organization_id uuid;
  v_athlete_id uuid;
  v_action text;
  v_status text;
  v_metadata jsonb;
  v_created_at timestamptz;
begin
  if tg_table_name = 'athletes' then
    v_organization_id := new.organization_id;
    v_athlete_id := new.id;
    v_action := 'account.created';
    v_status := 'succeeded';
    v_created_at := new.created_at;
    v_metadata := jsonb_build_object('accountKind', 'athlete', 'channel', 'self_service');
  elsif tg_table_name = 'athlete_sessions' and tg_op = 'INSERT' then
    v_athlete_id := new.athlete_id;
    select a.organization_id into v_organization_id
    from public.athletes a where a.id = v_athlete_id;
    v_action := 'auth.session_started';
    v_status := 'succeeded';
    v_created_at := new.created_at;
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'sessionId', new.id,
      'method', 'password',
      'ipHash', new.ip_hash,
      'userAgent', left(new.user_agent, 240),
      'expiresAt', new.expires_at
    ));
  elsif tg_table_name = 'athlete_sessions'
        and tg_op = 'UPDATE'
        and old.revoked_at is null
        and new.revoked_at is not null then
    v_athlete_id := new.athlete_id;
    select a.organization_id into v_organization_id
    from public.athletes a where a.id = v_athlete_id;
    v_action := 'auth.session_ended';
    v_status := 'succeeded';
    v_created_at := new.revoked_at;
    v_metadata := jsonb_build_object('sessionId', new.id, 'reason', 'logout');
  else
    return new;
  end if;

  insert into public.operational_event_logs (
    organization_id, source, action, entity_type, entity_id,
    actor_type, actor_id, status, severity, metadata, created_at
  ) values (
    v_organization_id,
    'identity',
    v_action,
    'athlete',
    v_athlete_id::text,
    'athlete',
    v_athlete_id::text,
    v_status,
    'success',
    coalesce(v_metadata, '{}'::jsonb),
    coalesce(v_created_at, now())
  );

  return new;
end;
$$;

revoke all on function plu_private.capture_athlete_identity_event()
  from public, anon, authenticated, service_role;
