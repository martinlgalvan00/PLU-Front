import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261014100000_manual_approval_without_proof.sql',
  ),
  'utf8',
)

describe('aprobacion manual sin comprobante', () => {
  it('mantiene la aprobacion restringida a ordenes manuales abiertas', () => {
    expect(migration).toContain("if v_order.method <> 'manual_link' then")
    expect(migration).toContain("if v_order.status not in ('pendiente', 'validacion_manual') then")
    expect(migration).toContain("'payment.approved_manually'")
    expect(migration).toContain("'hasPaymentProof', v_order.payment_proof_path is not null")
  })

  it('no conserva la guarda que bloqueaba por falta de archivo', () => {
    expect(migration).not.toContain('Adjunta y revisa el comprobante antes de aprobar')
  })
})
