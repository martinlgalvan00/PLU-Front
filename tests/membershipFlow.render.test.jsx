import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * membershipFlow.render.test.jsx — PLU ARG
 *
 * Render real (jsdom) de las dos pantallas donde el atleta se afilia y cobra
 * su credencial: la confirmación histórica del alta (`RegisterPage`, flujo
 * membership, usado en stories) y la sección de afiliación de la cuenta, que
 * es el cobro vivo. Home, Members y el aviso de inscripción navegan a este
 * tab para no duplicar precios.
 *
 * La regla que verifican los dos: **la credencial se emite después del pago.**
 * `athletes.credential_token` nace con la cuenta, así que el QR existe desde el
 * minuto cero y nada impedía ofrecerlo con la orden todavía en `pendiente`. Por
 * transferencia eso son días entre el alta y la acreditación, con una card
 * descargable y escaneable en el medio: en la puerta el operador ve un QR que
 * resuelve a una persona real y una afiliación que no está paga.
 */

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

// El brick de Mercado Pago carga el SDK remoto al montarse.
const mpBrick = vi.hoisted(() => ({ paymentProps: [] }))

vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: vi.fn(),
  Payment: (props) => {
    mpBrick.paymentProps.push(props)
    return <div data-testid="mp-payment-brick" />
  },
  CardPayment: () => <div data-testid="mp-card-brick" />,
  Wallet: () => <div data-testid="mp-wallet-brick" />,
}))

vi.mock('../src/services/athleteApi.js', () => ({
  // El alta y la ficha personal piden el listado de gimnasios al montar
  // (RegisterPage / PersonalDataSection). Omitirlo en el doble no desvia el
  // test a otra rama: revienta el render entero con "No fetchGyms export is
  // defined on the mock".
  fetchGyms: vi.fn(async () => []),
  resendAthleteVerification: vi.fn(),
}))

vi.mock('../src/services/registrationAccessService.js', () => ({
  fetchRegistrationAccessRequirements: vi.fn(async () => ({
    membership: false,
    registration: false,
    membershipEnabled: true,
    registrationEnabled: true,
    membershipManualEnabled: true,
    registrationManualEnabled: true,
  })),
  verifyRegistrationAccessCode: vi.fn(),
}))

// La clave pública de Mercado Pago llega por `import.meta.env`, que en jsdom
// viene vacía: sin esto el checkout se renderiza como "no configurado" y el
// test no podría distinguir eso de "no se ofrece pagar".
vi.mock('../src/config/env.js', () => ({
  env: {
    appUrl: 'http://localhost:5173',
    apiUrl: '',
    isDev: true,
    demoMode: false,
    supabase: { url: '', anonKey: '', configured: false },
    mercadoPago: { publicKey: 'APP_USR-test-public-key', configured: true },
    payments: { transferAlias: 'plu.arg', transferCbu: '', transferHolder: '' },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
}))

vi.mock('../src/services/paymentService.js', () => ({
  createPreference: vi.fn(async () => ({})),
  listMembershipPlans: vi.fn(async () => ({
    plans: [
      {
        code: 'plu-annual',
        name: 'Afiliación anual',
        price: 75000,
        currency: 'ARS',
        billingFrequency: 'annual',
        collectionMode: 'one_time',
      },
    ],
  })),
  isMercadoPagoConfigured: () => true,
  processEmbeddedPayment: vi.fn(),
  processEmbeddedSubscription: vi.fn(),
  getPaymentOrderStatus: vi.fn(),
}))

const RegisterPage = (await import('../src/pages/RegisterPage.jsx')).default
const MembershipPurchaseSection = (
  await import('../src/pages/profile/MembershipPurchaseSection.jsx')
).default
const { fetchRegistrationAccessRequirements } =
  await import('../src/services/registrationAccessService.js')
const { listMembershipPlans } = await import('../src/services/paymentService.js')

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  photoUrl: null,
  // Estable de por vida: existe desde el alta, mucho antes de cualquier pago.
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000001',
}

const PENDING_ORDER = {
  type: 'membership',
  athleteId: ATHLETE.id,
  athleteName: ATHLETE.fullName,
  athleteDocument: ATHLETE.documentId,
  paymentId: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
  paymentMethod: 'mercado_pago',
  preferenceId: 'pref-1',
  paymentMode: 'payment',
  amount: 25000,
  concept: 'Afiliación PLU',
  reference: 'MP-1',
  status: 'pendiente',
}

function membership(overrides = {}) {
  return {
    id: 'mem-1',
    athleteId: ATHLETE.id,
    status: 'activa',
    startDate: '2026-01-01',
    // Un año por delante del "hoy" real de cualquier corrida del test.
    expirationDate: `${new Date().getFullYear() + 1}-12-31`,
    memberCode: 'PLU-ARG-2026-014',
    qrToken: 'b5f1c0de-0000-4000-8000-000000000002',
    ...overrides,
  }
}

