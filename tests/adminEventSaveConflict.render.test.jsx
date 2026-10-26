import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCallback } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import useLiveState from '../src/hooks/useLiveState.js'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * Guardar en el editor del evento hace dos escrituras seguidas cuando hay un
 * cambio de estado (chips) y un cambio de Datos: primero el PATCH de estado y
 * después el upsert. La base cambia `updated_at` en cada una y el upsert se
 * rechaza si el `expectedUpdatedAt` no coincide.
 *
 * El host replica a `useAppData`: la lista de eventos vive en `useLiveState` y
 * el upsert lee la versión vigente de su ref. Antes la leía del cierre del
 * render anterior y salía con el `updatedAt` previo al cambio de estado.
 */

const BASE = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  description: 'Fecha nacional de powerlifting.',
  date: '15 ago',
  dateISO: '2026-08-15',
  startsAt: '2026-08-15T12:00:00.000Z',
  endsAt: '2026-08-16T23:00:00.000Z',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 48,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }],
  ticketTypes: [{ id: '8f0c3f0e-6a54-4a43-9d3e-3f1f6f0b7a11', name: 'General', price: 12000, active: true }],
  updatedAt: 'v1',
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.IntersectionObserver ??= class {
    constructor(callback) {
      this.callback = callback
    }

    observe() {
      this.callback?.([{ isIntersecting: true }], this)
    }

    disconnect() {}
  }
})

afterEach(() => cleanup())

function Host({ server, initial = BASE }) {
  const [events, setEvents, eventsRef] = useLiveState([initial])

  const onSetEventState = useCallback(
    async (slug, changes) => {
      server.version += 1
      server.stateCalls.push(changes)
      const next = { ...server.event, ...changes, updatedAt: `v${server.version}` }
      server.event = next
      setEvents([next])
      return { event: next, events: [next] }
    },
    [setEvents, server],
  )

  const onSaveEvent = useCallback(
    async (draft) => {
      const source = eventsRef.current.find((event) => event.id === draft.id) ?? null
      const expected = source?.updatedAt ?? draft.expectedUpdatedAt
      server.upsertCalls.push({ expected, serverVersion: `v${server.version}` })
      if (server.rejectUpsertWith) {
        const error = new Error(server.rejectUpsertWith)
        error.status = 409
        throw error
      }
      if (expected !== `v${server.version}`) {
        const error = new Error('Otra persona modificó este evento.')
        error.status = 409
        throw error
      }
      server.version += 1
      const next = { ...server.event, title: draft.title, updatedAt: `v${server.version}` }
      server.event = next
      setEvents([next])
      return { event: next, events: [next] }
    },
    [eventsRef, setEvents, server],
  )

  return (
    <I18nProvider>
      <EventsSection
        adminEvents={events}
        athletes={[]}
        canEdit
        canManageUsers
        canValidatePayments
        onSaveEvent={onSaveEvent}
        onSetEventState={onSetEventState}
        onListSecurityUsers={async () => []}
        onListSecurityZones={async () => []}
        payments={[]}
        pendingTicketOrders={[]}
        tickets={[]}
      />
    </I18nProvider>
  )
}

describe('guardar el evento con cambio de estado y de Datos a la vez', () => {
  it('no choca contra su propio cambio de estado', async () => {
    const server = { version: 1, event: BASE, stateCalls: [], upsertCalls: [] }
    render(<Host server={server} />)

    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    await screen.findByRole('region', { name: 'Evento seleccionado' })

    fireEvent.click(
      // El estado de la inscripción se maneja desde el control de venta; el
      // acceso sigue en Datos y se guarda con el "Guardar" del editor.
      [...document.querySelectorAll('.admin-event-state__option')].find((option) =>
        /^sin afiliación$/i.test(option.textContent ?? ''),
      ),
    )
    const title = await waitFor(() => {
      const input = document.querySelector('[name="title"]')
      expect(input).toBeTruthy()
      return input
    })
    fireEvent.change(title, { target: { value: 'Pitbull Classic 2026' } })

    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => expect(server.upsertCalls.length).toBe(1), { timeout: 3000 })
    expect(server.stateCalls).toHaveLength(1)
    // El upsert tiene que salir con la versión que dejó el PATCH de estado.
    expect(server.upsertCalls[0].expected).toBe(server.upsertCalls[0].serverVersion)
    expect(server.event.title).toBe('Pitbull Classic 2026')
  })

  it('si el upsert falla, muestra el motivo real y no da los cambios por guardados', async () => {
    const server = {
      version: 1,
      event: BASE,
      stateCalls: [],
      upsertCalls: [],
      rejectUpsertWith: 'Ya existe un evento con ese título y año.',
    }
    render(<Host server={server} />)

    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    await screen.findByRole('region', { name: 'Evento seleccionado' })

    fireEvent.click(
      // El estado de la inscripción se maneja desde el control de venta; el
      // acceso sigue en Datos y se guarda con el "Guardar" del editor.
      [...document.querySelectorAll('.admin-event-state__option')].find((option) =>
        /^sin afiliación$/i.test(option.textContent ?? ''),
      ),
    )
    const title = await waitFor(() => {
      const input = document.querySelector('[name="title"]')
      expect(input).toBeTruthy()
      return input
    })
    fireEvent.change(title, { target: { value: 'Pitbull Classic 2026' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    // El texto del servidor, no el genérico de "otra persona modificó".
    expect(await screen.findByText(/Ya existe un evento con ese título y año./)).toBeTruthy()
    expect(server.stateCalls).toHaveLength(1)
    // El estado ya se guardó, pero lo de Datos sigue pendiente: Guardar activo.
    expect(screen.queryByText(/sin cambios pendientes/i)).toBeNull()
    expect(screen.getByRole('button', { name: /guardar cambios/i }).disabled).toBe(false)
  })

  it('el rail dice si el evento se ve en el sitio o está oculto', async () => {
    const server = { version: 1, event: BASE, stateCalls: [], upsertCalls: [] }
    const { unmount } = render(<Host server={server} />)
    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    await screen.findByRole('region', { name: 'Evento seleccionado' })
    expect(document.querySelector('.admin-event-workspace__site')?.textContent).toBe('Visible en el sitio')
    unmount()

    const hidden = { ...BASE, published: false }
    render(<Host server={{ ...server, event: hidden }} initial={hidden} />)
    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    await screen.findByRole('region', { name: 'Evento seleccionado' })
    expect(document.querySelector('.admin-event-workspace__site')?.textContent).toBe('Oculto en el sitio')
  })
})
