import { describe, expect, it, vi } from 'vitest'
import { ensureAthleteForStaff } from '../server/services/staffAthleteBridge.js'
import { HttpError } from '../server/lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../server/lib/organizations.js'

function createAthletesClient({ existing = null, insertError = null, updateRow = null } = {}) {
  const athletes = {
    select: vi.fn(() => athletes),
    eq: vi.fn(() => athletes),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    insert: vi.fn(() => athletes),
    update: vi.fn(() => athletes),
    is: vi.fn(() => athletes),
    single: vi.fn(async () => {
      if (insertError) return { data: null, error: insertError }
      return {
        data: {
          id: 'ath-new',
          full_name: 'Admin PLU',
          email: 'admin@pluarg.com',
          status: 'registrado',
          email_verified_at: '2026-08-28T00:00:00.000Z',
          document_id: 'STAFF-usr-1',
        },
        error: null,
      }
    }),
  }

  if (updateRow) {
    athletes.maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: existing, error: null })
      .mockResolvedValueOnce({ data: updateRow, error: null })
  }

  const credentials = {
    insert: vi.fn(async () => ({ data: { athlete_id: 'ath-new' }, error: null })),
  }

  return {
    from: vi.fn((table) => {
      if (table === 'athletes') return athletes
      if (table === 'athlete_credentials') return credentials
      throw new Error(`Tabla inesperada: ${table}`)
    }),
    _athletes: athletes,
    _credentials: credentials,
  }
}

describe('ensureAthleteForStaff', () => {
  it('reusa el atleta existente por email', async () => {
    const existing = {
      id: 'ath-1',
      full_name: 'Admin PLU',
      email: 'admin@pluarg.com',
      status: 'registrado',
      email_verified_at: '2026-01-01T00:00:00.000Z',
      document_id: '30111222',
    }
    const client = createAthletesClient({ existing })

    const result = await ensureAthleteForStaff({
      client,
      staffUser: { id: 'usr-1', email: 'Admin@PLUARG.com', name: 'Admin PLU' },
    })

    expect(result.created).toBe(false)
    expect(result.athlete.id).toBe('ath-1')
    expect(client._credentials.insert).not.toHaveBeenCalled()
  })

  it('crea un atleta mínimo cuando el email no existe', async () => {
    const client = createAthletesClient({ existing: null })

    const result = await ensureAthleteForStaff({
      client,
      staffUser: { id: 'usr-1', email: 'admin@pluarg.com', name: 'Admin PLU' },
      organizationId: PRIMARY_ORGANIZATION_ID,
    })

    expect(result.created).toBe(true)
    expect(result.athlete.id).toBe('ath-new')
    expect(client._athletes.insert).toHaveBeenCalledOnce()
    expect(client._credentials.insert).toHaveBeenCalledOnce()
    const payload = client._athletes.insert.mock.calls[0][0]
    expect(payload.document_id).toBe('STAFF-usr-1')
    expect(payload.email).toBe('admin@pluarg.com')
    expect(payload.email_verified_at).toBeTruthy()
  })

  it('rechaza atletas bloqueados', async () => {
    const client = createAthletesClient({
      existing: {
        id: 'ath-1',
        full_name: 'Bloqueado',
        email: 'admin@pluarg.com',
        status: 'bloqueado',
        email_verified_at: '2026-01-01T00:00:00.000Z',
        document_id: '30111222',
      },
    })

    await expect(
      ensureAthleteForStaff({
        client,
        staffUser: { id: 'usr-1', email: 'admin@pluarg.com', name: 'Admin' },
      }),
    ).rejects.toBeInstanceOf(HttpError)
  })
})
