import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818090000_transfer_proof_rejection.sql'),
  'utf8',
)

describe('rechazo manual de comprobantes de transferencia', () => {
  it('define reject_athlete_payment_order exigiendo comprobante y dejando la orden en rechazado', () => {
    expect(migration).toContain('create or replace function public.reject_athlete_payment_order(')
    expect(migration).toContain("if v_order.method <> 'manual_link' then")
    expect(migration).toContain('if v_order.payment_proof_path is null then')
    expect(migration).toContain("set status = 'rechazado', updated_at = now()")
    expect(migration).toContain("'payment.rejected_manually'")
    expect(migration).toContain(
      'grant execute on function public.reject_athlete_payment_order(uuid, text, text)\n  to service_role;',
    )
  })

  it('define reject_ticket_payment_order liberando el cupo de los tickets pendientes', () => {
    expect(migration).toContain('create or replace function public.reject_ticket_payment_order(')
    expect(migration).toContain(
      "if v_order.status <> 'pendiente' or v_order.payment_proof_path is null then",
    )
    expect(migration).toContain(
      "update public.tickets set status = 'cancelada', updated_at = now()\n  where order_id = p_order_id and status = 'pendiente_pago';",
    )
    expect(migration).toContain("'ticket_order.rejected'")
    expect(migration).toContain(
      'grant execute on function public.reject_ticket_payment_order(uuid, text, text)\n  to service_role;',
    )
  })

  it('ambas RPC son idempotentes ante un segundo rechazo', () => {
    expect(migration).toContain("if v_order.status = 'rechazado' then")
    expect(migration.match(/'duplicate', true/g)?.length).toBe(2)
  })
})
