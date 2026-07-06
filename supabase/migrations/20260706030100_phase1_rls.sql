-- Fase 1: RLS. Lectura publica de eventos publicados; todo lo demas
-- (incluida la escritura de tickets/inscripciones) queda cerrado a
-- anon/authenticated y solo se abre via las funciones RPC SECURITY
-- DEFINER de 20260706030200_phase1_rpc_functions.sql -- un WITH CHECK de
-- RLS no puede validar cupo de forma atomica sin correr una carrera entre
-- inserts concurrentes.

alter table public.events enable row level security;
alter table public.event_capacity_rules enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.tickets enable row level security;
alter table public.event_registrations enable row level security;
alter table public.check_ins enable row level security;

-- events: publico puede ver eventos publicados; admin ve y edita todo.
create policy "events_select_public"
  on public.events for select
  to anon, authenticated
  using (published = true);

create policy "events_select_admin"
  on public.events for select
  to authenticated
  using (public.is_admin());

create policy "events_write_admin"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- event_capacity_rules: sin select publico -- las funciones RPC la leen
-- como SECURITY DEFINER. Solo el admin la gestiona desde el panel.
create policy "event_capacity_rules_admin"
  on public.event_capacity_rules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ticket_orders / tickets / check_ins: sin policies de insert/update para
-- anon ni authenticated -- se escriben unicamente via las funciones RPC.
-- Se deja select para que el admin pueda auditar desde el panel/Studio.
create policy "ticket_orders_select_admin"
  on public.ticket_orders for select
  to authenticated
  using (public.is_admin());

create policy "tickets_select_admin"
  on public.tickets for select
  to authenticated
  using (public.is_admin());

create policy "event_registrations_select_admin"
  on public.event_registrations for select
  to authenticated
  using (public.is_admin());

create policy "check_ins_select_admin"
  on public.check_ins for select
  to authenticated
  using (public.is_admin());

-- Las policies de RLS solo restringen filas -- sin el GRANT de tabla de
-- abajo, Postgres rechaza la consulta antes de siquiera evaluar la policy
-- ("permission denied for table", no "0 rows"). Los RPC SECURITY DEFINER
-- no dependen de estos GRANTs (corren como el dueño de la funcion), pero
-- el acceso directo via supabase-js/PostgREST/Studio si.
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

grant select, insert, update, delete on public.event_capacity_rules to authenticated;

grant select on public.ticket_orders to authenticated;
grant select on public.tickets to authenticated;
grant select on public.event_registrations to authenticated;
grant select on public.check_ins to authenticated;
