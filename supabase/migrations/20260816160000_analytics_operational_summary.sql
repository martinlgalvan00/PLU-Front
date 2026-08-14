-- Resumen agregado para operación: no expone eventos crudos ni identidad.
create or replace function public.get_analytics_operational_summary(
  p_from timestamptz, p_to timestamptz,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
) returns jsonb language sql stable security definer set search_path = public as $$
  with sessions as (
    select * from public.analytics_sessions where organization_id=p_organization_id and started_at>=p_from and started_at<p_to
  ), events as (
    select * from public.analytics_events where organization_id=p_organization_id and occurred_at>=p_from and occurred_at<p_to
  ), access_rows as (
    select c.*, e.title as event_title from public.check_ins c join public.events e on e.id=c.event_id
    where c.organization_id=p_organization_id and c.scanned_at>=p_from and c.scanned_at<p_to
  ) select jsonb_build_object(
    'engagedVisitors',(select count(distinct visitor_id) from sessions where page_count > 1 or event_count > 1),
    'engagedSessions',(select count(*) from sessions where page_count > 1 or event_count > 1),
    'formSubmits',(select count(*) from events where event_type='form_submit'),
    'keyActions',coalesce((select jsonb_agg(row_to_json(a) order by a.people desc) from (
      select coalesce(nullif(name,''),event_type) as action, count(*) as interactions, count(distinct visitor_id) as people
      from events where event_type in ('conversion','custom','form_submit') group by 1 order by 3 desc,2 desc limit 12
    ) a),'[]'::jsonb),
    'access',jsonb_build_object(
      'total',(select count(*) from access_rows),
      'athletes',(select count(*) from access_rows where attendee_kind='athlete'),
      'spectators',(select count(*) from access_rows where attendee_kind<>'athlete'),
      'byHour',coalesce((select jsonb_agg(row_to_json(h) order by h.hour) from (select to_char(scanned_at,'HH24:00') as hour,count(*) as entries from access_rows group by 1)h),'[]'::jsonb),
      'byGate',coalesce((select jsonb_agg(row_to_json(g) order by g.entries desc) from (select coalesce(nullif(gate,''),'Sin puerta') as gate,count(*) as entries from access_rows group by 1)g),'[]'::jsonb),
      'byEvent',coalesce((select jsonb_agg(row_to_json(e) order by e.entries desc) from (select event_title,count(*) as entries from access_rows group by 1)e),'[]'::jsonb)
    )
  );
$$;
revoke all on function public.get_analytics_operational_summary(timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.get_analytics_operational_summary(timestamptz,timestamptz,uuid) to service_role;
