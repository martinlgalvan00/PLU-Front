import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260817170000_fix_membership_renewal_start_date_leak.sql',
  ),
  'utf8',
)

describe('regresión de renovación después de un checkout cancelado', () => {
  it('calcula la nueva vigencia solo desde períodos efectivamente cobrados', () => {
    expect(migration).toContain("m.status in ('activa', 'vencida')")
    expect(migration).not.toContain("m.status <> 'pendiente_pago'")
  })

  it('mantiene el target de la orden alineado con la vigencia calculada', () => {
    expect(migration).toContain(
      'values (v_order.id, v_membership.id, v_start, v_end);',
    )
  })
})
