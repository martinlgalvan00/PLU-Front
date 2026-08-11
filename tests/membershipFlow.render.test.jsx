import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * membershipFlow.render.test.jsx — PLU ARG
 *
 * Render real (jsdom) de las dos pantallas donde el atleta se afilia y cobra
 * su credencial: la confirmación del alta (`RegisterPage`, flujo membership) y
 * la sección de afiliación de la cuenta.
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
vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: vi.fn(),
  Payment: () => <div data-testid="mp-payment-brick" />,
  CardPayment: () => <div data-testid="mp-card-brick" />,
}))

vi.mock('../src/services/athleteApi.js', () => ({
  resendAthleteVerification: vi.fn(),
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
  listMembershipPlans: vi.fn(async () => ({ plans: [] })),
  isMercadoPagoConfigured: () => true,
  processEmbeddedPayment: vi.fn(),
  processEmbeddedSubscription: vi.fn(),
  getPaymentOrderStatus: vi.fn(),
}))

const RegisterPage = (await import('../src/pages/RegisterPage.jsx')).default
const MembershipPurchaseSection = (
  await import('../src/pages/profile/MembershipPurchaseSection.jsx')
).default

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

function renderRegister({ memberships = [], registrations = [], flow = 'membership', order = PENDING_ORDER } = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={ATHLETE}
        createdOrder={{ ...order, type: flow }}
        event={{ slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026', price: 25000 }}
        flow={flow}
        form={{ paymentMethod: 'mercado_pago', division: 'Open', category: 'Raw' }}
        memberships={memberships}
        registrations={registrations}
        total={25000}
        onNavigate={() => {}}
        onSubmit={() => {}}
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

// Cada pantalla rotula su acción distinto: "Ver credencial" en el alta, "Ver
// mi card" en la cuenta. Lo que importa es si existe o no.
const registerCredentialAction = () => screen.queryByRole('button', { name: 'Ver credencial' })
const accountCredentialAction = () => screen.queryByRole('button', { name: 'Ver mi card' })

afterEach(cleanup)

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
    expect(screen.getByText('PLU-ARG-2026-014')).toBeTruthy()
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
  const cardActions = () => screen.queryAllByRole('button', { name: /generar mi card/i })

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
})

describe('sección de afiliación de la cuenta', () => {
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

  it('con la afiliación vigente muestra el código y esconde el checkout', () => {
    renderPurchaseSection(membership())

    expect(screen.getByText('PLU-ARG-2026-014')).toBeTruthy()
    expect(screen.queryByRole('group', { name: /método de pago/i })).toBeNull()
    expect(accountCredentialAction()).toBeTruthy()
  })

  it('explica una renovación programada sin ofrecer cobrar otra vez', () => {
    renderPurchaseSection(membership({
      startDate: `${new Date().getFullYear() + 1}-01-01`,
      expirationDate: `${new Date().getFullYear() + 2}-01-01`,
    }))

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
        <MembershipPurchaseSection athlete={ATHLETE} membership={membership({ status: 'reembolsada' })} />
      </I18nProvider>,
    )
    expect(screen.getByText('Pago reembolsado')).toBeTruthy()
  })

  it('bloquea el doble envío mientras crea la orden', async () => {
    let resolveOrder
    const onStartMembershipPayment = vi.fn(() => new Promise((resolve) => {
      resolveOrder = resolve
    }))
    renderPurchaseSection(membership({ status: 'pendiente_pago' }), { onStartMembershipPayment })

    const submit = screen.getByRole('button', { name: /continuar con mercado pago/i })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(onStartMembershipPayment).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /creando orden segura/i }).disabled).toBe(true)

    resolveOrder({ error: 'No se pudo crear la orden.' })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo crear la orden.'))
    expect(screen.getByRole('button', { name: /continuar con mercado pago/i }).disabled).toBe(false)
  })

  it('abre Mercado Pago en un modal y permite reabrirlo sin cancelar la orden', async () => {
    const onStartMembershipPayment = vi.fn(async () => ({
      createdOrder: {
        paymentId: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
        amount: 38000,
        preferenceId: 'pref-membership',
        paymentMode: 'payment',
        status: 'pendiente',
        payerEmail: 'ana@pluarg.local',
      },
    }))
    renderPurchaseSection(membership({ status: 'pendiente_pago' }), { onStartMembershipPayment })

    fireEvent.click(screen.getByRole('button', { name: /continuar con mercado pago/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /completá el pago/i })).toBeTruthy()
    })
    expect(screen.getByTestId('mp-payment-brick')).toBeTruthy()
    expect(screen.queryByText(/terminá el checkout de mercado pago debajo/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /cerrar checkout/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /completá el pago/i })).toBeNull()
    })

    const reopen = screen.getByRole('button', { name: /continuar el pago/i })
    expect(reopen.disabled).toBe(false)
    fireEvent.click(reopen)
    expect(screen.getByRole('dialog', { name: /completá el pago/i })).toBeTruthy()
    expect(onStartMembershipPayment).toHaveBeenCalledTimes(1)
  })
})
