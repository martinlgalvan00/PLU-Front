-- Restaura 'closed_before_expiry' al dominio de cancellation_code.
--
-- 20260922100000_financed_payment_deadline reemplazó la constraint para sumar
-- 'financing_term_expired' y perdió 'closed_before_expiry' en el camino. Pero
-- plu_private.stamp_order_closure() sigue sellando ese código cuando una orden
-- se cierra antes de su vencimiento sin que el camino que la cerró declare
-- motivo (p. ej. un rechazo tardío de Mercado Pago sobre una orden pendiente).
-- Cualquier orden en ese camino violaba el check y la base rechazaba la
-- escritura completa.

alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_cancellation_code_check;
alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_cancellation_code_check
  check (cancellation_code is null or cancellation_code in (
    'expired_without_payment',
    'expired_after_failed_attempt',
    'provider_cancelled',
    'cancelled_by_staff',
    'superseded_by_new_order',
    'resolved_off_platform',
    'closed_before_expiry',
    'financing_term_expired'
  ));
