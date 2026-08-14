import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const OTHER = {
  ...EVENT,
  id: 'evt-2',
  slug: 'agosto-elite',
  title: 'pit elite',
  dateISO: '2026-08-21',
  venue: 'pit elite',
  location: 'pit elite',
  registered: 1,
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
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
        onSaveEvent={async () => ({ event: EVENT, events: [EVENT] })}
        onSetEventState={async () => ({ event: EVENT, events: [EVENT] })}
        tickets={[]}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('EventsSection — ficha operativa', () => {
  it('muestra el título y la sede del evento seleccionado en la ficha', () => {
    renderEvents()
    const panel = screen.getByRole('complementary', { name: 'Evento seleccionado' })
    expect(panel.querySelector('.admin-event-preview__selected-title')?.textContent).toBe(
      'Pitbull Classic',
    )
    expect(panel.querySelector('.admin-event-preview__meta-line')?.textContent).toMatch(
      /Maximal Strength Club/,
    )
    expect(within(panel).getByRole('button', { name: 'Editar evento' })).toBeTruthy()
  })

  it('no duplica la sede cuando venue y location coinciden', () => {
    renderEvents({ adminEvents: [OTHER] })
    const panel = screen.getByRole('complementary', { name: 'Evento seleccionado' })
    expect(panel.querySelector('.admin-event-preview__meta-line')?.textContent).toMatch(/pit elite/)
    expect(panel.querySelector('.admin-event-preview__meta-line')?.textContent).not.toMatch(
      /pit elite,\s*pit elite/,
    )
  })

  it('desplaza la ficha al elegir otro evento cuando el layout está apilado', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const originalComputedStyle = window.getComputedStyle.bind(window)
    const style = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (element?.classList?.contains('admin-events-workspace')) {
        return { gridTemplateColumns: 'minmax(0, 1fr)', getPropertyValue: () => '' }
      }
      return originalComputedStyle(element, pseudo)
    })

    renderEvents({ adminEvents: [EVENT, OTHER] })
    fireEvent.click(screen.getByTitle(/pit elite · agosto-elite/))

    expect(scroll).toHaveBeenCalledTimes(1)
    style.mockRestore()
  })
})
