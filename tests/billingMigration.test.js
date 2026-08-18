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
const phase6 = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260715000500_phase6_payment_recovery_operations.sql',
  ),
  'utf8',
)
const hardening = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260722130000_domain_integrity_payment_hardening.sql',
  ),
  'utf8',
)

describe('billing migrations security contract', () => {
  it('reserva las acreditaciones automáticas al service role', () => {
    expect(phase3).toContain('to service_role;')
    expect(phase3).toContain('Monto o moneda no coinciden con la orden.')
    expect(phase4).toContain('apply_ticket_mercado_pago_payment')
    expect(phase4).toContain('Los pagos de Mercado Pago solo se aprueban por webhook.')
    expect(phase4).toContain(
      'revoke all on function public.approve_ticket_order(uuid) from public, anon;',
    )
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

  it('recupera y concilia pagos con locks, backoff y acceso service role', () => {
    expect(phase6).toContain('begin;')
    expect(phase6).toContain('to_regclass(v_relation)')
    expect(phase6).toContain('for update skip locked')
    expect(phase6).toContain('claim_due_payment_integration_events')
    expect(phase6).toContain('claim_embedded_payment_reconciliations')
    expect(phase6).toContain('claim_embedded_subscription_attempt')
    expect(phase6).toContain("operation_kind = 'payment'")
    expect(phase6).toContain('power(2, greatest(attempts_count - 1, 0))')
    expect(phase6).toContain('get_payment_operations_summary')
    expect(phase6).toContain('to service_role;')
  })

  it('instala una maquina de estados que tolera eventos fuera de orden', () => {
    expect(phase6).toContain('El pago externo ya pertenece a otra orden.')
    expect(phase6).toContain('apply_mercado_pago_subscription')
    expect(phase6).toContain("v_subscription.status = 'past_due'")
    expect(phase6).toContain("when bool_or(status = 'aprobado') then 'aprobado'")
    expect(phase6).toContain("when bool_or(status = 'pendiente') then 'pendiente'")
    expect(phase6).toContain("'reembolsada'")
    expect(phase6).toContain('get_payment_system_health')
    expect(phase6.trimEnd()).toMatch(/commit;$/)
  })

  it('cierra la integridad global y conserva el contrato recurrente', () => {
    expect(hardening).toContain('create table if not exists public.payment_provider_registry')
    expect(hardening).toContain('before insert or update of external_payment_id')
    expect(hardening).toContain('prepare_mercado_pago_subscription')
    expect(hardening).toContain('v_start := v_target.starts_at')
    expect(hardening).toContain('p_amount <> v_subscription.amount')
    expect(hardening).toContain('create_membership_order_v3')
    expect(hardening).not.toContain('card_token text')
  })
})
