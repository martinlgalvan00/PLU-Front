import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  // La densidad elegida se recuerda en el navegador: que no se filtre entre tests.
  window.localStorage.clear()
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

  it('muestra el máximo total declarado para armar la tanda', async () => {
    const data = board()
    data.unassigned[0] = athlete({
      isFirstMeet: false,
      competitionBestTotalKg: 500,
    })
    data.days[0].sessions[0].athletes[0] = athlete({
      registrationId: 'reg-3',
      fullName: 'Martín Sosa',
      isFirstMeet: true,
      trainingBestTotalKg: 410.5,
    })
    fetchEventBoard.mockResolvedValue(data)
    renderBoard()

    expect(await screen.findByText(/Total 500 kg/)).toBeTruthy()
    expect(screen.getByText(/Entrena 410\.5 kg/)).toBeTruthy()
    // Sin el dato (inscripción anterior) no se inventa un número.
    expect(screen.getByText('Lucas Ferro').closest('label').textContent).not.toMatch(/Total|Entrena/)
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

  it('sin permiso sobre la estructura el reparto solo llena las tandas que ya existen y avisa lo que no entró', async () => {
    // Dar el reparto por completo cuando no lo está es peor que no ofrecerlo.
    fetchEventBoard.mockResolvedValue(board())
    autofillEventDay.mockResolvedValue({ placed: 1, remaining: 1, board: board() })
    renderBoard({ canEditStructure: false })

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByRole('button', { name: /repartir autom.ticamente en día 1/i }))

    expect(await screen.findByText(/Quedan 1 sin lugar/i)).toBeTruthy()
  })

  it('repartir un día usa el motor: crea la tanda que falta y le pone horario según lo que ya hay', async () => {
    // El servicio siempre devuelve `platforms` (vacío si no hay tablados).
    const noPlatforms = () => ({ ...board(), platforms: [] })
    const created = noPlatforms()
    created.days[0].sessions.push({
      id: 'new-b',
      name: 'Tanda B',
      platform: '',
      platformId: null,
      weighInAt: null,
      startsAt: null,
      sortOrder: 1,
      athletes: [],
    })
    // Carga inicial, relectura al aplicar, y relecturas con la tanda ya creada.
    fetchEventBoard
      .mockResolvedValueOnce(noPlatforms())
      .mockResolvedValueOnce(noPlatforms())
      .mockResolvedValue(created)
    saveEventSessions.mockResolvedValue({})
    assignRegistrationSchedule.mockResolvedValue({ updated: 2, requested: 2, schedule: null })
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getByRole('button', { name: /repartir autom.ticamente en día 1/i }))

    // Las dos categorías chicas se juntan en una tanda nueva (la Tanda A es de otra categoría).
    await waitFor(() => expect(assignRegistrationSchedule).toHaveBeenCalledTimes(1))
    const calls = assignRegistrationSchedule.mock.calls.map(([, body]) => body)
    expect(calls[0]).toMatchObject({ dayIndex: 0, sessionId: 'new-b' })
    expect([...calls[0].registrationIds].sort()).toEqual(['reg-1', 'reg-2'])
    const [, payload] = saveEventSessions.mock.calls[0]
    const added = payload.find((row) => row.name === 'Tanda B')
    expect(added.dayIndex).toBe(0)
    // La Tanda A ocupa el arranque (09:00, 1 atleta x 4 min) y la pausa: la nueva sale 09:14.
    expect(added.startsAt).toBe('2026-11-13T12:14:00.000Z')
    expect(added.weighInAt).toBe('2026-11-13T10:14:00.000Z')
    expect(autofillEventDay).not.toHaveBeenCalled()
    expect(await screen.findByText('Se ubicaron 2 atletas.')).toBeTruthy()
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

  it('renombra el tablado desde la cabecera de su columna y guarda el set completo', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    saveEventPlatforms.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar Tablado 1' })[0])
    fireEvent.change(screen.getByLabelText('Nombre del tablado'), {
      target: { value: '  Tablado Rojo ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))

    await waitFor(() =>
      expect(saveEventPlatforms).toHaveBeenCalledWith('pitbull-classic-2026', [
        { id: 'plat-1', name: 'Tablado Rojo' },
        { id: 'plat-2', name: 'Tablado 2' },
      ]),
    )
  })

  it('Escape descarta el renombrado sin guardar', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar Tablado 1' })[0])
    const field = screen.getByLabelText('Nombre del tablado')
    fireEvent.change(field, { target: { value: 'Otro' } })
    fireEvent.keyDown(field, { key: 'Escape' })

    expect(screen.queryByLabelText('Nombre del tablado')).toBeNull()
    expect(saveEventPlatforms).not.toHaveBeenCalled()
  })

  it('el nombre repetido o vacío no se puede guardar desde la cabecera', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar Tablado 1' })[0])
    const field = screen.getByLabelText('Nombre del tablado')
    const save = screen.getByRole('button', { name: 'Guardar nombre' })

    fireEvent.change(field, { target: { value: ' tablado 2 ' } })
    expect(save.disabled).toBe(true)
    expect(screen.getByText('Ya hay un tablado con ese nombre.')).toBeTruthy()

    fireEvent.change(field, { target: { value: '   ' } })
    expect(save.disabled).toBe(true)
  })

  it('sin permiso sobre la estructura la cabecera no se puede renombrar', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    renderBoard({ canEdit: true, canEditStructure: false })

    await screen.findByText('Tanda A')
    expect(screen.queryByRole('button', { name: /^Renombrar/ })).toBeNull()
  })

  it('al renombrar muestra el progreso y, al terminar, confirma con "Nombre guardado"', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    let finish
    saveEventPlatforms.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar Tablado 1' })[0])
    fireEvent.change(screen.getByLabelText('Nombre del tablado'), {
      target: { value: 'Tablado Rojo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))

    // En vuelo: el botón dice que está guardando y no confirma todavía.
    const saving = await screen.findByRole('button', { name: 'Guardando nombre…' })
    expect(saving.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('Nombre guardado')).toBeNull()

    await act(async () => {
      finish({})
    })
    expect(await screen.findByText('Nombre guardado')).toBeTruthy()
    // Salió del modo edición: vuelve el título con su lápiz.
    expect(screen.queryByLabelText('Nombre del tablado')).toBeNull()
  })

  it('si el guardado falla no confirma y deja el campo para reintentar', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    saveEventPlatforms.mockRejectedValue(new Error('No se pudo guardar'))
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar Tablado 1' })[0])
    fireEvent.change(screen.getByLabelText('Nombre del tablado'), {
      target: { value: 'Tablado Rojo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Nombre guardado')).toBeNull()
    expect(screen.getByLabelText('Nombre del tablado').value).toBe('Tablado Rojo')
  })

  it('guardar los tablados desde la barra confirma con "Guardado"', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    saveEventPlatforms.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.change(screen.getByLabelText('Nombre del tablado 1'), {
      target: { value: 'Tablado Rojo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar tablados/i }))

    expect(await screen.findByText('Guardado')).toBeTruthy()
    // El botón de guardar se fue: ya no hay nada pendiente.
    expect(screen.queryByRole('button', { name: /guardar tablados/i })).toBeNull()
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
    const bar = screen.getByRole('form', { name: 'Tablados' })
    fireEvent.click(within(bar).getByRole('tab', { name: /^un tablado/i }))
    expect((await within(bar).findByRole('status')).textContent).toMatch(
      /Tablado 2 van a quedar sin tablado/i,
    )
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

  it('edita la hora de inicio y el tablado de una tanda desde el formulario', async () => {
    fetchEventBoard.mockResolvedValue(doubleBoard())
    saveEventSessions.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tanda' })[0])

    // El tablado se elige a la vista, no en un desplegable.
    expect(screen.getByRole('radio', { name: 'Tablado 1' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Tablado 2' }))
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '10:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tanda' }))

    await waitFor(() => expect(saveEventSessions).toHaveBeenCalled())
    const [, payload] = saveEventSessions.mock.calls[0]
    const edited = payload.find((row) => row.id === 'ses-a')
    expect(edited).toMatchObject({ platformId: 'plat-2', platform: 'Tablado 2' })
    // 10:30 en Buenos Aires; el pesaje que no se tocó viaja tal cual.
    expect(edited.startsAt).toBe('2026-11-13T13:30:00.000Z')
    expect(edited.weighInAt).toBe('2026-11-13T11:30:00.000Z')
  })

  it('mover el inicio arrastra el pesaje que nadie tocó y estima cuándo termina', async () => {
    const withTimes = doubleBoard()
    withTimes.days[0].sessions[0] = {
      ...withTimes.days[0].sessions[0],
      startsAt: '2026-11-13T12:00:00.000Z', // 09:00
      weighInAt: '2026-11-13T10:00:00.000Z', // 07:00
    }
    fetchEventBoard.mockResolvedValue(withTimes)
    saveEventSessions.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda A')
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tanda' })[0])
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '11:00' } })

    expect(screen.getByLabelText('Horario de pesaje').value).toBe('09:00')
    // 1 atleta x 4 min por atleta.
    expect(screen.getByText(/Estimado: ~4 min con 1 atletas · termina ~11:04/)).toBeTruthy()

    // Si lo edita a mano deja de seguir al inicio.
    fireEvent.change(screen.getByLabelText('Horario de pesaje'), { target: { value: '08:15' } })
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '11:30' } })
    expect(screen.getByLabelText('Horario de pesaje').value).toBe('08:15')
  })

  it('recalcular horarios reordena las horas de un tablado según sus atletas', async () => {
    const base = doubleBoard()
    base.days[0].sessions[0] = {
      ...base.days[0].sessions[0],
      startsAt: '2026-11-13T12:00:00.000Z', // 09:00
      weighInAt: '2026-11-13T10:00:00.000Z', // 07:00 (120 min antes)
    }
    base.days[0].sessions.push({
      id: 'ses-c',
      name: 'Tanda C',
      platform: 'Tablado 1',
      platformId: 'plat-1',
      weighInAt: null,
      startsAt: '2026-11-13T22:00:00.000Z', // una hora vieja que quedó mal
      sortOrder: 2,
      athletes: [athlete({ registrationId: 'reg-9', fullName: 'Paula Rey' })],
    })
    fetchEventBoard.mockResolvedValue(base)
    saveEventSessions.mockResolvedValue({})
    renderBoard()

    await screen.findByText('Tanda C')
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular horarios de Tablado 1 en Día 1' }))

    await waitFor(() => expect(saveEventSessions).toHaveBeenCalled())
    const [, payload] = saveEventSessions.mock.calls[0]
    const byId = Object.fromEntries(payload.map((row) => [row.id, row]))
    // Arranca donde ya arrancaba la primera (09:00); 1 atleta x 4 min + 10 de pausa -> 09:14.
    expect(byId['ses-a'].startsAt).toBe('2026-11-13T12:00:00.000Z')
    expect(byId['ses-c'].startsAt).toBe('2026-11-13T12:14:00.000Z')
    expect(byId['ses-c'].weighInAt).toBe('2026-11-13T10:14:00.000Z')
    // El otro tablado no se toca.
    expect(byId['ses-b'].startsAt).toBe('')
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

  it('"Ver como público" muestra la grilla sin publicar y sin nombres de atletas', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver como público' }))

    const dialog = await screen.findByRole('dialog', { name: 'Así se ve en el sitio' })
    expect(within(dialog).getByText(/Todavía no está publicada/)).toBeTruthy()
    expect(within(dialog).getByText('Tanda A')).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/Martín|Sosa|Iron House/)
    // Lo que conviene revisar sale de los mismos datos: Tanda A sin hora y de un
    // solo atleta, Tanda G sin atletas.
    expect(within(dialog).getByText('Para revisar antes de publicar')).toBeTruthy()
    expect(within(dialog).getByText(/Tandas sin hora de inicio: 1/)).toBeTruthy()
    expect(within(dialog).getByText(/Tandas sin atletas: 1/)).toBeTruthy()
    expect(within(dialog).getByText(/Tandas con menos de 3 atletas: 1/)).toBeTruthy()
    // No publicó nada por mirar.
    expect(setEventSchedulePublic).not.toHaveBeenCalled()
  })

  it('con la grilla publicada la vista previa lo dice, y Escape la cierra', async () => {
    fetchEventBoard.mockResolvedValue(published(true))
    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver como público' }))
    const dialog = await screen.findByRole('dialog', { name: 'Así se ve en el sitio' })
    expect(within(dialog).getByText(/La grilla está publicada/)).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('la vista previa es de solo lectura: también la ve quien no puede publicar', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard({ canEdit: false })
    const preview = await screen.findByRole('button', { name: 'Ver como público' })
    expect(preview.disabled).toBe(false)
  })

  it('al cerrar la vista previa espera la salida antes de desmontarla', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver como público' }))
    const dialog = await screen.findByRole('dialog', { name: 'Así se ve en el sitio' })
    const root = dialog.closest('.admin-board__preview')
    expect(root.getAttribute('data-state')).toBe('open')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar vista previa' }))
    // Sigue en pantalla mientras sale; la CSS hace la animación de salida.
    expect(root.getAttribute('data-state')).toBe('closing')
    expect(screen.queryByRole('dialog')).not.toBeNull()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('"Actualizar" vuelve a leer el tablero y dice a qué hora son los datos', async () => {
    fetchEventBoard.mockResolvedValue(published(false))
    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver como público' }))
    const dialog = await screen.findByRole('dialog', { name: 'Así se ve en el sitio' })
    expect(within(dialog).getByText(/Datos de las \d{2}:\d{2}/)).toBeTruthy()

    const before = fetchEventBoard.mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actualizar' }))

    await waitFor(() => expect(fetchEventBoard.mock.calls.length).toBe(before + 1))
    // Terminó: el botón vuelve a estar disponible para otro pedido.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Actualizar' }).disabled).toBe(false),
    )
  })

  it('mientras actualiza el botón lo dice y no deja pedir dos veces', async () => {
    fetchEventBoard.mockResolvedValueOnce(published(false))
    renderBoard()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver como público' }))
    const dialog = await screen.findByRole('dialog', { name: 'Así se ve en el sitio' })

    let finish
    fetchEventBoard.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actualizar' }))

    const busy = await within(dialog).findByRole('button', { name: 'Actualizando…' })
    expect(busy.disabled).toBe(true)
    expect(busy.getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      finish(published(false))
    })
    expect(await within(dialog).findByRole('button', { name: 'Actualizar' })).toBeTruthy()
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
        // Una sola categoría entre los inscriptos: separar por categoría no aporta.
        groupBy: ['sex'],
        sortBy: 'weight',
        platformMode: 'balance',
        // Los días tienen fecha: los horarios vienen sugeridos, con duración por atleta.
        schedule: {
          firstStart: '09:00',
          sessionMinutes: 45,
          minutesPerAthlete: 4,
          gapMinutes: 10,
          weighInLeadMinutes: 120,
        },
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
    it('con días con fecha los horarios vienen calculados y se pueden apagar', async () => {
      const panel = await open(withIds(boardWith()))

      // 09:00 en Buenos Aires; las dos primeras tandas (una por tablado) arrancan juntas.
      expect(within(panel).getAllByText(/Inicio 09:00/).length).toBeGreaterThanOrEqual(2)
      expect(within(panel).getAllByText(/Pesaje 07:00/).length).toBeGreaterThanOrEqual(1)

      fireEvent.click(within(panel).getByLabelText('Calcular horarios de pesaje e inicio'))
      expect(within(panel).queryByText(/Inicio \d\d:\d\d/)).toBeNull()
    })

    it('la duración se estima por atletas y se puede pasar a fija por tanda', async () => {
      const panel = await open(withIds(boardWith()))
      expect(within(panel).getByLabelText('Minutos por atleta').value).toBe('4')
      expect(within(panel).queryByLabelText('Minutos por tanda')).toBeNull()

      fireEvent.click(within(panel).getByRole('tab', { name: /^fija por tanda/i }))
      expect(within(panel).getByLabelText('Minutos por tanda').value).toBe('45')
      expect(within(panel).queryByLabelText('Minutos por atleta')).toBeNull()
    })

    it('un horario inválido bloquea confirmar y lo dice', async () => {
      const panel = await open(withIds(boardWith()))
      fireEvent.change(within(panel).getByLabelText('Minutos por atleta'), { target: { value: '0' } })

      expect(within(panel).getByText(/Revisá la hora de inicio/)).toBeTruthy()
      expect(within(panel).getByRole('button', { name: /confirmar/i }).disabled).toBe(true)

      fireEvent.click(within(panel).getByRole('tab', { name: /^fija por tanda/i }))
      fireEvent.change(within(panel).getByLabelText('Minutos por tanda'), { target: { value: '0' } })
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

describe('tandas compactas y completar desde la bolsa', () => {
  const person = (id, overrides = {}) =>
    athlete({
      registrationId: id,
      fullName: `Atleta ${id}`,
      sex: 'Femenino',
      category: 'Raw',
      bodyweightKg: 60,
      ...overrides,
    })

  const session = (index, athletes, overrides = {}) => ({
    id: `ses-${index}`,
    name: `Tanda ${String.fromCharCode(65 + index)}`,
    platform: '',
    platformId: null,
    weighInAt: null,
    startsAt: null,
    sortOrder: index,
    athletes,
    ...overrides,
  })

  const manySessions = (count) =>
    Array.from({ length: count }, (_, index) =>
      session(index, [person(`in-${index}`, { fullName: `Integrante ${index}` })]),
    )

  const boardOf = (sessions, unassigned = []) => ({
    event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026', published: true },
    platforms: [],
    schedulePublic: false,
    totals: { registered: sessions.length + unassigned.length, assigned: sessions.length, unassigned: unassigned.length },
    days: [
      {
        id: 'day-1',
        dayIndex: 0,
        label: 'Día 1',
        date: '2026-11-13',
        assignedCount: sessions.length,
        sessions,
        withoutSession: [],
      },
    ],
    unassigned,
  })

  describe('densidad', () => {
    it('con pocas tandas muestra el plantel a la vista', async () => {
      fetchEventBoard.mockResolvedValue(boardOf(manySessions(3)))
      renderBoard()
      expect(await screen.findByText('Integrante 0')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^ver atletas de/i })).toBeNull()
    })

    it('con más de seis tandas arranca compacta: cabeceras sí, plantel no', async () => {
      fetchEventBoard.mockResolvedValue(boardOf(manySessions(7)))
      renderBoard()
      expect(await screen.findByText('Tanda A')).toBeTruthy()
      expect(screen.getByText('Tanda G')).toBeTruthy()
      expect(screen.queryByText('Integrante 0')).toBeNull()
      expect(screen.getByRole('tab', { name: /compactas/i }).getAttribute('aria-selected')).toBe('true')
    })

    it('el chevron abre el plantel de una sola tanda', async () => {
      fetchEventBoard.mockResolvedValue(boardOf(manySessions(7)))
      renderBoard()
      await screen.findByText('Tanda A')

      const open = screen.getByRole('button', { name: 'Ver atletas de Tanda B' })
      expect(open.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(open)

      expect(screen.getByText('Integrante 1')).toBeTruthy()
      expect(screen.queryByText('Integrante 0')).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Ocultar atletas de Tanda B' }).getAttribute('aria-expanded'),
      ).toBe('true')
    })

    it('"Detalladas" muestra todos y la elección se recuerda para la próxima vez', async () => {
      fetchEventBoard.mockResolvedValue(boardOf(manySessions(7)))
      const first = renderBoard()
      await screen.findByText('Tanda A')
      fireEvent.click(screen.getByRole('tab', { name: /detalladas/i }))
      expect(screen.getByText('Integrante 0')).toBeTruthy()
      expect(screen.getByText('Integrante 6')).toBeTruthy()
      expect(window.localStorage.getItem('plu.board.density')).toBe('detail')

      first.unmount()
      renderBoard()
      expect(await screen.findByText('Integrante 0')).toBeTruthy()
    })

    it('una tanda compacta sigue siendo destino: el selector de mover la lista igual', async () => {
      fetchEventBoard.mockResolvedValue(boardOf(manySessions(7), [person('libre')]))
      renderBoard()
      await screen.findByText('Tanda A')
      fireEvent.click(screen.getByLabelText(/seleccionar a atleta libre/i))
      const bar = await screen.findByRole('region', { name: /mover atletas/i })
      expect(within(bar).getByRole('option', { name: /Tanda F/ })).toBeTruthy()
    })

    it('sin tandas no ofrece cambiar la densidad', async () => {
      fetchEventBoard.mockResolvedValue(boardOf([]))
      renderBoard()
      await screen.findByText(/todavía no tiene tandas/i)
      expect(screen.queryByRole('tab', { name: /compactas/i })).toBeNull()
    })

    it('la cabecera de cada tanda muestra cuánto cupo ocupa', async () => {
      fetchEventBoard.mockResolvedValue(boardOf(manySessions(7)))
      renderBoard()
      await screen.findByText('Tanda A')
      expect(screen.getAllByText('1/12').length).toBe(7)
    })
  })

  describe('completar con la bolsa', () => {
    const withRoom = () => [
      session(0, [person('a', { bodyweightKg: 60 }), person('b', { bodyweightKg: 64 })]),
    ]

    it('sugiere los compatibles más cercanos y los manda con un clic', async () => {
      const pool = [
        person('lejos', { bodyweightKg: 95 }),
        person('cerca', { bodyweightKg: 62 }),
        person('hombre', { sex: 'Masculino', bodyweightKg: 62 }),
      ]
      fetchEventBoard.mockResolvedValue(boardOf(withRoom(), pool))
      assignRegistrationSchedule.mockResolvedValue({ updated: 2, requested: 2, schedule: null })
      renderBoard()

      const button = await screen.findByRole('button', { name: /completar tanda a con 2 atletas/i })
      expect(button.textContent).toContain('+2')
      fireEvent.click(button)

      await waitFor(() =>
        expect(assignRegistrationSchedule).toHaveBeenCalledWith('pitbull-classic-2026', {
          registrationIds: ['cerca', 'lejos'],
          dayIndex: 0,
          sessionId: 'ses-0',
        }),
      )
      // Y queda a un clic de deshacerse.
      expect(await screen.findByRole('button', { name: 'Deshacer' })).toBeTruthy()
    })

    it('no aparece sin lugar, sin candidatos o sin permiso para mover', async () => {
      // Tanda llena.
      const full = [
        session(0, Array.from({ length: 12 }, (_, index) => person(`f${index}`))),
      ]
      fetchEventBoard.mockResolvedValue(boardOf(full, [person('x')]))
      const first = renderBoard()
      await screen.findByText('Tanda A')
      expect(screen.queryByRole('button', { name: /^completar tanda/i })).toBeNull()
      first.unmount()

      // Sin candidatos compatibles.
      fetchEventBoard.mockResolvedValue(boardOf(withRoom(), [person('h', { sex: 'Masculino' })]))
      const second = renderBoard()
      await screen.findByText('Tanda A')
      expect(screen.queryByRole('button', { name: /^completar tanda/i })).toBeNull()
      second.unmount()

      // Sin permiso de movimiento.
      fetchEventBoard.mockResolvedValue(boardOf(withRoom(), [person('m')]))
      renderBoard({ canEdit: false })
      await screen.findByText('Tanda A')
      expect(screen.queryByRole('button', { name: /^completar tanda/i })).toBeNull()
    })

    it('una tanda vacía se completa con el primer grupo de la bolsa', async () => {
      const pool = [
        person('m1', { sex: 'Masculino', bodyweightKg: 70 }),
        person('f-pesada', { bodyweightKg: 80 }),
        person('f-liviana', { bodyweightKg: 50 }),
      ]
      fetchEventBoard.mockResolvedValue(boardOf([session(0, [])], pool))
      assignRegistrationSchedule.mockResolvedValue({ updated: 2, requested: 2, schedule: null })
      renderBoard()
      fireEvent.click(await screen.findByRole('button', { name: /completar tanda a con 2 atletas/i }))
      await waitFor(() =>
        expect(assignRegistrationSchedule).toHaveBeenCalledWith('pitbull-classic-2026', {
          registrationIds: ['f-liviana', 'f-pesada'],
          dayIndex: 0,
          sessionId: 'ses-0',
        }),
      )
    })
  })

  describe('grupos de la bolsa', () => {
    it('la cabecera de cada grupo se puede arrastrar y lo dice', async () => {
      fetchEventBoard.mockResolvedValue(
        boardOf([session(0, [])], [person('a'), person('b', { sex: 'Masculino' })]),
      )
      renderBoard()
      await screen.findByText('Atleta a')
      fireEvent.click(screen.getByRole('tab', { name: /por grupo/i }))
      const head = screen.getByRole('heading', { name: 'Femenino · Raw · Open' }).parentElement
      expect(head.className).toContain('admin-board__group-head--draggable')
      expect(head.getAttribute('title')).toBe('Arrastrá el grupo Femenino · Raw · Open a una tanda')
    })

    it('sin permiso de movimiento la cabecera no es arrastrable', async () => {
      fetchEventBoard.mockResolvedValue(boardOf([session(0, [])], [person('a')]))
      renderBoard({ canEdit: false })
      await screen.findByText('Atleta a')
      fireEvent.click(screen.getByRole('tab', { name: /por grupo/i }))
      const head = screen.getByRole('heading', { name: 'Femenino · Raw · Open' }).parentElement
      expect(head.className).not.toContain('--draggable')
    })
  })
})
