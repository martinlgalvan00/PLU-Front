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
      const url = String(typeof input === 'string' ? input : (input?.url ?? ''))

      if (url.includes('/board')) {
        return new Response(JSON.stringify({ board }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/grid-templates')) {
        return new Response(
          JSON.stringify({
            templates: [
              {
                id: 'tpl-meet',
                name: 'Pitbull · doble tablado',
                config: {
                  platforms: ['Tablado Rojo', 'Tablado Azul'],
                  maxPerSession: 12,
                  groupBy: ['sex', 'category'],
                  sortBy: 'weight',
                  mergeSmall: true,
                  platformMode: 'balance',
                  weightClasses: null,
                  schedule: { firstStart: '09:00', sessionMinutes: 45, gapMinutes: 10, weighInLeadMinutes: 120 },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
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
  args: { adminEvents, canEdit: true, onGoToEvents: () => undefined },
  decorators: [withBoard(FULL_BOARD)],
}

/** Todo repartido: la bolsa de pendientes queda vacía. */
export const TodoRepartido = {
  args: { adminEvents, canEdit: true, onGoToEvents: () => undefined },
  decorators: [
    withBoard({
      ...FULL_BOARD,
      totals: { registered: 4, assigned: 4, unassigned: 0 },
      unassigned: [],
    }),
  ],
}

/** El evento no tiene días: hay que cargarlos desde el editor. */
export const SinDias = {
  args: { adminEvents, canEdit: true, onGoToEvents: () => undefined },
  decorators: [
    withBoard({
      event: FULL_BOARD.event,
      totals: { registered: 5, assigned: 0, unassigned: 5 },
      days: [],
      unassigned: POOL,
    }),
  ],
}

/** El evento tiene días pero todavía no tiene tandas. */
export const SinTandas = {
  args: { adminEvents, canEdit: true, onGoToEvents: () => undefined },
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
  args: { adminEvents, canEdit: false, onGoToEvents: () => undefined },
  decorators: [withBoard(FULL_BOARD)],
}

/** Bolsa grande con sexo, edad y peso variados: lo que hay que filtrar y agrupar. */
function bigPool() {
  const names = ['Ana', 'Luz', 'Mica', 'Sofi', 'Vale', 'Pau', 'Lucas', 'Tomás', 'Nico', 'Facu']
  const surnames = ['Torres', 'Ruiz', 'Paz', 'Ferro', 'Sosa', 'Medina', 'Aguirre', 'Navarro']
  const divisions = ['Open', 'Junior', 'Youth', 'Sub-Masters', 'Masters']
  const ages = { Open: 27, Junior: 21, Youth: 17, 'Sub-Masters': 36, Masters: 47 }
  const weights = [52, 57, 63, 69, 76, 83, 93, 105]
  return Array.from({ length: 48 }, (_, index) => {
    const division = divisions[index % divisions.length]
    const female = index % 3 !== 0
    return athlete(`big-${index}`, `${names[index % names.length]} ${surnames[(index * 3) % surnames.length]}`, {
      division,
      category: index % 4 === 0 ? 'Raw With Wraps' : 'Raw',
      sex: female ? 'Femenino' : 'Masculino',
      age: ages[division] + (index % 5),
      bodyweightKg: weights[(index * 5) % weights.length],
      gym: ['Barra Fija', 'PLU Norte', 'Iron House', 'Savage'][index % 4],
    })
  })
}

const DOUBLE_BOARD = {
  ...FULL_BOARD,
  platforms: [
    { id: 'plat-1', name: 'Tablado 1', sortOrder: 0 },
    { id: 'plat-2', name: 'Tablado 2', sortOrder: 1 },
  ],
  totals: { registered: 52, assigned: 4, unassigned: 48 },
  days: FULL_BOARD.days.map((day) => ({
    ...day,
    sessions: day.sessions.map((session, index) => ({
      ...session,
      platformId: index % 2 === 0 ? 'plat-1' : 'plat-2',
      athletes: session.athletes.map((row) => ({ ...row, sex: 'Femenino', age: 24 })),
    })),
  })),
  unassigned: bigPool(),
}

/** Doble tablado: una columna por tablado, bolsa con filtros por sexo, edad y peso. */
export const DobleTablado = {
  args: { adminEvents, canEdit: true, onGoToEvents: () => undefined },
  decorators: [withBoard(DOUBLE_BOARD)],
}

/** Un meet real: 234 inscriptos sin ubicar, dos días con fecha y sin tandas todavía. */
function crowd(total) {
  let state = 11
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  const divisions = ['Open', 'Junior', 'Youth', 'Sub-Masters', 'Masters']
  const gyms = ['Barra Fija', 'PLU Norte', 'Iron House', 'Savage', 'Pitbull Barbell Club']
  return Array.from({ length: total }, (_, index) =>
    athlete(`crowd-${index}`, `Atleta ${String(index + 1).padStart(3, '0')}`, {
      sex: rand() < 0.55 ? 'Femenino' : 'Masculino',
      category: rand() < 0.7 ? 'Raw' : 'Raw With Wraps',
      division: divisions[Math.floor(rand() * divisions.length)],
      bodyweightKg: Math.round((47 + rand() * 75) * 2) / 2,
      age: 15 + Math.floor(rand() * 40),
      gym: gyms[index % gyms.length],
    }),
  )
}

const CROWD_BOARD = {
  event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026', published: true },
  platforms: [],
  schedulePublic: false,
  totals: { registered: 234, assigned: 0, unassigned: 234 },
  days: [
    { id: 'day-1', dayIndex: 0, label: 'Día 1', date: '2026-11-13', assignedCount: 0, sessions: [], withoutSession: [] },
    { id: 'day-2', dayIndex: 1, label: 'Día 2', date: '2026-11-14', assignedCount: 0, sessions: [], withoutSession: [] },
  ],
  unassigned: crowd(234),
}

/** 234 inscriptos, sin tablados ni tandas: el caso que el asistente tiene que resolver de una. */
export const Inscriptos234 = {
  args: { adminEvents, canEdit: true, onGoToEvents: () => undefined },
  decorators: [withBoard(CROWD_BOARD)],
}