function renderRegister({
  memberships = [],
  registrations = [],
  flow = 'membership',
  order = PENDING_ORDER,
  event = {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic 2026',
    price: 75000,
    requiresMembership: true,
  },
  onSubmit = () => {},
  total = 75000,
  form = {
    paymentMethod: 'mercado_pago',
    division: 'Open',
    category: 'Raw',
    estimatedWeight: '83',
  },
} = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={ATHLETE}
        createdOrder={order ? { ...order, type: flow } : null}
        event={event}
        flow={flow}
        form={form}
        memberships={memberships}
        registrations={registrations}
        total={total}
        onNavigate={() => {}}
        onSubmit={onSubmit}
        onUpdateForm={() => {}}
      />
    </I18nProvider>,
  )
}

function renderPurchaseSection(membershipRow, props = {}) {
  return render(
    <I18nProvider>
      <MembershipPurchaseSection athlete={ATHLETE} membership={membershipRow} {...props} />
    </I18nProvider>,
  )
}

async function waitForMembershipPayButton() {
  await waitFor(() => {
    const submit = screen.getByRole('button', { name: /continuar con mercado pago/i })
    expect(submit.disabled).toBe(false)
  })
  return screen.getByRole('button', { name: /continuar con mercado pago/i })
}

// Cada pantalla rotula su acción distinto: "Descargar y compartir mi card" en
// el alta y en la inscripción, "Ver mi card" en la cuenta. Lo que importa es
// si existe o no, no el rótulo exacto.
const registerCredentialAction = () =>
  screen.queryByRole('button', { name: /descargar y compartir mi card/i })
const accountCredentialAction = () => screen.queryByRole('button', { name: 'Ver mi card' })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('confirmación del alta de afiliación', () => {
  it('no ofrece la credencial mientras la orden está pendiente', () => {
    renderRegister({ memberships: [membership({ status: 'pendiente_pago' })] })

    expect(registerCredentialAction()).toBeNull()
    // Y sí ofrece lo único que corresponde en ese estado: pagar.
    expect(screen.getByTestId('mp-payment-brick')).toBeTruthy()
  })

  it('tampoco la ofrece con una afiliación activa pero vencida', () => {
    // El cron de vencimiento no es instantáneo: la fila queda `activa` con la
    // fecha pasada por un rato, y el servidor ya la rechaza.
    renderRegister({ memberships: [membership({ expirationDate: '2020-12-31' })] })

    expect(registerCredentialAction()).toBeNull()
  })

  it('la ofrece en cuanto la afiliación cubre hoy', () => {
    // Es el estado tras la acreditación: `plu:payment-updated` refresca el
    // snapshot y la fila pasa a vigente.
    renderRegister({ memberships: [membership()] })

    expect(registerCredentialAction()).toBeTruthy()
    // El número de socio ahora vive dentro de la card ("Socio n.º PLU-…"), no
    // en una ficha aparte: se busca por contenido, no por nodo exacto.
    expect(screen.getAllByText(/PLU-ARG-2026-014/).length).toBeGreaterThan(0)
  })

  it('ignora la afiliación de otro atleta', () => {
    renderRegister({ memberships: [membership({ athleteId: 'ath-otro' })] })

    expect(registerCredentialAction()).toBeNull()
  })

  it('ofrece seguir al perfil una vez confirmada el alta', () => {
    // El CTA depende de `onNavigate`, que App no le estaba pasando: el atleta
    // terminaba de pagar y la pantalla no ofrecía a dónde seguir.
    renderRegister({ memberships: [membership()] })

    expect(screen.getByRole('button', { name: /ir a mi perfil|mi perfil/i })).toBeTruthy()
  })
})

