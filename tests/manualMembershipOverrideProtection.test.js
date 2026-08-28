import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260924110000_preserve_manual_membership_override.sql',
  ),
  'utf8',
)

describe('prioridad de la decision manual del entrenador', () => {
  it('protege una afiliacion activa con override manual', () => {
    expect(migration).toContain("old.manual_override_status = 'activa'")
    expect(migration).toContain("new.status in ('cancelada', 'reembolsada')")
    expect(migration).toContain('return old;')
  })

  it('no bloquea una baja manual explicita', () => {
    expect(migration).toContain("new.manual_override_status = 'activa'")
    expect(migration).toContain('before update of status on public.memberships')
  })

  it('mantiene Mercado Pago y la acreditacion manual como flujos separados', () => {
    expect(migration).toContain('notificacion tardia de Mercado Pago')
    expect(migration).toContain('No desactiva la validacion de Mercado Pago')
  })
})
