-- Dos acciones de staff quedaban sin responsable en domain_audit_logs pese a
-- ser sensibles (cobro manual acreditado / contraseña de otro atleta
-- reemplazada): la RPC nunca recibia el actor que Express ya tenia
-- disponible (actor(req) / actorLabel(req)). El resto de las acciones
-- equivalentes (check-in, canje de beneficio, aprobacion de afiliacion) ya
-- auditan con actor_id; estas dos quedaban afuera del patron.

-- ---------------------------------------------------------------------------
-- Aprobacion manual de una orden de entradas: sumar actor auditado
-- ---------------------------------------------------------------------------
drop function if exists public.staff_approve_ticket_order(uuid);

create or replace function public.staff_approve_ticket_order(p_order_id uuid, p_actor text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.ticket_orders; v_tickets jsonb;
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago solo se acredita por webhook.' using errcode = 'PLU01';
  end if;
  if v_order.status = 'aprobado' then
    select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status <> 'pendiente' or v_order.payment_proof_path is null then
    raise exception 'La orden necesita un comprobante pendiente de revision.' using errcode = 'PLU03';
  end if;
  update public.ticket_orders set status = 'aprobado', reservation_expires_at = null, updated_at = now()
  where id = p_order_id returning * into v_order;
  update public.tickets set status = 'pagada', updated_at = now()
  where order_id = p_order_id and status = 'pendiente_pago';
  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('ticket_order.approved', 'ticket_order', p_order_id::text, 'staff', p_actor);
  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end $$;

revoke all on function public.staff_approve_ticket_order(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_approve_ticket_order(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reemplazo de contraseña de atleta: sumar actor auditado
-- ---------------------------------------------------------------------------
-- Se usa tanto para el autoservicio (POST /me/password, con contraseña
-- actual ya verificada) como para el reset admin (POST /admin/:id/credential,
-- accion de alto riesgo tipo account-takeover). p_actor null identifica el
-- primer caso (el propio atleta); cuando Express manda actorLabel(req) es un
-- staff actuando sobre una cuenta ajena.
drop function if exists public.set_athlete_password(uuid, text);

create or replace function public.set_athlete_password(
  p_athlete_id uuid,
  p_password_hash text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked integer;
begin
  if not exists (select 1 from public.athletes where id = p_athlete_id) then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  insert into public.athlete_credentials (
    athlete_id,
    password_hash,
    password_updated_at
  )
  values (
    p_athlete_id,
    p_password_hash,
    now()
  )
  on conflict (athlete_id) do update
    set password_hash = excluded.password_hash,
        password_updated_at = excluded.password_updated_at;

  update public.athlete_password_reset_tokens
     set used_at = now()
   where athlete_id = p_athlete_id
     and used_at is null;

  v_revoked := plu_private.revoke_athlete_sessions(p_athlete_id);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values(
    'athlete.password_set',
    'athlete',
    p_athlete_id::text,
    case when p_actor is null then 'athlete' else 'staff' end,
    coalesce(p_actor, p_athlete_id::text)
  );

  return jsonb_build_object('revokedSessions', v_revoked);
end;
$$;

revoke all on function public.set_athlete_password(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_athlete_password(uuid, text, text) to service_role;
