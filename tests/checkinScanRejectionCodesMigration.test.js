import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261124100000_checkin_scan_rejection_codes.sql',
  'utf8',
)

describe('migración: códigos de rechazo distintos por motivo de escaneo', () => {
  it('da un código propio a cada motivo de rechazo', () => {
    expect(migration).toMatch(/todavía no está vigente[\s\S]*?errcode = 'PLU14'/)
    expect(migration).toMatch(/venció el %[\s\S]*?errcode = 'PLU15'/)
    expect(migration).toMatch(/no habilita esta zona[\s\S]*?errcode = 'PLU16'/)
  })

  it('deja PLU05 exclusivo del rechazo por falta de pago', () => {
    const plu05Matches = migration.match(/errcode = 'PLU05'/g) ?? []
    expect(plu05Matches).toHaveLength(1)
    expect(migration).toMatch(/no tiene el pago acreditado[\s\S]*?errcode = 'PLU05'/)
  })

  it('conserva PLU06 para la entrada ya usada', () => {
    expect(migration).toMatch(/ya fue utilizada[\s\S]*?errcode = 'PLU06'/)
  })

  it('repite el par revoke/grant de las dos firmas de staff_check_in_ticket', () => {
    expect(migration).toContain(
      'revoke all on function public.staff_check_in_ticket(uuid, text, text, text)',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_check_in_ticket(uuid, text, text, text)\n  to service_role',
    )
    expect(migration).toContain(
      'revoke all on function public.staff_check_in_ticket(uuid, text, text)',
    )
  })

  it('verifica los tres códigos nuevos al final de la migración', () => {
    expect(migration).toContain('do $verification$')
    expect(migration).toContain("position('PLU14' in pg_get_functiondef(")
    expect(migration).toContain("position('PLU15' in pg_get_functiondef(")
    expect(migration).toContain("position('PLU16' in pg_get_functiondef(")
  })
})
