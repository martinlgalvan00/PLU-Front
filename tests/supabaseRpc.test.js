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

  // El checkout de Pitbull le mostro a un atleta `duplicate key value violates
  // unique constraint "event_registrations_event_id_athlete_id_key"`. El
  // mensaje de una violacion de integridad nombra el constraint: no es texto
  // de producto.
  it('no filtra el nombre del constraint en una violacion de integridad', () => {
    try {
      assertSupabaseResult(
        {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "event_registrations_event_id_athlete_id_key"',
          },
        },
        'No se pudo crear la inscripcion.',
      )
      throw new Error('deberia haber lanzado')
    } catch (error) {
      expect(error.status).toBe(409)
      expect(error.message).toBe('No se pudo crear la inscripcion.')
      expect(error.message).not.toContain('constraint')
      // El texto crudo sigue disponible para el log del errorHandler.
      expect(error.details.raw).toContain('event_registrations_event_id_athlete_id_key')
    }
  })

  it('conserva el mensaje de negocio de los PLU, que si esta escrito para el atleta', () => {
    try {
      assertSupabaseResult(
        { error: { code: 'PLU08', message: 'Ya estas inscripto en este evento.' } },
        'No se pudo crear la inscripcion.',
      )
    } catch (error) {
      expect(error.message).toBe('Ya estas inscripto en este evento.')
      expect(error.details.raw).toBeUndefined()
    }
  })
})

describe('requireSupabaseClient', () => {
  it('responde 503 cuando falta configuracion del cliente admin', () => {
    expect(() => requireSupabaseClient(null)).toThrowError(expect.objectContaining({ status: 503 }))
  })
})
