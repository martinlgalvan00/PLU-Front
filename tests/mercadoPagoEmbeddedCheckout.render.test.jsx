import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const sdk = vi.hoisted(() => ({
  initMercadoPago: vi.fn(),
  payment: vi.fn(),
  cardPayment: vi.fn(),
  wallet: vi.fn(),
}))

const paymentApi = vi.hoisted(() => ({
  createPreference: vi.fn(async () => ({})),
  getPaymentOrderStatus: vi.fn(),
  notifyMockPayment: vi.fn(),
  processEmbeddedPayment: vi.fn(),
  processEmbeddedSubscription: vi.fn(),
  reportPaymentClientEvent: vi.fn(),
}))

vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: sdk.initMercadoPago,
  Payment: (props) => sdk.payment(props),
  CardPayment: (props) => sdk.cardPayment(props),
  Wallet: (props) => sdk.wallet(props),
}))

vi.mock('../src/config/env.js', () => ({
  env: {
    mercadoPago: { publicKey: 'APP_USR-checkout-test', configured: true },
    payments: { isMock: false },
  },
}))

vi.mock('../src/services/paymentService.js', () => paymentApi)

const MercadoPagoEmbeddedCheckout = (
  await import('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx')
).default

const ORDER = {
  paymentId: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
  paymentMethod: 'mercado_pago',
  paymentMode: 'payment',
  preferenceId: 'pref-checkout-test',
  amount: 120000,
  status: 'pendiente',
  payerEmail: 'atleta@pluarg.test',
}

