-- Acreditar en un paso una orden de entrada que el vencimiento canceló
-- con el comprobante ya cargado. Reabre y aprueba en la misma transacción:
-- si el cupo no alcanza, no queda a medias en pendiente. Una orden que ya
-- está pendiente no se acredita por acá: sigue el botón de validar.

create or replace function public.staff_settle_cancelled_ticket_order(
  p_order_id uuid,
  p_actor text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reopen jsonb;
  v_approved jsonb;
begin
  v_reopen := public.staff_reopen_cancelled_ticket_order(p_order_id, p_actor, p_reason);
  if coalesce((v_reopen ->> 'duplicate')::boolean, false) then
    raise exception 'La orden ya está pendiente: acreditala desde la cola.'
      using errcode = 'PLU03';
  end if;
  v_approved := public.staff_approve_ticket_order(p_order_id, p_actor, null);
  return v_approved || jsonb_build_object('settledFromCancelled', true);
end;
$$;

revoke all on function public.staff_settle_cancelled_ticket_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_settle_cancelled_ticket_order(uuid, text, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_settle_cancelled_ticket_order(uuid, text, text)') is null then
    raise exception 'Falta staff_settle_cancelled_ticket_order(uuid, text, text).'
      using errcode = 'PLU01';
  end if;
end
$verification$;
