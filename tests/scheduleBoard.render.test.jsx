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
  saveEventSessions: vi.fn(),
}))

const { assignRegistrationSchedule, autofillEventDay, fetchEventBoard } = await import(
  '../src/services/eventRegistrationApi.js'
)
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
