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

/**
 * El evento es una PAGINA con pestañas, no un modal con acordeones. Lo que se
 * protege acá es que cada superficie siga estando y siga trayendo datos reales
 * -- el intento anterior de este mismo cambio perdió cinco afordancias y dejó
 * la pestaña Datos imposible de abrir.
 */
function workspace() {
  fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

/** El rail de pestañas del evento, para no confundirlo con los capítulos que
 *  el editor de Ventas dibuja con sus propios `role="tab"`. */
function tabRail(panel) {
  return within(panel).getByRole('tablist', { name: /secciones del evento/i })
}

function openTab(panel, name) {
  fireEvent.click(within(tabRail(panel)).getByRole('tab', { name }))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

function mainCol() {
  return screen
    .getByRole('region', { name: 'Evento seleccionado' })
    .querySelector('.admin-event-workspace__main-col')
}

describe('EventsSection — página del evento', () => {
  it('abre en Datos con el editor montado', () => {
    renderEvents()
    const panel = workspace()

    // La regresión que este test existe para evitar: el intento anterior
    // arrancaba en 'basics' y retornaba temprano al clickear la pestaña
    // activa, así que el editor de Datos no se podía abrir nunca.
    expect(
      within(tabRail(panel)).getByRole('tab', { name: /datos/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(panel.querySelector('.admin-event-editor--accordion')).not.toBeNull()
    expect(panel.querySelector('.admin-event-workspace__head')).not.toBeNull()
    // Ya no es un diálogo: es la página del evento.
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
  })

  it('ofrece las seis superficies con los valores reales del evento', () => {
    renderEvents({
      onManageRegistrations: () => {},
      onManageCheckin: () => {},
      onOpenFinanceForEvent: () => {},
    })
    const panel = workspace()
    const rail = tabRail(panel)

    expect(within(rail).getByRole('tab', { name: /datos/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /estructura/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /^entradas/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /zonas y seguridad/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /pagos/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /vista pública/i })).toBeTruthy()

    // Los números salen del evento, no son decorativos.
    expect(panel.textContent).toContain('Pitbull Classic')
    expect(panel.textContent).toContain('48 de 80')
    expect(panel.textContent).toContain('1 pendientes')
    expect(panel.textContent).toContain('Ocupación')
  })

  it('mantiene Inscripciones y Check-in como accesos, no como pestañas', () => {
    const onManageRegistrations = vi.fn()
    const onManageCheckin = vi.fn()
    renderEvents({ onManageRegistrations, onManageCheckin })
    const panel = workspace()

    // Son otras secciones del panel: no pueden ser pestañas del evento,
    // pero tampoco podían desaparecer (el intento anterior las perdió).
    expect(within(tabRail(panel)).queryByRole('tab', { name: /inscripciones/i })).toBeNull()
    expect(within(tabRail(panel)).queryByRole('tab', { name: /check-in/i })).toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: /inscripciones/i }))
    expect(onManageRegistrations).toHaveBeenCalled()
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Evento seleccionado' })).getByRole('button', {
        name: /check-in/i,
      }),
    )
    expect(onManageCheckin).toHaveBeenCalled()
  })

  it('volver a tocar la pestaña activa no la cierra', () => {
    renderEvents()
    const panel = workspace()
    const afterOpen = openTab(panel, /estructura/i)
    const tab = within(tabRail(afterOpen)).getByRole('tab', { name: /estructura/i })
    expect(tab.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(tab)

    const after = screen.getByRole('region', { name: 'Evento seleccionado' })
    expect(
      within(tabRail(after)).getByRole('tab', { name: /estructura/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(after.querySelector('.admin-event-structure')).not.toBeNull()
  })

  it('al cambiar de pestaña mantiene un solo editor montado', () => {
    renderEvents()
    const panel = workspace()
    expect(panel.querySelector('.admin-event-editor--essentials')).not.toBeNull()

    const after = openTab(panel, /^entradas/i)
    expect(
      within(tabRail(after)).getByRole('tab', { name: /^entradas/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      within(tabRail(after)).getByRole('tab', { name: /datos/i }).getAttribute('aria-selected'),
    ).toBe('false')
    expect(after.querySelectorAll('.admin-event-editor--accordion')).toHaveLength(1)
  })

  it('abre el triage de pagos como pestaña, sin salir del evento', async () => {
    renderEvents({ onOpenFinanceForEvent: () => {} })
    const panel = workspace()
    openTab(panel, /pagos/i)

    await waitFor(() => expect(document.querySelector('.admin-event-payments')).not.toBeNull())
    // Antes el triage reemplazaba la lista entera y había que "volver a la
    // consola": ahora el encabezado del evento no se va.
    expect(screen.getByRole('region', { name: 'Evento seleccionado' })).toBeTruthy()
    expect(document.body.textContent).toContain('Ana Pérez')

    openTab(screen.getByRole('region', { name: 'Evento seleccionado' }), /datos/i)
    await waitFor(() => expect(document.querySelector('.admin-event-payments')).toBeNull())
  })

  it('en Zonas no monta el editor del evento', async () => {
    renderEvents()
    const panel = workspace()
    openTab(panel, /zonas y seguridad/i)

    await waitFor(() => expect(document.querySelector('.admin-event-zones')).not.toBeNull())
    expect(document.querySelector('.admin-event-editor--accordion')).toBeNull()
  })

  it('no ofrece zonas a quien no puede gestionar usuarios', () => {
    renderEvents({ canManageUsers: false })
    expect(
      within(tabRail(workspace())).queryByRole('tab', { name: /zonas y seguridad/i }),
    ).toBeNull()
  })

  it('vuelve a la lista con Volver, y el evento se puede reabrir', async () => {
    renderEvents()
    const panel = workspace()
    openTab(panel, /zonas y seguridad/i)
    await waitFor(() => expect(document.querySelector('.admin-event-zones')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /volver a la lista de eventos/i }))

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull(),
    )
    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    expect(screen.getByRole('region', { name: 'Evento seleccionado' })).toBeTruthy()
  })

  it('muestra la vista previa pública y el checklist en su pestaña', () => {
    renderEvents()
    const panel = workspace()
    expect(panel.querySelector('.admin-event-preview')).toBeNull()

    const after = openTab(panel, /vista pública/i)
    expect(after.querySelector('.admin-event-preview')).not.toBeNull()
    expect(after.querySelector('.admin-event-preview__readiness')).not.toBeNull()
  })

  it('en Vista pública no duplica estado ni acceso', () => {
    renderEvents()
    openTab(workspace(), /vista pública/i)
    const col = mainCol()

    expect(col.querySelector('#event-status')).toBeNull()
    expect(col.querySelector('#event-access')).toBeNull()
    expect(within(col).getByRole('group', { name: /qué se muestra en el sitio/i })).toBeTruthy()
  })

  it('en Entradas muestra cobro sin tipos de entrada', () => {
    renderEvents()
    openTab(workspace(), /^entradas/i)
    const col = mainCol()

    expect(col.querySelector('#event-slots')).not.toBeNull()
    expect(col.querySelector('[data-field="pricing.registration"]')).not.toBeNull()
    expect(col.querySelector('[data-field="pricing.registrationManual"]')).not.toBeNull()
    expect(col.querySelector('.admin-event-form__payment-profile')).not.toBeNull()
    expect(col.querySelector('.admin-event-form__lane--payment')).not.toBeNull()
    expect(col.querySelector('#event-bank-alias')).not.toBeNull()
    expect(col.querySelector('#event-bank-cbu')).not.toBeNull()
    expect(col.querySelector('#event-bank-holder')).not.toBeNull()
    expect(col.querySelector('[data-field="bankTransfer.reference"]')).not.toBeNull()
    expect(col.querySelector('.admin-event-form__ticket-config')).toBeNull()
  })

  it('divide Entradas en Cupo, Precios, Entradas y Cobro, un capítulo a la vez', () => {
    renderEvents()
    openTab(workspace(), /^entradas/i)
    const col = mainCol()

    expect(within(col).getByRole('tab', { name: /cupo/i })).toBeTruthy()
    expect(within(col).getByRole('tab', { name: /precios/i })).toBeTruthy()
    expect(within(col).getByRole('tab', { name: /entradas/i })).toBeTruthy()
    expect(within(col).getByRole('tab', { name: /cobro/i })).toBeTruthy()
    expect(col.querySelector('.admin-event-form__lane--cupo').hidden).toBe(false)
    expect(col.querySelector('.admin-event-form__lane--prices').hidden).toBe(true)
    expect(col.querySelector('.admin-event-form__lane--tickets').hidden).toBe(true)
    expect(col.querySelector('.admin-event-form__lane--payment').hidden).toBe(true)

    fireEvent.click(within(col).getByRole('tab', { name: /cobro/i }))
    expect(mainCol().querySelector('.admin-event-form__lane--payment').hidden).toBe(false)
    expect(mainCol().querySelector('.admin-event-form__lane--cupo').hidden).toBe(true)

    fireEvent.click(within(mainCol()).getByRole('tab', { name: /entradas/i }))
    expect(mainCol().querySelector('.admin-event-form__lane--tickets').hidden).toBe(false)
  })

  it('con entradas habilitadas, Entradas muestra ventana, tipos y add-ons', () => {
    renderEvents({
      adminEvents: [{ ...EVENT, pricing: { ...EVENT.pricing, ticketsEnabled: true } }],
    })
    openTab(workspace(), /^entradas/i)
    const col = mainCol()

    expect(col.querySelector('.admin-event-form__ticket-config')).not.toBeNull()
    expect(col.querySelector('#event-ticket-opens')).not.toBeNull()
    expect(col.querySelector('#event-ticket-closes')).not.toBeNull()
    expect(col.querySelector('.admin-ticket-types')).not.toBeNull()
    expect(col.querySelector('.admin-ticket-addons')).not.toBeNull()
  })

  it('sin días, Entradas invita a cargarlos en Estructura', () => {
    renderEvents({
      adminEvents: [
        { ...EVENT, eventDays: [], pricing: { ...EVENT.pricing, ticketsEnabled: true } },
      ],
    })
    openTab(workspace(), /^entradas/i)
    const col = mainCol()

    expect(col.querySelector('.admin-ticket-types__need-days')).not.toBeNull()
    fireEvent.click(within(col).getByRole('tab', { name: /entradas/i }))
    expect(within(mainCol()).getByRole('button', { name: /ir a estructura/i })).toBeTruthy()
  })

  it('en Estructura muestra días, pesajes y tandas en un solo flujo', async () => {
    renderEvents()
    const after = openTab(workspace(), /estructura/i)

    // Los tres bloques juntos y en orden: no son alternativas, son un orden.
    expect(after.querySelector('.admin-event-structure')).not.toBeNull()
    expect(after.textContent).toMatch(/días del evento/i)
    expect(after.querySelector('.admin-weigh-in-windows')).not.toBeNull()
    expect(
      within(after).getByRole('button', { name: /armar franjas desde los días/i }),
    ).toBeTruthy()
    await waitFor(() =>
      expect(after.querySelector('.admin-event-sessions--embedded')).not.toBeNull(),
    )
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
