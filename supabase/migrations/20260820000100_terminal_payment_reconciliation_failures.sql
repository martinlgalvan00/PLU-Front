-- Detiene conciliaciones que no pueden mejorar con un reintento automatico.
-- No acredita, no modifica la orden y deja el error como evidencia. La
-- conciliacion manual forzada sigue disponible despues de corregir el entorno.

begin;

create or replace function public.stop_embedded_payment_reconciliation(
  p_attempt_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.embedded_payment_attempts
  set reconciliation_status = 'failed',
      reconciliation_attempts = greatest(reconciliation_attempts, 12),
      error = left(coalesce(nullif(p_error, ''), 'Conciliación detenida por una falla no reintentable.'), 2000),
      reconciliation_locked_at = null,
      -- La funcion de reclamo manual con p_force=true omite esta fecha y el
      -- limite de intentos. El worker automatico no vuelve a levantarla.
      next_reconcile_at = now() + interval '100 years',
      updated_at = now()
  where id = p_attempt_id;
end;
$$;

revoke all on function public.stop_embedded_payment_reconciliation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.stop_embedded_payment_reconciliation(uuid, text)
  to service_role;

commit;
