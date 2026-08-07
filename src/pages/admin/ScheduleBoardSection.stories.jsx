import ScheduleBoardSection from './ScheduleBoardSection.jsx'

/**
 * Tablero de armado de grilla. Las historias cubren los estados por los que
 * pasa la organización entre que cierran las inscripciones y queda armado el
 * orden de competencia.
 *
 * El service está mockeado por historia: el tablero real necesita sesión de
 * staff y un evento con inscriptos en Supabase.
 */

const adminEvents = [
  { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
  { slug: 'copa-invierno-2026', title: 'Copa Invierno 2026' },
]

function athlete(registrationId, fullName, overrides = {}) {
  return {
    registrationId,
    athleteId: `ath-${registrationId}`,
    fullName,
    gym: 'Iron House',
    division: 'Open',
    category: 'Raw',
    bodyweightKg: 72.5,
    status: 'confirmada',
    checkedIn: false,
    ...overrides,
  }
}

const POOL = [
  athlete('reg-1', 'Ana Torres', { bodyweightKg: 63, gym: 'Barra Fija' }),
  athlete('reg-2', 'Lucas Ferro', { category: 'Raw With Wraps', bodyweightKg: 83 }),
  athlete('reg-3', 'Camila Ruiz', { division: 'Junior', bodyweightKg: 57, gym: 'PLU Norte' }),
  athlete('reg-4', 'Martín Sosa', { division: 'Masters', bodyweightKg: 93 }),
  athlete('reg-5', 'Sofía Navarro', { bodyweightKg: 69, gym: 'Barra Fija' }),
]

const FULL_BOARD = {
  event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
  totals: { registered: 9, assigned: 4, unassigned: 5 },
  days: [
    {
      id: 'day-1',
      dayIndex: 0,
      label: 'Día 1',
      date: '2026-11-13',
      assignedCount: 3,
      sessions: [
        {
          id: 'ses-a',
          name: 'Tanda A',
          platform: 'Plataforma 1',
          weighInAt: '2026-11-13T11:30:00.000Z',
          startsAt: '2026-11-13T13:00:00.000Z',
          sortOrder: 0,
          athletes: [
            athlete('reg-10', 'Julieta Paz', { bodyweightKg: 52 }),
            athlete('reg-11', 'Rocío Medina', { bodyweightKg: 57, checkedIn: true }),
          ],
        },
        {
          id: 'ses-b',
          name: 'Tanda B',
          platform: 'Plataforma 1',
          weighInAt: '2026-11-13T14:00:00.000Z',
          startsAt: null,
          sortOrder: 1,
          athletes: [athlete('reg-12', 'Pedro Lienzo', { bodyweightKg: 83 })],
        },
      ],
      withoutSession: [],
    },
    {
      id: 'day-2',
      dayIndex: 1,
      label: 'Día 2',
      date: '2026-11-14',
      assignedCount: 1,
      sessions: [
        {
          id: 'ses-g',
          name: 'Tanda G',
          platform: 'Plataforma 2',
          weighInAt: '2026-11-14T11:30:00.000Z',
          startsAt: null,
          sortOrder: 0,
          athletes: [],
        },
      ],
      // Con día pero sin tanda: estado intermedio real del armado.
      withoutSession: [athlete('reg-13', 'Nicolás Aguirre', { bodyweightKg: 105 })],
    },
  ],
  unassigned: POOL,
}

/**
 * Stub de red por historia. Se intercepta `fetch` y no el service, así la
 * historia ejercita el camino real -- service, hook y mapeo -- en vez de un
 * doble que se puede desincronizar del contrato.
 */
function withBoard(board) {
  return (Story) => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url ?? '')

      if (url.includes('/board')) {
        return new Response(JSON.stringify({ board }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/schedule/autofill')) {
        return new Response(JSON.stringify({ placed: 5, remaining: 0, board }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/registrations/schedule')) {
        return new Response(JSON.stringify({ updated: 1, requested: 1, schedule: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return original ? original(input, init) : new Response('{}', { status: 200 })
    }

    return <Story />
  }
}

export default {
  title: 'Admin/ScheduleBoardSection',
  component: ScheduleBoardSection,
  parameters: { layout: 'padded' },
}

/** Armado en curso: cinco sin ubicar y dos días con tandas cargadas. */
export const EnArmado = {
  args: { adminEvents, canEdit: true },
  decorators: [withBoard(FULL_BOARD)],
}

/** Todo repartido: la bolsa de pendientes queda vacía. */
export const TodoRepartido = {
  args: { adminEvents, canEdit: true },
  decorators: [
    withBoard({
      ...FULL_BOARD,
      totals: { registered: 4, assigned: 4, unassigned: 0 },
      unassigned: [],
    }),
  ],
}

/** El evento todavía no tiene tandas: hay que cargarlas desde el editor. */
export const SinTandas = {
  args: { adminEvents, canEdit: true },
  decorators: [
    withBoard({
      ...FULL_BOARD,
      totals: { registered: 5, assigned: 0, unassigned: 5 },
      days: [
        {
          id: 'day-1',
          dayIndex: 0,
          label: 'Día 1',
          date: '2026-11-13',
          assignedCount: 0,
          sessions: [],
          withoutSession: [],
        },
      ],
    }),
  ],
}

/** Solo lectura: se ve el reparto pero no se puede mover a nadie. */
export const SoloLectura = {
  args: { adminEvents, canEdit: false },
  decorators: [withBoard(FULL_BOARD)],
}