describe('credencial de inscripción a torneo', () => {
  const registration = (overrides = {}) => ({
    id: 'reg-1',
    athleteId: ATHLETE.id,
    paymentOrderId: PENDING_ORDER.paymentId,
    status: 'pendiente_pago',
    event: 'Pitbull Classic 2026',
    eventSlug: 'pitbull-classic-2026',
    division: 'Open',
    category: 'Raw',
    ...overrides,
  })

  // El bloque de estado se duplica en el layout (aside de desktop + contexto
  // mobile), así que la acción aparece más de una vez cuando existe.
  const cardActions = () =>
    screen.queryAllByRole('button', { name: /descargar y compartir mi card/i })

  it('muestra ARS 75.000 como total de inscripción de Pitbull Classic con Mercado Pago', () => {
    const { container } = renderRegister({
      flow: 'competition',
      order: null,
      total: 75000,
      event: {
        slug: 'pitbull-classic-2026',
        title: 'Pitbull Classic 2026',
        price: 75000,
        requiresMembership: true,
      },
    })

    const displayedTotals = [
      ...container.querySelectorAll('.register-competition-ticket__total strong'),
    ].map((node) => node.textContent.replace(/\s/g, ''))
    expect(displayedTotals.some((value) => value.includes('75.000'))).toBe(true)
    expect(displayedTotals.some((value) => /^\$?2$/.test(value))).toBe(false)
  })

  it('no la emite con la inscripción pendiente de pago', () => {
    renderRegister({ flow: 'competition', registrations: [registration()] })

    expect(cardActions()).toHaveLength(0)
  })

  it('la emite cuando la inscripción ya habilita el ingreso', () => {
    // Mismo criterio que aplica la puerta al escanear (isRegistrationAdmitted).
    renderRegister({ flow: 'competition', registrations: [registration({ status: 'confirmada' })] })

    expect(cardActions().length).toBeGreaterThan(0)
  })

  it('ignora una inscripción de otra orden', () => {
    renderRegister({
      flow: 'competition',
      registrations: [registration({ status: 'confirmada', paymentOrderId: 'otra-orden' })],
    })

    expect(cardActions()).toHaveLength(0)
  })

  it('ofrece y envia el combo como una unica eleccion cuando falta afiliacion', async () => {
    const onSubmit = vi.fn(async () => ({}))
    renderRegister({
      flow: 'competition',
      order: null,
      onSubmit,
      total: 75000,
      event: {
        slug: 'pitbull-classic-2026',
        title: 'Pitbull Classic 2026',
        price: 75000,
        requiresMembership: true,
        comboOffer: {
          id: 'combo-1',
          active: true,
          price: 120000,
          currency: 'ARS',
          startsAt: '2020-01-01T00:00:00-03:00',
          endsAt: '2099-12-31T23:59:59-03:00',
        },
      },
    })

    expect(screen.getByRole('radio', { name: /afiliaci/i }).checked).toBe(true)
    expect(screen.getByRole('button', { name: /continuar al pago/i })).toBeTruthy()
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'pitbull-classic-2026' }),
        expect.objectContaining({ purchaseType: 'combo', paymentMethod: 'mercado_pago' }),
      )
    })
  })

  it('contiene un error al crear el combo y permite reintentarlo en la misma pagina', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('No se pudo iniciar el pago. Reintentá en unos segundos.'))
      .mockResolvedValueOnce({})
    renderRegister({
      flow: 'competition',
      order: null,
      onSubmit,
      total: 75000,
      event: {
        slug: 'pitbull-classic-2026',
        title: 'Pitbull Classic 2026',
        price: 75000,
        requiresMembership: true,
        comboOffer: {
          id: 'combo-1',
          active: true,
          price: 120000,
          currency: 'ARS',
          startsAt: '2020-01-01T00:00:00-03:00',
          endsAt: '2099-12-31T23:59:59-03:00',
        },
      },
    })

    const submit = screen.getByRole('button', { name: /continuar al pago/i })
    await waitForAccessValidation()
    fireEvent.click(submit)
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo iniciar el pago')
    expect(submit.disabled).toBe(false)

    fireEvent.click(submit)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('sección de afiliación de la cuenta', () => {
  it('muestra el precio del catálogo, no un fallback local', async () => {
    listMembershipPlans.mockResolvedValueOnce({
      plans: [
        {
          code: 'plu-annual',
          name: 'Afiliación anual',
          price: 88000,
          currency: 'ARS',
          billingFrequency: 'annual',
          collectionMode: 'one_time',
        },
      ],
    })
    renderPurchaseSection(membership({ status: 'pendiente_pago' }))

    await waitFor(() => {
      expect(screen.getAllByText(/88\.000/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/75\.000/)).toBeNull()
  })

  it('ofrece renovar cuando la afiliación venció, sin llamarla impaga', () => {
    renderPurchaseSection(membership({ expirationDate: '2020-12-31' }))

    expect(screen.getByText('Afiliación vencida')).toBeTruthy()
    expect(screen.queryByText('Pendiente de pago')).toBeNull()
    // La salida del atleta: el checkout tiene que estar a la vista.
    expect(screen.getByRole('group', { name: /método de pago/i })).toBeTruthy()
  })

  it('llama impaga a la que nunca se pagó', () => {
    renderPurchaseSection(membership({ status: 'pendiente_pago' }))

    expect(screen.getByText('Pendiente de pago')).toBeTruthy()
    expect(screen.queryByText('Afiliación vencida')).toBeNull()
  })

  it('no permite reemplazar una transferencia cuyo comprobante está en validación', () => {
    renderPurchaseSection(membership({ status: 'cancelada', paymentStatus: 'validacion_manual' }))

    expect(screen.getByText('Transferencia en validación')).toBeTruthy()
    expect(screen.getAllByText(/puede demorar hasta 48 horas/i)).not.toHaveLength(0)
    expect(screen.queryByText('Afiliación cancelada')).toBeNull()
    expect(screen.queryByRole('button', { name: /continuar con mercado pago/i })).toBeNull()
  })

  it('con la afiliación vigente muestra el código y esconde el checkout', () => {
    renderPurchaseSection(membership())

    expect(screen.getByText('PLU-ARG-2026-014')).toBeTruthy()
    expect(screen.queryByRole('group', { name: /método de pago/i })).toBeNull()
    expect(accountCredentialAction()).toBeTruthy()
  })

  it('explica una renovación programada sin ofrecer cobrar otra vez', () => {
    renderPurchaseSection(
      membership({
        startDate: `${new Date().getFullYear() + 1}-01-01`,
        expirationDate: `${new Date().getFullYear() + 2}-01-01`,
      }),
    )

    expect(screen.getByText('Afiliación programada')).toBeTruthy()
    expect(screen.getByText(/el pago ya está validado/i)).toBeTruthy()
    expect(screen.queryByRole('group', { name: /método de pago/i })).toBeNull()
  })

  it('distingue una baja y un reembolso de un pago pendiente', () => {
    const { rerender } = renderPurchaseSection(membership({ status: 'cancelada' }))
    expect(screen.getByText('Afiliación cancelada')).toBeTruthy()
    expect(screen.queryByText('Afiliación no paga')).toBeNull()

    rerender(
      <I18nProvider>
        <MembershipPurchaseSection
          athlete={ATHLETE}
          membership={membership({ status: 'reembolsada' })}
        />
      </I18nProvider>,
    )
    expect(screen.getByText('Pago reembolsado')).toBeTruthy()
  })

  it('bloquea el doble envío mientras crea la orden', async () => {
    let resolveOrder
    const onStartMembershipPayment = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveOrder = resolve
        }),
    )
    renderPurchaseSection(membership({ status: 'pendiente_pago' }), { onStartMembershipPayment })

    const submit = await waitForMembershipPayButton()
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(onStartMembershipPayment).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /creando orden segura/i }).disabled).toBe(true)

    resolveOrder({ error: 'No se pudo crear la orden.' })
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No se pudo crear la orden.'),
    )
    expect(screen.getByRole('button', { name: /continuar con mercado pago/i }).disabled).toBe(false)
  })

  it('paga con Mercado Pago inline (sin modal) y deja volver a elegir el método sin perder la orden', async () => {
    const createdOrder = {
      paymentId: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
      amount: 75000,
      preferenceId: 'pref-membership',
      paymentMode: 'payment',
      paymentMethod: 'mercado_pago',
      status: 'pendiente',
      payerEmail: 'ana@pluarg.local',
    }
    const onStartMembershipPayment = vi.fn(async () => ({ createdOrder }))
    renderPurchaseSection(membership({ status: 'pendiente_pago' }), { onStartMembershipPayment })

    fireEvent.click(await waitForMembershipPayButton())

    // Mismo diseño que el settle de inscripción a torneo: el Brick queda
    // embebido en la propia página, no en un diálogo aparte.
    await waitFor(() => {
      expect(screen.getByTestId('mp-payment-brick')).toBeTruthy()
    })
    // La cuenta de Mercado Pago se ofrece como una fila más de la misma lista,
    // no como un segundo formulario con su propio botón.
    expect(screen.queryByTestId('mp-wallet-brick')).toBeNull()
    expect(mpBrick.paymentProps.at(-1).customization.paymentMethods.mercadoPago).toEqual([
      'wallet_purchase',
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onStartMembershipPayment).toHaveBeenCalledTimes(1)

    // "Elegir otro medio" vuelve al selector sin cancelar la orden creada.
    fireEvent.click(screen.getByRole('button', { name: /elegir otro medio/i }))
    await waitFor(() => {
      expect(screen.queryByTestId('mp-payment-brick')).toBeNull()
    })
    expect(screen.getByRole('button', { name: /volver a mercado pago/i })).toBeTruthy()

    // Si vuelve a confirmar Mercado Pago, el hook decide si crea una orden
    // nueva o resume la pendiente — acá simplemente se vuelve a invocar. El
    // CTA sigue diciendo "Continuar el pago" porque la orden previa sigue
    // en memoria (`embeddedOrder`) mientras se elige de nuevo el método.
    fireEvent.click(screen.getByRole('button', { name: /continuar el pago/i }))
    await waitFor(() => {
      expect(onStartMembershipPayment).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByTestId('mp-payment-brick')).toBeTruthy()
    })
  })
})
