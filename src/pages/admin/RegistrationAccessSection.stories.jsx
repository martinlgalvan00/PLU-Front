import RegistrationAccessSection from './RegistrationAccessSection.jsx'
import {
  PAYMENT_CHANNELS,
  PAYMENT_CONCEPTS,
  PLATFORM_TOGGLE_KEYS,
} from '../../services/platformSettingsAdminService.js'

const emptyConfiguration = {
  membershipGate: null,
  eventGates: [],
}

const populatedConfiguration = {
  membershipGate: {
    id: 'gate-membership',
    scope: 'membership',
    label: 'Selección clubes — tanda 1',
    active: true,
    startsAt: '2026-08-01T10:00:00.000Z',
    endsAt: '2026-08-20T22:00:00.000Z',
  },
  eventGates: [
    {
      id: 'gate-event-1',
      scope: 'registration',
      eventSlug: 'pitbull-classic-2026',
      eventTitle: 'Pitbull Classic 2026',
      label: 'Staff y jueces',
      active: true,
      startsAt: '2026-08-10T10:00:00.000Z',
      endsAt: '2026-08-25T22:00:00.000Z',
    },
  ],
}

const adminEvents = [
  {
    id: 'event-1',
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic 2026',
    status: 'inscripcion_abierta',
  },
]

/** Matriz completa con un valor por defecto, más los overrides del caso. */
function channelMatrix(enabled = true, overrides = {}) {
  return Object.fromEntries(
    PAYMENT_CONCEPTS.map((concept) => [
      concept,
      {
        ...Object.fromEntries(PAYMENT_CHANNELS.map((channel) => [channel, enabled])),
        ...(overrides[concept] ?? {}),
      },
    ]),
  )
}

/**
 * Doble del endpoint del panel: entiende los dos setters —el de interruptor por
 * concepto y el de celda de la matriz— para que los switches del story sean
 * operables de verdad.
 */
function mockPlatformSettings(initialToggles) {
  const originalFetch = globalThis.fetch
  let toggles = { paymentChannels: channelMatrix(), environmentHolds: [], ...initialToggles }

  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    if (!url.includes('/api/platform-settings')) {
      return originalFetch(input, options)
    }

    if (String(options.method || 'GET').toUpperCase() === 'PUT') {
      const payload = JSON.parse(options.body)
      if (url.includes('/channels')) {
        toggles = {
          ...toggles,
          paymentChannels: {
            ...toggles.paymentChannels,
            [payload.concept]: {
              ...toggles.paymentChannels[payload.concept],
              [payload.channel]: payload.enabled,
            },
          },
        }
      } else {
        // `membership_manual` -> los dos canales manuales, igual que la RPC.
        const concept = payload.feature.replace(/_manual$/, '')
        if (concept !== payload.feature) {
          toggles = {
            ...toggles,
            paymentChannels: {
              ...toggles.paymentChannels,
              [concept]: {
                ...toggles.paymentChannels[concept],
                bank_transfer: payload.enabled,
                cash_pitbull: payload.enabled,
              },
            },
          }
        } else {
          const key = `${payload.feature.replace(/_(.)/g, (_m, char) => char.toUpperCase())}Enabled`
          toggles = { ...toggles, [key]: payload.enabled }
        }
      }
    }

    return new Response(JSON.stringify(toggles), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return () => {
    globalThis.fetch = originalFetch
  }
}

function mockPlatformSettingsFailure(status = 404, message = 'Ruta no encontrada') {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (input, options = {}) => {
    if (!String(input).includes('/api/platform-settings')) {
      return originalFetch(input, options)
    }

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return () => {
    globalThis.fetch = originalFetch
  }
}

const defaultToggles = Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, true]))

export default {
  title: 'Admin/Acceso y habilitación',
  component: RegistrationAccessSection,
  parameters: { layout: 'padded' },
}

export const Operativa = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => mockPlatformSettings(defaultToggles),
}

export const ConTandas = {
  args: {
    configuration: populatedConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => mockPlatformSettings(defaultToggles),
}

export const InterruptoresPausados = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () =>
    mockPlatformSettings({
      ...Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, false])),
      paymentChannels: channelMatrix(false),
    }),
}

/** Lo que antes no se podía configurar: la pasarela cerrada por concepto. */
export const MercadoPagoCerrado = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () =>
    mockPlatformSettings({
      ...defaultToggles,
      paymentChannels: channelMatrix(true, {
        membership: { mercado_pago: false, bank_transfer: true, cash_pitbull: true },
      }),
    }),
}

/** Concepto sin ningún medio abierto: configurable, pero se avisa. */
export const ConceptoSinMedios = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () =>
    mockPlatformSettings({
      ...defaultToggles,
      paymentChannels: channelMatrix(true, {
        registration: { mercado_pago: false, bank_transfer: false, cash_pitbull: false },
      }),
    }),
}

/** Una variable de entorno frena los cobros por encima del panel. */
export const FrenadoPorEntorno = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () =>
    mockPlatformSettings({
      ...defaultToggles,
      environmentHolds: [{ variable: 'PAID_CHECKOUT_ENABLED', scope: 'checkout' }],
    }),
}

