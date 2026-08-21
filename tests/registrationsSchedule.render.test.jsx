import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Render real (jsdom) de la asignación de grilla en Inscripciones. Cierra la
 * clase de bug que este repo ya tuvo: código que parece correcto y explota al
 * montarse (prop faltante, import mal resuelto, clave de i18n inexistente).
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
  fetchEventRegistrationSummary: vi.fn(),
  fetchEventSchedule: vi.fn(),
  saveEventSessions: vi.fn(),
  assignRegistrationSchedule: vi.fn(),
}))

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      membershipValidationEnabled: true,
      registrationValidationEnabled: true,
      ticketValidationEnabled: true,
    })),
  }
})

const { assignRegistrationSchedule, fetchEventSchedule } = await import(
  '../src/services/eventRegistrationApi.js'
)

const RegistrationsSection = (await import('../src/pages/admin/RegistrationsSection.jsx')).default

const SCHEDULE = {
  eventSlug: 'pitbull-classic-2026',
  days: [
    { id: 'day-1', dayIndex: 0, label: 'Día 1', date: '2026-11-13', assignedCount: 3 },
    { id: 'day-2', dayIndex: 1, label: 'Día 2', date: '2026-11-14', assignedCount: 0 },
  ],
  sessions: [
    {
      id: 'ses-b',
      eventDayId: 'day-2',
      dayIndex: 1,
      name: 'Tanda B',
      platform: 'Plataforma 1',
      weighInAt: '2026-11-14T11:30:00.000Z',
      startsAt: null,
      sortOrder: 0,
      assignedCount: 0,
    },
  ],
  unassignedCount: 2,
}

function registration(overrides = {}) {
  return {
    id: 'reg-1',
    athleteId: 'ath-1',
    athlete: { fullName: 'Ana Torres', documentId: '30111222' },
    event: 'Pitbull Classic 2026',
    eventSlug: 'pitbull-classic-2026',
    category: 'Raw',
    division: 'Open',
    status: 'confirmada',
    schedule: null,
    ...overrides,
  }
}

