/**
 * API simulada para los flujos de `playwright.flows.config.js`.
 *
 * Cada test arma su escenario (catálogo, sesión, interruptores) y la página
 * habla con estas respuestas. Lo que no está simulado responde 404 y queda
 * anotado en `unhandled`, para que un endpoint nuevo no pase en silencio.
 */

import {
  manualPaymentChannel,
  storagePaymentMethod,
} from '../../server/modules/pricing/checkoutPricePolicy.js'

export const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
export const SUBMISSION_SLUG = 'barbell-submission-2027'
export const OPEN_SLUG = 'winter-open-2026'

/**
 * Fila del catálogo como la entrega `GET /api/events/catalog`. Por defecto:
 * Barbell Submission con la landing oculta y la venta abierta, que es lo que
 * el catálogo del servidor deja viajar (`registrationOnlyCatalogEvent`).
 */
export function submissionEvent(overrides = {}) {
  const { rules = {}, ...rest } = overrides
  return {
    id: 'evt-barbell-submission',
    slug: SUBMISSION_SLUG,
    title: 'Barbell Submission',
    description: '',
    venue: 'Virtus Fitness',
    location: 'Berazategui, Buenos Aires',
    starts_at: '2027-03-06T12:00:00Z',
    ends_at: '2027-03-06T22:00:00Z',
    registration_opens_at: null,
    registration_closes_at: null,
    status: 'inscripcion_abierta',
    published: true,
    requires_membership: false,
    capacity: 120,
    price: 75000,
    manual_price: null,
    currency: 'ARS',
    payment_channel_overrides: {},
    registration_count: 0,
    ...rest,
    rules: {
      salesIntent: 'charge',
      offering: {
        categories: ['Raw', 'Raw With Wraps'],
        divisions: ['Open', 'Junior', 'Sub-Masters', 'Masters'],
        modalities: ['full_power', 'push_pull', 'squat', 'bench', 'deadlift'],
      },
      landing: { templateId: 'submission', themeId: 'ember', publicVisible: false },
      ...rules,
    },
  }
}

/** El stub que entrega el catálogo con la landing oculta y la venta cerrada. */
export function hiddenStub(overrides = {}) {
  return {
    id: 'evt-barbell-submission',
    slug: SUBMISSION_SLUG,
    title: 'Barbell Submission',
    published: true,
    status: 'proximamente',
    rules: { landing: { templateId: 'submission', themeId: 'ember', publicVisible: false } },
    ...overrides,
  }
}

/** Otro evento del calendario, visible y a la venta (para el destacado). */
export function openEvent(overrides = {}) {
  return {
    ...submissionEvent(),
    id: 'evt-winter-open',
    slug: OPEN_SLUG,
    title: 'Winter Open',
    venue: 'Club Atlético',
    location: 'CABA',
    starts_at: '2026-12-12T12:00:00Z',
    ends_at: '2026-12-12T22:00:00Z',
    price: 60000,
    rules: {
      salesIntent: 'charge',
      featured: true,
      landing: { templateId: 'meet', themeId: 'plu-default', publicVisible: true },
    },
    ...overrides,
  }
}