export const SoloLectura = {
  args: {
    configuration: populatedConfiguration,
    adminEvents,
    canEdit: false,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => mockPlatformSettings(defaultToggles),
}

export const Cargando = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    isLoading: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => mockPlatformSettings(defaultToggles),
}

export const ErrorDeRuta = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    error: 'Ruta no encontrada',
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => mockPlatformSettingsFailure(404, 'Ruta no encontrada'),
}

export const EditorAbierto = {
  args: {
    configuration: populatedConfiguration,
    adminEvents,
    canEdit: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => mockPlatformSettings(defaultToggles),
  play: async ({ canvasElement }) => {
    const configure = Array.from(canvasElement.querySelectorAll('button')).find((item) =>
      /Configurar|Reabrir|Configure|Reopen/i.test(item.textContent || ''),
    )
    configure?.click()
  },
}

/** Doble de /api/payment-profiles para el panel de cuentas de cobro. */
function mockPaymentProfiles({ oauthAvailable = true } = {}) {
  const originalFetch = globalThis.fetch
  const now = Date.now()
  const day = 86_400_000
  const profiles = {
    mercado_pago: [
      {
        id: 'mp-1',
        name: 'PLU · Pitbull Classic',
        kind: 'mercado_pago',
        active: true,
        connectionStatus: 'connected',
        config: {
          connection: 'oauth',
          accountNickname: 'PLUARGENTINA',
          collectorId: '241983636',
          liveMode: true,
          expiresAt: new Date(now + 150 * day).toISOString(),
        },
        usage: {
          events: [
            { id: 'e1', title: 'Pitbull Classic 2026', finished: false },
            { id: 'e2', title: 'Copa Nacional de Press', finished: false },
          ],
          shop: true,
          pinnedOrders: 12,
        },
      },
      {
        id: 'mp-2',
        name: 'Club anfitrión Rosario',
        kind: 'mercado_pago',
        active: true,
        connectionStatus: 'expiring',
        config: {
          connection: 'oauth',
          accountEmail: 'tesoreria@clubrosario.test',
          collectorId: '55512345',
          liveMode: true,
          expiresAt: new Date(now + 9 * day).toISOString(),
        },
        usage: { events: [{ id: 'e3', title: 'Open Rosario', finished: false }], shop: false, pinnedOrders: 0 },
      },
      {
        id: 'mp-3',
        name: 'Cuenta de prueba',
        kind: 'mercado_pago',
        active: true,
        connectionStatus: 'needs_reconnect',
        config: { connection: 'oauth', accountNickname: 'TESTUSER77', liveMode: false, status: 'needs_reconnect' },
        usage: { events: [], shop: false, pinnedOrders: 0 },
      },
      {
        id: 'mp-4',
        name: 'Credenciales 2025',
        kind: 'mercado_pago',
        active: false,
        connectionStatus: 'manual',
        config: { publicKey: 'APP_USR-7f1c2a90-aaaa', collectorId: '' },
        usage: { events: [{ id: 'e0', title: 'Pitbull Classic 2025', finished: true }], shop: false, pinnedOrders: 40 },
      },
    ],
    bank_transfer: [
      {
        id: 'bk-1',
        name: 'Transferencia PLU',
        kind: 'bank_transfer',
        active: true,
        config: { alias: 'plu.argentina.mp', cbu: '0000003100012345678901', holder: 'Powerlifting United Argentina' },
        usage: { events: [{ id: 'e1', title: 'Pitbull Classic 2026', finished: false }], shop: false, pinnedOrders: 0 },
      },
    ],
  }

  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    if (!url.includes('/api/payment-profiles')) return originalFetch(input, options)
    const kind = new URL(url, 'http://local').searchParams.get('kind') ?? 'bank_transfer'
    return new Response(
      JSON.stringify({
        profiles: profiles[kind] ?? [],
        secretsKeyConfigured: true,
        mercadoPagoOAuth: oauthAvailable
          ? { available: true, missing: [] }
          : { available: false, missing: ['MERCADO_PAGO_CLIENT_ID', 'MERCADO_PAGO_CLIENT_SECRET'] },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return () => {
    globalThis.fetch = originalFetch
  }
}

/** Cuentas de cobro: vinculadas por OAuth, por vencer, a reconectar y archivadas. */
export const CuentasDeCobro = {
  args: {
    configuration: emptyConfiguration,
    adminEvents,
    canEdit: true,
    canReadPaymentAccounts: true,
    canEditPaymentAccounts: true,
    onRefresh: () => {},
    onSave: async () => ({}),
  },
  beforeEach: () => {
    const restoreProfiles = mockPaymentProfiles()
    const restoreSettings = mockPlatformSettings(defaultToggles)
    return () => {
      restoreSettings()
      restoreProfiles()
    }
  },
}

/** Sin la app de Mercado Pago configurada en el servidor. */
export const CuentasDeCobroSinOAuth = {
  args: { ...CuentasDeCobro.args },
  beforeEach: () => {
    const restoreProfiles = mockPaymentProfiles({ oauthAvailable: false })
    const restoreSettings = mockPlatformSettings(defaultToggles)
    return () => {
      restoreSettings()
      restoreProfiles()
    }
  },
}
