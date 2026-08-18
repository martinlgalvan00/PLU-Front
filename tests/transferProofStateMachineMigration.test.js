import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819120000_transfer_proof_state_machine.sql'),
  'utf8',
)

describe('máquina de estados del comprobante de transferencia', () => {
  it('solo permite adjuntar comprobantes a órdenes abiertas y extiende la revisión 48 horas', () => {
    expect(migration).toContain("if v_order.status not in ('pendiente', 'validacion_manual') then")
    expect(migration).toContain(
      'if v_order.expires_at is not null and v_order.expires_at < now() then',
    )
    expect(migration).toContain("status = 'validacion_manual'")
    expect(migration).toContain("expires_at = now() + interval '48 hours'")
  })

  it('no permite aprobar ni rechazar transiciones terminales', () => {
    expect(
      migration.match(/if v_order.status not in \('pendiente', 'validacion_manual'\) then/g),
    ).toHaveLength(3)
    expect(migration).toContain("if v_order.status = 'aprobado' then")
    expect(migration).toContain("if v_order.status = 'rechazado' then")
  })
})
