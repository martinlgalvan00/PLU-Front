import { describe, expect, it } from 'vitest'
import { getEmailDefinition } from '../server/modules/notifications/emailCatalog.js'
import { redactSensitiveEmailParams } from '../server/modules/notifications/emailDispatcher.js'
import { renderEmail } from '../server/modules/notifications/emailTemplates.js'
import {
  buildTicketConfirmationDelivery,
  buildTicketScanUrl,
  ticketConfirmationIdempotencyKey,
} from '../server/modules/notifications/ticketConfirmationMail.js'

const ORDER = {
  id: '22222222-2222-4222-8222-222222222222',
  buyer_name: 'Camila Rearte',
  buyer_email: 'camila@example.com',
  reference: 'TORD-abc123',
  updated_at: '2026-03-10T12:00:00.000Z',
}

const QR_A = '11111111-1111-4111-8111-111111111111'
const QR_B = '22222222-2222-4222-8222-222222222222'

const TICKETS = [
  {
    id: 't1',
    is_primary_credential: true,
    ticket_code: 'TCK-1',
    qr_token: QR_A,
    gate_code: 'K4M-7QP',
    attendee_name: 'Camila',
    credential_label: 'Espectador',
    status: 'pagada',
  },
  {
    id: 't2',
    is_primary_credential: false,
    ticket_code: 'TCK-2',
    qr_token: QR_B,
    gate_code: 'N8R-3WK',
    attendee_name: 'Camila',
    credential_label: 'Entrenador',
    status: 'pagada',
  },
]

describe('mail de confirmación de entradas', () => {
  it('adjunta un PNG por credencial y no pone el token en los params', async () => {
    const delivery = await buildTicketConfirmationDelivery({
      order: ORDER,
      tickets: TICKETS,
      event: {
        title: 'Pitbull',
        slug: 'pitbull',
        starts_at: '2026-12-12T12:00:00.000Z',
        venue: 'Club',
      },
      appUrl: 'https://plu.test',
      renderQr: async (text) => Buffer.from(text),
    })

    expect(delivery.attachment.map((file) => file.name)).toEqual(['qr-TCK-1.png', 'qr-TCK-2.png'])
    expect(delivery.params.quantity).toBe('1')
    expect(delivery.params.passes.map((pass) => pass.gateCode)).toEqual(['K4M-7QP', 'N8R-3WK'])
    const dumped = JSON.stringify(delivery.params)
    expect(dumped).not.toContain(QR_A)
    expect(dumped).not.toContain(QR_B)
    expect(delivery.attachment[0].content).toBe(
      Buffer.from(buildTicketScanUrl('https://plu.test', QR_A, 'pitbull')).toString('base64'),
    )
    expect(buildTicketScanUrl('https://plu.test', QR_A, 'pitbull')).toContain('tipo=ticket')
  })

  it('la primera vez y el reenvío del día siguiente no comparten clave', () => {
    const first = ticketConfirmationIdempotencyKey(ORDER)
    const sameDay = ticketConfirmationIdempotencyKey(ORDER, {
      resend: true,
      now: new Date('2026-11-02T15:00:00.000Z'),
    })
    const nextDay = ticketConfirmationIdempotencyKey(ORDER, {
      resend: true,
      now: new Date('2026-11-03T03:30:00.000Z'),
    })
    expect(first).toBe(`email:ticket-confirmation:${ORDER.id}:${ORDER.updated_at}`)
    expect(sameDay).toContain(':resend:2026-11-02')
    expect(nextDay).toContain(':resend:2026-11-03')
    expect(sameDay).not.toBe(nextDay)
    expect(sameDay).not.toBe(first)
  })

  it('el HTML muestra el código y el outbox lo redacta', () => {
    const { htmlContent } = renderEmail('ticket_confirmation', {
      name: 'Camila',
      eventTitle: 'Pitbull',
      passes: [{ name: 'Camila', type: 'Espectador', gateCode: 'K4M-7QP' }],
      ticketUrl: 'https://plu.test/entradas?ref=TORD-abc123',
    })
    expect(htmlContent).toContain('K4M-7QP')
    expect(htmlContent).toContain('Espectador')
    expect(htmlContent).not.toContain(QR_A)
    expect(getEmailDefinition('ticket_confirmation').sensitiveParams).toEqual(['passes', 'ticketUrl'])
    const stored = redactSensitiveEmailParams('ticket_confirmation', {
      name: 'Camila',
      passes: [{ gateCode: 'K4M-7QP' }],
      ticketUrl: 'https://plu.test/entradas?ref=TORD-abc123&k=secreto',
    })
    expect(stored.passes).toBe('[REDACTED]')
    expect(stored.ticketUrl).toBe('[REDACTED]')
    expect(stored.name).toBe('Camila')
  })
})
