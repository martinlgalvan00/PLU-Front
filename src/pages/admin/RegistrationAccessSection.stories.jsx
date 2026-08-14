import RegistrationAccessSection from './RegistrationAccessSection.jsx'

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

function mockPlatformSettings(initialToggles) {
  const originalFetch = globalThis.fetch
  let toggles = { ...initialToggles }

  globalThis.fetch = async (input, options = {}) => {
    if (!String(input).includes('/api/platform-settings')) {
      return originalFetch(input, options)
    }

    if (String(options.method || 'GET').toUpperCase() === 'PUT') {
      const payload = JSON.parse(options.body)
      toggles = {
        ...toggles,
        [`${payload.feature}Enabled`]: payload.enabled,
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

const defaultToggles = {
  checkoutEnabled: true,
  membershipEnabled: true,
  registrationEnabled: true,
}

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
      checkoutEnabled: false,
      membershipEnabled: false,
      registrationEnabled: false,
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
