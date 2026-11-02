import { describe, expect, it, vi } from 'vitest'
import { runTicketRevealMailJob } from '../server/jobs/ticketRevealMailJob.js'

const NOW = new Date('2026-11-02T15:00:00.000Z')

function order(overrides = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    buyer_name: 'Camila',
    buyer_email: 'camila@example.com',
    reference: 'TORD-abc123',
    status: 'aprobado',
    updated_at: '2026-11-01T12:00:00.000Z',
    event: {
      title: 'Pitbull',
      slug: 'pitbull',
      ticket_reveal_lead_minutes: 1440,
    },
    tickets: [
      {
        id: 't1',
        is_primary_credential: true,
        ticket_code: 'TCK-1',
        qr_token: '11111111-1111-4111-8111-111111111111',
        gate_code: 'K4M-7QP',
        attendee_name: 'Camila',
        status: 'pagada',
        valid_from: '2026-11-03T03:00:00.000Z',
        valid_until: '2026-11-04T03:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

describe('ticketRevealMailJob', () => {
  it('manda el QR una sola vez cuando la ventana ya abrió', async () => {
    const marked = new Set()
    const sent = []
    const due = order()
    const deps = {
      now: NOW,
      loadDueOrders: async () => (marked.has(due.id) ? [] : [due]),
      markRevealed: async (_client, id) => {
        marked.add(id)
      },
      sendDelivery: async (delivery) => {
        sent.push(delivery)
        return { status: 'sent', created: true }
      },
    }

    const first = await runTicketRevealMailJob(deps)
    const second = await runTicketRevealMailJob(deps)

    expect(first).toMatchObject({ processed: 1, sent: 1, skipped: false })
    expect(second).toMatchObject({ processed: 0, sent: 0, skipped: false })
    expect(sent).toHaveLength(1)
    expect(sent[0].attachment).toHaveLength(1)
    expect(sent[0].params.sealed).toBe(false)
    expect(sent[0].idempotencyKey).toContain('email:ticket-reveal:')
    expect(marked.has(due.id)).toBe(true)
  })

  it('no marca la orden si el envío quedó en skipped', async () => {
    const markRevealed = vi.fn()
    const result = await runTicketRevealMailJob({
      now: NOW,
      loadDueOrders: async () => [order()],
      markRevealed,
      sendDelivery: async () => ({ status: 'skipped', created: false }),
    })

    expect(result.sent).toBe(0)
    expect(markRevealed).not.toHaveBeenCalled()
  })

  it('no manda nada si el pase sigue reservado', async () => {
    const sendDelivery = vi.fn()
    const markRevealed = vi.fn()
    const result = await runTicketRevealMailJob({
      now: NOW,
      loadDueOrders: async () => [
        order({
          tickets: [
            {
              ...order().tickets[0],
              valid_from: '2099-01-02T03:00:00.000Z',
            },
          ],
        }),
      ],
      markRevealed,
      sendDelivery,
    })

    expect(result.sent).toBe(0)
    expect(sendDelivery).not.toHaveBeenCalled()
    expect(markRevealed).not.toHaveBeenCalled()
  })
})
