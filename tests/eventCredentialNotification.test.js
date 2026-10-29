import { describe, expect, it, vi } from 'vitest'
import {
  buildCredentialScanUrl,
  createEventCredentialNotificationService,
} from '../server/modules/notifications/eventCredentialNotificationService.js'

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  starts_at: '2026-12-11T12:00:00Z',
  venue: 'La Troupé',
  location: 'Banfield',
  requires_membership: false,
}

const athlete = (id, extra = {}) => ({
  id,
  full_name: `Atleta ${id}`,
  email: `${id}@plu.test`,
  status: 'registrado',
  credential_token: `tok-${id}`,
  ...extra,
})

function setup({ event = EVENT, registrations, memberships = [], sendResult } = {}) {
  const repository = {
    findEventBySlug: vi.fn(async () => event),
    listConfirmedRegistrations: vi.fn(async () => registrations),
    findRegistration: vi.fn(async (id) => {
      const row = registrations.find((item) => item.id === id)
      return row ? { ...row, event } : null
    }),
    listMemberships: vi.fn(async () => memberships),
  }
  const sent = new Set()
  const dispatcher = {
    send: vi.fn(async (_type, input) => {
      if (sendResult) return sendResult
      if (sent.has(input.idempotencyKey)) return { status: 'sent', created: false }
      sent.add(input.idempotencyKey)
      return { status: 'sent', created: true }
    }),
  }
  const service = createEventCredentialNotificationService({
    repository,
    dispatcher,
    env: { VITE_APP_URL: 'https://www.powerliftingunited.ar' },
    renderQr: async () => Buffer.from('png'),
    now: () => new Date('2026-12-01T12:00:00Z'),
  })
  return { service, repository, dispatcher }
}

describe('Enviar credenciales de un evento', () => {
  const registrations = [
    { id: 'r1', status: 'confirmada', division: 'Raw', category: 'Open', athlete: athlete('a1') },
    { id: 'r2', status: 'confirmada', athlete: athlete('a2', { email: null }) },
    { id: 'r3', status: 'confirmada', athlete: athlete('a3') },
  ]

  it('el conteo previo no manda nada', async () => {
    const { service, dispatcher } = setup({ registrations })
    const result = await service.sendForEvent({ eventSlug: EVENT.slug, dryRun: true })
    expect(result).toMatchObject({ confirmed: 3, ready: 2, noEmail: 1, dryRun: true })
    expect(dispatcher.send).not.toHaveBeenCalled()
  })

  it('manda el QR como adjunto, nunca en los params, con link a la credencial', async () => {
    const { service, dispatcher } = setup({ registrations })
    const result = await service.sendForEvent({ eventSlug: EVENT.slug })
    expect(result).toMatchObject({ sent: 2, already: 0, failed: 0 })

    const [type, input] = dispatcher.send.mock.calls[0]
    expect(type).toBe('event_credential')
    expect(input.idempotencyKey).toBe('email:event-credential:r1')
    expect(input.attachment[0]).toMatchObject({ name: 'credencial-pitbull-classic-2026.png' })
    expect(JSON.stringify(input.params)).not.toContain('tok-a1')
    expect(input.params.accountUrl).toBe('https://www.powerliftingunited.ar/mi-cuenta?section=qr')
  })

  it('apretarlo dos veces no duplica: los ya enviados vuelven como "already"', async () => {
    const { service } = setup({ registrations })
    await service.sendForEvent({ eventSlug: EVENT.slug })
    const again = await service.sendForEvent({ eventSlug: EVENT.slug })
    expect(again).toMatchObject({ sent: 0, already: 2 })
  })

  it('si el evento pide afiliación, no le dice "ya podés entrar" a quien la puerta rechazaría', async () => {
    const { service } = setup({
      event: { ...EVENT, requires_membership: true },
      registrations,
      memberships: [
        {
          athlete_id: 'a1',
          status: 'activa',
          start_date: '2026-01-01',
          expiration_date: '2027-01-31',
        },
        {
          athlete_id: 'a3',
          status: 'activa',
          start_date: '2025-01-01',
          expiration_date: '2025-12-31',
        },
      ],
    })
    const result = await service.sendForEvent({ eventSlug: EVENT.slug })
    expect(result).toMatchObject({ ready: 1, blocked: 1, sent: 1 })
  })

  it('al confirmar una inscripción a mano sale su credencial', async () => {
    const { service, dispatcher } = setup({ registrations })
    expect(await service.sendForRegistration('r1')).toBe('sent')
    expect(dispatcher.send.mock.calls[0][1].to).toBe('a1@plu.test')
  })
})

describe('buildCredentialScanUrl', () => {
  it('apunta a la home con ?credencial=, igual que el QR del perfil', () => {
    expect(buildCredentialScanUrl('https://www.powerliftingunited.ar', 'abc')).toBe(
      'https://www.powerliftingunited.ar/?credencial=abc',
    )
  })
})
