import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretBundleSection.render.test.jsx — PLU ARG
 *
 * La ficha del código-paquete: el documento arriba, el trámite abajo y un solo
 * paso visible por vez. Es la única superficie donde el paquete se lee entero y
 * se termina de pagar, así que lo que se prueba es que cada estado muestre lo
 * suyo y que el submit mande exactamente lo que la RPC del combo necesita.
 */
const confirmAthleteManualPayment = vi.fn()
const deferAthleteFinancedPayment = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({
  confirmAthleteManualPayment,
  deferAthleteFinancedPayment,
}))

const SecretBundleSection = (await import('../src/pages/profile/SecretBundleSection.jsx')).default

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Agustín Di Santo',
  documentId: '30111222',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 93,
}

/** Un código-paquete tal como lo devuelve `athlete_list_offer_unlocks`. */
function bundleOffer(overrides = {}) {
  return {
    id: 'code-1',
    code: 'ONLY-PITBULL-GOLD',
    kind: 'fixed_price',
    appliesTo: 'combo',
    fixedPrice: 120000,
    fixedPriceManual: 120000,
    manualChannels: ['bank_transfer', 'cash_pitbull'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 14,
    expiresAt: null,
    remaining: null,
    purchase: null,
    membershipPlan: { id: 'plan-1', name: 'Afiliación PLU anual', price: 85000, currency: 'ARS' },
    event: {
      id: 'ev-1',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      registrationPrice: 45000,
      currency: 'ARS',
    },
    ...overrides,
  }
}

afterEach(cleanup)
beforeEach(() => {
  confirmAthleteManualPayment.mockReset()
  deferAthleteFinancedPayment.mockReset()
  window.sessionStorage.clear()
})

describe('la ficha del código-paquete', () => {
  it('cuenta el paquete entero: qué es, cuánto sale y con qué condiciones', () => {
    render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[bundleOffer()]} />
      </I18nProvider>,
    )

    // El código, en el mismo registro que un documento emitido.
    expect(screen.getByText('ONLY-PITBULL-GOLD')).toBeTruthy()
    // Qué se está comprando, en una sola frase.
    expect(screen.getByText(/Afiliación PLU anual \+ Pitbull Classic/)).toBeTruthy()
    // El ahorro contra la suma de las partes: 130.000 por separado, 120.000 el
    // paquete. Sin esto el precio pactado no se lee como una oferta.
    expect(screen.getByText(/Ahorrás/)).toBeTruthy()
    // Las condiciones que cambian la operación, no como notas al pie.
    expect(screen.getByText(/Sólo con transferencia · efectivo/)).toBeTruthy()
    expect(screen.getByText(/14 días para pagar/)).toBeTruthy()
  })

  it('precarga los datos competitivos del perfil en vez de volver a pedirlos', () => {
    render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[bundleOffer()]} />
      </I18nProvider>,
    )

    expect(screen.getByLabelText(/División/i).value).toBe('Open')
    expect(screen.getByLabelText(/Categoría/i).value).toBe('Raw')
    expect(screen.getByLabelText(/Peso declarado/i).value).toBe('93')
  })

  it('ofrece sólo los canales que el código habilita', () => {
    render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[bundleOffer()]} />
      </I18nProvider>,
    )

    // El código cerró la pasarela: ofrecerla sería prometer un medio que la RPC
    // rechaza con PLU28.
    expect(screen.queryByRole('radio', { name: /Mercado Pago/i })).toBe(null)
    expect(screen.getByRole('radio', { name: /transferencia/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /efectivo/i })).toBeTruthy()
  })

  it('cobra sin salir de la ficha, con los datos que la RPC del combo exige', async () => {
    const onStartOfferPayment = vi.fn(async () => ({ order: { id: 'order-1' } }))
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[bundleOffer()]}
          onStartOfferPayment={onStartOfferPayment}
        />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }))
    })

    await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalledTimes(1))
    const call = onStartOfferPayment.mock.calls[0][0]
    expect(call.paymentMethod).toBe('manual_link')
    expect(call.division).toBe('Open')
    expect(call.category).toBe('Raw')
    expect(call.bodyweightKg).toBe(93)
    expect(call.event.slug).toBe('pitbull-classic-2026')
    expect(call.offer.code).toBe('ONLY-PITBULL-GOLD')
  })

  it('no crea la orden con el perfil competitivo incompleto', async () => {
    const onStartOfferPayment = vi.fn()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={{ ...ATHLETE, division: '', category: '', estimatedWeight: null }}
          offers={[bundleOffer()]}
          onStartOfferPayment={onStartOfferPayment}
        />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }))
    })

    expect(onStartOfferPayment).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/división, categoría y peso/i)
  })

  it('con el derecho ya otorgado manda la cuenta regresiva y retira el formulario', () => {
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              purchase: {
                orderId: 'order-1',
                status: 'pendiente',
                manualPaymentChannel: 'cash_pitbull',
                financingAllowed: true,
                manualPaymentDeclaredAt: null,
                financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
                financedEntitlementsRevokedAt: null,
                financedPaymentDueAt: dueAt,
              },
            }),
          ]}
        />
      </I18nProvider>,
    )

    // Comprado: no se vuelve a ofrecer comprarlo.
    expect(screen.queryByRole('button', { name: /Confirmar y pagar/i })).toBe(null)
    expect(screen.getByText(/Habilitado, con saldo/)).toBeTruthy()
    // La cuenta regresiva ya es una oración completa; la ficha sólo le suma la
    // consecuencia. Envolverla en otra frase daba "Te queda Te quedan 2 días…".
    expect(screen.getByText(/Te quedan .* Vencido el plazo se dan de baja/)).toBeTruthy()
  })

  it('el desvío a Mercado Pago guarda el código pendiente antes de navegar', async () => {
    // La pasarela se cobra en el checkout del torneo. El código tiene que
    // viajar como pendiente con destino 'competition': es lo que ese checkout
    // lee al montar para auto-aplicarlo y destrabar el combo — sin esto el
    // atleta aterrizaba en una inscripción suelta a precio de lista.
    const onStartOfferPayment = vi.fn()
    const onNavigate = vi.fn()
    const onSelectEvent = vi.fn()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[bundleOffer({ mercadoPagoEnabled: true, manualChannels: [] })]}
          onStartOfferPayment={onStartOfferPayment}
          onNavigate={onNavigate}
          onSelectEvent={onSelectEvent}
        />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ir a pagar con Mercado Pago/i }))
    })

    expect(onStartOfferPayment).not.toHaveBeenCalled()
    expect(onSelectEvent).toHaveBeenCalledWith({ slug: 'pitbull-classic-2026' })
    expect(onNavigate).toHaveBeenCalledWith('competition', { eventSlug: 'pitbull-classic-2026' })
    const pending = JSON.parse(window.sessionStorage.getItem('plu:pending-promotion-code'))
    expect(pending.code).toBe('ONLY-PITBULL-GOLD')
    expect(pending.context.destination).toEqual({
      view: 'competition',
      eventSlug: 'pitbull-classic-2026',
    })
  })

  it('quien volvió tras declarar por transferencia ve la cuenta regresiva en el sello', () => {
    // `financedPaymentDueAt` tiene que atravesar TransferReceipt hasta el
    // sello: quien ya declaró monta directo en 'confirmed' con el plazo de la
    // prop como único origen — sin él, la rama de transferencia caía al copy
    // genérico y sólo el efectivo contaba cuánto plazo quedaba.
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              purchase: {
                orderId: 'order-1',
                status: 'validacion_manual',
                manualPaymentChannel: 'bank_transfer',
                financingAllowed: true,
                manualPaymentDeclaredAt: '2026-08-25T12:00:00.000Z',
                financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
                financedEntitlementsRevokedAt: null,
                financedPaymentDueAt: dueAt,
              },
            }),
          ]}
        />
      </I18nProvider>,
    )

    // El sello del paso de liquidación dice el plazo con la cuenta regresiva,
    // no el copy genérico sin fecha.
    expect(screen.getByText(/Tus beneficios ya están activos\. Te quedan/)).toBeTruthy()
  })

  it('una compra reembolsada queda como constancia, sin volver a ofrecer el formulario', () => {
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              purchase: { orderId: 'order-1', status: 'reembolsado' },
            }),
          ]}
        />
      </I18nProvider>,
    )

    // Un reembolso no libera el canje (20260906100000): re-ofrecer la compra
    // terminaba en "ya usaste ese código" al confirmar.
    expect(screen.queryByRole('button', { name: /Confirmar y pagar/i })).toBe(null)
    expect(screen.getByText('Reembolsado')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/se devolvió/i)
  })

  /**
   * El agujero que cerró este caso: la compra de Mercado Pago sin pagar caía en
   * el paso 'manual' —el único que quedaba— y la ficha ofrecía el panel de
   * liquidación a mano. Con `manualPaymentChannel` en null (la orden de la
   * pasarela no tiene canal manual) el bloque elegía la rama de efectivo, así
   * que el único botón disponible era "Ya entregué el efectivo" sobre una orden
   * que `athlete_confirm_manual_payment` rechaza con PLU10. Y no había ninguna
   * salida hacia la pasarela: la ficha era un callejón.
   */
  const gatewayPurchase = {
    orderId: 'order-mp',
    status: 'pendiente',
    amount: 150000,
    currency: 'ARS',
    concept: 'combo',
    method: 'mercado_pago',
    manualPaymentChannel: null,
    financingAllowed: false,
  }

  it('una compra de Mercado Pago sin pagar no ofrece declarar un pago manual', () => {
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              mercadoPagoEnabled: true,
              manualChannels: [],
              financed: false,
              purchase: gatewayPurchase,
            }),
          ]}
        />
      </I18nProvider>,
    )

    expect(screen.queryByRole('button', { name: /Ya entregué el efectivo/i })).toBe(null)
    expect(screen.queryByText(/comprobante/i)).toBe(null)
    // Lo que sí ofrece: volver al checkout del torneo, que es donde vive el brick.
    expect(screen.getByRole('button', { name: /Retomar el pago con Mercado Pago/i })).toBeTruthy()
  })

  it('retomar la pasarela guarda el código pendiente y vuelve al checkout del torneo', async () => {
    const onNavigate = vi.fn()
    const onSelectEvent = vi.fn()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              mercadoPagoEnabled: true,
              manualChannels: [],
              financed: false,
              purchase: gatewayPurchase,
            }),
          ]}
          onNavigate={onNavigate}
          onSelectEvent={onSelectEvent}
        />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retomar el pago con Mercado Pago/i }))
    })

    // Mismo traspaso que el desvío desde el formulario: sin el pendiente, el
    // checkout cobra la inscripción suelta a precio de lista.
    expect(onSelectEvent).toHaveBeenCalledWith({ slug: 'pitbull-classic-2026' })
    expect(onNavigate).toHaveBeenCalledWith('competition', { eventSlug: 'pitbull-classic-2026' })
    const pending = JSON.parse(window.sessionStorage.getItem('plu:pending-promotion-code'))
    expect(pending.code).toBe('ONLY-PITBULL-GOLD')
    expect(pending.context.destination).toEqual({
      view: 'competition',
      eventSlug: 'pitbull-classic-2026',
    })
  })

  it('la ficha cotiza el canal de la orden, no el del selector', () => {
    // 125.000 es lo que cobra la orden de Mercado Pago; 110.000 es el precio
    // del canal manual. La ficha forzaba 'manual' apenas existía una compra,
    // así que anunciaba un importe que esa orden no cobra.
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              fixedPrice: 125000,
              fixedPriceManual: 110000,
              mercadoPagoEnabled: true,
              manualChannels: [],
              financed: false,
              purchase: { ...gatewayPurchase, amount: 125000 },
            }),
          ]}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('$ 125.000')).toBeTruthy()
    expect(screen.queryByText('$ 110.000')).toBe(null)
  })

  it('sin ningún código canjeado no renderiza nada', () => {
    const { container } = render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[]} />
      </I18nProvider>,
    )
    expect(container.textContent).toBe('')
  })
})

