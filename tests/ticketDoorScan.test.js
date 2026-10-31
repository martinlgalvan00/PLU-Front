import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTicketScan } from '../src/services/checkinScanService.js'

const QR_TOKEN = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

vi.mock('../src/lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  }
})

const { apiGet, apiPost } = await import('../src/lib/api.js')

beforeEach(() => {
  apiGet.mockReset()
  apiPost.mockReset()
})

describe('escaneo de puerta con código dictado', () => {
  it('canjea el XXX-XXX contra el mismo token que el QR', async () => {
    apiPost.mockImplementation(async (path) => {
      if (path === '/api/tickets/door-code') return { qrToken: QR_TOKEN }
      throw new Error(`apiPost inesperado: ${path}`)
    })
    apiGet.mockImplementation(async () => ({
      ticket: {
        ticket: {
          id: 't1',
          ticket_code: 'TCK-00000001',
          qr_token: QR_TOKEN,
          gate_code: 'K4M-7QP',
          attendee_name: 'Ana',
          status: 'pagada',
          credential_scopes: ['gate_tickets'],
        },
        event: null,
        checkIn: null,
      },
    }))

    const spoken = await resolveTicketScan('k4m 7qp')
    const scanned = await resolveTicketScan(QR_TOKEN)

    expect(apiPost).toHaveBeenCalledWith('/api/tickets/door-code', { code: 'K4M-7QP' })
    expect(apiGet).toHaveBeenCalledWith(`/api/tickets/verify/${QR_TOKEN}`)
    expect(spoken.qrToken).toBe(QR_TOKEN)
    expect(scanned.qrToken).toBe(QR_TOKEN)
    expect(spoken.outcome).toBe('ready')
    expect(spoken.ticket.gateCode).toBe('K4M-7QP')
    expect(apiPost).toHaveBeenCalledTimes(1)
  })
})