function renderSection(props = {}) {
  const registrations = props.registrations ?? [registration()]
  return render(
    <I18nProvider>
      <RegistrationsSection
        canAssignSchedule
        canEdit
        filters={{ event: 'all', status: 'all', query: '' }}
        filteredRegistrations={registrations}
        payments={[]}
        registrations={registrations}
        registrationsCount={registrations.length}
        onApprovePayment={() => {}}
        onExportAdmin={() => {}}
        onExportPluUsa={() => {}}
        onSetFilters={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('filtros de evento en Inscripciones', () => {
  it('no muestra el filtro de evento cuando hay uno solo', () => {
    renderSection()
    expect(screen.queryByRole('combobox', { name: /evento/i })).toBeNull()
  })

  it('usa chips de evento cuando hay más de uno', () => {
    renderSection({
      registrations: [
        registration(),
        registration({
          id: 'reg-2',
          athleteId: 'ath-2',
          athlete: { fullName: 'Lucas Ferro', documentId: '31222333' },
          event: 'Copa Invierno 2026',
          eventSlug: 'copa-invierno-2026',
        }),
      ],
    })
    expect(screen.getByRole('group', { name: /^evento$/i })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /pitbull classic/i }).length).toBeGreaterThan(0)
  })
})

describe('asignación de grilla en Inscripciones', () => {
  it('muestra "sin asignar" mientras la organización no armó la grilla', () => {
    renderSection()
    expect(screen.getAllByText('Sin asignar').length).toBeGreaterThan(0)
  })

  it('muestra el día y la tanda una vez asignados', () => {
    renderSection({
      registrations: [
        registration({
          schedule: {
            dayId: 'day-2',
            dayIndex: 1,
            dayLabel: 'Día 2',
            dayDate: '2026-11-14',
            sessionId: 'ses-b',
            sessionName: 'Tanda B',
          },
        }),
      ],
    })
    // La tabla se pinta dos veces (tabla desktop + cards mobile).
    expect(screen.getAllByText('Día 2 · sáb 14 nov · Tanda B').length).toBeGreaterThan(0)
  })

  it('la barra de asignación aparece recién con filas seleccionadas', async () => {
    fetchEventSchedule.mockResolvedValue(SCHEDULE)
    renderSection()

    expect(screen.queryByRole('region', { name: /asignación de grilla/i })).toBeNull()

    fireEvent.click(screen.getAllByLabelText(/seleccionar la inscripción de ana torres/i)[0])

    const bar = await screen.findByRole('region', { name: /asignación de grilla/i })
    expect(within(bar).getByText('1 seleccionadas')).toBeTruthy()
  })

  it('manda el lote al día y la tanda elegidos', async () => {
    fetchEventSchedule.mockResolvedValue(SCHEDULE)
    assignRegistrationSchedule.mockResolvedValue({
      updated: 1,
      requested: 1,
      schedule: SCHEDULE,
    })
    const onScheduleAssigned = vi.fn()
    renderSection({ onScheduleAssigned })

    fireEvent.click(screen.getAllByLabelText(/seleccionar la inscripción de ana torres/i)[0])
    const bar = await screen.findByRole('region', { name: /asignación de grilla/i })

    // El select se habilita recién cuando llegó la grilla del evento.
    await waitFor(() => expect(within(bar).getByLabelText(/^día$/i).disabled).toBe(false))
    fireEvent.change(within(bar).getByLabelText(/^día$/i), { target: { value: '1' } })
    fireEvent.change(within(bar).getByLabelText(/^tanda$/i), { target: { value: 'ses-b' } })
    fireEvent.click(within(bar).getByRole('button', { name: /^asignar$/i }))

    await waitFor(() =>
      expect(assignRegistrationSchedule).toHaveBeenCalledWith('pitbull-classic-2026', {
        registrationIds: ['reg-1'],
        dayIndex: 1,
        sessionId: 'ses-b',
      }),
    )
    // El snapshot del panel es el que alimenta el QR: hay que releerlo.
    await waitFor(() => expect(onScheduleAssigned).toHaveBeenCalled())
  })

  it('bloquea la asignación cuando la selección cruza eventos', async () => {
    // La RPC trabaja sobre un evento por vez: asignar a medias sería peor que
    // no asignar.
    renderSection({
      registrations: [
        registration(),
        registration({
          id: 'reg-2',
          athleteId: 'ath-2',
          athlete: { fullName: 'Lucas Ferro', documentId: '31222333' },
          event: 'Copa Invierno 2026',
          eventSlug: 'copa-invierno-2026',
        }),
      ],
    })

    fireEvent.click(screen.getAllByLabelText(/seleccionar todas las inscripciones visibles/i)[0])

    const bar = await screen.findByRole('region', { name: /asignación de grilla/i })
    expect(within(bar).getByText(/mezcla eventos/i)).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: /^asignar$/i })).toBeNull()
    // Sin evento único no se pide la grilla a ningún lado.
    expect(fetchEventSchedule).not.toHaveBeenCalled()
  })
})

describe('acciones de fila en Inscripciones', () => {
  it('muestra acciones solo cuando hay permiso de validar o eliminar', () => {
    // `method` sólo admite 'mercado_pago' | 'manual_link' en la base: el
    // fixture usaba 'transferencia', que no existe como orden real.
    const payments = [
      {
        id: 'pay-1',
        athleteId: 'ath-1',
        event: 'Pitbull Classic 2026',
        amount: 85000,
        status: 'validacion_manual',
        method: 'manual_link',
        manualPaymentChannel: 'bank_transfer',
        paymentProofPath: 'pay-1/comprobante.jpg',
      },
    ]

    const { unmount } = renderSection({
      canEdit: true,
      canDelete: true,
      canValidatePayments: true,
      payments,
      registrations: [registration({ paymentOrderId: 'pay-1' })],
    })

    expect(screen.getAllByRole('button', { name: /^validar$/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /eliminar inscripción/i }).length).toBeGreaterThan(0)
    unmount()

    renderSection({
      canEdit: false,
      canDelete: false,
      payments,
      registrations: [registration({ paymentOrderId: 'pay-1' })],
    })

    expect(screen.queryByRole('button', { name: /^validar$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminar inscripción/i })).toBeNull()
  })
})
