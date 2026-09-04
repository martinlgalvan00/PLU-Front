import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTicketRow } from '../src/services/checkinScanService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261108100000_scan_shows_credential.sql'),
  'utf8',
)

/**
 * Una compra de entrenador emite dos credenciales con el MISMO nombre y el
 * MISMO DNI. Si la puerta no ve cuál está escaneando, las dos credenciales no
 * sirven de nada: es el punto entero de la función.
 */
describe('la puerta distingue las dos credenciales del entrenador', () => {
  const base = {
    id: 't-1',
    attendeeName: 'Coach Test',
    attendeeDni: '30111222',
    ticketTypeName: 'Entrenadores',
    status: 'pagada',
  }

  it('la fila del escaneo lleva la credencial, no sólo el tipo de entrada', () => {
    const espectador = buildTicketRow({ ...base, credentialLabel: 'Espectador' })
    const entrenador = buildTicketRow({ ...base, credentialLabel: 'ENTRENADOR' })

    // Mismo tipo de entrada y misma persona: lo único que las separa es esto.
    expect(espectador.ticketTypeName).toBe(entrenador.ticketTypeName)
    expect(espectador.name).toBe(entrenador.name)
    expect(espectador.credentialLabel).not.toBe(entrenador.credentialLabel)
  })

  /** Una entrada vieja no tiene credencial: no puede romper el escáner. */
  it('sin credencial cargada no inventa una', () => {
    expect(buildTicketRow(base).credentialLabel).toBeNull()
    expect(buildTicketRow(base).credentialScopes).toEqual([])
  })

  it('la verificación y la lista offline devuelven la credencial', () => {
    expect(migration).toContain("'credential_label', coalesce(t.credential_label")
    // Offline es el caso que más importa: en la puerta suele no haber señal, y
    // es justo cuando no se puede consultar nada.
    expect(migration).toContain("'credentialLabel', coalesce(t.credential_label")
  })
})
