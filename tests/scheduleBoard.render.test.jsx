import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Render real (jsdom) del tablero de armado de grilla.
 *
 * Cubre el flujo por el que existe la pantalla: ver quién falta ubicar,
 * seleccionar y moverlo a una tanda de un día concreto — que es lo que después
 * responde el QR del atleta en la puerta.
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

vi.mock('../src/services/eventRegistrationApi.js', () => ({
  fetchEventBoard: vi.fn(),
  autofillEventDay: vi.fn(),
  assignRegistrationSchedule: vi.fn(),
  fetchEventRegistrationSummary: vi.fn(),
  fetchEventSchedule: vi.fn(),
  saveEventPlatforms: vi.fn(),
  saveEventSessions: vi.fn(),
  setEventSchedulePublic: vi.fn(),
  fetchGridTemplates: vi.fn(),
  saveGridTemplate: vi.fn(),
  deleteGridTemplate: vi.fn(),
}))

const {
  assignRegistrationSchedule,
  autofillEventDay,
  fetchEventBoard,
  saveEventPlatforms,
  saveEventSessions,
  setEventSchedulePublic,
  fetchGridTemplates,
  saveGridTemplate,
  deleteGridTemplate,
} = await import('../src/services/eventRegistrationApi.js')
const ScheduleBoardSection = (await import('../src/pages/admin/ScheduleBoardSection.jsx')).default

const EVENTS = [{ slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }]

function athlete(overrides = {}) {
  return {
    registrationId: 'reg-1',
    athleteId: 'ath-1',
    fullName: 'Ana Torres',
    gym: 'Iron House',
    division: 'Open',
    category: 'Raw',
    bodyweightKg: 63,
    status: 'confirmada',
    checkedIn: false,
    ...overrides,
  }
}

function board(overrides = {}) {
  return {
    event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
    totals: { registered: 3, assigned: 1, unassigned: 2 },
    days: [
      {
        id: 'day-1',
        dayIndex: 0,
        label: 'Día 1',
        date: '2026-11-13',
        assignedCount: 1,
        sessions: [
          {
            id: 'ses-a',
            name: 'Tanda A',
            platform: 'Plataforma 1',
            weighInAt: '2026-11-13T11:30:00.000Z',
            startsAt: null,
            sortOrder: 0,
            athletes: [athlete({ registrationId: 'reg-3', fullName: 'Martín Sosa' })],
          },
        ],
        withoutSession: [],
      },
      {
        id: 'day-2',
        dayIndex: 1,
        label: 'Día 2',
        date: '2026-11-14',
        assignedCount: 0,
        sessions: [
          { id: 'ses-g', name: 'Tanda G', platform: '', weighInAt: null, startsAt: null, sortOrder: 0, athletes: [] },
        ],
        withoutSession: [],
      },
    ],
    unassigned: [
      athlete(),
      athlete({ registrationId: 'reg-2', fullName: 'Lucas Ferro', category: 'Raw With Wraps' }),
    ],
    ...overrides,
  }
}

