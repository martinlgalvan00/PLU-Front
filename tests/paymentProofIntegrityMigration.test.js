import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261214100000_payment_proof_integrity.sql'),
  'utf8',
)

describe('integridad de comprobantes', () => {
  it('un archivo nuevo limpia las marcas de descarga, acceso y purga', () => {
    expect(migration).toMatch(
      /payment_proof_path is distinct from old\.payment_proof_path/,
    )
    for (const column of [
      'payment_proof_exported_at',
      'payment_proof_accessed_at',
      'payment_proof_purged_at',
    ]) {
      expect(migration).toContain(`new.${column} := null;`)
    }
  })

  it('la purga (path en null) no cuenta como archivo nuevo', () => {
    expect(migration).toMatch(/new\.payment_proof_path is not null/)
  })

  it('el trigger cubre atletas y entradas', () => {
    expect(migration).toMatch(
      /before update of payment_proof_path on public\.athlete_payment_orders/,
    )
    expect(migration).toMatch(/before update of payment_proof_path on public\.ticket_orders/)
  })

  it('el resumen solo lo ejecuta el backend y no escala privilegios', () => {
    expect(migration).toMatch(
      /revoke all on function public\.payment_proof_overview\(text, int, int\)\s+from public, anon, authenticated;/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.payment_proof_overview\(text, int, int\)\s+to service_role;/,
    )
    expect(migration).not.toMatch(/security definer/i)
  })

  it('valida la política antes de calcular', () => {
    expect(migration).toContain("p_mode not in ('keep', 'after_export', 'after_days')")
    expect(migration).toContain('p_days < 1 or p_days > 3650')
  })
})