/** Atleta con la ficha completa y el correo confirmado. */
export function athleteRow(overrides = {}) {
  return {
    id: ATHLETE_ID,
    full_name: 'Lucía Prueba',
    document_id: '30111222',
    email: 'lucia.prueba@example.com',
    birth_date: '1995-05-10',
    phone: '+54 11 5555-5555',
    country: 'Argentina',
    province: 'Buenos Aires',
    city: 'Quilmes',
    gym: 'Team E2E',
    sex: 'Femenino',
    division: 'Open',
    category: 'Raw',
    estimated_weight: 62,
    status: 'active',
    email_verified_at: '2026-01-01T00:00:00Z',
    emergency_contact_name: 'Contacto',
    emergency_contact_phone: '+54 11 4444-4444',
    ...overrides,
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{
 *   events?: object[],
 *   athlete?: object|null,
 *   platform?: object,
 *   registrationResponse?: { status: number, body: object },
 * }} scenario
 */
export async function mockApi(page, scenario = {}) {
  const state = {
    events: scenario.events ?? [submissionEvent(), openEvent()],
    athlete: scenario.athlete ?? null,
    platform: {
      membershipEnabled: true,
      registrationEnabled: true,
      ticketEnabled: true,
      ...scenario.platform,
    },
    registrationRequests: [],
    // Lo que el servidor ya guardó: la sesión lo devuelve y el pago lo aprueba.
    registrations: [],
    paymentOrders: [],
    unhandled: [],
  }

  const sessionRegistrations = () =>
    state.registrations.map((registration) => {
      const event = state.events.find((item) => item.slug === registration.event_slug) ?? {}
      return {
        registration,
        event: {
          slug: event.slug,
          title: event.title,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
        },
      }
    })

  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const method = request.method()

    if (method === 'GET' && pathname === '/api/events/catalog') {
      return json(route, { events: state.events })
    }
    if (method === 'GET' && pathname === '/api/platform-settings/public') {
      return json(route, state.platform)
    }
    if (method === 'GET' && pathname === '/api/platform-settings/teaser') {
      return json(route, { enabled: false })
    }
    if (method === 'GET' && pathname === '/api/auth/me') {
      return json(route, { error: 'No autenticado.' }, 401)
    }
    if (method === 'GET' && pathname === '/api/athletes/session') {
      if (!state.athlete) return json(route, { user: null })
      return json(route, {
        user: {
          role: 'athlete_plu',
          athleteId: state.athlete.id,
          name: state.athlete.full_name,
          email: state.athlete.email,
        },
        athlete: state.athlete,
        memberships: [],
        registrations: sessionRegistrations(),
        paymentOrders: state.paymentOrders,
      })
    }
    if (method === 'GET' && /^\/api\/events\/[^/]+\/registration-summary$/.test(pathname)) {
      return json(route, { registered: 0 })
    }
    if (method === 'POST' && pathname === '/api/athletes/me/registrations') {
      const body = request.postDataJSON()
      state.registrationRequests.push(body)
      // Rechazo del servidor (cupo lleno, solo anuncio…) para probar el mensaje.
      if (scenario.registrationResponse) {
        return json(route, scenario.registrationResponse.body, scenario.registrationResponse.status)
      }
      const createdAt = new Date().toISOString()
      state.paymentOrders = [
        {
          id: 'order-e2e-1',
          athlete_id: ATHLETE_ID,
          concept: 'registration',
          amount: 75000,
          currency: 'ARS',
          // Igual que el servidor: efectivo y Wise se guardan como manual_link
          // con su canal; sin esto el settle de efectivo se veía como transferencia.
          method: storagePaymentMethod(body.paymentMethod),
          manual_payment_channel: manualPaymentChannel(body.paymentMethod),
          status: 'pendiente',
          reference: 'PLU-E2E-0001',
          created_at: createdAt,
        },
      ]
      state.registrations = [
        {
          id: 'reg-e2e-1',
          athlete_id: ATHLETE_ID,
          event_slug: body.eventSlug,
          division: body.division,
          secondary_division: body.secondaryDivision ?? null,
          category: body.category,
          modalities: body.modalities,
          declared_weight_class: body.declaredWeightClass,
          bodyweight_kg: body.bodyweightKg,
          status: 'pendiente_pago',
          payment_order_id: 'order-e2e-1',
          created_at: createdAt,
        },
      ]
      return json(
        route,
        {
          order: state.paymentOrders[0],
          registration: {
            id: 'reg-e2e-1',
            athleteId: ATHLETE_ID,
            eventSlug: body.eventSlug,
            division: body.division,
            category: body.category,
            modalities: body.modalities,
            declaredWeightClass: body.declaredWeightClass,
            status: 'pendiente_pago',
          },
          mercadoPagoPublicKey: null,
        },
        201,
      )
    }
    // Pago con el brick simulado (PAYMENTS_MOCK): aprueba la orden y confirma
    // la inscripción, como el webhook real.
    if (method === 'POST' && pathname === '/api/payments/embedded/process') {
      const order = state.paymentOrders[0]
      if (!order) return json(route, { error: 'Orden inexistente.' }, 404)
      order.status = 'aprobado'
      for (const registration of state.registrations) registration.status = 'confirmada'
      return json(route, { payment: { id: 'mp-e2e-1', status: 'approved' }, order }, 201)
    }
    if (method === 'GET' && pathname === '/api/athletes/gyms') {
      return json(route, { gyms: [] })
    }
    if (method === 'GET' && pathname === '/api/athletes/me/registration-access-requirements') {
      return json(route, { membership: false, registration: false })
    }
    if (method === 'POST' && pathname === '/api/athletes/me/discount-preview') {
      // Sin código cargado no hay descuento que cotizar.
      return json(route, { error: 'Código inexistente.', code: 'DISCOUNT_NOT_FOUND' }, 404)
    }
    if (method === 'POST' && pathname.startsWith('/api/analytics')) {
      return json(route, { ok: true })
    }

    state.unhandled.push(`${method} ${pathname}`)
    return json(route, { error: 'No simulado en el E2E de flujos.' }, 404)
  })

  return state
}

export async function acceptCookies(page) {
  const accept = page.getByRole('button', { name: /^Aceptar todo$/i })
  await accept
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => accept.click())
    .catch(() => {})
}
