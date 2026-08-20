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

/**
 * El listado marca la excepción, no la regla: casi todos los meets piden
 * afiliación, así que un sello en la mayoría de las filas sería ruido. El que
 * está abierto es el que cambia cómo se lo controla en la puerta, y hasta ahora
 * eso solo se veía abriendo el editor.
 */
describe('EventsSection — meets abiertos en el listado', () => {
  it('marca la fila del meet que no pide afiliación', () => {
    renderEvents({ adminEvents: [{ ...EVENT, requiresMembership: false }] })

    const mark = document.querySelector('.admin-event-row__open-mark')
    expect(mark).not.toBeNull()
    expect(mark.getAttribute('aria-label')).toBe('Abierto sin afiliación')
  })

  it('no marca las filas que sí piden afiliación', () => {
    renderEvents({ adminEvents: [{ ...EVENT, requiresMembership: true }] })
    expect(document.querySelector('.admin-event-row__open-mark')).toBeNull()

    cleanup()
    // Sin el campo, el default del negocio es que el meet pide afiliación:
    // marcar la fila acá diría lo contrario de lo que hace el checkout.
    renderEvents({ adminEvents: [EVENT] })
    expect(document.querySelector('.admin-event-row__open-mark')).toBeNull()
  })

  it('deja el requisito operable desde la ficha, sin abrir el editor', () => {
    renderEvents({ adminEvents: [{ ...EVENT, requiresMembership: false }] })
    const panel = screen.getByRole('complementary', { name: 'Evento seleccionado' })

    const access = panel.querySelector('.admin-event-state__access')
    expect(access).not.toBeNull()
    expect(
      access.querySelector('.admin-filter-chip[aria-pressed="true"]').textContent,
    ).toContain('Abierto')
  })
})
