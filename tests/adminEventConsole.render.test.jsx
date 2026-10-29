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

function renderEvents(overrides = {}, { wrapAdminShellContent = false } = {}) {
  const ui = (
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
    </I18nProvider>
  )
  // El scroll real de esta pantalla lo hace `.admin-shell__content` (un
  // ancestro que pone AdminShell, no EventsSection) -- los tests del
  // encabezado sticky/compacto necesitan ese ancestro presente de verdad.
  return wrapAdminShellContent
    ? render(<div className="admin-shell__content">{ui}</div>)
    : render(ui)
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

/** Los capítulos de Ventas viven en el chrome del panel (junto a copiar/
 *  borrar). "Cupo" también matchea "Ventas y cupos" del rail si se busca
 *  sin acotar. */
function chaptersRail(panel) {
  return within(panel).getByRole('tablist', { name: /capítulos/i })
}

function salesSubnav(panel) {
  return within(tabRail(panel)).getByRole('group', { name: /capítulos/i })
}

/** Datos y Estructura son capítulos de la pestaña "Evento". */
function eventChapters(panel) {
  return within(panel).getByRole('tablist', { name: /partes del evento/i })
}

const EVENT_CHAPTER = /datos|estructura/i

function openTab(panel, name) {
  if (EVENT_CHAPTER.test(String(name))) {
    const eventTab = within(tabRail(panel)).getByRole('tab', { name: /^evento$/i })
    if (eventTab.getAttribute('aria-selected') !== 'true') fireEvent.click(eventTab)
    const current = screen.getByRole('region', { name: 'Evento seleccionado' })
    fireEvent.click(within(eventChapters(current)).getByRole('tab', { name }))
    return screen.getByRole('region', { name: 'Evento seleccionado' })
  }
  fireEvent.click(within(tabRail(panel)).getByRole('tab', { name }))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

/** La pestaña o el capítulo de Evento con ese nombre. */
function sectionTab(panel, name) {
  return EVENT_CHAPTER.test(String(name))
    ? within(eventChapters(panel)).getByRole('tab', { name })
    : within(tabRail(panel)).getByRole('tab', { name })
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
      sectionTab(panel, /datos/i).getAttribute('aria-selected'),
    ).toBe('true')
    expect(panel.querySelector('.admin-event-editor--accordion')).not.toBeNull()
    expect(panel.querySelector('.admin-event-workspace__toolbar')).not.toBeNull()
    expect(panel.querySelector('.admin-event-workspace__section-title')).toBeNull()
    // Ya no es un diálogo: es la página del evento.
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
  })

  it('el panel no deja una banda de sección pegada al scrollear', () => {
    renderEvents({}, { wrapAdminShellContent: true })
    const panel = workspace()
    const toolbar = panel.querySelector('.admin-event-workspace__toolbar')

    expect(toolbar).not.toBeNull()
    expect(toolbar.className).not.toMatch(/is-compact/)
    expect(panel.querySelector('.admin-event-workspace__head-progress')).toBeNull()
    expect(panel.querySelector('.admin-event-workspace__head')).toBeNull()
  })

  it('cambiar de pestaña vuelve a subir el scroll de la página', () => {
    const { container } = renderEvents({}, { wrapAdminShellContent: true })
    const panel = workspace()
    const host = container.querySelector('.admin-shell__content')
    const scrollTo = vi.fn()
    host.scrollTo = scrollTo

    openTab(panel, /estructura/i)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('ofrece las seis superficies con los valores reales del evento', () => {
    renderEvents({
      onManageRegistrations: () => {},
      onManageCheckin: () => {},
      onOpenFinanceForEvent: () => {},
    })
    const panel = workspace()
    const rail = tabRail(panel)

    // Cuatro pestañas para armar el evento y, aparte, las de operación.
    const names = within(rail)
      .getAllByRole('tab')
      .map((tab) => tab.textContent.replace(/\d+$/, '').trim())
    expect(names.slice(0, 4)).toEqual(['Resumen', 'Evento', 'Venta', 'Página'])
    expect(within(rail).getByRole('tab', { name: /zonas y seguridad/i })).toBeTruthy()
    expect(within(rail).getByRole('tab', { name: /pagos/i })).toBeTruthy()
    // Datos y Estructura son capítulos de Evento.
    expect(within(eventChapters(panel)).getByRole('tab', { name: /datos/i })).toBeTruthy()
    expect(within(eventChapters(panel)).getByRole('tab', { name: /estructura/i })).toBeTruthy()

    expect(panel.textContent).toContain('Pitbull Classic')

    // Ocupación y accesos viven en el Resumen, no en la pestaña que abre por
    // defecto: la consola dejó de repartirlos en un rail al costado de cada
    // superficie. Los números se siguen comprobando ahí, que es donde el
    // operador los lee.
    const resumen = openTab(panel, /resumen/i)
    expect(resumen.textContent).toContain('48 de 80')
    expect(resumen.textContent).toContain('1 pendientes')
    // Una sola cifra contra el cupo (antes Ocupación e Inscripciones por separado).
    expect(resumen.textContent).toContain('Inscriptos')
  })

  it('Inscripciones es pestaña del meet; Check-in sigue como acceso', () => {
    const onManageCheckin = vi.fn()
    renderEvents({ onManageCheckin })
    const panel = workspace()

    expect(within(tabRail(panel)).getByRole('tab', { name: /inscripciones/i })).toBeTruthy()
    expect(within(tabRail(panel)).queryByRole('tab', { name: /check-in/i })).toBeNull()

    openTab(panel, /inscripciones/i)
    expect(
      within(tabRail(panel)).getByRole('tab', { name: /inscripciones/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByRole('heading', { name: /^inscripciones$/i })).toBeTruthy()

    openTab(panel, /resumen/i)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Evento seleccionado' })).getByRole('button', {
        name: /puerta y qr/i,
      }),
    )
    expect(onManageCheckin).toHaveBeenCalled()
  })

  it('volver a tocar la pestaña activa no la cierra', () => {
    renderEvents()
    const panel = workspace()
    const afterOpen = openTab(panel, /estructura/i)
    const tab = sectionTab(afterOpen, /estructura/i)
    expect(tab.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(tab)

    const after = screen.getByRole('region', { name: 'Evento seleccionado' })
    expect(
      sectionTab(after, /estructura/i).getAttribute('aria-selected'),
    ).toBe('true')
    expect(after.querySelector('.admin-event-structure')).not.toBeNull()
  })

  it('al cambiar de pestaña mantiene un solo editor montado', () => {
    renderEvents()
    const panel = workspace()
    expect(panel.querySelector('.admin-event-editor--essentials')).not.toBeNull()

    const after = openTab(panel, /^venta$/i)
    expect(
      within(tabRail(after)).getByRole('tab', { name: /^venta$/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      within(tabRail(after)).getByRole('tab', { name: /^evento$/i }).getAttribute('aria-selected'),
    ).toBe('false')
    expect(after.querySelectorAll('.admin-event-editor--accordion')).toHaveLength(1)
  })

  it('volver al resumen cierra la sección del editor y no la reabre', () => {
    renderEvents()
    const panel = workspace()

    expect(
      sectionTab(panel, /datos/i).getAttribute('aria-selected'),
    ).toBe('true')
    expect(panel.querySelector('.admin-event-editor--accordion')).not.toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: /volver al resumen/i }))

    const after = screen.getByRole('region', { name: 'Evento seleccionado' })
    expect(
      within(tabRail(after)).getByRole('tab', { name: /resumen/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(after.querySelector('.admin-event-editor--accordion')).toBeNull()
    expect(after.querySelector('.admin-event-dashboard')).not.toBeNull()
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
    expect(document.querySelector('.admin-event-zones__eyebrow')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Estructura operativa/)
    expect(document.body.textContent).toMatch(/Cada zona define qué puede escanear/)
    expect(document.body.textContent).toMatch(/El puesto filtra qué se lee/)
    expect(document.body.textContent).toMatch(/link directo/)
    expect(document.querySelector('fieldset.admin-event-form__pricing.admin-event-security')).toBeNull()
    expect(document.querySelector('section.admin-event-security')).not.toBeNull()
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

  it('cierra el workspace si el padre suelta el slug (salida por el menú del panel)', async () => {
    function Harness({ slug }) {
      return (
        <I18nProvider>
          <EventsSection
            adminEvents={[EVENT]}
            adminEventWorkspaceSlug={slug}
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
            payments={[]}
            pendingTicketOrders={[]}
            tickets={[]}
          />
        </I18nProvider>
      )
    }

    const { rerender } = render(<Harness slug={EVENT.slug} />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Evento seleccionado' })).toBeTruthy(),
    )

    rerender(<Harness slug={null} />)

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull(),
    )
    expect(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/)).toBeTruthy()
  })

  it('muestra la vista previa pública y el checklist en su pestaña', () => {
    renderEvents()
    const panel = workspace()
    expect(panel.querySelector('.admin-event-preview')).toBeNull()

    const after = openTab(panel, /^página$/i)
    expect(after.querySelector('.admin-event-preview')).not.toBeNull()
    expect(after.querySelector('.admin-event-preview__readiness')).not.toBeNull()
    expect(after.querySelector('.admin-event-visual-builder')).toBeNull()
  })

  it('en Vista pública no duplica estado ni acceso', () => {
    renderEvents()
    openTab(workspace(), /^página$/i)
    const col = mainCol()

    expect(col.querySelector('#event-status')).toBeNull()
    expect(col.querySelector('#event-access')).toBeNull()
    expect(within(col).queryByRole('heading', { name: /^publicación$/i })).toBeNull()
    expect(within(col).getByRole('group', { name: /secciones de la página/i })).toBeTruthy()
  })

  it('en Entradas muestra cobro sin tipos de entrada', () => {
    renderEvents()
    openTab(workspace(), /^venta$/i)
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

  it('divide Venta en Módulos, Cupo, Precios, Entradas y Cobro, un capítulo a la vez', () => {
    renderEvents()
    const panel = workspace()
    expect(within(tabRail(panel)).queryByRole('group', { name: /capítulos/i })).toBeNull()
    const after = openTab(panel, /^venta$/i)
    const col = mainCol()
    const chapters = chaptersRail(after)
    const subnav = salesSubnav(after)

    expect(after.contains(chapters)).toBe(true)
    expect(after.querySelector('.admin-event-workspace__toolbar')?.contains(chapters)).toBe(true)
    expect(
      within(tabRail(after)).getByRole('tab', { name: /^venta$/i }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(within(subnav).getByRole('button', { name: /^módulos$/i })).toBeTruthy()
    expect(within(subnav).getByRole('button', { name: /^cupo$/i })).toBeTruthy()
    expect(within(subnav).getByRole('button', { name: /^precios$/i })).toBeTruthy()
    expect(within(subnav).getByRole('button', { name: /^entradas$/i })).toBeTruthy()
    expect(within(subnav).getByRole('button', { name: /^cobro$/i })).toBeTruthy()

    expect(within(chapters).getByRole('tab', { name: /módulos/i })).toBeTruthy()
    expect(within(chapters).getByRole('tab', { name: /cupo/i })).toBeTruthy()
    expect(within(chapters).getByRole('tab', { name: /precios/i })).toBeTruthy()
    expect(within(chapters).getByRole('tab', { name: /entradas/i })).toBeTruthy()
    expect(within(chapters).getByRole('tab', { name: /cobro/i })).toBeTruthy()
    // Venta abre en Módulos: la vista de conjunto de qué se vende y cómo se cobra.
    expect(col.querySelector('.admin-event-form__lane--modules').hidden).toBe(false)
    expect(col.querySelector('.admin-event-form__lane--cupo').hidden).toBe(true)
    expect(col.querySelector('.admin-event-form__lane--prices').hidden).toBe(true)
    expect(col.querySelector('.admin-event-form__lane--tickets').hidden).toBe(true)
    expect(col.querySelector('.admin-event-form__lane--payment').hidden).toBe(true)

    fireEvent.click(within(subnav).getByRole('button', { name: /^cobro$/i }))
    expect(mainCol().querySelector('.admin-event-form__lane--payment').hidden).toBe(false)
    expect(mainCol().querySelector('.admin-event-form__lane--cupo').hidden).toBe(true)

    fireEvent.click(
      within(chaptersRail(screen.getByRole('region', { name: 'Evento seleccionado' }))).getByRole(
        'tab',
        { name: /entradas/i },
      ),
    )
    expect(mainCol().querySelector('.admin-event-form__lane--tickets').hidden).toBe(false)
    expect(within(mainCol()).getByText(/vender entradas/i)).toBeTruthy()
    expect(within(mainCol()).queryByText(/configurar entradas/i)).toBeNull()
  })

  it('en Cupo deja publicar u ocultar la ocupación del sitio', () => {
    renderEvents()
    const panel = openTab(workspace(), /^venta$/i)
    fireEvent.click(within(chaptersRail(panel)).getByRole('tab', { name: /cupo/i }))
    const cupo = mainCol().querySelector('.admin-event-form__lane--cupo')
    const toggle = cupo?.querySelector('#event-capacity-progress-public')

    expect(cupo?.hidden).toBe(false)
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(cupo.querySelector('.admin-event-form__cupo')?.contains(toggle)).toBe(true)
    expect(cupo.querySelector('.admin-event-form__cupo #event-slots')).not.toBeNull()
    expect(within(cupo).getByText(/mostrar ocupación en el sitio/i)).toBeTruthy()
    expect(cupo.querySelector('#event-capacity-total-public')).not.toBeNull()
    expect(within(cupo).getByText(/mostrar el número total/i)).toBeTruthy()
    expect(within(cupo).getByText(/en el sitio:/i)).toBeTruthy()
  })

  it('con entradas habilitadas, Entradas muestra ventana, tipos y add-ons', () => {
    renderEvents({
      adminEvents: [{ ...EVENT, pricing: { ...EVENT.pricing, ticketsEnabled: true } }],
    })
    const panel = openTab(workspace(), /^venta$/i)
    fireEvent.click(within(chaptersRail(panel)).getByRole('tab', { name: /entradas/i }))
    const col = mainCol()

    expect(within(col).getByText(/entradas en venta/i)).toBeTruthy()
    expect(col.querySelector('.admin-event-form__ticket-config')).not.toBeNull()
    expect(col.querySelector('.admin-event-form__ticket-config-summary')).toBeNull()
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
    const panel = openTab(workspace(), /^venta$/i)
    const col = mainCol()

    expect(col.querySelector('.admin-ticket-types__need-days')).not.toBeNull()
    fireEvent.click(within(chaptersRail(panel)).getByRole('tab', { name: /entradas/i }))
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

/** El alta es una página con su URL, no un diálogo: se lee como una región. */
function findCreatePage() {
  return screen.findByRole('region', { name: /crear meet/i })
}

describe('EventsSection — alta rápida', () => {
  afterEach(() => {
    window.history.pushState(null, '', '/')
  })

  it('"Nuevo evento" abre el alta rápida, no el editor de cinco secciones', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))

    const page = await findCreatePage()
    expect(within(page).queryByRole('tablist')).toBeNull()
  })

  it('el alta es una página con su URL y reemplaza al listado, sin tapar nada', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    await findCreatePage()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.pathname).toBe('/admin/eventos/nuevo')
    // El listado deja de montarse mientras se crea: no hay nada detrás.
    expect(screen.queryByRole('button', { name: /nuevo evento/i })).toBeNull()
  })

  it('pide solo los seis campos sin los que el evento no puede existir', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await findCreatePage()

    for (const name of ['title', 'startsAt', 'endsAt', 'venue', 'location', 'slots']) {
      expect(dialog.querySelector(`[name="${name}"]`)).not.toBeNull()
    }
    // El primer paso es el evento: el precio vive en el paso Venta (con el de
    // lista precargado) y la ventana solo aparece si se programa la apertura.
    expect(dialog.querySelector('[name="pricing.registration"]')).toBeNull()
    expect(dialog.querySelector('[name="registrationOpensAt"]')).toBeNull()
  })

  it('decide la afiliación en el alta, con la consecuencia escrita', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await findCreatePage()

    expect(within(dialog).getByRole('button', { name: /solo afiliados/i })).toBeTruthy()
    expect(dialog.textContent).toContain('afiliación vigente')

    fireEvent.click(within(dialog).getByRole('button', { name: /sin afiliación/i }))
    expect(dialog.textContent).toContain('sin afiliación')
  })

  it('no envía nada si falta un campo obligatorio', async () => {
    const onSaveEvent = vi.fn()
    renderEvents({ onSaveEvent })
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await findCreatePage()

    // El alta es guiada: el primer paso no deja avanzar incompleto.
    fireEvent.click(within(dialog).getByRole('button', { name: /^siguiente/i }))

    await waitFor(() => expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0))
    expect(onSaveEvent).not.toHaveBeenCalled()
  })

  it('crea el evento con acceso abierto cuando se elige así', async () => {
    const onSaveEvent = vi.fn(async () => ({ event: EVENT, events: [EVENT] }))
    renderEvents({ onSaveEvent })
    fireEvent.click(screen.getByRole('button', { name: /nuevo evento/i }))
    const dialog = await findCreatePage()

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
    fireEvent.click(within(dialog).getByRole('button', { name: /sin afiliación/i }))

    fireEvent.click(within(dialog).getByRole('button', { name: /^siguiente/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /^siguiente/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /crear evento/i }))

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
    const quick = await findCreatePage()

    fireEvent.change(quick.querySelector('[name="title"]'), {
      target: { value: 'Copa Norte' },
    })
    fireEvent.click(within(quick).getByRole('button', { name: /editor completo/i }))

    // El editor largo se reconoce por sus tabs: el alta rápida no tiene.
    const editor = await screen.findByRole('dialog', { name: /nuevo evento/i })
    expect(within(editor).getByRole('tablist')).toBeTruthy()
    expect(editor.querySelector('[name="title"]')?.value).toBe('Copa Norte')
  })

  it('cambia el acceso del meet con el Guardar del editor, sin upsert ni barra pending', async () => {
    const onSaveEvent = vi.fn(async () => ({ event: EVENT, events: [EVENT] }))
    const onSetEventState = vi.fn(async () => ({
      event: { ...EVENT, status: 'cerrado' },
      events: [{ ...EVENT, status: 'cerrado' }],
    }))
    renderEvents({ onSaveEvent, onSetEventState })
    workspace()

    fireEvent.click(
      // El estado de la inscripción se maneja desde el control de venta; el
      // acceso sigue en Datos y se guarda con el "Guardar" del editor.
      [...document.querySelectorAll('.admin-event-state__option')].find((option) =>
        /^sin afiliación$/i.test(option.textContent ?? ''),
      ),
    )

    expect(onSetEventState).not.toHaveBeenCalled()
    expect(document.querySelector('.admin-event-state__pending')).toBeNull()

    const save = screen.getByRole('button', { name: /guardar cambios/i })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    await waitFor(() => expect(onSetEventState).toHaveBeenCalledTimes(1))
    expect(onSetEventState).toHaveBeenCalledWith('pitbull-classic-2026', {
      requiresMembership: false,
    })
    expect(onSaveEvent).not.toHaveBeenCalled()
  })
})
