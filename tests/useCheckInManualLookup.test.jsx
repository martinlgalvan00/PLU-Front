import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { ApiError } from '../src/lib/api.js'

/**
 * "El QR no escanea": el guardia tipea el número impreso o el DNI. La búsqueda
 * traduce eso a la credencial y el resto es el carril de siempre: el veredicto
 * lo da `resolveCredentialScan` con el token, igual que con la cámara.
 */

const resolveCredentialScan = vi.fn()
const lookupCheckinCredentials = vi.fn()
const findMatchesInAllowlist = vi.fn()
const reportScanAttempt = vi.fn()

vi.mock('../src/services/checkinScanService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveCredentialScan: (...args) => resolveCredentialScan(...args),
}))
vi.mock('../src/services/ticketApi.js', async (importOriginal) => ({
  ...(await importOriginal()),
  lookupCheckinCredentials: (...args) => lookupCheckinCredentials(...args),
}))
vi.mock('../src/lib/offlineCheckinDb.js', () => ({
  enqueueCheckin: vi.fn(),
  findInAllowlist: vi.fn(),
  findMatchesInAllowlist: (...args) => findMatchesInAllowlist(...args),
}))
vi.mock('../src/services/checkinTelemetry.js', () => ({
  reportScanAttempt: (...args) => reportScanAttempt(...args),
}))
vi.mock('../src/lib/checkinFeedback.js', async (importOriginal) => ({
  ...(await importOriginal()),
  playCheckinFeedback: vi.fn(),
}))
vi.mock('../src/services/athleteApi.js', () => ({
  getEventCheckinAllowlist: vi.fn(async () => ({ tickets: [], registrations: [] })),
}))
vi.mock('../src/hooks/useOfflineCheckinSync.js', () => ({
  useOfflineCheckinSync: () => ({
    conflictCount: 0,
    downloadAllowlist: () => {},
    isOnline: true,
    lastDownloadedAt: null,
    lastSyncedAt: null,
    pendingCount: 0,
    refreshCounts: vi.fn(),
    syncIssue: null,
    syncNow: () => {},
    syncing: false,
  }),
}))

const { useCheckInWorkspace } = await import('../src/hooks/useCheckInWorkspace.js')

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>
const TOKEN = '6f1c1e0e-8f6b-4d7a-9a63-1d3b7b2a9c11'
const TICKET_MATCH = {
  kind: 'ticket',
  code: TOKEN,
  ticketCode: 'TCK-00000412',
  name: 'Ana Torres',
  document: '30111222',
  label: 'Entrada general',
  status: 'pagada',
}

function setup() {
  const stable = {
    athletes: [],
    canCheckIn: true,
    eventSlug: 'pitbull-classic-2026',
    onCheckInRegistration: vi.fn(),
    onCheckInTicket: vi.fn(),
    onRefreshTickets: vi.fn(),
    registrations: [],
    tickets: [],
    securityZone: { name: 'Puerta 1', scope: 'gate_tickets' },
  }
  return renderHook(() => useCheckInWorkspace(stable), { wrapper })
}

beforeEach(() => {
  resolveCredentialScan.mockResolvedValue({ kind: 'ticket', outcome: 'ready', qrToken: TOKEN })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('verificación por código en la puerta', () => {
  it('el código de puerta de 6 dígitos busca la credencial y la valida', async () => {
    lookupCheckinCredentials.mockResolvedValue([{ ...TICKET_MATCH, doorCode: '482913' }])
    const { result } = setup()

    await act(() => result.current.handleScan('482 913'))

    expect(lookupCheckinCredentials).toHaveBeenCalledWith('pitbull-classic-2026', {
      doorCode: '482913',
    })
    expect(resolveCredentialScan).toHaveBeenCalledWith(
      expect.objectContaining({ code: TOKEN, type: 'ticket' }),
      expect.anything(),
    )
  })

  it('el número impreso busca la entrada y sigue por el carril del escaneo', async () => {
    lookupCheckinCredentials.mockResolvedValue([TICKET_MATCH])
    const { result } = setup()

    await act(() => result.current.handleScan('412'))

    expect(lookupCheckinCredentials).toHaveBeenCalledWith('pitbull-classic-2026', {
      ticketCode: 'TCK-00000412',
    })
    expect(resolveCredentialScan).toHaveBeenCalledWith(
      { code: TOKEN, eventSlug: 'pitbull-classic-2026', type: 'ticket' },
      expect.objectContaining({ zoneScope: 'gate_tickets' }),
    )
    expect(result.current.scanResult.outcome).toBe('ready')
  })

  it('un DNI con varias credenciales pide elegir, y la elegida se valida', async () => {
    const coach = { ...TICKET_MATCH, code: 'b2222222-2222-4222-8222-222222222222', label: 'Calentamiento' }
    lookupCheckinCredentials.mockResolvedValue([TICKET_MATCH, coach])
    const { result } = setup()

    await act(() => result.current.handleScan('30.111.222'))

    expect(lookupCheckinCredentials).toHaveBeenCalledWith('pitbull-classic-2026', {
      dni: '30111222',
    })
    expect(result.current.scanResult.outcome).toBe('multiple_matches')
    expect(result.current.scanResult.matches).toHaveLength(2)
    expect(resolveCredentialScan).not.toHaveBeenCalled()

    await act(() => result.current.selectScanMatch(coach))
    expect(resolveCredentialScan).toHaveBeenCalledWith(
      expect.objectContaining({ code: coach.code, type: 'ticket' }),
      expect.anything(),
    )
  })

  it('sin coincidencias dice qué se buscó, no "código inválido"', async () => {
    lookupCheckinCredentials.mockResolvedValue([])
    const { result } = setup()

    await act(() => result.current.handleScan('TCK-00000999'))

    expect(result.current.scanResult).toMatchObject({
      outcome: 'not_found',
      manualQuery: { kind: 'ticket_code', ticketCode: 'TCK-00000999' },
    })
  })

  it('sin red busca en la lista descargada y valida offline', async () => {
    lookupCheckinCredentials.mockRejectedValue(new ApiError('offline', { status: 0 }))
    findMatchesInAllowlist.mockResolvedValue([
      {
        ...TICKET_MATCH,
        entry: {
          qrToken: TOKEN,
          ticketCode: 'TCK-00000412',
          status: 'pagada',
          attendeeName: 'Ana Torres',
          attendeeDni: '30111222',
          credentialScopes: ['gate_tickets'],
        },
      },
    ])
    const { result } = setup()

    await act(() => result.current.handleScan('412'))

    expect(findMatchesInAllowlist).toHaveBeenCalledWith('pitbull-classic-2026', {
      ticketCode: 'TCK-00000412',
    })
    expect(result.current.scanResult).toMatchObject({ outcome: 'ready', offline: true })
    expect(resolveCredentialScan).not.toHaveBeenCalled()
  })

  it('sin red y sin lista descargada dice que el servicio no contestó', async () => {
    lookupCheckinCredentials.mockRejectedValue(new ApiError('offline', { status: 0 }))
    findMatchesInAllowlist.mockResolvedValue(null)
    const { result } = setup()

    await act(() => result.current.handleScan('30111222'))

    expect(result.current.scanResult).toMatchObject({ outcome: 'service_unavailable' })
  })

  it('un código de socio sigue el camino de siempre, sin búsqueda', async () => {
    const { result } = setup()

    await act(() => result.current.handleScan('PLU-2026-0042'))

    expect(lookupCheckinCredentials).not.toHaveBeenCalled()
    expect(resolveCredentialScan).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PLU-2026-0042' }),
      expect.anything(),
    )
  })
})
