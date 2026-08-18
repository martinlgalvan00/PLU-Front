import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260816140000_require_transfer_proof_before_approval.sql',
  ),
  'utf8',
)

describe('aprobación manual de transferencias de atleta', () => {
  it('exige comprobante antes de acreditar afiliación, inscripción o combo', () => {
    expect(migration).toContain("if v_order.method <> 'manual_link' then")
    expect(migration).toContain('if v_order.payment_proof_path is null then')
    expect(migration).toContain("'hasPaymentProof', true")
  })
})
