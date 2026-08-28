import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * organizationTimezone.test.js — PLU ARG
 *
 * 20260930100000 fija la base en hora argentina. El bug que cierra lo encontró
 * el E2E de Mercado Pago corriendo a las 23:14 ART: `current_date` en UTC ya
 * era "mañana", la membresía recién pagada nacía con start_date del día
 * siguiente y el frontend la proyectaba SCHEDULED — el atleta pagaba y veía
 * "Sin afiliación" hasta la medianoche, tres horas por día.
 *
 * Estas afirmaciones fijan la forma de la migración: la zona a nivel base, los
 * roles de entrada alineados y la verificación que corta el deploy si no quedó.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260930100000_organization_timezone_buenos_aires.sql',
  ),
  'utf8',
)

describe('la base opera en hora argentina', () => {
  it('fija la zona a nivel base: toma en cada conexión nueva', () => {
    expect(migration).toContain(
      "alter database postgres set timezone to 'America/Argentina/Buenos_Aires'",
    )
  })

  it('alinea los roles de entrada de PostgREST sin esperar el rollover', () => {
    expect(migration).toContain('alter role authenticator set timezone')
    expect(migration).toContain('alter role postgres set timezone')
  })

  it('la verificación corta si la configuración no quedó persistida', () => {
    expect(migration).toContain('pg_db_role_setting')
    expect(migration).toContain("'TimeZone=America/Argentina/Buenos_Aires' = any(s.setconfig)")
  })

  it('documenta el bug de la vigencia adelantada, que es el porqué de todo esto', () => {
    expect(migration).toMatch(/current_date/)
    expect(migration).toMatch(/SCHEDULED|programada/)
  })
})
