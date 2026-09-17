import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/ticketApi.js', () => ({
  reportScanTelemetry: vi.fn(),
}))
vi.mock('../src/lib/offlineCheckinDb.js', () => ({
  getDeviceId: () => 'device-test',
  enqueueScanEvent: vi.fn(),
  listPendingScanEvents: vi.fn(),
  clearScanEvents: vi.fn(),
}))

describe('checkinTelemetry', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('buffer-ea y manda el lote recién después del debounce, no en cada escaneo', async () => {
    const { reportScanTelemetry } = await import('../src/services/ticketApi.js')
    reportScanTelemetry.mockResolvedValue({ accepted: 1 })
    const { reportScanAttempt } = await import('../src/services/checkinTelemetry.js')

    reportScanAttempt({ eventSlug: 'pitbull-classic-2026', kind: 'ticket', outcome: 'expired', qrToken: 'qr-1' })
    expect(reportScanTelemetry).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)

    expect(reportScanTelemetry).toHaveBeenCalledTimes(1)
    const [payload] = reportScanTelemetry.mock.calls[0]
    expect(payload.eventSlug).toBe('pitbull-classic-2026')
    expect(payload.deviceId).toBe('device-test')
    expect(payload.attempts).toHaveLength(1)
    expect(payload.attempts[0]).toMatchObject({ kind: 'ticket', outcome: 'expired', qrToken: 'qr-1' })
    expect(payload.attempts[0].clientId).toBeTruthy()
  })

  it('junta varios escaneos en un solo lote si ocurren antes del debounce', async () => {
    const { reportScanTelemetry } = await import('../src/services/ticketApi.js')
    reportScanTelemetry.mockResolvedValue({ accepted: 2 })
    const { reportScanAttempt } = await import('../src/services/checkinTelemetry.js')

    reportScanAttempt({ eventSlug: 'evt', kind: 'ticket', outcome: 'expired' })
    reportScanAttempt({ eventSlug: 'evt', kind: 'ticket', outcome: 'already_used' })
    await vi.advanceTimersByTimeAsync(2000)

    expect(reportScanTelemetry).toHaveBeenCalledTimes(1)
    expect(reportScanTelemetry.mock.calls[0][0].attempts).toHaveLength(2)
  })

  it('flushea de inmediato al llegar al tope del lote, sin esperar el debounce', async () => {
    const { reportScanTelemetry } = await import('../src/services/ticketApi.js')
    reportScanTelemetry.mockResolvedValue({ accepted: 20 })
    const { reportScanAttempt } = await import('../src/services/checkinTelemetry.js')

    for (let i = 0; i < 20; i += 1) {
      reportScanAttempt({ eventSlug: 'evt', kind: 'ticket', outcome: 'ready' })
    }
    await vi.advanceTimersByTimeAsync(0)

    expect(reportScanTelemetry).toHaveBeenCalledTimes(1)
    expect(reportScanTelemetry.mock.calls[0][0].attempts).toHaveLength(20)
  })

  it('si el reporte falla por red, encola el intento en vez de perderlo', async () => {
    // `ApiError` se importa dinámicamente y recién después de resetModules():
    // con un import estático de nivel de módulo, `instanceof` adentro de
    // checkinTelemetry.js compararía contra una copia distinta de la clase.
    const { ApiError } = await import('../src/lib/api.js')
    const { reportScanTelemetry } = await import('../src/services/ticketApi.js')
    reportScanTelemetry.mockRejectedValue(new ApiError('sin conexión', { status: 0 }))
    const { enqueueScanEvent } = await import('../src/lib/offlineCheckinDb.js')
    const { reportScanAttempt } = await import('../src/services/checkinTelemetry.js')

    reportScanAttempt({ eventSlug: 'evt', kind: 'ticket', outcome: 'expired' })
    await vi.advanceTimersByTimeAsync(2000)

    expect(enqueueScanEvent).toHaveBeenCalledTimes(1)
    expect(enqueueScanEvent.mock.calls[0][0]).toMatchObject({ eventSlug: 'evt', outcome: 'expired' })
  })

  it('nunca lanza hacia el caller, ni siquiera cuando el reporte falla', async () => {
    const { reportScanTelemetry } = await import('../src/services/ticketApi.js')
    reportScanTelemetry.mockRejectedValue(new Error('boom'))
    const { reportScanAttempt, flushNow } = await import('../src/services/checkinTelemetry.js')

    reportScanAttempt({ eventSlug: 'evt', kind: 'ticket', outcome: 'expired' })
    await expect(flushNow()).resolves.toBeUndefined()
  })

  it('syncPendingScanEvents sólo limpia los intentos de ESE evento tras confirmarlos', async () => {
    const { reportScanTelemetry } = await import('../src/services/ticketApi.js')
    reportScanTelemetry.mockResolvedValue({ accepted: 1 })
    const { listPendingScanEvents, clearScanEvents } = await import('../src/lib/offlineCheckinDb.js')
    listPendingScanEvents.mockResolvedValue([
      { eventSlug: 'evt-a', clientId: 'c1', outcome: 'expired', kind: 'ticket', scannedAt: '2026-01-01T00:00:00Z' },
      { eventSlug: 'evt-b', clientId: 'c2', outcome: 'expired', kind: 'ticket', scannedAt: '2026-01-01T00:00:00Z' },
    ])
    const { syncPendingScanEvents } = await import('../src/services/checkinTelemetry.js')

    await syncPendingScanEvents('evt-a')

    expect(reportScanTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ eventSlug: 'evt-a', attempts: [expect.objectContaining({ clientId: 'c1' })] }),
    )
    expect(clearScanEvents).toHaveBeenCalledWith(['c1'])
  })
})
