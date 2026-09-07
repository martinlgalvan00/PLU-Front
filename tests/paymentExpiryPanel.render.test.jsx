import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentExpiryPanel from '../src/components/admin/PaymentExpiryPanel.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const overview = vi.hoisted(() => vi.fn())
const saveWindow = vi.hoisted(() => vi.fn())

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPaymentExpiryOverview: overview,
  saveCheckoutWindow: saveWindow,
}))

const HEALTHY = {
  manualWindowMinutes: 7200,
  staleAttemptGraceMinutes: 30,
  expiredStillOpen: 0,
  heldForProof: 0,
  blockedByProvider: 0,
  reapableAttempts: 0,
  nextExpiringAt: null,
}

function renderPanel(props = {}) {
  return render(
    <I18nProvider>
      <PaymentExpiryPanel canEdit {...props} />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  overview.mockResolvedValue(HEALTHY)
  saveWindow.mockResolvedValue({})
})

describe('PaymentExpiryPanel', () => {
  it('traduce el plazo a días en vez de mostrar 7200 minutos', async () => {
    renderPanel()
    // El número crudo sirve para editar; la lectura de referencia tiene que
    // estar en la unidad en que una persona piensa el plazo.
    expect(await screen.findByText(/Vigente: 5 día/)).toBeTruthy()
  })

  it('separa lo que espera a una persona de lo que cierra el barrido solo', async () => {
    overview.mockResolvedValue({
      ...HEALTHY,
      expiredStillOpen: 5,
      heldForProof: 2,
      blockedByProvider: 3,
      reapableAttempts: 4,
    })
    renderPanel()
    await screen.findByText(/Trabadas por el proveedor/)
    expect(screen.getByText(/Retenidas por comprobante/)).toBeTruthy()
    expect(screen.getByText(/Intentos por cerrar/)).toBeTruthy()
  })

  it('avisa sólo cuando hay vencidas que ni la retención ni el proveedor explican', async () => {
    // 5 vencidas = 2 retenidas + 3 trabadas: todo explicado, sin aviso.
    overview.mockResolvedValue({
      ...HEALTHY,
      expiredStillOpen: 5,
      heldForProof: 2,
      blockedByProvider: 3,
    })
    const { unmount } = renderPanel()
    await screen.findByText(/Trabadas por el proveedor/)
    expect(screen.queryByText(/revisá que el barrido esté corriendo/)).toBeNull()
    unmount()

    // 9 vencidas con las mismas causas: sobran 4 y el cron es sospechoso.
    overview.mockResolvedValue({
      ...HEALTHY,
      expiredStillOpen: 9,
      heldForProof: 2,
      blockedByProvider: 3,
    })
    renderPanel()
    expect(await screen.findByText(/4 orden\/es vencida\/s no se explican/)).toBeTruthy()
  })

  it('no ofrece guardar un plazo por debajo del piso de la gracia', async () => {
    renderPanel()
    const input = await screen.findByLabelText(/Gracia de intentos abandonados/)
    // 1 minuto contradiría a `claim_embedded_payment_attempt`, que da por
    // vencido un intento propio recién a los 5.
    fireEvent.change(input, { target: { value: '1' } })
    await waitFor(() => expect(screen.getByText(/Tiene que ser un número entero/)).toBeTruthy())
    expect(saveWindow).not.toHaveBeenCalled()
  })

  it('desaparece sin ruido cuando el rol no tiene permiso de lectura', async () => {
    // Un 403 acá no es una falla que reportarle a quien está cobrando: es una
    // sección que no le corresponde.
    overview.mockRejectedValue(Object.assign(new Error('Prohibido'), { status: 403 }))
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelector('.admin-payment-expiry')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('muestra el error cuando la lectura falla por cualquier otro motivo', async () => {
    overview.mockRejectedValue(Object.assign(new Error('Supabase caído'), { status: 500 }))
    renderPanel()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