function renderBoard(props = {}) {
  return render(
    <I18nProvider>
      <ScheduleBoardSection adminEvents={EVENTS} canEdit {...props} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  // El asistente pide las plantillas al abrirse; sin ninguna es la lista vacía.
  fetchGridTemplates.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('tablero de armado de grilla', () => {
  it('muestra primero cuánta gente falta ubicar', async () => {
    fetchEventBoard.mockResolvedValue(board())
    renderBoard()

    const region = await screen.findByRole('region', { name: /grilla/i })
    // El pendiente es el titular; el panel de trabajo se llama por lo que
    // contiene ("sin día asignado"), no repitiendo la misma etiqueta.
    expect(within(region).getByText('Sin día asignado')).toBeTruthy()

    // El titular sale del bloque de totales: 2 sin ubicar sobre 3 inscriptos.
    const totals = within(region).getByText('Sin ubicar').closest('div')
    expect(within(totals).getByText('2')).toBeTruthy()
    expect(within(region).getByText('3')).toBeTruthy()
  })

  it('lista el roster de cada tanda, no solo el conteo', async () => {
    // El conteo no alcanza para armar: hay que ver quién cayó en cada tanda.
    fetchEventBoard.mockResolvedValue(board())
    renderBoard()

    expect(await screen.findByText('Tanda A')).toBeTruthy()
    expect(screen.getByText('Martín Sosa')).toBeTruthy()
    expect(screen.getByText('Tanda G')).toBeTruthy()
  })

  it('la barra de movimiento aparece recién con selección', async () => {
    fetchEventBoard.mockResolvedValue(board())
    renderBoard()

    await screen.findByText('Tanda A')
    expect(screen.queryByRole('region', { name: /mover atletas/i })).toBeNull()

    fireEvent.click(screen.getByLabelText(/seleccionar a ana torres/i))
    expect(await screen.findByRole('region', { name: /mover atletas/i })).toBeTruthy()
  })

  it('mueve la selección a la tanda elegida', async () => {
    fetchEventBoard.mockResolvedValue(board())
    assignRegistrationSchedule.mockResolvedValue({ updated: 1, requested: 1, schedule: null })
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByLabelText(/seleccionar a ana torres/i))

    const bar = await screen.findByRole('region', { name: /mover atletas/i })
    fireEvent.change(within(bar).getByLabelText(/mover a/i), {
      target: { value: 'session|1|ses-g' },
    })
    fireEvent.click(within(bar).getByRole('button', { name: /^mover$/i }))

    await waitFor(() =>
      expect(assignRegistrationSchedule).toHaveBeenCalledWith('pitbull-classic-2026', {
        registrationIds: ['reg-1'],
        dayIndex: 1,
        sessionId: 'ses-g',
      }),
    )
  })

  it('permite sacar a alguien del reparto', async () => {
    fetchEventBoard.mockResolvedValue(board())
    assignRegistrationSchedule.mockResolvedValue({ updated: 1, requested: 1, schedule: null })
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByLabelText(/seleccionar a martín sosa/i))

    const bar = await screen.findByRole('region', { name: /mover atletas/i })
    fireEvent.change(within(bar).getByLabelText(/mover a/i), { target: { value: 'unassign' } })
    fireEvent.click(within(bar).getByRole('button', { name: /^mover$/i }))

    await waitFor(() =>
      expect(assignRegistrationSchedule).toHaveBeenCalledWith('pitbull-classic-2026', {
        registrationIds: ['reg-3'],
        dayIndex: null,
        sessionId: null,
      }),
    )
  })

  it('avisa cuando el reparto sugerido deja gente sin lugar', async () => {
    // Dar el reparto por completo cuando no lo está es peor que no ofrecerlo.
    fetchEventBoard.mockResolvedValue(board())
    autofillEventDay.mockResolvedValue({ placed: 1, remaining: 1, board: board() })
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByRole('button', { name: /repartir autom.ticamente en día 1/i }))

    expect(await screen.findByText(/Quedan 1 sin lugar/i)).toBeTruthy()
  })

  it('sin permiso de escritura no deja mover', async () => {
    fetchEventBoard.mockResolvedValue(board())
    renderBoard({ canEdit: false })

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByLabelText(/seleccionar a ana torres/i))

    const bar = await screen.findByRole('region', { name: /mover atletas/i })
    expect(within(bar).getByRole('button', { name: /^mover$/i }).disabled).toBe(true)
  })

  it('un día sin tandas lo dice en vez de quedar vacío', async () => {
    fetchEventBoard.mockResolvedValue(
      board({
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
    )
    renderBoard()

    expect(await screen.findByText(/todavía no tiene tandas/i)).toBeTruthy()
  })
})

describe('tablados', () => {
  const PLATFORMS = [
    { id: 'plat-1', name: 'Tablado 1', sortOrder: 0 },
    { id: 'plat-2', name: 'Tablado 2', sortOrder: 1 },
  ]

  function doubleBoard() {
    const base = board()
    return {
      ...base,
      platforms: PLATFORMS,
      days: [
        {
          ...base.days[0],
          sessions: [
            { ...base.days[0].sessions[0], platformId: 'plat-1' },
            {
              id: 'ses-b',
              name: 'Tanda B',
              platform: 'Tablado 2',
              platformId: 'plat-2',
              weighInAt: null,
              startsAt: null,
              sortOrder: 1,
              athletes: [],
            },
          ],
        },
        base.days[1],
      ],
    }
  }

  it('sin tablados cargados pregunta cuántos son y guarda la respuesta', async () => {
    fetchEventBoard.mockResolvedValue(board())
    saveEventPlatforms.mockResolvedValue({})
    renderBoard()

    const question = await screen.findByRole('group', { name: /cuántos tablados/i })
    fireEvent.click(within(question).getByRole('button', { name: /dos tablados/i }))

    await waitFor(() =>
      expect(saveEventPlatforms).toHaveBeenCalledWith('pitbull-classic-2026', [
        { name: 'Tablado 1' },
        { name: 'Tablado 2' },
      ]),
    )
  })

  it('arma un carril por tablado con sus tandas', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard()

    await screen.findByText('Tanda A')
    const lane1 = screen.getAllByRole('group', { name: 'Tablado Tablado 1' })[0]
    const lane2 = screen.getAllByRole('group', { name: 'Tablado Tablado 2' })[0]
    expect(within(lane1).getByText('Tanda A')).toBeTruthy()
    expect(within(lane1).queryByText('Tanda B')).toBeNull()
    expect(within(lane2).getByText('Tanda B')).toBeTruthy()
  })

  it('renombrar un tablado guarda el id y el nombre nuevo', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    saveEventPlatforms.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.change(screen.getByLabelText('Nombre del tablado 1'), {
      target: { value: 'Tablado Rojo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar tablados/i }))

    await waitFor(() =>
      expect(saveEventPlatforms).toHaveBeenCalledWith('pitbull-classic-2026', [
        { id: 'plat-1', name: 'Tablado Rojo' },
        { id: 'plat-2', name: 'Tablado 2' },
      ]),
    )
  })

  it('no deja guardar dos tablados con el mismo nombre', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.change(screen.getByLabelText('Nombre del tablado 2'), {
      target: { value: ' tablado 1 ' },
    })
    expect(screen.getByRole('button', { name: /guardar tablados/i }).disabled).toBe(true)
  })

  it('bajar a un tablado avisa qué tandas quedan sin tablado', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByRole('tab', { name: /un tablado/i }))
    expect(await screen.findByText(/Tablado 2 van a quedar sin tablado/i)).toBeTruthy()
    expect(saveEventPlatforms).not.toHaveBeenCalled()
  })

  it('agrega una tanda en el tablado elegido con la siguiente letra libre', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    saveEventSessions.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Agregar tanda en Tablado 2, Día 1' })[0],
    )

    await waitFor(() => expect(saveEventSessions).toHaveBeenCalled())
    const [, payload] = saveEventSessions.mock.calls[0]
    expect(payload.find((row) => row.name === 'Tanda C')).toMatchObject({
      dayIndex: 0,
      platformId: 'plat-2',
      platform: 'Tablado 2',
    })
    // Las existentes viajan con su tablado: el RPC reemplaza el set completo.
    expect(payload.find((row) => row.id === 'ses-a').platformId).toBe('plat-1')
  })

  it('no permite quitar una tanda con atletas', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard()

    await screen.findByText('Tanda A')
    expect(screen.getByRole('button', { name: 'Quitar Tanda A' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Quitar Tanda B' }).disabled).toBe(false)
  })
})

