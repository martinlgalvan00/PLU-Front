import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const confirmAthleteManualPayment = vi.fn()
const deferAthleteFinancedPayment = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({
  confirmAthleteManualPayment,
  deferAthleteFinancedPayment,
}))

const ManualPaymentConfirmation = (
  await import('../src/components/checkout/ManualPaymentConfirmation.jsx')
).default
const TransferReceipt = (await import('../src/components/checkout/TransferReceipt.jsx')).default

afterEach(cleanup)
beforeEach(() => {
  confirmAthleteManualPayment.mockReset()
  deferAthleteFinancedPayment.mockReset()
  window.sessionStorage.clear()
})

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
      // Se espera la ráfaga en vez de asumir que un solo avance alcanza: el
      // temporizador arranca cuando el sello termina de montarse, y con la
      // suite entera en paralelo ese montaje puede caer después del avance.
      // Un `advanceTimersByTime` seco fallaba sólo bajo carga.
      const burst = await waitFor(() => {
        const node = document.body.querySelector('.celebration-burst')
        expect(node).not.toBeNull()
        return node
      })
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

  it('el efectivo confirma en un solo toque: llama a la RPC de inmediato, sin paso intermedio', async () => {
    confirmAthleteManualPayment.mockResolvedValue({
      order: { id: 'order-cash-1', status: 'validacion_manual', financingAllowed: false },
      entitlementsGranted: false,
    })

    render(
      <I18nProvider>
        <ManualPaymentConfirmation channel="cash_pitbull" orderId="order-cash-1" />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya entregué el efectivo' }))

    await waitFor(() => expect(confirmAthleteManualPayment).toHaveBeenCalledWith('order-cash-1'))
    expect(await screen.findByText('Aviso recibido')).toBeTruthy()
  })

  it('tras confirmar efectivo financiado, ofrece un boton para volver al perfil', async () => {
    const onNavigate = vi.fn()
    confirmAthleteManualPayment.mockResolvedValue({
      order: {
        id: 'order-cash-2',
        status: 'validacion_manual',
        financingAllowed: true,
        manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
        financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
      },
      entitlementsGranted: true,
    })

    render(
      <I18nProvider>
        <ManualPaymentConfirmation
          channel="cash_pitbull"
          financingAllowed
          orderId="order-cash-2"
          onNavigate={onNavigate}
          profileTab="account-events"
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya entregué el efectivo' }))
    await waitFor(() => expect(screen.getByText('Ya estás afiliado e inscripto')).toBeTruthy())

    // No navega sola: la persona decide cuándo dejar la pantalla.
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a mi perfil' }))
    expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-events' })
  })

  it('sin financiamiento, el aviso en efectivo no ofrece volver al perfil: se queda con el acuse frio', async () => {
    const onNavigate = vi.fn()
    confirmAthleteManualPayment.mockResolvedValue({
      order: { id: 'order-cash-3', status: 'validacion_manual', financingAllowed: false },
      entitlementsGranted: false,
    })

    render(
      <I18nProvider>
        <ManualPaymentConfirmation
          channel="cash_pitbull"
          orderId="order-cash-3"
          onNavigate={onNavigate}
          profileTab="account-events"
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya entregué el efectivo' }))
    await waitFor(() => expect(confirmAthleteManualPayment).toHaveBeenCalled())
    expect(onNavigate).not.toHaveBeenCalled()
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

/**
 * El plazo de pago se calcula al DECLARAR, no al crear la orden
 * (20260922100000), así que la prop `financedPaymentDueAt` llega en null
 * justamente en el único momento en que la fecha decide algo: cuando la persona
 * acaba de quedar habilitada. El sello prometía "ya estás afiliado e inscripto"
 * y se guardaba que eso caduca solo si Finanzas no acredita.
 *
 * La respuesta de la declaración ya trae la fecha; estos tests fijan que el
 * sello la use.
 */
describe('ManualPaymentConfirmation — plazo del financiamiento', () => {
  it('el sello dice la cuenta regresiva, con la fecha que devolvió la declaración', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
      confirmAthleteManualPayment.mockResolvedValue({
        order: {
          id: 'order-due',
          status: 'validacion_manual',
          financingAllowed: true,
          manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
          financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
          financedPaymentDueAt: '2026-08-27T12:00:00.000Z',
        },
        financed: true,
        entitlementsGranted: true,
      })

      render(
        <I18nProvider>
          {/* Sin `financedPaymentDueAt`: es el estado real de la orden antes de
              declarar, y es donde estaba el agujero. */}
          <ManualPaymentConfirmation orderId="order-due" financingAllowed />
        </I18nProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))

      // A la fecha de la declaración, el plazo de 7 días queda entero.
      const detail = await screen.findByText(/Te quedan 7 días/i)
      // Y dice que los beneficios ya están activos, no sólo la cuenta
      // regresiva: sin eso el plazo es un dato suelto sin contexto.
      expect(detail.textContent).toMatch(/beneficios ya están activos/i)
      expect(detail.textContent).toMatch(/para que Finanzas acredite tu pago/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin plazo en la respuesta cae al detalle de siempre, no a una cuenta regresiva inventada', async () => {
    confirmAthleteManualPayment.mockResolvedValue({
      order: {
        id: 'order-no-due',
        status: 'validacion_manual',
        financingAllowed: true,
        manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
        financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
        financedPaymentDueAt: null,
      },
      financed: true,
      entitlementsGranted: true,
    })

    render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-no-due" financingAllowed />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))

    expect(await screen.findByText(/saldo sigue pendiente de validación/i)).toBeTruthy()
    expect(screen.queryByText(/Te quedan/i)).toBeNull()
  })

  it('al volver a la pantalla el plazo sale de la orden ya declarada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'))
      // Acá la prop sí trae la fecha (la orden ya la tiene sellada) y no hay
      // declaración nueva que la devuelva.
      render(
        <I18nProvider>
          <ManualPaymentConfirmation
            orderId="order-back"
            financingAllowed
            manualPaymentDeclaredAt="2026-08-20T12:00:00.000Z"
            financedEntitlementsAt="2026-08-20T12:00:00.000Z"
            financedPaymentDueAt="2026-09-03T12:00:00.000Z"
          />
        </I18nProvider>,
      )

      expect(await screen.findByText(/Te quedan 9 días/i)).toBeTruthy()
      expect(confirmAthleteManualPayment).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * Las dos maneras de cerrar una orden financiada (20260926100000).
 *
 * Hasta acá había una sola: "ya pagué". Quien pensaba pagar dentro del plazo
 * —que es para lo que existe el financiamiento— tenía que declarar un pago
 * inexistente para quedar habilitado, y Finanzas recibía esa declaración como si
 * hubiera una transferencia que revisar.
 */
describe('ManualPaymentConfirmation — pagar dentro del plazo', () => {
  it('ofrece diferir sólo cuando el código financia', () => {
    const { unmount } = render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-x" financingAllowed />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: /Voy a pagar dentro del plazo/i })).toBeTruthy()
    unmount()

    render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-y" />
      </I18nProvider>,
    )
    // Sin plazo que correr, "pagar después" no habilita nada: sería una promesa
    // vacía y la orden quedaría igual de pendiente.
    expect(screen.queryByRole('button', { name: /Voy a pagar dentro del plazo/i })).toBe(null)
  })

  it('difiere sin declarar el pago y sella la habilitación con su plazo', async () => {
    deferAthleteFinancedPayment.mockResolvedValue({
      order: {
        id: 'order-defer',
        status: 'pendiente',
        financingAllowed: true,
        manualPaymentDeclaredAt: null,
        financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
        financedPaymentDueAt: '2026-09-01T12:00:00.000Z',
      },
      entitlementsGranted: true,
      duplicate: false,
    })

    render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-defer" financingAllowed />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Voy a pagar dentro del plazo/i }))
    })

    await waitFor(() => expect(deferAthleteFinancedPayment).toHaveBeenCalledWith('order-defer'))
    // La otra acción no se toca: diferir no es declarar, y confundirlas es
    // justamente lo que mandaba a Finanzas a revisar pagos que no existieron.
    expect(confirmAthleteManualPayment).not.toHaveBeenCalled()
    // El sello no puede decir "recibimos tu aviso de pago" a quien avisó que va
    // a pagar después.
    expect(await screen.findByText(/Quedás habilitado/i)).toBeTruthy()
  })
})
