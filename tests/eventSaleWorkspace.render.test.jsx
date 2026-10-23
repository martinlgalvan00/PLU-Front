import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * Venta de inscripciones dentro de la página del evento: el Resumen la
 * encabeza, la cabecera dice el estado real y lo que cambia la barra rápida no
 * se pierde en el próximo guardado del editor.
 */

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  description: 'Fecha nacional de powerlifting.',
  date: '15 ago',
  dateISO: '2030-08-15',
  startsAt: '2030-08-15T12:00:00.000Z',
  endsAt: '2030-08-15T22:00:00.000Z',
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

beforeAll(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Panel({ onSaveEvent, onSetEventState }) {
  const [events, setEvents] = useState([EVENT])
  return (
    <I18nProvider>
      <EventsSection
        adminEvents={events}
        canEdit
        canManageUsers={false}
        onSaveEvent={async (draft) => {
          const result = await onSaveEvent(draft)
          return result
        }}
        onSetEventState={async (slug, changes) => {
          const next = { ...events[0], ...changes }
          setEvents([next])
          onSetEventState(slug, changes)
          return { event: next, events: [next] }
        }}
        tickets={[]}
      />
    </I18nProvider>
  )
}

function openEvent() {
  fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

describe('venta de inscripciones en la página del evento', { timeout: 30000 }, () => {
  it('el Resumen arranca por la venta y la cabecera dice su estado', async () => {
    render(<Panel onSaveEvent={vi.fn()} onSetEventState={vi.fn()} />)
    const panel = openEvent()
    fireEvent.click(within(panel).getByRole('tab', { name: /Resumen/ }))

    const sale = await screen.findByRole('region', { name: 'Venta de inscripciones' })
    await waitFor(() => expect(within(sale).getByRole('status').textContent).toBe('A la venta'))
    expect(panel.querySelector('.admin-event-workspace__sale').textContent).toBe(
      'Inscripciones: A la venta',
    )
  })

  it('en Datos ya no se elige el estado a mano', () => {
    render(<Panel onSaveEvent={vi.fn()} onSetEventState={vi.fn()} />)
    openEvent()
    const options = [...document.querySelectorAll('.admin-event-state__option')].map(
      (option) => option.textContent,
    )
    expect(options).not.toContain('Inscripción abierta')
    expect(options).toContain('Sin afiliación')
  })

  it('cerrar desde la barra con el editor abierto no se deshace al guardar otro cambio', async () => {
    const onSetEventState = vi.fn()
    const onSaveEvent = vi.fn(async (draft) => ({ event: { ...EVENT, ...draft }, events: [EVENT] }))
    render(<Panel onSaveEvent={onSaveEvent} onSetEventState={onSetEventState} />)
    openEvent()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar inscripciones' }))
    await waitFor(() =>
      expect(onSetEventState).toHaveBeenCalledWith('pitbull-classic-2026', { status: 'cerrado' }),
    )

    const title = document.querySelector('[name="title"]')
    fireEvent.change(title, { target: { value: 'Pitbull Classic 2030' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    // El borrador quedó al día: el upsert no vuelve a abrir lo que se cerró.
    expect(onSaveEvent.mock.calls[0][0].status).toBe('cerrado')
  })

  it('alta guiada: tres pasos, «Listo» con la venta y de ahí al Resumen del evento', async () => {
    function CreatePanel() {
      const [events, setEvents] = useState([EVENT])
      return (
        <I18nProvider>
          <EventsSection
            adminEvents={events}
            canEdit
            canManageUsers={false}
            onSaveEvent={async (draft) => {
              const created = {
                ...EVENT,
                ...draft,
                id: 'evt-new',
                registered: 0,
                published: false,
                status: draft.status,
              }
              setEvents((current) => [...current, created])
              return { event: created, events: [...events, created] }
            }}
            onSetEventState={async () => ({ event: EVENT, events })}
            tickets={[]}
          />
        </I18nProvider>
      )
    }
    render(<CreatePanel />)
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const page = await screen.findByRole('region', { name: /crear meet/i })
    const set = (name, value) =>
      fireEvent.change(page.querySelector(`[name="${name}"]`), { target: { value } })
    set('title', 'Copa Norte')
    set('startsAt', '2030-09-12T09:00')
    set('endsAt', '2030-09-12T20:00')
    set('venue', 'Complejo Belgrano')
    set('location', 'Salta')

    fireEvent.click(within(page).getByRole('button', { name: /^siguiente/i }))
    // Venta: abre ya.
    fireEvent.click(within(page).getByRole('button', { name: 'Abierta ya' }))
    fireEvent.click(within(page).getByRole('button', { name: /^siguiente/i }))
    fireEvent.click(within(page).getByRole('button', { name: /crear evento/i }))

    const sale = await screen.findByRole('region', { name: 'Venta de inscripciones' })
    // Creado oculto: abierta, pero todavía no se puede pagar.
    await waitFor(() =>
      expect(within(sale).getByRole('status').textContent).toBe('Abiertas, sin poder pagar'),
    )
    expect(within(sale).getByText('El evento está oculto en el sitio.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /ir al evento/i }))
    const workspace = await screen.findByRole('region', { name: 'Evento seleccionado' })
    expect(workspace.querySelector('.admin-event-workspace__title').textContent).toBe('Copa Norte')
    expect(
      within(workspace).getByRole('tab', { name: /^resumen$/i }).getAttribute('aria-selected'),
    ).toBe('true')
  })
})
