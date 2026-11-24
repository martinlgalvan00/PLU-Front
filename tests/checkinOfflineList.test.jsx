import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * La tabla de la puerta tiene que salir de la foto local si la red no contesta,
 * y un ingreso desde esa lista tiene que encolarse igual que un escaneo.
 */

const getAllowlist = vi.fn()
const enqueueCheckin = vi.fn(async () => ({ localId: 'local-1' }))
const getEventCheckinAllowlist = vi.fn()
let online = true
const refreshCounts = vi.fn()
const noteSnapshot = vi.fn()

vi.mock('../src/lib/offlineCheckinDb.js', () => ({
  downloadAllowlist: vi.fn(async (_slug, data) => data),
  enqueueCheckin: (...args) => enqueueCheckin(...args),
  findInAllowlist: vi.fn(async () => null),
  getAllowlist: (...args) => getAllowlist(...args),
}))

vi.mock('../src/services/athleteApi.js', () => ({
  getEventCheckinAllowlist: (...args) => getEventCheckinAllowlist(...args),
}))

vi.mock('../src/services/checkinTelemetry.js', () => ({
  reportScanAttempt: vi.fn(),
}))

vi.mock('../src/hooks/useOfflineCheckinSync.js', () => ({
  useOfflineCheckinSync: () => ({
    conflictCount: 0,
    downloadAllowlist: () => {},
    failedCount: 0,
    isOnline: online,
    lastDownloadedAt: '2026-10-29T12:00:00.000Z',
    lastSyncedAt: null,
    noteSnapshot,
    pendingCount: 0,
    refreshCounts,
    syncIssue: null,
    syncNow: () => {},
    syncing: false,
  }),
}))

const { useCheckInWorkspace } = await import('../src/hooks/useCheckInWorkspace.js')

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>

const SNAPSHOT = {
  eventSlug: 'pitbull-classic-2026',
  downloadedAt: '2026-10-29T12:00:00.000Z',
  revision: 0,
  tickets: [
    {
      qrToken: 'qr-ana',
      ticketCode: 'TCK-ANA',
      attendeeName: 'Ana Torres',
      attendeeDni: '30111222',
      status: 'pagada',
      credentialScopes: ['gate_tickets'],
    },
  ],
  registrations: [],
}

function setup() {
  return renderHook(
    () =>
      useCheckInWorkspace({
        athletes: [],
        canCheckIn: true,
        eventSlug: 'pitbull-classic-2026',
        onCheckInRegistration: vi.fn(),
        onCheckInTicket: vi.fn(),
        onRefreshTickets: vi.fn(),
        registrations: [],
        securityZone: { name: 'Puerta 1', scope: 'gate_tickets' },
        tickets: [],
      }),
    { wrapper },
  )
}

beforeEach(() => {
  online = true
  getAllowlist.mockReset()
  enqueueCheckin.mockClear()
  getEventCheckinAllowlist.mockReset()
  refreshCounts.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('lista offline de la puerta', () => {
  it('muestra la foto local si la red falla', async () => {
    getAllowlist.mockResolvedValue(SNAPSHOT)
    getEventCheckinAllowlist.mockRejectedValue(new Error('offline'))
    const { result } = setup()

    await waitFor(() => {
      expect(result.current.rows.some((row) => row.name === 'Ana Torres')).toBe(true)
    })
  })

  it('ingresar desde la lista sin red encola el QR', async () => {
    online = false
    getAllowlist.mockResolvedValue(null)
    getEventCheckinAllowlist.mockRejectedValue(new Error('offline'))
    const { result } = setup()

    await act(async () => {
      await result.current.handleCheckIn({
        id: 'tkt-qr-ana',
        type: 'espectador',
        qrToken: 'qr-ana',
        status: 'pagada',
        credentialScopes: ['gate_tickets'],
      })
    })

    expect(enqueueCheckin).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSlug: 'pitbull-classic-2026',
        kind: 'ticket',
        qrToken: 'qr-ana',
        gate: 'Puerta 1',
      }),
    )
  })
})
