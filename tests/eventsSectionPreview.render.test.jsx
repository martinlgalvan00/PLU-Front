import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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

function openConsole(rowTitle) {
  fireEvent.click(screen.getByTitle(rowTitle))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

describe('EventsSection — la página del evento', () => {
  it('la lista es la única superficie: sin evento abierto hasta tocar una fila', () => {
    renderEvents()
    expect(document.querySelector('.admin-event-preview--panel')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull()
  })

  it('abre la página del evento al tocar la fila', () => {
    renderEvents({ adminEvents: [EVENT, OTHER] })
    const panel = openConsole(/Pitbull Classic · pitbull-classic-2026/)

    expect(panel.querySelector('.admin-event-workspace__title')?.textContent).toBe(
      'Pitbull Classic',
    )
    expect(panel.querySelector('.admin-event-workspace__meta')?.textContent).toMatch(
      /Maximal Strength Club/,
    )
    expect(within(panel).queryByRole('button', { name: 'Editar evento' })).toBeNull()

    const rail = within(panel).getByRole('tablist', { name: /secciones del evento/i })
    expect(within(rail).getByRole('tab', { name: /datos/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /^entradas/i })).toBeTruthy()
  })

  it('cambia de evento tocando otra fila desde la lista', () => {
    renderEvents({ adminEvents: [EVENT, OTHER] })
    const panel = openConsole(/Pitbull Classic · pitbull-classic-2026/)
    expect(panel.querySelector('.admin-event-workspace__title')?.textContent).toBe(
      'Pitbull Classic',
    )

    // La página reemplaza la lista, así que hay que volver para cambiar de meet
    // -- que es justamente lo que evita operar el evento equivocado.
    fireEvent.click(screen.getByRole('button', { name: /volver a la lista de eventos/i }))
    fireEvent.click(screen.getByTitle(/pit elite · agosto-elite/))

    expect(
      screen
        .getByRole('region', { name: 'Evento seleccionado' })
        .querySelector('.admin-event-workspace__title')?.textContent,
    ).toBe('pit elite')
  })

  it('no duplica la sede cuando venue y location coinciden', () => {
    renderEvents({ adminEvents: [OTHER] })
    const panel = openConsole(/pit elite · agosto-elite/)
    const meta = panel.querySelector('.admin-event-workspace__meta')?.textContent
    expect(meta).toMatch(/pit elite/)
    expect(meta).not.toMatch(/pit elite,\s*pit elite/)
  })

  it('vuelve a la lista con Volver, y Escape no se lleva el trabajo', () => {
    renderEvents({ adminEvents: [EVENT] })
    openConsole(/Pitbull Classic · pitbull-classic-2026/)

    // Ya no es un modal: Escape no cierra. Perder cambios sin guardar por
    // apretar Escape en una página es peor que no tener el atajo.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Evento seleccionado' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /volver a la lista de eventos/i }))
    expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull()
  })
})

/**
 * El listado marca la excepción, no la regla: casi todos los meets piden
 * afiliación, así que un sello en la mayoría de filas sería ruido. El que
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

  it('deja el requisito operable desde la consola, sin abrir el editor', () => {
    renderEvents({ adminEvents: [{ ...EVENT, requiresMembership: false }] })
    const dialog = openConsole(/Pitbull Classic · pitbull-classic-2026/)

    const access = dialog.querySelector('.admin-event-state__access')
    expect(access).not.toBeNull()
    expect(
      access.querySelector('[role="radio"][aria-pressed="true"]')?.textContent,
    ).toContain('Abierto')
  })
})
