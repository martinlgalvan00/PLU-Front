import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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
}))

const {
  assignRegistrationSchedule,
  autofillEventDay,
  fetchEventBoard,
  saveEventPlatforms,
  saveEventSessions,
  setEventSchedulePublic,
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
    fetchEventBoard.mockResolvedValue(created)

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