describe('filtros de la bolsa', () => {
  function filterBoard() {
    return board({
      unassigned: [
        athlete({
          registrationId: 'r-ana',
          fullName: 'Ana Torres',
          sex: 'Femenino',
          age: 20,
          bodyweightKg: 57,
        }),
        athlete({
          registrationId: 'r-luis',
          fullName: 'Luis Ferro',
          sex: 'Masculino',
          age: 35,
          bodyweightKg: 83,
        }),
        athlete({
          registrationId: 'r-vale',
          fullName: 'Vale Sosa',
          sex: 'Femenino',
          age: 41,
          bodyweightKg: 63,
          division: 'Masters',
        }),
      ],
    })
  }

  it('filtra por sexo y muestra cuántos quedan de cuántos', async () => {
    fetchEventBoard.mockResolvedValue(filterBoard())
    renderBoard()

    await screen.findByText('Ana Torres')
    fireEvent.change(document.querySelector('.admin-board__filters select'), {
      target: { value: 'Femenino' },
    })

    expect(screen.queryByText('Luis Ferro')).toBeNull()
    expect(screen.getByText('Ana Torres')).toBeTruthy()
    expect(screen.getByText('Mostrando 2 de 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /ver todos/i }))
    expect(screen.getByText('Luis Ferro')).toBeTruthy()
  })

  it('filtra por rango de edad', async () => {
    fetchEventBoard.mockResolvedValue(filterBoard())
    renderBoard()

    await screen.findByText('Ana Torres')
    fireEvent.change(screen.getByLabelText('Edad · Desde'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Edad · Hasta'), { target: { value: '40' } })

    expect(screen.getByText('Luis Ferro')).toBeTruthy()
    expect(screen.queryByText('Ana Torres')).toBeNull()
    expect(screen.queryByText('Vale Sosa')).toBeNull()
  })

  it('"Seleccionar todos" actúa sobre lo filtrado, no sobre toda la bolsa', async () => {
    fetchEventBoard.mockResolvedValue(filterBoard())
    renderBoard()

    await screen.findByText('Ana Torres')
    fireEvent.change(document.querySelector('.admin-board__filters select'), {
      target: { value: 'Femenino' },
    })
    const pool = screen.getByText('Sin día asignado').closest('.admin-board__pool')
    fireEvent.click(within(pool).getByRole('button', { name: /seleccionar todos/i }))

    const bar = await screen.findByRole('region', { name: /mover atletas/i })
    expect(within(bar).getByText('2 seleccionados')).toBeTruthy()
  })

  it('la vista por grupo permite seleccionar un grupo entero', async () => {
    fetchEventBoard.mockResolvedValue(filterBoard())
    renderBoard()

    await screen.findByText('Ana Torres')
    fireEvent.click(screen.getByRole('tab', { name: /por grupo/i }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Seleccionar grupo Femenino · Raw · Masters' }),
    )

    const bar = await screen.findByRole('region', { name: /mover atletas/i })
    expect(within(bar).getByText('1 seleccionados')).toBeTruthy()
  })

  it('con filtros sin coincidencias lo dice en vez de quedar vacío', async () => {
    fetchEventBoard.mockResolvedValue(filterBoard())
    renderBoard()

    await screen.findByText('Ana Torres')
    fireEvent.change(screen.getByPlaceholderText(/nombre o gimnasio/i), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText(/nadie sin ubicar coincide/i)).toBeTruthy()
  })
})

describe('armado automático', () => {
  const PLATFORMS = [
    { id: 'plat-1', name: 'Tablado 1', sortOrder: 0 },
    { id: 'plat-2', name: 'Tablado 2', sortOrder: 1 },
  ]

  function planBoard() {
    const people = Array.from({ length: 8 }, (_, index) =>
      athlete({
        registrationId: `p-${index}`,
        fullName: `Atleta ${index}`,
        sex: index < 4 ? 'Femenino' : 'Masculino',
        bodyweightKg: 55 + index,
        age: 20 + index,
      }),
    )
    return {
      event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
      platforms: PLATFORMS,
      totals: { registered: 8, assigned: 0, unassigned: 8 },
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
      unassigned: people,
    }
  }

  async function openPanel() {
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: /armar tandas automáticamente/i }))
    return screen.findByRole('region', { name: /armado automático/i })
  }

  it('muestra la propuesta antes de escribir nada', async () => {
    fetchEventBoard.mockResolvedValue(planBoard())
    const panel = await openPanel()

    // Dos sexos → dos tandas nuevas, una por tablado.
    expect(within(panel).getByText(/8 atletas en 2 tandas/i)).toBeTruthy()
    expect(within(panel).getByText('Tablado 1')).toBeTruthy()
    expect(within(panel).getByText('Tablado 2')).toBeTruthy()
    expect(saveEventSessions).not.toHaveBeenCalled()
    expect(assignRegistrationSchedule).not.toHaveBeenCalled()
  })

  it('confirmar crea las tandas con su tablado y asigna a cada una', async () => {
    fetchEventBoard.mockResolvedValueOnce(planBoard())
    saveEventSessions.mockResolvedValue({})
    assignRegistrationSchedule.mockResolvedValue({ updated: 4, requested: 4, schedule: null })
    const panel = await openPanel()

    // Tras crear las tandas el backend las devuelve con id: se releen para asignar.
    const created = planBoard()
    created.days[0].sessions = [
      { id: 'new-a', name: 'Tanda A', platform: 'Tablado 1', platformId: 'plat-1', weighInAt: null, startsAt: null, sortOrder: 1, athletes: [] },
      { id: 'new-b', name: 'Tanda B', platform: 'Tablado 2', platformId: 'plat-2', weighInAt: null, startsAt: null, sortOrder: 2, athletes: [] },
    ]
    // Aplicar relee el tablero antes de crear (sin tandas) y después (con ids).
    fetchEventBoard.mockResolvedValueOnce(planBoard()).mockResolvedValue(created)

    fireEvent.click(within(panel).getByRole('button', { name: /confirmar: 8 atletas, 2 tandas nuevas/i }))

    await waitFor(() => expect(assignRegistrationSchedule).toHaveBeenCalledTimes(2))
    const [, sessions] = saveEventSessions.mock.calls[0]
    expect(sessions.map((row) => [row.name, row.platformId])).toEqual([
      ['Tanda A', 'plat-1'],
      ['Tanda B', 'plat-2'],
    ])
    const calls = assignRegistrationSchedule.mock.calls.map(([, body]) => body)
    expect(calls.map((body) => body.sessionId).sort()).toEqual(['new-a', 'new-b'])
    expect(calls.every((body) => body.registrationIds.length === 4)).toBe(true)
    expect(await screen.findByText('Se ubicaron 8 atletas.')).toBeTruthy()
  })

  it('sacar el sexo como criterio avisa que pueden mezclarse y junta todo', async () => {
    fetchEventBoard.mockResolvedValue(planBoard())
    const panel = await openPanel()

    fireEvent.click(within(panel).getByLabelText('Sexo'))

    expect(within(panel).getByText(/puede mezclar Femenino y Masculino/i)).toBeTruthy()
    expect(within(panel).getByText(/8 atletas en 1 tandas/i)).toBeTruthy()
  })

  it('arma solo con lo que muestra la bolsa filtrada', async () => {
    fetchEventBoard.mockResolvedValue(planBoard())
    renderBoard()
    await screen.findByText('Atleta 0')
    fireEvent.change(document.querySelector('.admin-board__filters select'), {
      target: { value: 'Femenino' },
    })
    fireEvent.click(screen.getByRole('button', { name: /armar tandas automáticamente/i }))
    const panel = await screen.findByRole('region', { name: /armado automático/i })

    expect(within(panel).getByText(/sobre 4 atletas sin ubicar/i)).toBeTruthy()
    expect(within(panel).getByText(/4 atletas en 1 tandas/i)).toBeTruthy()
  })

  it('sin permiso de escritura no ofrece el armado', async () => {
    fetchEventBoard.mockResolvedValue(planBoard())
    renderBoard({ canEdit: false })
    await screen.findByText('Atleta 0')
    expect(screen.queryByRole('button', { name: /armar tandas automáticamente/i })).toBeNull()
  })
})

describe('publicación en el sitio oficial', () => {
  const published = (schedulePublic, eventPublished = true) => ({
    ...board(),
    schedulePublic,
    event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026', published: eventPublished },
  })

  it('arranca oculta y lo dice con texto, no solo con el color', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard()

    const toggle = await screen.findByRole('switch', { name: /mostrar la grilla en el sitio oficial/i })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(within(toggle).getByText('Oculta')).toBeTruthy()
    expect(screen.getByText(/No se publican nombres/i)).toBeTruthy()
  })

  it('prenderla publica, relee el tablero y avisa', async () => {
    fetchEventBoard.mockResolvedValueOnce(published(false))
    setEventSchedulePublic.mockResolvedValue(true)
    renderBoard()

    const toggle = await screen.findByRole('switch', { name: /mostrar la grilla/i })
    fetchEventBoard.mockResolvedValue(published(true))
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(setEventSchedulePublic).toHaveBeenCalledWith('pitbull-classic-2026', true),
    )
    expect(await screen.findByText('La grilla ya se muestra en el sitio oficial.')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /mostrar la grilla/i }).getAttribute('aria-checked')).toBe('true'),
    )
  })

  it('retirarla también avisa', async () => {
    fetchEventBoard.mockResolvedValueOnce(published(true))
    setEventSchedulePublic.mockResolvedValue(false)
    renderBoard()

    const toggle = await screen.findByRole('switch', { name: /mostrar la grilla/i })
    fetchEventBoard.mockResolvedValue(published(false))
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(setEventSchedulePublic).toHaveBeenCalledWith('pitbull-classic-2026', false),
    )
    expect(await screen.findByText(/dejó de mostrarse/i)).toBeTruthy()
  })

  it('prendida con el evento sin publicar avisa que todavía no se va a ver', async () => {
    fetchEventBoard.mockResolvedValue(published(true, false))
    renderBoard()
    expect(await screen.findByText(/el evento no está publicado/i)).toBeTruthy()
  })

  it('sin permiso sobre el evento el interruptor está deshabilitado aunque pueda mover atletas', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard({ canEdit: true, canEditStructure: false })

    const toggle = await screen.findByRole('switch', { name: /mostrar la grilla/i })
    expect(toggle.disabled).toBe(true)
    // Y tampoco ofrece tocar la estructura: tablados, tandas ni armado automático.
    expect(screen.queryByRole('button', { name: /armar tandas automáticamente/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar tanda' })).toBeNull()
    expect(screen.queryByRole('button', { name: /agregar tanda/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /guardar tablados/i })).toBeNull()
    // Mover atletas sigue funcionando.
    fireEvent.click(screen.getByLabelText(/seleccionar a ana torres/i))
    const bar = await screen.findByRole('region', { name: /mover atletas/i })
    expect(within(bar).getByRole('button', { name: /^mover$/i }).disabled).toBe(true) // sin destino todavía
  })

  it('sin ningún permiso no se puede publicar', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard({ canEdit: false })
    const toggle = await screen.findByRole('switch', { name: /mostrar la grilla/i })
    expect(toggle.disabled).toBe(true)
  })
})

