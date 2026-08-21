import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const confirmAthleteManualPayment = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({ confirmAthleteManualPayment }))

const ManualPaymentConfirmation = (
  await import('../src/components/checkout/ManualPaymentConfirmation.jsx')
).default
const TransferReceipt = (await import('../src/components/checkout/TransferReceipt.jsx')).default

afterEach(cleanup)
beforeEach(() => confirmAthleteManualPayment.mockReset())

describe('ManualPaymentConfirmation', () => {
  it('declara la transferencia y sella la habilitacion sin llamarla pago', async () => {
    confirmAthleteManualPayment.mockResolvedValue({
      order: {
        id: 'order-1',
        status: 'validacion_manual',
        financingAllowed: true,
        manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
        financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
      },
      financed: true,
      entitlementsGranted: true,
    })
    const updated = vi.fn()
    window.addEventListener('plu:payment-updated', updated)

    render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-1" financingAllowed />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))

    await waitFor(() => expect(confirmAthleteManualPayment).toHaveBeenCalledWith('order-1'))
    // El aviso ya no es un renglón administrativo: es el cierre del trámite,
    // con el mismo sello de los otros tres.
    expect(await screen.findByText('Ya estás afiliado e inscripto')).toBeTruthy()
    expect(screen.getByText('Afiliación e inscripción habilitadas')).toBeTruthy()
    // Y la deuda se dice en la misma pieza: habilitar no es acreditar.
    expect(screen.getByText(/saldo sigue pendiente de validación/i)).toBeTruthy()
    expect(screen.queryByText(/pago aprobado/i)).toBeNull()
    // El aviso al resto de la app espera a que el sello se lea: ese refresco
    // retira la ficha de la oferta y desmontaba el cierre a mitad de camino.
    expect(updated).not.toHaveBeenCalled()
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1), { timeout: 4000 })
    window.removeEventListener('plu:payment-updated', updated)
  })

  it('la ráfaga sale del sello, una sola vez, cuando el papel ya está estampado', async () => {
    // Es el mismo festejo aprobado que cierra afiliación, credencial e
    // inscripción: acá se cierran dos de esos tres a la vez.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      window.localStorage.clear()
      confirmAthleteManualPayment.mockResolvedValue({
        order: {
          id: 'order-burst',
          status: 'validacion_manual',
          financingAllowed: true,
          manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
          financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
        },
        entitlementsGranted: true,
      })

      render(
        <I18nProvider>
          <ManualPaymentConfirmation orderId="order-burst" financingAllowed />
        </I18nProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
      await waitFor(() => expect(screen.getByText('Ya estás afiliado e inscripto')).toBeTruthy())

      // No sale junto con el montaje: espera a que el sello quede estampado.
      expect(document.body.querySelector('.celebration-burst')).toBeNull()
      await act(async () => {
        vi.advanceTimersByTime(700)
      })
      const burst = document.body.querySelector('.celebration-burst')
      expect(burst).not.toBeNull()
      expect(burst.querySelectorAll('.celebration-burst__piece').length).toBeGreaterThan(0)
      // Y no aporta nada al árbol accesible: la confirmación vive en el texto.
      expect(burst.getAttribute('aria-hidden')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin financiamiento no hay nada que cerrar: queda el acuse frío', async () => {
    // Festejar acá sería festejar un pago que Finanzas todavía puede rechazar.
    confirmAthleteManualPayment.mockResolvedValue({
      order: { id: 'order-3', status: 'validacion_manual', financingAllowed: false },
      entitlementsGranted: false,
    })

    render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-3" />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))

    expect(await screen.findByText('Aviso recibido')).toBeTruthy()
    expect(screen.queryByText('Ya estás afiliado e inscripto')).toBeNull()
    expect(document.querySelector('.celebration-burst')).toBeNull()
  })

  it('al volver a la pantalla el sello sigue, el papel no vuelve a salir', () => {
    // Una ráfaga que se repite en cada visita deja de ser un festejo.
    render(
      <I18nProvider>
        <ManualPaymentConfirmation
          orderId="order-4"
          financingAllowed
          manualPaymentDeclaredAt="2026-08-20T12:00:00.000Z"
          financedEntitlementsAt="2026-08-20T12:00:00.000Z"
        />
      </I18nProvider>,
    )

    expect(screen.getByText('Ya estás afiliado e inscripto')).toBeTruthy()
    expect(document.querySelector('.celebration-burst')).toBeNull()
    expect(confirmAthleteManualPayment).not.toHaveBeenCalled()
  })

  it('usa la accion especifica para efectivo', () => {
    render(
      <I18nProvider>
        <ManualPaymentConfirmation channel="cash_pitbull" orderId="order-2" />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: 'Ya entregué el efectivo' })).toBeTruthy()
  })

  it('la transferencia avisa a la ficha para releer FIAR y retirarse', async () => {
    confirmAthleteManualPayment.mockResolvedValue({
      order: {
        id: 'order-fiar',
        status: 'validacion_manual',
        financingAllowed: true,
        manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
        financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
      },
      entitlementsGranted: true,
    })
    const onConfirmed = vi.fn()

    render(
      <I18nProvider>
        <TransferReceipt
          athlete={{ documentId: '30111222', fullName: 'Ana Pérez' }}
          financingAllowed
          onConfirmed={onConfirmed}
          orderId="order-fiar"
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(onConfirmed.mock.calls[0][0]).toMatchObject({ entitlementsGranted: true })
  })
})
