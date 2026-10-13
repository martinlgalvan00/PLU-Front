import { expect, userEvent, within } from 'storybook/test'
import EventsSection from './EventsSection.jsx'
// El layout del shell es parte de la superficie: sin él la lista no tiene su
// contenedor de scroll y la ficha se mide distinto que en el panel real.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'
import '../../styles/pages/admin-modals.css'

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
      // Cadena real del panel: AdminShell -> `.admin-shell__content`
      // (`overflow: auto`, el ÚNICO scroller del admin) -> `.admin-page`.
      // Sin `__content` la historia scrolleaba en un lugar que no existe en la
      // app, y los bugs de scroll y de sticky no aparecían acá.
      <div className="admin-shell" style={{ display: 'block', height: 'calc(100dvh - 4rem)' }}>
        <div
          className="admin-shell__content ant-layout-content"
          style={{ height: '100%' }}
        >
          <div className="admin-page admin-section-enter">
            <Story />
          </div>
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

/**
 * Publicar en lote: el aviso de eventos sin publicar lleva a la selección con
 * los ocultos ya elegidos, y un solo botón los publica.
 */
export const PublicarEnLote = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Revisar y publicar' }))
    await expect(await canvas.findByText('1 seleccionado')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Publicar 1' })).toBeEnabled()
  },
}

// Logo mínimo (96px) sobre fondo blanco, embebido: la story no depende de la red.
const LOGO_SOBRE_BLANCO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgBAMAAAAQtmoLAAAAMFBMVEUUIz/////ouSMkMEVkboE+SmGLk6BzZjJERTiagi3l5+q2limvtL3TqiXO0dffsiRfduyDAAAACXBIWXMAAAsTAAALEwEAmpwYAAAC6ElEQVRYhe2Xv2sTURzAv3A1ORMNfGmaIRwdvg5JCCVRulgUUpI6OEgKzaRIA1odJYO1uJQMikNB4lDBQYPi5FACIm4GwUEySF0cW+xfkM1N3nt3yd1775J7/tjyHZLj7vu578/33vcADQVmQASBKEp+mQF/nKV3txplq3Hla0TAqYIry/0owEnZ0wewrk0HTiAgN6YBb4L6AFcnAxlZH6zmJCBbVwA41Z0AfFb1AS6FAyOHrMfb2w9G2WqGApuu+s4hEdHSvovEwgDXgP2SXPm1q5oAxYDdIyp93N95MSQq7iomfIAj/OkQfeB69kOigvCqrwVe82d7VHruRftkSD/4xYoW4DWIEz0bZ/Qi0T1eCx0gQm6573Rlj3JS2BD0KE5FX7MCWD1hIqEBKsLA02CZk8LEnAos8sRQQW6MHvGUHStAmt2+TAcykKTv7G9VAY7Y7c5SIAIexSE3mlIAFoJNeVkfoM19mlMA9uqkHDKT09xNSwZ4X7RLikcA1jDv7w7wx9xRcjS+uyoB8+N3KUGUmN11CXjFy/y+VqvV6gD8B5ZrVXZ5nRc7IQGfeHj3eQnrlkjaOi4AdPEOT8UZCWCL5yw9El0VBO7SN98i8gCmcKEUQxx0MR0ENofnfIXwAOZzuxjDLCTQkYBe3rck/ECrwICUAnRyGqDsARtNzOgASwJYwls5Edm8BLT4kggHspUoQNl1CQeDKkRxqT4KWjxkwHlMs1gr2qDHaRXAl62t2ynMrt1ErGvT6hXOA1gDi1o5oC2c1xp+QKyBn7a2NbzmCwBzx4hvy3Ft84n2lvcMq9FgC1fX3gumCyhtukSd8E2AtJuA8TaDxhvZkelWmTbdjBfZbZuKMtArhWz33oFyEPVAwYlH1sq/OBTR9NhF72Cn8cFOEw92x3R0QNPhBI3HHzQdsNB4hEPTIRGNx1DMlM0GXTQepVEe1pXx/u8/BxCdNU9/o/9/PmkmC0x5PgNmWYoqxr30G5X9dgwY8+MiAAAAAElFTkSuQmCC'

/**
 * Ficha de un evento cuyo logo ya subido tiene un fondo liso: aparece «Quitar
 * fondo» junto a las otras acciones. Con un logo sin fondo que quitar, no.
 */
export const LogoConFondoBlanco = {
  args: {
    adminEvents: EVENTS.map((event, index) =>
      index === 0 ? { ...event, logoUrl: LOGO_SOBRE_BLANCO } : event,
    ),
    onSetEventLogo: async () => ({ events: EVENTS, backgroundRemoved: true }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByTitle(/Pitbull Classic 2026/))
    await expect(await canvas.findByRole('button', { name: 'Quitar fondo' })).toBeInTheDocument()
  },
}
