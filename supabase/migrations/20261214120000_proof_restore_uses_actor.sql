-- `proof_restore` ya recibía `p_actor` (misma firma que `proof_trash`), pero no
-- lo usaba: `supabase db lint --fail-on warning` fallaba con
-- "unused parameter p_actor". El API siempre manda el actor; lo devolvemos en
-- el payload para trazabilidad y para que el parámetro deje de ser decorativo.

create or replace function public.proof_restore(p_file_id uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.payment_proof_files;
  v_current text;
  v_found boolean;
  v_grace int;
  v_actor text := left(nullif(btrim(coalesce(p_actor, '')), ''), 200);
begin
  select * into v_file from public.payment_proof_files where id = p_file_id for update;
  if not found then
    raise exception 'Archivo no encontrado.' using errcode = 'PLU02';
  end if;
  if v_file.purged_at is not null then
    raise exception 'El archivo ya se eliminó definitivamente.' using errcode = 'PLU10';
  end if;
  if v_file.deleted_at is null then
    return jsonb_build_object('restored', false, 'fileId', v_file.id, 'actor', v_actor);
  end if;

  -- Pasado el período de gracia el archivo ya es candidato a la purga física.
  -- Si se pudiera restaurar justo entonces, el job podría borrar el objeto de
  -- Storage de un comprobante que acaba de volver a estar vigente. Con el mismo
  -- criterio de corte que usa el job, esa carrera no existe.
  select coalesce(max(trash_grace_days), 30) into v_grace
  from public.payment_proof_settings
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid;
  if v_file.deleted_at <= now() - make_interval(days => v_grace) then
    raise exception 'El archivo superó el período de la papelera y está por eliminarse: descargalo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;
  if v_file.order_id is null then
    raise exception 'El archivo no está asociado a una orden: descargalo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;

  -- Restaurar = volver a ser el comprobante vigente de su orden. Si la orden ya
  -- no existe o tiene otro archivo, no hay dónde ponerlo.
  if v_file.source = 'athlete' then
    select true, payment_proof_path into v_found, v_current
    from public.athlete_payment_orders where id = v_file.order_id for update;
  elsif v_file.source = 'ticket' then
    select true, payment_proof_path into v_found, v_current
    from public.ticket_orders where id = v_file.order_id for update;
  else
    select true, proof_path into v_found, v_current
    from public.shop_orders where id = v_file.order_id for update;
  end if;
  if not coalesce(v_found, false) then
    raise exception 'La orden ya no existe: descargá el archivo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;
  if v_current is not null then
    raise exception 'La orden ya tiene otro comprobante: descargá este archivo en lugar de restaurarlo.'
      using errcode = 'PLU10';
  end if;

  -- Transaction-local: el trigger de "archivo nuevo" no debe borrar la historia.
  perform set_config('plu.proof_restore', 'on', true);
  if v_file.source = 'athlete' then
    update public.athlete_payment_orders
    set payment_proof_path = v_file.path,
        payment_proof_exported_at = v_file.exported_at,
        payment_proof_trashed_at = null,
        payment_proof_purged_at = null,
        updated_at = now()
    where id = v_file.order_id;
  elsif v_file.source = 'ticket' then
    update public.ticket_orders
    set payment_proof_path = v_file.path,
        payment_proof_exported_at = v_file.exported_at,
        payment_proof_trashed_at = null,
        payment_proof_purged_at = null,
        updated_at = now()
    where id = v_file.order_id;
  else
    update public.shop_orders set proof_path = v_file.path, updated_at = now()
    where id = v_file.order_id;
  end if;
  perform set_config('plu.proof_restore', 'off', true);

  update public.payment_proof_files
  set deleted_at = null, deleted_by = null, deleted_reason = null, superseded_at = null
  where id = v_file.id;

  return jsonb_build_object(
    'restored', true,
    'fileId', v_file.id,
    'source', v_file.source,
    'orderId', v_file.order_id,
    'actor', v_actor
  );
end;
$$;

revoke all on function public.proof_restore(uuid, text) from public, anon, authenticated;
grant execute on function public.proof_restore(uuid, text) to service_role;
