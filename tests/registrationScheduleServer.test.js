import { describe, expect, it, vi } from 'vitest'
import { resolveEventRegistrationOpensAt } from '../server/lib/registrationSchedule.js'

function supabaseFor(rowsBySlug) {
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            if (column !== 'slug') return { data: null, error: null }
            const row = rowsBySlug[value]
            return { data: row ?? null, error: null }
          },
        }),
      }),
    })),
  }
}

describe('resolveEventRegistrationOpensAt', () => {
  it('devuelve null sin client ni identificador de evento', async () => {
    expect(await resolveEventRegistrationOpensAt(null, { eventSlug: 'evento-a' })).toBeNull()
    expect(await resolveEventRegistrationOpensAt(supabaseFor({}), {})).toBeNull()
  })

  it('resuelve la fecha del evento puntual por slug, no la de otro evento', async () => {
    const client = supabaseFor({
      'evento-a': { registration_opens_at: '2026-08-01T00:00:00-03:00' },
      'evento-b': { registration_opens_at: '2026-12-01T00:00:00-03:00' },
    })

    await expect(resolveEventRegistrationOpensAt(client, { eventSlug: 'evento-a' })).resolves.toBe(
      '2026-08-01T00:00:00-03:00',
    )
    await expect(resolveEventRegistrationOpensAt(client, { eventSlug: 'evento-b' })).resolves.toBe(
      '2026-12-01T00:00:00-03:00',
    )
  })

  it('no cae a otro evento cuando el propio no tiene fecha configurada', async () => {
    const client = supabaseFor({ 'evento-sin-fecha': { registration_opens_at: null } })
    await expect(
      resolveEventRegistrationOpensAt(client, { eventSlug: 'evento-sin-fecha' }),
    ).resolves.toBeNull()
  })

  it('devuelve null si el evento no existe', async () => {
    const client = supabaseFor({})
    await expect(
      resolveEventRegistrationOpensAt(client, { eventSlug: 'no-existe' }),
    ).resolves.toBeNull()
  })
})
