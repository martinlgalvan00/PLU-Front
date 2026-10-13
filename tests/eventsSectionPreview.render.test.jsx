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
    expect(panel.querySelector('.admin-event-workspace__meta')?.textContent).not.toMatch(
      /\/evento\//,
    )
    expect(within(panel).queryByRole('button', { name: 'Editar evento' })).toBeNull()

    const rail = within(panel).getByRole('tablist', { name: /secciones del evento/i })
    expect(within(rail).getByRole('tab', { name: /datos/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /^ventas/i })).toBeTruthy()
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
    expect(meta).not.toMatch(/\/evento\//)
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

  it('marca el evento principal en la lista, sin sacarlo de su lugar', () => {
    renderEvents({
      adminEvents: [
        { ...EVENT, featured: true },
        {
          ...EVENT,
          id: 'evt-2',
          slug: 'copa-norte-2026',
          title: 'Copa Norte',
          dateISO: '2026-03-01',
          featured: false,
        },
      ],
    })

    const rows = [...document.querySelectorAll('.admin-event-row')]
    expect(rows.length).toBe(2)
    // Orden del calendario: Copa Norte (marzo) antes que Pitbull Classic.
    expect(rows[0].textContent).toMatch(/Copa Norte/)
    const featured = document.querySelectorAll('.admin-event-row__featured-mark')
    expect(featured.length).toBe(1)
    expect(featured[0].getAttribute('aria-label')).toBe('Evento principal')
    expect(featured[0].closest('.admin-event-row')?.textContent).toMatch(/Pitbull Classic/)
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

    const options = [...dialog.querySelectorAll('.admin-event-state__option')]
    expect(options.length).toBeGreaterThan(0)
    expect(
      options.find((option) => option.getAttribute('aria-checked') === 'true'
        && /afiliación/i.test(option.textContent))?.textContent,
    ).toContain('Sin afiliación')
  })
})

describe('EventsSection — secciones y evento principal', () => {
  const FINISHED = {
    ...EVENT,
    id: 'evt-9',
    slug: 'copa-verano',
    title: 'Copa Verano',
    dateISO: '2026-02-01',
    status: 'finalizado',
  }

  it('separa próximos y archivo en pestañas con su conteo', () => {
    renderEvents({ adminEvents: [EVENT, FINISHED] })

    const views = screen.getByRole('tablist', { name: 'Ver eventos' })
    expect(within(views).getByRole('tab', { name: /próximos/i }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(within(views).getByRole('tab', { name: /archivo/i }).textContent).toMatch(/1/)
    expect(screen.queryByTitle(/Copa Verano · copa-verano/)).toBeNull()

    fireEvent.click(within(views).getByRole('tab', { name: /archivo/i }))
    expect(screen.getByTitle(/Copa Verano · copa-verano/)).toBeTruthy()
    expect(screen.queryByTitle(/Pitbull Classic · pitbull-classic-2026/)).toBeNull()
    // El archivo no tiene evento principal: no hay nada que fijar.
    expect(document.querySelector('.admin-event-row__featured-mark')).toBeNull()
  })

  it('fija un evento como principal con el mismo guardado del editor', async () => {
    const onSaveEvent = vi.fn(async () => ({ event: EVENT, events: [EVENT, OTHER] }))
    renderEvents({ adminEvents: [EVENT, OTHER], onSaveEvent })

    const pins = screen.getAllByRole('button', { name: 'Destacar como evento principal' })
    fireEvent.click(pins[0])

    await vi.waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    expect(onSaveEvent.mock.calls[0][0]).toMatchObject({ featured: true })
    await screen.findByText(/quedó como evento principal/i)
  })

  it('no ofrece fijar sin permiso de edición', () => {
    renderEvents({ adminEvents: [EVENT], canEdit: false })
    expect(screen.queryByRole('button', { name: /evento principal/i })).toBeNull()
  })

  it('Resumen vuelve al resumen desde una pestaña que no es del editor', () => {
    renderEvents({ onManagePayments: () => {} })
    const panel = openConsole(/Pitbull Classic · pitbull-classic-2026/)
    const rail = within(panel).getByRole('tablist', { name: /secciones del evento/i })

    fireEvent.click(within(rail).getByRole('tab', { name: /pagos/i }))
    expect(panel.querySelector('.admin-event-payments')).not.toBeNull()

    fireEvent.click(within(rail).getByRole('tab', { name: /resumen/i }))
    expect(
      within(rail).getByRole('tab', { name: /resumen/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(panel.querySelector('.admin-event-dashboard')).not.toBeNull()
  })
})

describe('EventsSection — precios y logo en la ficha', () => {
  it('resume qué cobra cada medio mientras se editan las tarifas', () => {
    const priced = {
      ...EVENT,
      pricing: { ...EVENT.pricing, registration: 115000, registrationManual: 100000 },
    }
    renderEvents({ adminEvents: [priced] })
    const panel = openConsole(/Pitbull Classic · pitbull-classic-2026/)
    const rail = within(panel).getByRole('tablist', { name: /secciones del evento/i })

    fireEvent.click(within(rail).getByRole('tab', { name: /^ventas/i }))
    const prices = [...panel.querySelectorAll('.admin-event-workspace__chapter')].find((button) =>
      /Precios/.test(button.textContent),
    )
    fireEvent.click(prices)

    const summary = panel.querySelector('.admin-event-form__price-summary')
    expect(summary.textContent).toMatch(/Mercado Pago cobra.*115\.000.*transferencia y efectivo.*100\.000/)
    expect(summary.textContent).toMatch(/-13%/)
  })

  it('ofrece cambiar el logo desde la cabecera y desde Datos solo con permiso', () => {
    renderEvents({ onSetEventLogo: async () => ({ events: [EVENT] }) })
    const panel = openConsole(/Pitbull Classic · pitbull-classic-2026/)

    expect(within(panel).getByRole('button', { name: 'Cambiar el logo del evento' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Subir imagen' })).toBeTruthy()

    cleanup()
    renderEvents({ canEdit: false, onSetEventLogo: async () => ({ events: [EVENT] }) })
    const readOnly = openConsole(/Pitbull Classic · pitbull-classic-2026/)
    expect(within(readOnly).queryByRole('button', { name: 'Cambiar el logo del evento' })).toBeNull()
  })

  it('sube el logo y avisa por toast', async () => {
    const onSetEventLogo = vi.fn(async () => ({ events: [EVENT] }))
    renderEvents({ onSetEventLogo })
    const panel = openConsole(/Pitbull Classic · pitbull-classic-2026/)

    const file = new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' })
    const input = panel.querySelector('.admin-event-logo--field input[type="file"]')
    fireEvent.change(input, { target: { files: [file] } })

    // «Quitar fondo» viene encendido: el logo se sube ya recortado si tiene fondo liso.
    await vi.waitFor(() =>
      expect(onSetEventLogo).toHaveBeenCalledWith('pitbull-classic-2026', file, {
        removeBackground: true,
      }),
    )
  })
})