function renderCheckout() {
  return render(
    <I18nProvider>
      <MercadoPagoEmbeddedCheckout order={ORDER} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  sdk.initMercadoPago.mockReset()
  sdk.payment.mockReset().mockImplementation(() => <div data-testid="payment-brick" />)
  sdk.cardPayment.mockReset().mockImplementation(() => <div data-testid="card-payment-brick" />)
  sdk.wallet.mockReset().mockImplementation(() => <div data-testid="wallet-brick" />)
  Object.values(paymentApi).forEach((mock) => mock.mockReset())
  paymentApi.reportPaymentClientEvent.mockResolvedValue({ accepted: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('checkout embebido controlado dentro de la pagina', () => {
  it('contiene una falla al inicializar el SDK y permite reintentarlo', async () => {
    sdk.initMercadoPago.mockImplementationOnce(() => {
      throw new Error('sdk initialization failed')
    })

    renderCheckout()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo cargar el formulario de Mercado Pago',
    )
    expect(paymentApi.reportPaymentClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'initialization' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Recargar checkout' }))
    await waitFor(() => expect(sdk.initMercadoPago).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('evita una pantalla en blanco si el Brick falla durante el render', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let brickBroken = true
    sdk.payment.mockImplementation(() => {
      if (brickBroken) throw new Error('brick render failed')
      return <div data-testid="payment-brick" />
    })

    renderCheckout()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudo cargar el formulario de Mercado Pago',
    )
    expect(paymentApi.reportPaymentClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'render' }),
    )

    brickBroken = false
    fireEvent.click(screen.getByRole('button', { name: 'Recargar checkout' }))
    expect(await screen.findByTestId('payment-brick')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    consoleError.mockRestore()
  })

  it('muestra una falla del proveedor sin exponer el error interno', async () => {
    let brickProps
    sdk.payment.mockImplementation((props) => {
      brickProps = props
      return <div data-testid="payment-brick" />
    })
    paymentApi.processEmbeddedPayment.mockRejectedValue(
      Object.assign(new Error('Error interno'), { status: 502 }),
    )

    renderCheckout()
    await screen.findByTestId('payment-brick')

    await act(async () => {
      await expect(brickProps.onSubmit({
        formData: {
          token: 'token-seguro-de-prueba',
          payment_method_id: 'visa',
          payer: { email: ORDER.payerEmail },
        },
      })).rejects.toMatchObject({ status: 502 })
    })

    expect(screen.getByRole('alert').textContent).toContain('No hay un cobro confirmado')
    expect(screen.queryByText('Error interno')).toBeNull()
    expect(screen.getByRole('button', { name: 'Recargar checkout' })).toBeTruthy()
  })

  it('representa un rechazo y deja reabrir el formulario para otro medio', async () => {
    let brickProps
    sdk.payment.mockImplementation((props) => {
      brickProps = props
      return <div data-testid="payment-brick" />
    })
    paymentApi.processEmbeddedPayment.mockResolvedValue({
      payment: { id: 'payment-rejected', status: 'rejected' },
      order: { id: ORDER.paymentId, status: 'rechazado' },
    })

    renderCheckout()
    await screen.findByTestId('payment-brick')
    await act(async () => {
      await brickProps.onSubmit({
        formData: {
          token: 'token-rechazado-de-prueba',
          payment_method_id: 'visa',
          payer: { email: ORDER.payerEmail },
        },
      })
    })

    expect(screen.getByText(/Mercado Pago rechazó la operación/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar nuevamente' }))
    expect(await screen.findByTestId('payment-brick')).toBeTruthy()
  })
})

describe('presentación settle embebida', () => {
  it('ofrece una sola lista con Mercado Pago, crédito y débito', async () => {
    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={ORDER} presentation="settle" />
      </I18nProvider>,
    )

    await screen.findByTestId('payment-brick')
    const { paymentMethods } = sdk.payment.mock.calls[0][0].customization
    // Tres opciones y ninguna más: `wallet_purchase` deja afuera Mercado Crédito.
    expect(paymentMethods.mercadoPago).toEqual(['wallet_purchase'])
    expect(paymentMethods.creditCard).toBe('all')
    expect(paymentMethods.debitCard).toBe('all')
    expect(paymentMethods.ticket).toBeUndefined()
    expect(paymentMethods.prepaidCard).toBeUndefined()
  })

  it('no monta un Wallet Brick aparte: la cuenta es una fila más del formulario', async () => {
    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={ORDER} presentation="settle" />
      </I18nProvider>,
    )

    await screen.findByTestId('payment-brick')
    expect(sdk.wallet).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wallet-brick')).toBeNull()
    expect(screen.getAllByTestId('payment-brick')).toHaveLength(1)
  })

  it('avisa el salto a Mercado Pago una vez montado el formulario', async () => {
    sdk.payment.mockImplementation((props) => {
      queueMicrotask(() => props.onReady?.())
      return <div data-testid="payment-brick" />
    })

    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={ORDER} presentation="settle" />
      </I18nProvider>,
    )

    expect(
      await screen.findByText(
        'Si elegís Mercado Pago te llevamos a iniciar sesión y volvés acá al confirmar.',
      ),
    ).toBeTruthy()
  })

  it('sin preferencia el formulario sólo ofrece tarjetas', async () => {
    paymentApi.createPreference.mockResolvedValue({})

    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout
          order={{ ...ORDER, preferenceId: null }}
          presentation="settle"
        />
      </I18nProvider>,
    )

    await screen.findByTestId('payment-brick')
    // La cuenta de Mercado Pago necesita `preferenceId`: sin preferencia no se
    // pide el medio, para no listar una opción que el Brick no puede resolver.
    expect(sdk.payment.mock.calls[0][0].customization.paymentMethods.mercadoPago).toBeUndefined()
    expect(
      screen.queryByText(
        'Si elegís Mercado Pago te llevamos a iniciar sesión y volvés acá al confirmar.',
      ),
    ).toBeNull()
  })

  it('si falla preparar la preferencia dos veces, explica la ausencia y permite reintentar', async () => {
    paymentApi.createPreference
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ preference: { id: 'pref-recovered' } })

    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={{ ...ORDER, preferenceId: null }} presentation="settle" />
      </I18nProvider>,
    )

    await screen.findByTestId('payment-brick', {}, { timeout: 4000 })
    expect(
      await screen.findByText('Cuenta de Mercado Pago no disponible', {}, { timeout: 4000 }),
    ).toBeTruthy()
    expect(paymentApi.reportPaymentClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'preference' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    // Recuperada la preferencia, el Brick se remonta y la cuenta de Mercado
    // Pago vuelve a la lista de medios: no hay una superficie aparte que mirar.
    await waitFor(() => {
      expect(sdk.payment.mock.calls.at(-1)[0].customization.paymentMethods.mercadoPago)
        .toEqual(['wallet_purchase'])
    })
    expect(screen.queryByText('Cuenta de Mercado Pago no disponible')).toBeNull()
  })

  it('no rehace el Brick cuando cambia el estado del checkout', async () => {
    paymentApi.getPaymentOrderStatus.mockResolvedValue({
      order: { id: ORDER.paymentId, status: 'pendiente' },
    })

    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={ORDER} presentation="settle" />
      </I18nProvider>,
    )

    await screen.findByTestId('payment-brick')
    const mountedWith = sdk.payment.mock.calls.at(-1)[0]

    // `onReady` del Brick cambia estado del componente: si `customization` o
    // `initialization` perdieran identidad, el SDK desmontaría el formulario y
    // se borraría la tarjeta a medio completar.
    await act(async () => {
      mountedWith.onReady()
    })

    for (const call of sdk.payment.mock.calls) {
      expect(call[0].customization).toBe(mountedWith.customization)
      expect(call[0].initialization).toBe(mountedWith.initialization)
      expect(call[0].onSubmit).toBe(mountedWith.onSubmit)
    }
  })

  it('en la presentación default también lista Mercado Pago dentro del formulario', async () => {
    renderCheckout()

    expect(await screen.findByTestId('payment-brick')).toBeTruthy()
    expect(sdk.wallet).not.toHaveBeenCalled()
    expect(sdk.payment.mock.calls[0][0].customization.paymentMethods.mercadoPago)
      .toEqual(['wallet_purchase'])
  })

  it('espera la preferencia antes de montar Payment Brick para no remountarlo', async () => {
    let resolvePreference
    paymentApi.createPreference.mockImplementation(
      () => new Promise((resolve) => { resolvePreference = resolve }),
    )

    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout
          order={{ ...ORDER, preferenceId: null }}
          presentation="settle"
        />
      </I18nProvider>,
    )

    expect(screen.queryByTestId('payment-brick')).toBeNull()
    await waitFor(() => expect(paymentApi.createPreference).toHaveBeenCalled())

    await act(async () => {
      resolvePreference({ preference: { id: 'pref-late' } })
    })

    expect(await screen.findByTestId('payment-brick')).toBeTruthy()
    const inits = sdk.payment.mock.calls.map((call) => call[0].initialization)
    expect(inits.length).toBeGreaterThan(0)
    expect(inits.every((init) => init.preferenceId === 'pref-late')).toBe(true)
  })

  it('pide al Brick fondo transparente y sin título propio de Mercado Pago', async () => {
    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={ORDER} presentation="settle" />
      </I18nProvider>,
    )

    await screen.findByTestId('payment-brick')
    const visual = sdk.payment.mock.calls[0][0].customization.visual
    expect(visual.hideFormTitle).toBe(true)
    expect(visual.style.customVariables.formBackgroundColor).toBe('transparent')
    expect(visual.style.customVariables.formPadding).toBe('0px')
  })

  it('cambia el CTA nativo según el medio activo, sin reemplazar el submit de Mercado Pago', async () => {
    sdk.payment.mockImplementation((props) => {
      queueMicrotask(() => props.onReady?.())
      return (
        <form data-testid="payment-form">
          <div className="mp-checkout-bricks__selector-a active-x">
            Mercado Pago Tus medios de pago preferidos
          </div>
          <div className="mp-checkout-bricks__selector-b">Tarjeta de crédito Cuotas disponibles</div>
          <button type="submit">Pagar</button>
        </form>
      )
    })

    render(
      <I18nProvider>
        <MercadoPagoEmbeddedCheckout order={ORDER} presentation="settle" />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continuar en Mercado Pago' })).toBeTruthy()
    })

    const wallet = screen.getByText(/Tus medios de pago preferidos/)
    const credit = screen.getByText(/Tarjeta de crédito/)
    act(() => {
      wallet.classList.remove('active-x')
      credit.classList.add('active-x')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pagar con tarjeta' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Pagar con tarjeta' }).getAttribute('type')).toBe('submit')
  })
})
