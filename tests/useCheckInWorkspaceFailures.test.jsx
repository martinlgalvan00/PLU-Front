import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { ApiError } from '../src/lib/api.js'

/**
 * La puerta no puede mentirle al guardia. `api.js` envuelve toda caída de red
 * en un `ApiError` de status 0, y el workspace sólo reconocía `TypeError`: con un
 * corte real el modo offline no arrancaba nunca y un 429 o un 5xx se leían como
 * "credencial no encontrada". Acá se fija cada falla con su veredicto honesto.
 */

const resolveCredentialScan = vi.fn()
const findInAllowlist = vi.fn()
const enqueueCheckin = vi.fn()
const reportScanAttempt = vi.fn()
const playCheckinFeedback = vi.fn()
let online = true
const refreshCounts = vi.fn()

vi.mock('../src/services/checkinScanService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveCredentialScan: (...args) => resolveCredentialScan(...args),
}))
vi.mock('../src/lib/offlineCheckinDb.js', () => ({
  enqueueCheckin: (...args) => enqueueCheckin(...args),
  findInAllowlist: (...args) => findInAllowlist(...args),
}))
vi.mock('../src/services/checkinTelemetry.js', () => ({
  reportScanAttempt: (...args) => reportScanAttempt(...args),
}))
vi.mock('../src/lib/checkinFeedback.js', async (importOriginal) => ({
  ...(await importOriginal()),
  playCheckinFeedback: (...args) => playCheckinFeedback(...args),
}))
vi.mock('../src/services/athleteApi.js', () => ({
  getEventCheckinAllowlist: vi.fn(async () => ({ tickets: [], registrations: [] })),
}))
vi.mock('../src/hooks/useOfflineCheckinSync.js', () => ({
  useOfflineCheckinSync: () => ({
    conflictCount: 0,
    downloadAllowlist: () => {},
    isOnline: online,
    lastDownloadedAt: null,
    lastSyncedAt: null,
    pendingCount: 0,
    refreshCounts,
    syncIssue: null,
    syncNow: () => {},
    syncing: false,
  }),
}))

const { useCheckInWorkspace } = await import('../src/hooks/useCheckInWorkspace.js')

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>
const apiError = (status, body = {}) => new ApiError('x', { status, body })

const ALLOWLIST_TICKET = {
  kind: 'ticket',
  entry: {
    qrToken: 'qr-1',
    ticketCode: 'TCK-1',
    status: 'pagada',
    attendeeName: 'Ana Torres',
    attendeeDni: '30111222',
    credentialScopes: ['gate_tickets'],
  },
}

function setup(props = {}) {
  // Las props se arman UNA vez: con arrays o funciones nuevas en cada render, el
  // efecto que baja la lista de la puerta volvería a dispararse sin fin.
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
    ...props,
  }
  return renderHook(() => useCheckInWorkspace(stable), { wrapper })
}