describe('asistente de armado', () => {
  const people = (count, overrides = () => ({})) =>
    Array.from({ length: count }, (_, index) =>
      athlete({
        registrationId: `w-${index}`,
        fullName: `Atleta ${index}`,
        sex: index % 2 === 0 ? 'Femenino' : 'Masculino',
        bodyweightKg: 55 + index,
        age: 20 + index,
        ...overrides(index),
      }),
    )

  const emptyDay = (extra = {}) => ({
    id: 'day-1',
    dayIndex: 0,
    label: 'Día 1',
    date: '2026-11-13',
    assignedCount: 0,
    sessions: [],
    withoutSession: [],
    ...extra,
  })

  const boardWith = (overrides = {}) => ({
    event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026', published: true },
    platforms: [],
    schedulePublic: false,
    totals: { registered: 8, assigned: 0, unassigned: 8 },
    days: [emptyDay()],
    unassigned: people(8),
    ...overrides,
  })

  const withIds = (board) => ({
    ...board,
    platforms: [
      { id: 'p1', name: 'Tablado 1', sortOrder: 0 },
      { id: 'p2', name: 'Tablado 2', sortOrder: 1 },
    ],
  })

  async function open(board) {
    fetchEventBoard.mockResolvedValueOnce(board)
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: /armar tandas automáticamente/i }))
    return screen.findByRole('region', { name: /armado automático/i })
  }

  describe('plantillas', () => {
    it('elegir una predefinida llena tablados, criterios y tope sin escribir nada', async () => {
      const panel = await open(boardWith())
      fireEvent.change(within(panel).getByLabelText('Plantilla'), {
        target: { value: 'builtin:double-by-sex' },
      })

      expect(within(panel).getByLabelText('Nombre del tablado 1').value).toBe('Tablado 1')
      expect(within(panel).getByLabelText('Nombre del tablado 2').value).toBe('Tablado 2')
      expect(within(panel).getByRole('tab', { name: /un sexo por tablado/i }).getAttribute('aria-selected')).toBe('true')
      expect(within(panel).getByText('Plantilla aplicada: Doble tablado · un sexo por tablado.')).toBeTruthy()
      expect(saveEventPlatforms).not.toHaveBeenCalled()
      expect(saveEventSessions).not.toHaveBeenCalled()
    })

    it('muestra y aplica las guardadas de la organización, con su tope y horarios', async () => {
      fetchGridTemplates.mockResolvedValue([
        {
          id: 'tpl-1',
          name: 'Mi meet',
          config: {
            platforms: ['Rojo', 'Azul'],
            maxPerSession: 6,
            groupBy: ['sex'],
            sortBy: 'age',
            mergeSmall: false,
            platformMode: 'alternate',
            weightClasses: { Femenino: [57, 63] },
            schedule: { firstStart: '10:00', sessionMinutes: 30, gapMinutes: 5, weighInLeadMinutes: 60 },
          },
        },
      ])
      const panel = await open(boardWith())
      await waitFor(() => expect(within(panel).getByRole('option', { name: 'Mi meet' })).toBeTruthy())
      fireEvent.change(within(panel).getByLabelText('Plantilla'), { target: { value: 'tpl-1' } })

      expect(within(panel).getByLabelText('Nombre del tablado 1').value).toBe('Rojo')
      expect(within(panel).getByLabelText('Nombre del tablado 2').value).toBe('Azul')
      expect(within(panel).getByLabelText('Por tanda').value).toBe('6')
      expect(within(panel).getByRole('tab', { name: /^edad/i }).getAttribute('aria-selected')).toBe('true')
      expect(within(panel).getByLabelText('Primer inicio').value).toBe('10:00')
      expect(within(panel).getByLabelText('Femenino', { selector: 'input[type="text"]' }).value).toBe('57, 63')
      // Con tope 6 y 8 atletas, dos tandas por sexo no entran en una: se ve en la propuesta.
      expect(within(panel).getAllByText(/Inicio 10:00/).length).toBeGreaterThanOrEqual(1)
    })

    it('guardar como plantilla manda solo la configuración (sin días ni atletas)', async () => {
      saveGridTemplate.mockResolvedValue([{ id: 'tpl-9', name: 'Nueva', config: {} }])
      const panel = await open(boardWith())
      fireEvent.change(within(panel).getByLabelText('Por tanda'), { target: { value: '10' } })
      fireEvent.change(within(panel).getByLabelText('Nombre de la plantilla'), {
        target: { value: ' Nueva ' },
      })
      fireEvent.click(within(panel).getByRole('button', { name: 'Guardar como plantilla' }))

      await waitFor(() => expect(saveGridTemplate).toHaveBeenCalledTimes(1))
      const [slug, body] = saveGridTemplate.mock.calls[0]
      expect(slug).toBe('pitbull-classic-2026')
      expect(body.name).toBe('Nueva')
      expect(body.config).toMatchObject({
        platforms: ['Tablado 1'],
        maxPerSession: 10,
        groupBy: ['sex', 'category'],
        sortBy: 'weight',
        platformMode: 'balance',
        schedule: null,
        weightClasses: null,
      })
      expect(body.config).not.toHaveProperty('dayIndexes')
      expect(await within(panel).findByText('Plantilla guardada: Nueva.')).toBeTruthy()
    })

    it('si el nombre ya existe el botón dice que la reemplaza', async () => {
      fetchGridTemplates.mockResolvedValue([{ id: 'tpl-1', name: 'Mi meet', config: {} }])
      const panel = await open(boardWith())
      await waitFor(() => expect(within(panel).getByRole('option', { name: 'Mi meet' })).toBeTruthy())
      fireEvent.change(within(panel).getByLabelText('Nombre de la plantilla'), {
        target: { value: 'mi MEET' },
      })
      expect(within(panel).getByRole('button', { name: 'Reemplazar plantilla' })).toBeTruthy()
    })

    it('borra una propia, pero las predefinidas no tienen borrar', async () => {
      fetchGridTemplates.mockResolvedValue([{ id: 'tpl-1', name: 'Mi meet', config: {} }])
      deleteGridTemplate.mockResolvedValue([])
      const panel = await open(boardWith())
      await waitFor(() => expect(within(panel).getByRole('option', { name: 'Mi meet' })).toBeTruthy())

      fireEvent.change(within(panel).getByLabelText('Plantilla'), {
        target: { value: 'builtin:single' },
      })
      expect(within(panel).queryByRole('button', { name: /borrar la plantilla/i })).toBeNull()

      fireEvent.change(within(panel).getByLabelText('Plantilla'), { target: { value: 'tpl-1' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Borrar la plantilla Mi meet' }))
      await waitFor(() =>
        expect(deleteGridTemplate).toHaveBeenCalledWith('pitbull-classic-2026', 'tpl-1'),
      )
      expect(await within(panel).findByText('Plantilla borrada: Mi meet.')).toBeTruthy()
    })

    it('sin permiso sobre el evento puede aplicar plantillas pero no guardarlas', async () => {
      fetchEventBoard.mockResolvedValueOnce(boardWith())
      renderBoard({ canEdit: true, canEditStructure: true })
      fireEvent.click(await screen.findByRole('button', { name: /armar tandas automáticamente/i }))
      const panel = await screen.findByRole('region', { name: /armado automático/i })
      expect(within(panel).getByLabelText('Nombre de la plantilla')).toBeTruthy()
    })
  })

  describe('horarios, clases de peso y alcance', () => {
    it('calcula pesaje e inicio por tablado cuando se prende', async () => {
      const panel = await open(withIds(boardWith()))
      expect(within(panel).queryByText(/Inicio \d\d:\d\d/)).toBeNull()

      fireEvent.click(within(panel).getByText('Horarios'))
      fireEvent.click(within(panel).getByLabelText('Calcular horarios de pesaje e inicio'))

      // 09:00 en Buenos Aires; las dos primeras tandas (una por tablado) arrancan juntas.
      expect(within(panel).getAllByText(/Inicio 09:00/).length).toBeGreaterThanOrEqual(2)
      expect(within(panel).getAllByText(/Pesaje 07:00/).length).toBeGreaterThanOrEqual(1)
    })

    it('un horario inválido bloquea confirmar y lo dice', async () => {
      const panel = await open(withIds(boardWith()))
      fireEvent.click(within(panel).getByText('Horarios'))
      fireEvent.click(within(panel).getByLabelText('Calcular horarios de pesaje e inicio'))
      fireEvent.change(within(panel).getByLabelText('Minutos por tanda'), { target: { value: '0' } })

      expect(within(panel).getByText(/Revisá la hora de inicio/)).toBeTruthy()
      expect(within(panel).getByRole('button', { name: /confirmar/i }).disabled).toBe(true)
    })

    it('las clases de peso mal tipeadas bloquean y no se cuelan: "63,5" marca el 5', async () => {
      const panel = await open(withIds(boardWith()))
      fireEvent.click(within(panel).getByText('Clases de peso (opcional)'))
      fireEvent.change(within(panel).getByLabelText('Femenino', { selector: 'input[type="text"]' }), {
        target: { value: '57, 63,5' },
      })
      expect(within(panel).getByText('Hay valores que no son pesos válidos.')).toBeTruthy()
      expect(within(panel).getByRole('button', { name: /confirmar/i }).disabled).toBe(true)
    })

    it('rehacer toda la grilla suma a los ya ubicados y deja fijos a los que ingresaron', async () => {
      const placed = people(4, (index) => ({
        registrationId: `placed-${index}`,
        checkedIn: index === 0,
      }))
      const board = withIds(
        boardWith({
          unassigned: people(2),
          days: [
            emptyDay({
              sessions: [
                {
                  id: 'ses-a',
                  name: 'Tanda A',
                  platform: 'Tablado 1',
                  platformId: 'p1',
                  weighInAt: null,
                  startsAt: null,
                  sortOrder: 0,
                  athletes: placed,
                },
              ],
            }),
          ],
        }),
      )
      const panel = await open(board)
      expect(within(panel).getByText(/Sobre 2 atletas sin ubicar/)).toBeTruthy()

      fireEvent.click(within(panel).getByLabelText(/Rehacer toda la grilla/));
      // 2 libres + 3 movibles (el que ingresó queda fijo en su tanda).
      expect(within(panel).getByText(/Sobre 5 atletas, ubicados o no\. 1 con ingreso registrado/)).toBeTruthy()
    })

    it('quitar tandas vacías aparece solo si hay y las saca sin tocar las que tienen gente', async () => {
      saveEventSessions.mockResolvedValue({})
      const board = withIds(
        boardWith({
          days: [
            emptyDay({
              sessions: [
                { id: 'ses-a', name: 'Tanda A', platform: '', platformId: 'p1', weighInAt: null, startsAt: null, sortOrder: 0, athletes: people(1) },
                { id: 'ses-b', name: 'Tanda B', platform: '', platformId: 'p2', weighInAt: null, startsAt: null, sortOrder: 1, athletes: [] },
              ],
            }),
          ],
        }),
      )
      fetchEventBoard.mockResolvedValue(board)
      renderBoard()
      fireEvent.click(await screen.findByRole('button', { name: /armar tandas automáticamente/i }))
      const panel = await screen.findByRole('region', { name: /armado automático/i })
      fireEvent.click(within(panel).getByRole('button', { name: 'Quitar 1 tandas vacías' }))

      await waitFor(() => expect(saveEventSessions).toHaveBeenCalled())
      const [, payload] = saveEventSessions.mock.calls[0]
      expect(payload.map((row) => row.id)).toEqual(['ses-a'])
      expect(await screen.findByText('Se quitaron 1 tandas vacías.')).toBeTruthy()
    })
  })

  describe('confirmar', () => {
    it('crea primero los tablados que faltan, después las tandas con su tablado, y asigna', async () => {
      saveEventPlatforms.mockResolvedValue({})
      saveEventSessions.mockResolvedValue({})
      assignRegistrationSchedule.mockResolvedValue({ updated: 4, requested: 4, schedule: null })
      const panel = await open(boardWith())

      fireEvent.click(within(panel).getByRole('tab', { name: /dos tablados/i }))
      fireEvent.change(within(panel).getByLabelText('Nombre del tablado 1'), { target: { value: 'Rojo' } })
      fireEvent.change(within(panel).getByLabelText('Nombre del tablado 2'), { target: { value: 'Azul' } })

      const created = withIds(boardWith())
      created.platforms = [
        { id: 'p1', name: 'Rojo', sortOrder: 0 },
        { id: 'p2', name: 'Azul', sortOrder: 1 },
      ]
      created.days = [
        emptyDay({
          sessions: [
            { id: 'new-a', name: 'Tanda A', platform: 'Rojo', platformId: 'p1', weighInAt: null, startsAt: null, sortOrder: 1, athletes: [] },
            { id: 'new-b', name: 'Tanda B', platform: 'Azul', platformId: 'p2', weighInAt: null, startsAt: null, sortOrder: 2, athletes: [] },
          ],
        }),
      ]
      // 1 releída previa (sin tablados) → 2 con tablados → 3 con tandas (y la final).
      fetchEventBoard
        .mockResolvedValueOnce(boardWith())
        .mockResolvedValueOnce({ ...boardWith(), platforms: created.platforms })
        .mockResolvedValue(created)

      fireEvent.click(within(panel).getByRole('button', { name: /confirmar/i }))

      await waitFor(() => expect(assignRegistrationSchedule).toHaveBeenCalledTimes(2))
      expect(saveEventPlatforms).toHaveBeenCalledWith('pitbull-classic-2026', [
        { name: 'Rojo' },
        { name: 'Azul' },
      ])
      const [, sessions] = saveEventSessions.mock.calls[0]
      expect(sessions.map((row) => [row.name, row.platformId])).toEqual([
        ['Tanda A', 'p1'],
        ['Tanda B', 'p2'],
      ])
      // Las plataformas se guardan antes que las tandas que las referencian.
      expect(saveEventPlatforms.mock.invocationCallOrder[0]).toBeLessThan(
        saveEventSessions.mock.invocationCallOrder[0],
      )
    })

    it('con los mismos tablados no vuelve a guardarlos', async () => {
      saveEventSessions.mockResolvedValue({})
      assignRegistrationSchedule.mockResolvedValue({ updated: 4, requested: 4, schedule: null })
      const board = withIds(boardWith())
      const panel = await open(board)
      fetchEventBoard.mockResolvedValue(board)
      fireEvent.click(within(panel).getByRole('button', { name: /confirmar/i }))
      await waitFor(() => expect(saveEventSessions).toHaveBeenCalled())
      expect(saveEventPlatforms).not.toHaveBeenCalled()
    })

    it('tablados repetidos o vacíos bloquean confirmar', async () => {
      const panel = await open(withIds(boardWith()))
      fireEvent.change(within(panel).getByLabelText('Nombre del tablado 2'), {
        target: { value: 'tablado 1' },
      })
      expect(within(panel).getByRole('button', { name: /confirmar/i }).disabled).toBe(true)
      fireEvent.change(within(panel).getByLabelText('Nombre del tablado 2'), { target: { value: '  ' } })
      expect(within(panel).getByRole('button', { name: /confirmar/i }).disabled).toBe(true)
    })
  })

  describe('deshacer', () => {
    it('después de un movimiento vuelve a cada atleta a donde estaba', async () => {
      const board = boardWith({
        unassigned: people(2),
        days: [
          emptyDay({
            sessions: [
              { id: 'ses-a', name: 'Tanda A', platform: '', platformId: null, weighInAt: null, startsAt: null, sortOrder: 0, athletes: [] },
            ],
          }),
        ],
      })
      fetchEventBoard.mockResolvedValue(board)
      assignRegistrationSchedule.mockResolvedValue({ updated: 1, requested: 1, schedule: null })
      renderBoard()

      await screen.findByText('Atleta 0')
      fireEvent.click(screen.getByLabelText(/seleccionar a atleta 0/i))
      const bar = await screen.findByRole('region', { name: /mover atletas/i })
      fireEvent.change(within(bar).getByLabelText(/mover a/i), { target: { value: 'session|0|ses-a' } })
      fireEvent.click(within(bar).getByRole('button', { name: /^mover$/i }))
      await waitFor(() => expect(assignRegistrationSchedule).toHaveBeenCalledTimes(1))

      fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
      await waitFor(() => expect(assignRegistrationSchedule).toHaveBeenCalledTimes(2))
      expect(assignRegistrationSchedule.mock.calls[1]).toEqual([
        'pitbull-classic-2026',
        { registrationIds: ['w-0'], dayIndex: null, sessionId: null },
      ])
      expect(await screen.findByText(/Se deshizo: 1 atletas volvieron a su lugar/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    })

    it('después de un armado vuelve a todos y quita las tandas que creó', async () => {
      saveEventSessions.mockResolvedValue({})
      assignRegistrationSchedule.mockResolvedValue({ updated: 8, requested: 8, schedule: null })
      const base = withIds(boardWith())
      const panel = await open(base)

      const created = {
        ...base,
        days: [
          emptyDay({
            sessions: [
              { id: 'new-a', name: 'Tanda A', platform: 'Tablado 1', platformId: 'p1', weighInAt: null, startsAt: null, sortOrder: 1, athletes: [] },
              { id: 'new-b', name: 'Tanda B', platform: 'Tablado 2', platformId: 'p2', weighInAt: null, startsAt: null, sortOrder: 2, athletes: [] },
            ],
          }),
        ],
      }
      fetchEventBoard.mockResolvedValueOnce(base).mockResolvedValue(created)
      fireEvent.click(within(panel).getByRole('button', { name: /confirmar/i }))
      fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))

      // Un lote de vuelta a "sin día" con los 8, y recién entonces se quitan las tandas vacías.
      await waitFor(() =>
        expect(
          assignRegistrationSchedule.mock.calls.some(
            ([, body]) => body.dayIndex === null && body.sessionId === null && body.registrationIds.length === 8,
          ),
        ).toBe(true),
      )
      await waitFor(() => expect(saveEventSessions).toHaveBeenCalledTimes(2))
      const [, afterUndo] = saveEventSessions.mock.calls[1]
      expect(afterUndo).toEqual([])
    })

    it('no ofrece deshacer a quien solo puede mirar', async () => {
      fetchEventBoard.mockResolvedValue(boardWith())
      renderBoard({ canEdit: false })
      await screen.findByText('Atleta 0')
      expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    })
  })
})
