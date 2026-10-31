import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AlertTriangle } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOfflineSyncStatus from '../src/components/admin/AdminOfflineSyncStatus.jsx'
import AdminQrScanner from '../src/components/admin/AdminQrScanner.jsx'
import CheckInScanResult from '../src/components/admin/CheckInScanResult.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Lo que ve y toca el guardia en la puerta: por qué no abre la cámara, si hay
 * linterna, qué pasa con la sesión vencida y cuándo/dónde ya ingresó alguien.
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const withI18n = (ui) => render(<I18nProvider>{ui}</I18nProvider>)

describe('AdminQrScanner: cámara', () => {
  let getUserMedia

  beforeEach(() => {
    getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
    window.matchMedia ??= () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })
  })

  const named = (name) => Object.assign(new Error(name), { name })
  const renderScanner = () => withI18n(<AdminQrScanner onScan={() => {}} />)

  it('sin permiso da la instrucción de permisos y no ofrece reintentar', async () => {
    getUserMedia.mockRejectedValue(named('NotAllowedError'))
    renderScanner()

    expect((await screen.findByRole('alert')).textContent).toMatch(/permisos del navegador/i)
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull()
  })

  it('sin cámara en el equipo lo dice, en vez de pedir permisos que ya están bien', async () => {
    getUserMedia.mockRejectedValue(named('NotFoundError'))
    renderScanner()

    expect((await screen.findByRole('alert')).textContent).toMatch(/no encontramos una cámara/i)
  })

  it('con la cámara ocupada ofrece reintentar y vuelve a pedirla', async () => {
    getUserMedia.mockRejectedValue(named('NotReadableError'))
    renderScanner()

    expect((await screen.findByRole('alert')).textContent).toMatch(/en uso/i)
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
  })

  it('ofrece la linterna sólo si la cámara la declara y la prende con aplicarConstraints', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined)
    const track = { getCapabilities: () => ({ torch: true }), applyConstraints, stop: vi.fn() }
    getUserMedia.mockResolvedValue({
      getTracks: () => [track],
      getVideoTracks: () => [track],
    })
    renderScanner()

    const torch = await screen.findByRole('button', { name: /linterna/i })
    await act(async () => {
      fireEvent.click(torch)
    })

    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    expect(screen.getByRole('button', { name: /linterna/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('sin soporte de linterna no muestra el botón', async () => {
    const track = { getCapabilities: () => ({}), applyConstraints: vi.fn(), stop: vi.fn() }
    getUserMedia.mockResolvedValue({
      getTracks: () => [track],
      getVideoTracks: () => [track],
    })
    renderScanner()

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await screen.findByText(/listo para escanear|cámara lista|apuntá/i).catch(() => {})
    expect(screen.queryByRole('button', { name: /linterna/i })).toBeNull()
  })
})

describe('AdminOfflineSyncStatus: sesión vencida', () => {
  const props = {
    conflictCount: 0,
    downloadAllowlist: () => {},
    isOnline: true,
    lastDownloadedAt: '2026-08-15T10:00:00.000Z',
    lastSyncedAt: null,
    pendingCount: 3,
    syncNow: () => {},
    syncing: false,
  }

  it('avisa cuántos ingresos esperan y que no se pierden', () => {
    withI18n(<AdminOfflineSyncStatus {...props} syncIssue="auth" />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/3 ingreso/i)
    expect(alert.textContent).toMatch(/no se pierden/i)
  })

  it('volver a entrar avisa y no toca la cola desde este aviso', () => {
    const reenter = vi.fn()
    withI18n(<AdminOfflineSyncStatus {...props} onReauthenticate={reenter} syncIssue="auth" />)
    fireEvent.click(screen.getByRole('button', { name: /volver a entrar/i }))
    expect(reenter).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/3 ingreso/i)).toBeTruthy()
  })

  it('sin problema de sesión no muestra el aviso', () => {
    withI18n(<AdminOfflineSyncStatus {...props} syncIssue={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sin pendientes no hay nada que avisar', () => {
    withI18n(<AdminOfflineSyncStatus {...props} pendingCount={0} syncIssue="auth" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sin internet avisa que el ingreso quedó en el teléfono y muestra el QR', () => {
    withI18n(
      <AdminOfflineSyncStatus
        {...props}
        isOnline={false}
        pendingCount={1}
        queueLog={[{ localId: '1', label: 'TCK-1', status: 'pending' }]}
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/este teléfono/i)
    expect(screen.getByText('TCK-1')).toBeTruthy()
    expect(screen.getByText('En cola')).toBeTruthy()
  })

  it('sin internet la cola queda a la vista y no se puede sincronizar', () => {
    const reload = vi.fn()
    withI18n(
      <AdminOfflineSyncStatus
        {...props}
        isOnline={false}
        onReloadAndSync={reload}
        pendingCount={1}
        queueLog={[{ localId: '1', label: 'Ana Torres', gate: 'Puerta', at: '2026-10-30T18:00:00.000Z', status: 'pending' }]}
        workList
      />,
    )
    expect(screen.getByText('Ana Torres')).toBeTruthy()
    expect(screen.getByText('En cola')).toBeTruthy()
    expect(screen.getByText(/Puerta/)).toBeTruthy()
    const button = screen.getByRole('button', { name: /volver a cargar y sincronizar/i })
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(reload).not.toHaveBeenCalled()
  })

  it('con señal, volver a cargar sincroniza la cola', () => {
    const reload = vi.fn()
    withI18n(
      <AdminOfflineSyncStatus
        {...props}
        isOnline
        onReloadAndSync={reload}
        pendingCount={1}
        queueLog={[{ localId: '2', label: 'Luis Gómez', status: 'pending' }]}
        syncIssue="auth"
        workList
      />,
    )
    expect(screen.getByText('Sin sesión')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /volver a cargar y sincronizar/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('al volver la señal se puede ver qué QR ya se registró', () => {
    withI18n(
      <AdminOfflineSyncStatus
        {...props}
        pendingCount={0}
        queueLog={[{ localId: '9', label: 'TCK-9', status: 'synced' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ingresos de este teléfono/i }))
    expect(screen.getByText('TCK-9')).toBeTruthy()
    expect(screen.getByText('Enviado')).toBeTruthy()
  })
})

describe('CheckInScanResult: ya ingresó', () => {
  // "Ingresó" también es la etiqueta del estado: se busca sólo el título de la fila.
  const admittedLabel = () =>
    [...document.querySelectorAll('dt')].find((node) => node.textContent === 'Ingresó')

  function renderAlreadyUsed(row) {
    return withI18n(
      <CheckInScanResult
        canCheckIn={false}
        locale="es-AR"
        onDismiss={() => {}}
        onScanCheckIn={() => {}}
        scanBusy={false}
        scanPersonDoc="30111222"
        scanPersonName="Juana Pérez"
        scanTicketPaid
        scanVerdict={{ Icon: AlertTriangle, tone: 'warning' }}
        scanResult={{
          kind: 'ticket',
          outcome: 'already_used',
          canCheckIn: false,
          status: 'usada',
          row: {
            id: 'ticket-1',
            type: 'espectador',
            name: 'Juana Pérez',
            document: '30111222',
            ticketTypeName: 'General',
            credentialScopes: ['gate_tickets'],
            status: 'usada',
            ...row,
          },
        }}
      />,
    )
  }

  it('dice cuándo y por qué puesto ingresó, para cortar la discusión en la puerta', () => {
    renderAlreadyUsed({ checkedInAt: '2026-08-15T14:32:00.000Z', checkedInGate: 'Puerta 2' })
    const label = admittedLabel()
    expect(label.nextElementSibling.textContent).toMatch(/Puerta 2/)
  })

  it('sin puesto registrado muestra sólo la hora', () => {
    renderAlreadyUsed({ checkedInAt: '2026-08-15T14:32:00.000Z', checkedInGate: null })
    const label = admittedLabel()
    expect(label.nextElementSibling.textContent).not.toMatch(/·/)
  })

  it('sin hora de ingreso no inventa una fila', () => {
    renderAlreadyUsed({ checkedInAt: null })
    expect(admittedLabel()).toBeUndefined()
  })
})
