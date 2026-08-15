import { describe, expect, it } from 'vitest'
import { assertSupabaseResult, requireSupabaseClient } from '../server/lib/supabaseRpc.js'

function statusOf(code) {
  try {
    assertSupabaseResult({ error: { code, message: 'falla' } })
  } catch (error) {
    return error.status
  }
  return null
}

describe('assertSupabaseResult', () => {
  it('devuelve los datos cuando no hay error', () => {
    expect(assertSupabaseResult({ data: { id: 1 }, error: null })).toEqual({ id: 1 })
  })

  it('mantiene el mapeo de negocio de los codigos PLU', () => {
    expect(statusOf('PLU01')).toBe(400)
    expect(statusOf('PLU02')).toBe(404)
    expect(statusOf('PLU06')).toBe(409)
    expect(statusOf('42501')).toBe(403)
  })

  // Una migracion sin aplicar no es una caida: si sale como 503 el frontend le
  // dice al operador que reintente en unos segundos y el panel parece muerto,
  // cuando lo que falta es un `supabase db push`.
  it('trata el objeto ausente como error de deploy y no como indisponibilidad', () => {
    expect(statusOf('PGRST202')).toBe(500) // funcion inexistente
    expect(statusOf('PGRST205')).toBe(500) // tabla inexistente
    expect(statusOf('42703')).toBe(500) // columna inexistente
    expect(statusOf('42P01')).toBe(500) // relacion inexistente
  })

  it('deja en 503 lo que si es indisponibilidad de la base', () => {
    expect(statusOf(undefined)).toBe(503)
    expect(statusOf('57014')).toBe(503)
  })

  it('propaga el codigo del error para poder identificar el objeto', () => {
    try {
      assertSupabaseResult({ error: { code: 'PGRST205', message: 'no table' } })
    } catch (error) {
      expect(error.details.code).toBe('PGRST205')
      expect(error.message).toBe('no table')
    }
  })
})

describe('requireSupabaseClient', () => {
  it('responde 503 cuando falta configuracion del cliente admin', () => {
    expect(() => requireSupabaseClient(null)).toThrowError(
      expect.objectContaining({ status: 503 }),
    )
  })
})
