import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  description: 'Fecha nacional de powerlifting.',
  date: '15 ago',
  dateISO: '2026-08-15',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  featured: false,
  slots: 80,
  registered: 48,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
}

function impact({ requiresForce = false } = {}) {
  return {
    id: EVENT.id,
    slug: EVENT.slug,
    title: EVENT.title,
    impact: {
      registrations: 48,
      paidRegistrations: requiresForce ? 41 : 0,
      tickets: 120,
      paidTickets: requiresForce ? 88 : 0,
      ticketOrders: 96,
      settledTicketOrders: requiresForce ? 90 : 0,
      checkIns: requiresForce ? 44 : 0,
      eventDays: 2,
      eventSessions: 6,
      ticketTypes: 3,
    },
    requiresForce,
    deleted: false,
  }
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

function renderEvents(overrides = {}) {
  return render(
    <I18nProvider>
      <EventsSection
        adminEvents={[EVENT]}
        canEdit
        canDeleteEvents
        canManageUsers={false}
        onDeleteEvent={async () => ({ deletedEvent: { id: EVENT.id }, events: [] })}
        onFetchDeleteImpact={async () => impact()}
        onSaveEvent={async () => ({ event: EVENT, events: [EVENT] })}
        tickets={[]}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('EventsSection — borrado de eventos', () => {
  // El borrado vive en la consola del evento: abrir el modal es parte del flujo.
  function openConsole() {
    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    return screen.getByRole('region', { name: 'Evento seleccionado' })
  }

  it('no ofrece la acción a quien no puede eliminar eventos', () => {
    renderEvents({ canDeleteEvents: false })
    openConsole()
    expect(screen.queryByLabelText('Eliminar evento')).toBeNull()
  })

  it('muestra el impacto real antes de confirmar y borra sin forzar', async () => {
    const onDeleteEvent = vi.fn(async () => ({ deletedEvent: { id: EVENT.id }, events: [] }))
    renderEvents({ onDeleteEvent })

    openConsole()
    fireEvent.click(screen.getByLabelText('Eliminar evento'))

    // Los números salen del dry run en la base, no de lo que el panel tenga en
    // memoria: es lo que hace que la confirmación signifique algo.
    await screen.findByText(/48 inscripciones, 120 entradas, 96 órdenes y 0 acreditaciones/)
    expect(screen.queryByLabelText('Escribí el identificador del evento')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() =>
      expect(onDeleteEvent).toHaveBeenCalledWith('pitbull-classic-2026', { force: false }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('exige escribir el identificador cuando el evento ya movió plata o gente', async () => {
    const onDeleteEvent = vi.fn(async () => ({ deletedEvent: { id: EVENT.id }, events: [] }))
    renderEvents({ onDeleteEvent, onFetchDeleteImpact: async () => impact({ requiresForce: true }) })

    openConsole()
    fireEvent.click(screen.getByLabelText('Eliminar evento'))

    const input = await screen.findByLabelText('Escribí el identificador del evento')
    const confirm = screen.getByRole('button', { name: 'Eliminar definitivamente' })
    expect(confirm.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'otro-evento' } })
    expect(confirm.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'pitbull-classic-2026' } })
    expect(confirm.disabled).toBe(false)

    fireEvent.click(confirm)
    await waitFor(() =>
      expect(onDeleteEvent).toHaveBeenCalledWith('pitbull-classic-2026', { force: true }),
    )
  })

  it('escala a confirmación escrita cuando la base rechaza el borrado con 409', async () => {
    const conflict = Object.assign(new Error('El evento ya tiene actividad real.'), { status: 409 })
    const onDeleteEvent = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ deletedEvent: { id: EVENT.id }, events: [] })

    renderEvents({ onDeleteEvent })

    openConsole()
    fireEvent.click(screen.getByLabelText('Eliminar evento'))
    await screen.findByText(/48 inscripciones/)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    // El 409 no es un fallo: es el segundo paso de la confirmación.
    const input = await screen.findByLabelText('Escribí el identificador del evento')
    expect(screen.getByText('El evento ya tiene actividad real.')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'pitbull-classic-2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() =>
      expect(onDeleteEvent).toHaveBeenLastCalledWith('pitbull-classic-2026', { force: true }),
    )
  })
})