describe('bundleState — el paso del trámite se lee de la compra', () => {
  it('una orden cerrada devuelve el paquete al principio', async () => {
    const { bundleState } = await import('../src/pages/profile/SecretBundleSection.jsx')
    // El canje se libera con la orden (20260906100000): el código vuelve a estar
    // disponible, así que la ficha tiene que volver a ofrecerlo en vez de
    // quedarse mostrando un cobro muerto.
    expect(bundleState({ status: 'rechazado' })).toBe('ready')
    expect(bundleState({ status: 'cancelado' })).toBe('ready')
    expect(bundleState(null)).toBe('ready')
    expect(bundleState({ status: 'aprobado' })).toBe('settled')
    // El reembolso NO libera el canje (la redención queda como registro
    // contable): la ficha es constancia, no una nueva oferta.
    expect(bundleState({ status: 'reembolsado' })).toBe('refunded')
    expect(bundleState({ status: 'validacion_manual' })).toBe('manual')
    // Abierta pero con la pasarela: no hay nada que declarar y el brick vive en
    // el checkout del torneo, así que es su propio paso.
    expect(bundleState({ status: 'pendiente', method: 'mercado_pago' })).toBe('gateway')
    expect(bundleState({ status: 'pendiente', method: 'manual_link' })).toBe('manual')
    // Cerradas: el método no cambia en qué terminó la orden.
    expect(bundleState({ status: 'aprobado', method: 'mercado_pago' })).toBe('settled')
    expect(bundleState({ status: 'cancelado', method: 'mercado_pago' })).toBe('ready')
    expect(
      bundleState({ status: 'pendiente', financedEntitlementsAt: '2026-08-25T12:00:00.000Z' }),
    ).toBe('granted')
    // Revocado ya no es un derecho vigente: vuelve a ser una orden a cobrar.
    expect(
      bundleState({
        status: 'pendiente',
        financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
        financedEntitlementsRevokedAt: '2026-09-08T12:00:00.000Z',
      }),
    ).toBe('manual')
  })
})
