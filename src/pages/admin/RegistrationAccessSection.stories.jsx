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
      /Configurar|Configure/i.test(item.textContent || ''),
    )
    configure?.click()
  },
}
