import { describe, expect, it, vi } from 'vitest'
import { createSupabaseAthleteRepository } from '../server/modules/athletes/supabaseAthleteRepository.js'
import { PRIMARY_ORGANIZATION_ID } from '../server/lib/organizations.js'

function createClient({ emailHit = null, documentHit = null } = {}) {
  return {
    rpc: vi.fn(),
    from(table) {
      if (table !== 'athletes') throw new Error(`tabla inesperada: ${table}`)
      const filters = {}
      const builder = {
        select() {
          return builder
        },
        eq(column, value) {
          filters[column] = value
          return builder
        },
        async maybeSingle() {
          if (filters.email) {
            return { data: emailHit, error: null }
          }
          if (filters.document_id) {
            return { data: documentHit, error: null }
          }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

describe('athlete checkAvailability', () => {
  it('marca email tomado sin devolver datos del atleta', async () => {
    const repo = createSupabaseAthleteRepository(
      createClient({ emailHit: { id: 'ath-1' } }),
      { organizationId: PRIMARY_ORGANIZATION_ID },
    )

    await expect(repo.checkAvailability({ email: 'AgusDiSanto99@gmail.com' })).resolves.toEqual({
      emailTaken: true,
      documentTaken: false,
    })
  })

  it('normaliza documento y detecta conflicto', async () => {
    const repo = createSupabaseAthleteRepository(
      createClient({ documentHit: { id: 'ath-2' } }),
      { organizationId: PRIMARY_ORGANIZATION_ID },
    )

    await expect(repo.checkAvailability({ documentId: '40.111.222' })).resolves.toEqual({
      emailTaken: false,
      documentTaken: true,
    })
  })

  it('deja ambos libres cuando no hay coincidencia', async () => {
    const repo = createSupabaseAthleteRepository(createClient(), {
      organizationId: PRIMARY_ORGANIZATION_ID,
    })

    await expect(
      repo.checkAvailability({ email: 'nuevo@pluarg.com', documentId: '40111222' }),
    ).resolves.toEqual({
      emailTaken: false,
      documentTaken: false,
    })
  })
})
