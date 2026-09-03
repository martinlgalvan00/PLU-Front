import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * Consola del evento y alta rápida.
 *
 * Lo que se protege acá es el motivo del rediseño: crear un meet no pasa por el
 * formulario largo, y la configuración que se guarda sola (grilla, zonas) se
 * abre sin el modal que reescribe el evento entero.
 */

const EVENT = {
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
  ticketTypes: [{ id: 'tt-1', name: 'General', price: 12000, active: true }],
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

function renderEvents(overrides = {}) {
  return render(
    <I18nProvider>
      <EventsSection
        adminEvents={[EVENT]}
        athletes={[{ id: 'ath-1', fullName: 'Ana Pérez' }]}
        canEdit
        canManageUsers
        canValidatePayments
        onApprovePayment={async () => ({})}
        onRejectPayment={async () => ({})}
        onSaveEvent={async () => ({ event: EVENT, events: [EVENT] })}
        onSetEventState={async () => ({ event: EVENT, events: [EVENT] })}
        onListSecurityUsers={async () => []}
        onListSecurityZones={async () => []}
        payments={[
          {
            id: 'pay-1',
            athleteId: 'ath-1',
            eventSlug: 'pitbull-classic-2026',
            status: 'validacion_manual',
            amount: 75000,
            concept: 'Inscripción',
            method: 'manual_link',
            paymentProofPath: 'proofs/a.pdf',
            manualPaymentChannel: 'bank_transfer',
          },
        ]}
        pendingTicketOrders={[]}
        tickets={[]}
        {...overrides}
      />
    </I18nProvider>,
  )
}

function consolePanel() {
  // La consola es un modal que se abre al tocar la fila del evento.
  fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
  return screen.getByRole('dialog', { name: 'Evento seleccionado' })
}

describe('EventsSection — filas de sección de la consola', () => {
  it('lista configuración y actividad con los valores reales del evento', () => {
    renderEvents({
      onManageRegistrations: () => {},
      onManageCheckin: () => {},
      onOpenFinanceForEvent: () => {},
    })
    const panel = consolePanel()

    expect(within(panel).getByRole('button', { name: /ventas y cupos/i })).toBeTruthy()
    expect(panel.textContent).toContain('Ficha')
    expect(panel.textContent).toContain('Sitio público')
    expect(panel.textContent).toContain('Operación')
    // El valor sale del evento, no de un número decorativo.
    expect(panel.textContent).toContain('1 tipos · 48/80')
    expect(panel.textContent).toContain('1 días')
    expect(panel.textContent).toContain('48 de 80')
    expect(panel.textContent).toContain('Inscripciones abiertas')
    expect(panel.textContent).toContain('1 pendientes')
    expect(panel.querySelector('.admin-event-preview__readiness')).not.toBeNull()
  })

  it('abre el triage de pagos y vuelve a la consola', async () => {
    renderEvents({ onOpenFinanceForEvent: () => {} })
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /pagos/i }))

    await waitFor(() => expect(document.querySelector('.admin-event-payments')).not.toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Evento seleccionado' })).toBeNull()
    expect(document.body.textContent).toContain('Ana Pérez')

    fireEvent.click(screen.getByRole('button', { name: /volver a la consola/i }))

    await waitFor(() => {
      expect(document.querySelector('.admin-event-payments')).toBeNull()
      expect(screen.getByRole('dialog', { name: 'Evento seleccionado' })).toBeTruthy()
    })
  })

  it('mantiene la vista previa al abrir Datos', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /datos/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    expect(dialog.querySelector('.admin-event-console-modal__aside')).not.toBeNull()
    expect(dialog.querySelector('.admin-event-preview')).not.toBeNull()
    expect(dialog.querySelector('#event-status')).toBeNull()
  })

  it('en Publicación del acordeón no duplica estado ni acceso', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /publicación/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    const fold = dialog.querySelector('.admin-event-console__fold[data-section="visibility"]')
    expect(fold).not.toBeNull()
    expect(fold.querySelector('#event-status')).toBeNull()
    expect(fold.querySelector('#event-access')).toBeNull()
    expect(fold.textContent).toContain('Estado, sitio y acceso se controlan arriba')
    const item = fold.closest('.admin-event-console__item')
    expect(within(item).getByRole('group', { name: /qué se muestra en el sitio/i })).toBeTruthy()
    expect(within(item).getByRole('switch', { name: /calendario/i })).toBeTruthy()
    expect(within(item).getByRole('switch', { name: /pesajes/i })).toBeTruthy()
    expect(within(item).getByRole('switch', { name: /categorías/i })).toBeTruthy()
    expect(within(item).getByRole('switch', { name: /experiencia/i })).toBeTruthy()
    expect(within(item).getByRole('switch', { name: /mostrar ocupación en el sitio/i })).toBeTruthy()
  })

  it('no ofrece zonas a quien no puede gestionar usuarios', () => {
    renderEvents({ canManageUsers: false })
    expect(
      within(consolePanel()).queryByRole('button', { name: /zonas y seguridad/i }),
    ).toBeNull()
  })

  it('abre la grilla de tandas en acordeón, sin salir de la consola', async () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /estructura/i }))

    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    expect(
      within(dialog).getByRole('button', { name: /estructura/i }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(dialog.querySelector('.admin-event-console__fold--structure')).not.toBeNull()
    expect(document.querySelector('.admin-event-drill')).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    await waitFor(() => {
      expect(dialog.querySelector('.admin-event-sessions--embedded')).not.toBeNull()
    })
  })

  it('cierra Estructura al volver a tocar la fila', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /estructura/i }))
    expect(
      within(panel).getByRole('button', { name: /estructura/i }).getAttribute('aria-expanded'),
    ).toBe('true')

    fireEvent.click(within(panel).getByRole('button', { name: /estructura/i }))
    expect(
      within(panel).getByRole('button', { name: /estructura/i }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(panel.querySelector('.admin-event-console__fold--structure')).toBeNull()
  })

  it('vuelve a la lista desde la vista de zonas', async () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /zonas y seguridad/i }))
    await waitFor(() => expect(document.querySelector('.admin-event-drill')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /volver a la lista de eventos/i }))

    await waitFor(() => {
      expect(document.querySelector('.admin-event-drill')).toBeNull()
    })
    expect(screen.queryByRole('dialog', { name: 'Evento seleccionado' })).toBeNull()
    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    expect(screen.getByRole('dialog', { name: 'Evento seleccionado' })).toBeTruthy()
  })

  it('abre zonas a ancho completo, sin el editor modal', async () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /zonas y seguridad/i }))

    await waitFor(() => expect(document.querySelector('.admin-event-drill')).not.toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('al tocar Datos abre el editor en acordeón dentro de la consola', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /datos/i }))

    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    expect(dialog).toBeTruthy()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(
      within(dialog).getByRole('button', { name: /datos/i }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(within(dialog).queryByRole('button', { name: /volver a la consola/i })).toBeNull()
    expect(within(dialog).queryByRole('tablist', { name: /secciones del detalle/i })).toBeNull()
    expect(within(dialog).getByRole('button', { name: /cerrar sección/i })).toBeTruthy()
    expect(dialog.querySelector('.admin-event-console-modal__head')).not.toBeNull()
    expect(dialog.querySelector('.admin-event-console__fold')).not.toBeNull()
    expect(dialog.querySelector('.admin-event-editor--accordion')).not.toBeNull()
  })

  it('al cambiar de sección mantiene un solo editor montado', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /datos/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    expect(dialog.querySelector('.admin-event-console__fold[data-section="basics"]')).not.toBeNull()
    expect(dialog.querySelector('.admin-event-editor--essentials')).not.toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: /ventas y cupos/i }))
    expect(
      within(dialog).getByRole('button', { name: /ventas y cupos/i }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      within(dialog).getByRole('button', { name: /datos/i }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(dialog.querySelectorAll('.admin-event-editor--accordion')).toHaveLength(1)
    expect(dialog.querySelector('.admin-event-console__fold[data-section="sales"]')).not.toBeNull()
    expect(dialog.querySelector('.admin-event-console__fold[data-section="basics"]')).toBeNull()
  })

  it('en Ventas el acordeón muestra cobro sin tipos de entrada', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /ventas y cupos/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    const fold = dialog.querySelector('.admin-event-console__fold[data-section="sales"]')
    expect(fold).not.toBeNull()
    expect(fold.querySelector('#event-slots')).not.toBeNull()
    expect(fold.querySelector('[data-field="pricing.registration"]')).not.toBeNull()
    expect(fold.querySelector('[data-field="pricing.registrationManual"]')).not.toBeNull()
    expect(fold.querySelector('.admin-event-form__payment-profile')).not.toBeNull()
    expect(fold.querySelector('.admin-event-form__lane--payment')).not.toBeNull()
    expect(fold.querySelector('#event-bank-alias')).not.toBeNull()
    expect(fold.querySelector('#event-bank-cbu')).not.toBeNull()
    expect(fold.querySelector('#event-bank-holder')).not.toBeNull()
    expect(fold.querySelector('[data-field="bankTransfer.reference"]')).not.toBeNull()
    expect(fold.querySelector('.admin-event-form__lane--athletes .admin-event-form__payment-profile')).toBeNull()
    expect(fold.querySelector('.admin-event-form__ticket-config')).toBeNull()
    expect(fold.querySelector('.admin-event-editor__toolbar--accordion')).toBeNull()
  })

  it('divide Ventas en Cupo, Precios, Entradas y Cobro, un capítulo a la vez', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /ventas y cupos/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    const fold = dialog.querySelector('.admin-event-console__fold[data-section="sales"]')
    const item = fold.closest('.admin-event-console__item')

    expect(within(item).getByRole('tab', { name: /cupo/i })).toBeTruthy()
    expect(within(item).getByRole('tab', { name: /precios/i })).toBeTruthy()
    expect(within(item).getByRole('tab', { name: /entradas/i })).toBeTruthy()
    expect(within(item).getByRole('tab', { name: /cobro/i })).toBeTruthy()
    expect(fold.querySelector('.admin-event-form__lane--cupo').hidden).toBe(false)
    expect(fold.querySelector('.admin-event-form__lane--prices').hidden).toBe(true)
    expect(fold.querySelector('.admin-event-form__lane--tickets').hidden).toBe(true)
    expect(fold.querySelector('.admin-event-form__lane--payment').hidden).toBe(true)

    const salesSubmenu = item.querySelector('.admin-event-console__submenu--chapters')
    expect(salesSubmenu).not.toBeNull()
    const cupoLane = fold.querySelector('.admin-event-form__lane--cupo')
    const occupancy = cupoLane.querySelector('.admin-event-form__occupancy')
    expect(occupancy).not.toBeNull()
    expect(occupancy.closest('.admin-event-form__grid')).toBeNull()
    expect(cupoLane.querySelector('.admin-event-form__lane-head')).toBeNull()
    expect(fold.querySelector('.admin-event-form__lane--prices .admin-event-form__lane-head')).toBeNull()
    expect(fold.querySelector('.admin-event-form__payment-profile > .admin-event-form__lane-head')).toBeNull()

    fireEvent.click(within(item).getByRole('tab', { name: /cobro/i }))
    expect(fold.querySelector('.admin-event-form__lane--payment').hidden).toBe(false)
    expect(fold.querySelector('.admin-event-form__lane--cupo').hidden).toBe(true)

    fireEvent.click(within(item).getByRole('tab', { name: /entradas/i }))
    expect(fold.querySelector('.admin-event-form__lane--tickets').hidden).toBe(false)
    expect(fold.querySelector('#event-section-tickets').hidden).toBe(false)
  })

  it('con entradas habilitadas, Ventas muestra ventana, tipos y add-ons', () => {
    renderEvents({
      adminEvents: [
        {
          ...EVENT,
          pricing: { ...EVENT.pricing, ticketsEnabled: true },
        },
      ],
    })
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /ventas y cupos/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    const fold = dialog.querySelector('.admin-event-console__fold[data-section="sales"]')
    const item = fold.closest('.admin-event-console__item')

    expect(fold.querySelector('.admin-event-form__ticket-config')).not.toBeNull()
    expect(fold.querySelector('#event-ticket-opens')).not.toBeNull()
    expect(fold.querySelector('#event-ticket-closes')).not.toBeNull()
    expect(fold.querySelector('.admin-ticket-types')).not.toBeNull()
    expect(fold.querySelector('.admin-ticket-addons')).not.toBeNull()
    expect(fold.querySelector('.admin-ticket-types__day-list')).toBeNull()
    expect(within(fold).queryByRole('button', { name: /agregar día/i })).toBeNull()
    fireEvent.click(within(item).getByRole('tab', { name: /entradas/i }))
    expect(fold.querySelector('.admin-ticket-types__days-list')).not.toBeNull()
  })

  it('sin días, Ventas invita a cargarlos en Estructura', () => {
    renderEvents({
      adminEvents: [
        {
          ...EVENT,
          eventDays: [],
          pricing: { ...EVENT.pricing, ticketsEnabled: true },
        },
      ],
    })
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /ventas y cupos/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    const fold = dialog.querySelector('.admin-event-console__fold[data-section="sales"]')
    const item = fold.closest('.admin-event-console__item')

    expect(fold.querySelector('.admin-ticket-types__need-days')).not.toBeNull()
    fireEvent.click(within(item).getByRole('tab', { name: /entradas/i }))
    expect(within(fold).getByRole('button', { name: /ir a estructura/i })).toBeTruthy()
    expect(fold.querySelector('.admin-ticket-types__day-list')).toBeNull()
  })

  it('en Estructura muestra días, pesajes públicos y tandas', () => {
    renderEvents()
    const panel = consolePanel()
    fireEvent.click(within(panel).getByRole('button', { name: /^estructura/i }))
    const dialog = screen.getByRole('dialog', { name: 'Evento seleccionado' })
    const fold = dialog.querySelector('.admin-event-console__fold[data-section="structure"]')
    const item = fold.closest('.admin-event-console__item')

    expect(fold).not.toBeNull()
    expect(fold.querySelector('.admin-event-structure')).not.toBeNull()
    expect(within(item).getByRole('tab', { name: /días/i })).toBeTruthy()
    expect(within(item).getByRole('tab', { name: /pesajes/i })).toBeTruthy()
    expect(within(item).getByRole('tab', { name: /tandas/i })).toBeTruthy()
    expect(item.querySelector('.admin-event-console__submenu--chapters')).not.toBeNull()
    expect(fold.textContent).toMatch(/días del evento/i)
    expect(fold.querySelector('.admin-ticket-types__day-list')).not.toBeNull()

    fireEvent.click(within(item).getByRole('tab', { name: /pesajes/i }))
    expect(fold.querySelector('.admin-weigh-in-windows')).not.toBeNull()
    expect(within(fold).getByRole('button', { name: /armar franjas desde los días/i })).toBeTruthy()
  })
})

