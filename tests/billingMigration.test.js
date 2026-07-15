import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const phase3 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260715000200_phase3_billing_mercado_pago.sql'),
  'utf8',
)
const phase4 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260715000300_phase4_ticket_payments_renewals.sql'),
  'utf8',
)
const phase5 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260715000400_phase5_embedded_checkout.sql'),
  'utf8',
)

describe('billing migrations security contract', () => {
  it('reserva las acreditaciones automáticas al service role', () => {
    expect(phase3).toContain('to service_role;')
    expect(phase3).toContain('Monto o moneda no coinciden con la orden.')
    expect(phase4).toContain('apply_ticket_mercado_pago_payment')
    expect(phase4).toContain('Los pagos de Mercado Pago solo se aprueban por webhook.')
    expect(phase4).toContain('revoke all on function public.approve_ticket_order(uuid) from public, anon;')
  })

  it('persiste emails y renovaciones con claves idempotentes', () => {
    expect(phase4).toContain('idempotency_key text not null unique')
    expect(phase4).toContain('unique (membership_id, notification_key)')
    expect(phase4).toContain('for update skip locked')
    expect(phase4).toContain('attempts_count < 5')
  })

  it('arbitra intentos del checkout embebido sin almacenar tokens', () => {
    expect(phase5).toContain("'plu-annual-auto'")
    expect(phase5).toContain("'annual', 'recurring'")
    expect(phase5).toContain('embedded_payment_attempts_processing_uidx')
    expect(phase5).toContain("where status = 'processing'")
    expect(phase5).toContain('to service_role;')
    expect(phase5).toContain('token_fingerprint text not null')
    expect(phase5).not.toContain('card_token text')
  })
})