beforeEach(() => {
  online = true
  resolveCredentialScan.mockReset()
  findInAllowlist.mockReset()
  enqueueCheckin.mockReset()
  reportScanAttempt.mockReset()
  playCheckinFeedback.mockReset()
  refreshCounts.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('escaneo con fallas del servidor', () => {
  it('una caída de red (ApiError status 0) valida contra la lista descargada', async () => {
    resolveCredentialScan.mockRejectedValue(apiError(0))
    findInAllowlist.mockResolvedValue(ALLOWLIST_TICKET)
    const { result } = setup()

    await act(async () => {
      await result.current.handleScan('qr-1')
    })

    expect(findInAllowlist).toHaveBeenCalledWith('pitbull-classic-2026', 'qr-1')
    expect(result.current.scanResult).toMatchObject({ offline: true, kind: 'ticket' })
    expect(result.current.scanResult.outcome).not.toBe('not_found')
  })

  it('un 5xx también recurre a la lista local', async () => {
    resolveCredentialScan.mockRejectedValue(apiError(503))
    findInAllowlist.mockResolvedValue(ALLOWLIST_TICKET)
    const { result } = setup()

    await act(async () => {
      await result.current.handleScan('qr-1')
    })

    expect(result.current.scanResult.offline).toBe(true)
  })

  it('un 429 sin lista descargada dice "servicio no disponible", no "no encontrada"', async () => {
    resolveCredentialScan.mockRejectedValue(apiError(429))
    findInAllowlist.mockResolvedValue(null)
    const { result } = setup()

    await act(async () => {
      await result.current.handleScan('qr-1')
    })

    expect(result.current.scanResult.outcome).toBe('service_unavailable')
    expect(result.current.scanVerdict.tone).toBe('warning')
  })

  it('con la sesión vencida (401) avisa que venció y no acusa al QR', async () => {
    resolveCredentialScan.mockRejectedValue(apiError(401))
    const { result } = setup()

    await act(async () => {
      await result.current.handleScan('qr-1')
    })

    expect(result.current.scanResult.outcome).toBe('session_expired')
    expect(findInAllowlist).not.toHaveBeenCalled()
    // No es un intento sobre ese QR: no ensucia el reporte de escaneos.
    expect(reportScanAttempt).not.toHaveBeenCalled()
  })

  it('un error desconocido sigue siendo "no encontrada"', async () => {
    resolveCredentialScan.mockRejectedValue(new Error('boom'))
    const { result } = setup()

    await act(async () => {
      await result.current.handleScan('qr-1')
    })

    expect(result.current.scanResult.outcome).toBe('not_found')
  })

  it('un QR lento no pisa el resultado de uno más nuevo', async () => {
    let releaseSlow
    resolveCredentialScan
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseSlow = () => resolve({ kind: 'ticket', outcome: 'ready', qrToken: 'lento' })
          }),
      )
      .mockResolvedValueOnce({ kind: 'ticket', outcome: 'ready', qrToken: 'rapido' })
    const { result } = setup()

    let slow
    await act(async () => {
      slow = result.current.handleScan('qr-lento')
    })
    await act(async () => {
      await result.current.handleScan('qr-rapido')
    })
    await act(async () => {
      releaseSlow()
      await slow
    })

    expect(result.current.scanResult.qrToken).toBe('rapido')
  })
})

describe('admitir un ingreso con la conexión caída', () => {
  async function scanReady(result) {
    resolveCredentialScan.mockResolvedValue({
      kind: 'ticket',
      outcome: 'ready',
      canCheckIn: true,
      qrToken: 'qr-1',
      status: 'pagada',
    })
    await act(async () => {
      await result.current.handleScan('qr-1')
    })
  }

  it('con navigator.onLine en true pero el pedido caído, encola en vez de marcar "inválido"', async () => {
    const onCheckInTicket = vi.fn().mockRejectedValue(apiError(0))
    const { result } = setup({ onCheckInTicket })
    await scanReady(result)

    await act(async () => {
      await result.current.handleScanCheckIn()
    })

    expect(enqueueCheckin).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ticket', qrToken: 'qr-1', gate: 'Puerta 1' }),
    )
    expect(result.current.scanResult.outcome).toBe('queued_offline')
  })

  it('un 5xx al admitir también se encola', async () => {
    const onCheckInTicket = vi.fn().mockRejectedValue(apiError(502))
    const { result } = setup({ onCheckInTicket })
    await scanReady(result)

    await act(async () => {
      await result.current.handleScanCheckIn()
    })

    expect(enqueueCheckin).toHaveBeenCalled()
  })

  it('con la sesión vencida no encola: avisa que venció', async () => {
    const onCheckInTicket = vi.fn().mockRejectedValue(apiError(401))
    const { result } = setup({ onCheckInTicket })
    await scanReady(result)

    await act(async () => {
      await result.current.handleScanCheckIn()
    })

    expect(enqueueCheckin).not.toHaveBeenCalled()
    expect(result.current.scanResult.outcome).toBe('session_expired')
  })

  it('el puesto de la zona viaja con el ingreso encolado sin conexión', async () => {
    online = false
    resolveCredentialScan.mockRejectedValue(apiError(0))
    findInAllowlist.mockResolvedValue(ALLOWLIST_TICKET)
    const { result } = setup()

    await act(async () => {
      await result.current.handleScan('qr-1')
    })
    await act(async () => {
      await result.current.handleScanCheckIn()
    })

    expect(enqueueCheckin).toHaveBeenCalledWith(expect.objectContaining({ gate: 'Puerta 1' }))
  })
})