describe('EventsSection — alta rápida', () => {
  it('"Nuevo evento" abre el alta rápida, no el editor de cinco secciones', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))

    const dialog = await screen.findByRole('dialog', { name: /crear meet/i })
    expect(within(dialog).queryByRole('tablist')).toBeNull()
  })

  it('pide solo los seis campos sin los que el evento no puede existir', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await screen.findByRole('dialog', { name: /crear meet/i })

    for (const name of ['title', 'startsAt', 'endsAt', 'venue', 'location', 'slots']) {
      expect(dialog.querySelector(`[name="${name}"]`)).not.toBeNull()
    }
    // Precios y ventanas no se piden en el alta: viven en el editor.
    expect(dialog.querySelector('[name="registration"]')).toBeNull()
    expect(dialog.querySelector('[name="registrationOpensAt"]')).toBeNull()
  })

  it('decide la afiliación en el alta, con la consecuencia escrita', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await screen.findByRole('dialog', { name: /crear meet/i })

    expect(within(dialog).getByRole('button', { name: /solo afiliados/i })).toBeTruthy()
    expect(dialog.textContent).toContain('afiliación vigente')

    fireEvent.click(within(dialog).getByRole('button', { name: /^abierto$/i }))
    expect(dialog.textContent).toContain('sin afiliación')
  })

  it('no envía nada si falta un campo obligatorio', async () => {
    const onSaveEvent = vi.fn()
    renderEvents({ onSaveEvent })
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await screen.findByRole('dialog', { name: /crear meet/i })

    fireEvent.click(within(dialog).getByRole('button', { name: /crear y abrir consola/i }))

    await waitFor(() => expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0))
    expect(onSaveEvent).not.toHaveBeenCalled()
  })

  it('crea el evento con acceso abierto cuando se elige así', async () => {
    const onSaveEvent = vi.fn(async () => ({ event: EVENT, events: [EVENT] }))
    renderEvents({ onSaveEvent })
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await screen.findByRole('dialog', { name: /crear meet/i })

    fireEvent.change(dialog.querySelector('[name="title"]'), {
      target: { value: 'Regional Litoral' },
    })
    fireEvent.change(dialog.querySelector('[name="startsAt"]'), {
      target: { value: '2026-09-12T09:00' },
    })
    fireEvent.change(dialog.querySelector('[name="endsAt"]'), {
      target: { value: '2026-09-12T20:00' },
    })
    fireEvent.change(dialog.querySelector('[name="venue"]'), {
      target: { value: 'Gimnasio Municipal' },
    })
    fireEvent.change(dialog.querySelector('[name="location"]'), { target: { value: 'Rosario' } })
    fireEvent.change(dialog.querySelector('[name="slots"]'), { target: { value: '40' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^abierto$/i }))

    fireEvent.click(within(dialog).getByRole('button', { name: /crear y abrir consola/i }))

    await waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    expect(onSaveEvent.mock.calls[0][0]).toMatchObject({
      title: 'Regional Litoral',
      venue: 'Gimnasio Municipal',
      location: 'Rosario',
      requiresMembership: false,
      // Se crea oculto: publicar es una decisión aparte.
      published: false,
    })
    // El slug es derivado, no se tipea.
    expect(onSaveEvent.mock.calls[0][0].slug).toBe('regional-litoral-2026')
  })

  it('deja salir al editor completo sin perder lo tipeado', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const quick = await screen.findByRole('dialog', { name: /crear meet/i })

    fireEvent.change(quick.querySelector('[name="title"]'), {
      target: { value: 'Copa Norte' },
    })
    fireEvent.click(within(quick).getByRole('button', { name: /editor completo/i }))

    // El editor largo se reconoce por sus tabs: el alta rápida no tiene.
    const editor = await screen.findByRole('dialog', { name: /nuevo evento/i })
    expect(within(editor).getByRole('tablist')).toBeTruthy()
    expect(editor.querySelector('[name="title"]')?.value).toBe('Copa Norte')
  })
})
