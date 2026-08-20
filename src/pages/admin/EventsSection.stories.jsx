import EventsSection from './EventsSection.jsx'
// El layout del shell es parte de la superficie: sin él la lista no tiene su
// contenedor de scroll y la ficha se mide distinto que en el panel real.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'

const PITBULL = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  description: 'Fecha nacional de powerlifting.',
  date: '14 mar',
  dateISO: '2026-03-14',
  startsAt: '2026-03-14T12:00:00.000Z',
  endsAt: '2026-03-15T23:00:00.000Z',
  venue: 'Club Atlético Obras',
  location: 'CABA',
  status: 'inscripcion_abierta',
  published: true,
  featured: true,
  requiresMembership: true,
  slots: 60,
  registered: 42,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [
    { dayIndex: 0, label: 'Día 1', date: '2026-03-14' },
    { dayIndex: 1, label: 'Día 2', date: '2026-03-15' },
  ],
  ticketTypes: [
    { id: 'tt-1', name: 'General', price: 12000, active: true },
    { id: 'tt-2', name: 'Preferencial', price: 20000, active: true },
    { id: 'tt-3', name: 'Retirada', price: 9000, active: false },
  ],
}

const EVENTS = [
  PITBULL,
  {
    ...PITBULL,
    id: 'evt-2',
    slug: 'copa-norte-2026',
    title: 'Copa Norte',
    date: '21 mar',
    dateISO: '2026-03-21',
    venue: 'Complejo Belgrano',
    location: 'Salta',
    status: 'cupos_limitados',
    featured: false,
    // La excepción: este meet no pide afiliación y la fila lo marca.
    requiresMembership: false,
    slots: 40,
    registered: 36,
  },
  {
    ...PITBULL,
    id: 'evt-3',
    slug: 'regional-litoral-2026',
    title: 'Regional Litoral',
    date: '28 mar',
    dateISO: '2026-03-28',
    venue: 'Gimnasio Municipal',
    location: 'Rosario',
    status: 'proximamente',
    published: false,
    featured: false,
    slots: 40,
    registered: 0,
  },
]

export default {
  title: 'Admin/EventsSection',
  component: EventsSection,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="admin-shell">
        <div className="admin-page">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    adminEvents: EVENTS,
    canEdit: true,
    canManageUsers: true,
    canDeleteEvents: true,
    tickets: [],
    onRefresh: () => {},
    onSaveEvent: async () => ({ event: PITBULL, events: EVENTS }),
    onSetEventState: async () => ({ event: PITBULL, events: EVENTS }),
    onDeleteEvent: async () => ({ deletedEvent: { id: PITBULL.id }, events: EVENTS }),
    onFetchDeleteImpact: async () => ({ impact: {}, requiresForce: false }),
    onManageRegistrations: () => {},
    onManagePayments: () => {},
    onManageCheckin: () => {},
    onListSecurityUsers: async () => [],
    onListSecurityZones: async () => [],
    onCreateSecurityZone: async () => [],
    onUpdateSecurityZone: async () => [],
    onDeleteSecurityZone: async () => [],
    onPresetSecurityZones: async () => [],
    onAssignSecurityZone: async () => [],
  },
}

/** Consola del evento: estado, acceso y filas de sección. */
export const Default = {}

/** Sin permiso de escritura: se lee la operación, no se toca. */
export const SoloLectura = {
  args: { canEdit: false, canManageUsers: false, canDeleteEvents: false },
}

export const Cargando = {
  args: { adminEvents: [], isLoading: true },
}

export const SinEventos = {
  args: { adminEvents: [] },
}

export const ErrorDeCarga = {
  args: {
    adminEvents: [],
    loadError: 'No se pudo conectar con la base de eventos.',
  },
}
