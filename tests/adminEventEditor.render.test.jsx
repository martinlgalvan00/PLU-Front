import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import AdminEventEditor from '../src/components/admin/AdminEventEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'
import { invalidatePlatformPaymentChannels } from '../src/hooks/usePlatformPaymentChannels.js'

/**
 * La matriz del evento se dibuja contra la de plataforma, así que el panel la
 * lee. Por defecto el doble la entrega toda abierta —el caso en que "heredar"
 * y "todo tildado" coinciden—; los tests de apertura la cierran celda a celda.
 */
const platformDouble = vi.hoisted(() => ({ closed: new Set() }))

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      checkoutEnabled: true,
      environmentHolds: [],
      paymentChannels: Object.fromEntries(
        original.PAYMENT_CONCEPTS.map((concept) => [
          concept,
          Object.fromEntries(
            original.PAYMENT_CHANNELS.map((channel) => [
              channel,
              !platformDouble.closed.has(`${concept}:${channel}`),
            ]),
          ),
        ]),
      ),
    })),
  }
})

/**
 * Render real del editor (jsdom). Complementa a eventAdminService.test.js, que
 * cubre la lógica pura: acá se verifica que la reestructuración del editor
 * llegue efectivamente al DOM — tabs editoriales, cierres visibles en Ventas,
 * y avisos de consistencia en Publicación.
 */
beforeAll(() => {
  // jsdom no implementa IntersectionObserver, que el editor usa para resaltar
  // la sección activa en la navegación. El mock dispara la intersección al
  // observar: si queda inerte, los AnimatedNumber del resto de la suite
  // (mismo worker) quedan congelados en el valor inicial.
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

afterEach(() => {
  platformDouble.closed.clear()
  invalidatePlatformPaymentChannels()
  // Sin cleanup cada render se acumula en el body y aparecen tablists/dialogs
  // duplicados (mismo patrón que adminAuditSection.test.jsx).
  cleanup()
})

function renderEditor(overrides = {}, { sourceEvent = null, onChange = () => {} } = {}) {
  const draft = buildAdminEventDraft({
    id: 'evt-1',
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    status: 'inscripcion_abierta',
    slots: 120,
    startsAt: '2026-09-15T12:00:00.000Z',
    endsAt: '2026-09-15T23:00:00.000Z',
    pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
    ...overrides,
  })

  return render(
    <I18nProvider>
      <AdminEventEditor
        canEdit
        canManageUsers={false}
        draft={draft}
        sourceEvent={sourceEvent}
        onCancel={() => {}}
        onChange={onChange}
        onListSecurityUsers={async () => []}
        onSubmit={() => {}}
      />
    </I18nProvider>,
  )
}

function editorTablist() {
  return screen.getByRole('tablist', { name: /secciones del detalle/i })
}

function activateEditorTab(name) {
  fireEvent.click(within(editorTablist()).getByRole('tab', { name }))
}

/**
 * Los capítulos de Ventas y cupos llevan su dato al lado del nombre —
 * "Entradas · 4 tipos"—, así que se buscan dentro de su propia tira y por
 * prefijo: el nombre accesible ya no es sólo la etiqueta.
 */
function salesChapter(name) {
  const nav = screen.getByRole('tablist', { name: /capítulos de ventas y cupos/i })
  return within(nav).getByRole('tab', { name })
}

describe('AdminEventEditor — estructura del formulario', () => {
  it('muestra solo las secciones que se guardan con el evento', () => {
    renderEditor()
    const items = within(editorTablist()).getAllByRole('tab')

    // Grilla y zonas de seguridad salieron del editor: viven en la consola del
    // evento, guardan por su cuenta y no pasan por el upsert que reescribe días,
    // tandas y tipos de entrada. Lo que queda es lo que sí viaja en el draft.
    expect(items.map((item) => item.textContent)).toEqual([
      'Datos',
      'Ventas y cupos',
      'Publicación',
    ])
  })

  it('expone inicio y fin como única fuente de fecha, sin un campo "Fecha" aparte', () => {
    renderEditor()
    const basics = within(
      screen.getByRole('dialog', { name: /pitbull classic/i }),
    ).getByRole('tabpanel', { name: /^datos$/i })

    expect(basics.querySelector('[name="startsAt"]')).not.toBeNull()
    expect(basics.querySelector('[name="endsAt"]')).not.toBeNull()
    expect(document.querySelector('[name="dateISO"]')).toBeNull()
    expect(within(basics).getByRole('group', { name: /cuándo/i })).toBeTruthy()
    expect(within(basics).getByRole('group', { name: /^lugar$/i })).toBeTruthy()
  })

  // El motivo del rediseño: las dos palancas de cierre estaban a distinta
  // profundidad y una ni figuraba en la navegación.
  it('deja los dos cierres a un clic de capítulo, sin desplegables', () => {
    renderEditor()
    activateEditorTab(/ventas y cupos/i)

    const athleteIds = ['#event-reg-opens', '#event-reg-closes']
    for (const id of athleteIds) {
      const field = document.querySelector(id)
      expect(field).not.toBeNull()
      expect(field.closest('details')).toBeNull()
      expect(field.closest('[hidden]')).toBeNull()
    }

    fireEvent.click(salesChapter(/^entradas/i))

    const ticketIds = ['#event-ticket-opens', '#event-ticket-closes']
    for (const id of ticketIds) {
      const field = document.querySelector(id)
      expect(field).not.toBeNull()
      expect(field.closest('details')).toBeNull()
      expect(field.closest('[hidden]')).toBeNull()
    }

    const labels = [...athleteIds, ...ticketIds].map(
      (id) => document.querySelector(`label[for="${id.slice(1)}"] span`)?.textContent,
    )

    expect(labels.filter(Boolean).length).toBe(4)
    expect(new Set(labels).size).toBe(4)

    expect(document.querySelector('#event-section-sales .admin-event-form__ticket-config')).not.toBeNull()
    expect(screen.getByRole('button', { name: /agregar día/i })).toBeTruthy()
  })

  it('en Cupo permite publicar u ocultar la ocupación del sitio', () => {
    const onChange = vi.fn()
    renderEditor({ capacityProgressPublic: true }, { onChange })
    activateEditorTab(/ventas y cupos/i)

    const toggle = document.querySelector('#event-capacity-progress-public')
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.disabled).toBe(false)
    expect(toggle.closest('[hidden]')).toBeNull()
    expect(toggle.closest('.admin-event-form__cupo')?.querySelector('#event-slots')).not.toBeNull()

    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)[0].capacityProgressPublic).toBe(false)
  })

  it('en Cupo permite ocultar el número total sin apagar la ocupación', () => {
    const onChange = vi.fn()
    renderEditor({ capacityProgressPublic: true, capacityTotalPublic: true }, { onChange })
    activateEditorTab(/ventas y cupos/i)

    const totalToggle = document.querySelector('#event-capacity-total-public')
    expect(totalToggle).not.toBeNull()
    expect(totalToggle.getAttribute('aria-checked')).toBe('true')
    expect(totalToggle.disabled).toBe(false)
    expect(totalToggle.textContent).toMatch(/solo oculta el total/i)

    fireEvent.click(totalToggle)
    expect(onChange.mock.calls.at(-1)[0].capacityTotalPublic).toBe(false)
    expect(onChange.mock.calls.at(-1)[0].capacityProgressPublic).not.toBe(false)
  })

  it('el preview sin total muestra anotados y restantes, no el máximo', () => {
    renderEditor(
      { capacityProgressPublic: true, capacityTotalPublic: false, slots: 200 },
      { sourceEvent: { registered: 76 } },
    )
    activateEditorTab(/ventas y cupos/i)

    const preview = document.querySelector('.admin-event-form__cupo-preview')
    expect(preview?.textContent).toMatch(/76 anotados/i)
    expect(preview?.textContent).toMatch(/quedan 124/i)
    expect(preview?.textContent ?? '').not.toMatch(/\/\s*200/)
    expect(preview?.textContent ?? '').not.toMatch(/\b200\b/)
    expect(document.querySelector('.admin-event-form__occupancy-value')?.textContent).toMatch(
      /76\/200/,
    )
  })

  it('en Cupo el número total se puede apagar aunque la ocupación pública esté apagada', () => {
    const onChange = vi.fn()
    renderEditor({ capacityProgressPublic: false, capacityTotalPublic: true }, { onChange })
    activateEditorTab(/ventas y cupos/i)

    const progressToggle = document.querySelector('#event-capacity-progress-public')
    const totalToggle = document.querySelector('#event-capacity-total-public')
    expect(progressToggle.getAttribute('aria-checked')).toBe('false')
    expect(totalToggle.disabled).toBe(false)
    expect(totalToggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(totalToggle)
    expect(onChange.mock.calls.at(-1)[0].capacityTotalPublic).toBe(false)
  })

  it('en el acordeón de Ventas el interruptor de ocupación sigue visible', () => {
    const draft = buildAdminEventDraft({
      id: 'evt-1',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'inscripcion_abierta',
      slots: 120,
      startsAt: '2026-09-15T12:00:00.000Z',
      endsAt: '2026-09-15T23:00:00.000Z',
      pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
    })

    render(
      <I18nProvider>
        <AdminEventEditor
          accordion
          canEdit
          draft={draft}
          forcedTab="sales"
          onCancel={() => {}}
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </I18nProvider>,
    )

    const toggle = document.querySelector('#event-capacity-progress-public')
    expect(toggle).not.toBeNull()
    expect(toggle.closest('[hidden]')).toBeNull()
    expect(toggle.closest('.admin-event-form__cupo')?.querySelector('#event-slots')).not.toBeNull()
  })

  it('en Ventas muestra el día antes que el mes', () => {
    renderEditor({
      registrationOpensAt: '2026-09-03T07:48:00.000Z',
      registrationClosesAt: '2026-09-03T10:00:00.000Z',
    })
    activateEditorTab(/ventas y cupos/i)

    expect(document.querySelector('#event-reg-opens')?.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    const [day, month] = document.querySelector('#event-reg-opens').value.split('/')
    // 3 de septiembre, no 9 de marzo.
    expect(Number(month)).toBe(9)
    expect(Number(day)).toBe(3)
  })

  it('agrupa el cupo de atletas junto a su ventana de inscripción', () => {
    renderEditor()
    activateEditorTab(/ventas y cupos/i)
    const lane = document.querySelector('#event-section-sales .admin-event-form__lane')

    expect(lane.querySelector('[name="slots"]')).not.toBeNull()
    expect(lane.querySelector('.admin-event-form__occupancy')).not.toBeNull()
    expect(lane.querySelector('.admin-event-form__occupancy-value')).not.toBeNull()
    expect(lane.querySelector('#event-reg-closes')).not.toBeNull()
  })
})

describe('AdminEventEditor — avisos de consistencia', () => {
  it('no muestra avisos cuando el estado coincide con la configuración', () => {
    renderEditor({ registrationClosesAt: '2099-01-01T00:00:00.000Z' })
    activateEditorTab(/publicación/i)

    expect(screen.queryByText(/el estado público no coincide/i)).toBeNull()
  })

  it('avisa cuando el cupo está lleno y el estado sigue en inscripción abierta', () => {
    renderEditor({}, { sourceEvent: { registered: 120, slots: 120 } })
    activateEditorTab(/publicación/i)

    expect(screen.getByText(/el estado público no coincide/i)).toBeDefined()
    expect(screen.getByText(/no quedan cupos/i)).toBeDefined()
  })

  it('avisa cuando la inscripción figura abierta con la ventana ya vencida', () => {
    renderEditor({ registrationClosesAt: '2020-01-01T00:00:00.000Z' })
    activateEditorTab(/publicación/i)

    expect(screen.getByText(/la fecha de cierre ya pasó/i)).toBeDefined()
  })
})


/**
 * Acceso al meet: el requisito de afiliación decide quién puede inscribirse y
 * quién pasa la puerta (`src/lib/gateAccess.js`). Antes vivía en un checkbox
 * cuya etiqueta era una afirmación —"Requiere afiliación activa"—, así que para
 * saber el estado había que interpretar la casilla, y nada decía qué pasaba en
 * la puerta.
 */
describe('AdminEventEditor — acceso al meet', () => {
  it('presenta el requisito como dos opciones excluyentes, no como casilla', () => {
    renderEditor()
    activateEditorTab(/publicación/i)

    const group = document.querySelector('.admin-event-form__access')
    expect(group).not.toBeNull()

    const chips = [...group.querySelectorAll('.admin-filter-chip')].map((chip) =>
      chip.textContent.trim(),
    )
    expect(chips).toEqual(['Solo afiliados', 'Sin afiliación'])
    // El default del negocio: un meet pide afiliación salvo que se diga lo
    // contrario (eventAdminService normaliza `requiresMembership !== false`).
    expect(
      group.querySelector('.admin-filter-chip.is-active, .admin-filter-chip[aria-pressed="true"]')
        .textContent,
    ).toContain('Solo afiliados')

    expect(screen.queryByText(/requiere afiliación activa/i)).toBeNull()
  })

  it('escribe la consecuencia real de cada opción', () => {
    renderEditor()
    activateEditorTab(/publicación/i)

    expect(document.querySelector('.admin-event-form__access-note').textContent).toMatch(
      /en la puerta un inscripto sin afiliación queda bloqueado/i,
    )

    cleanup()
    renderEditor({ requiresMembership: false })
    activateEditorTab(/publicación/i)

    expect(document.querySelector('.admin-event-form__access-note').textContent).toMatch(
      /alcanza con la inscripción confirmada/i,
    )
  })

  it('propaga el cambio al draft sin tocar nada más', () => {
    const onChange = vi.fn()
    renderEditor({}, { onChange })
    activateEditorTab(/publicación/i)

    const group = document.querySelector('.admin-event-form__access')
    fireEvent.click(
      [...group.querySelectorAll('.admin-filter-chip')].find((chip) =>
        /sin afiliación/i.test(chip.textContent),
      ),
    )

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatchObject({
      requiresMembership: false,
      slug: 'pitbull-classic-2026',
      status: 'inscripcion_abierta',
    })
  })
})

/**
 * Regresión: prender la venta de entradas sin ningún tipo vendible bloquea el
 * guardado, y el motivo llega como clave de raíz (`ticketTypes`, `eventDays`),
 * sin un input al que colgar el error. Antes eso mandaba al operador a Datos
 * -- otra pestaña, sin nada marcado -- y el mensaje no se mostraba en ningún
 * lado: el botón Guardar parecía no hacer nada.
 */
describe('AdminEventEditor — venta de entradas bloqueada', () => {
  function renderTicketsDraft(overrides = {}) {
    const draft = buildAdminEventDraft({
      id: 'evt-9',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'inscripcion_abierta',
      slots: 120,
      startsAt: '2026-09-15T12:00:00.000Z',
      endsAt: '2026-09-15T23:00:00.000Z',
      pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
      eventDays: [{ dayIndex: 0, label: 'Sábado' }],
      ticketTypes: [],
      ...overrides,
    })

    return render(
      <I18nProvider>
        <AdminEventEditor
          canEdit
          canManageUsers={false}
          // Distinta de la firma del draft: sin `dirty` el editor ni valida.
          baselineSignature="baseline-vieja"
          draft={draft}
          sourceEvent={null}
          onCancel={() => {}}
          onChange={() => {}}
          onListSecurityUsers={async () => []}
          onSubmit={() => {}}
        />
      </I18nProvider>,
    )
  }

  function save() {
    fireEvent.submit(document.querySelector('form.admin-event-form'))
  }

  it('muestra el motivo dentro del capítulo Entradas', () => {
    renderTicketsDraft()
    save()

    const alert = document.querySelector('[data-field="ticketTypes"]')
    expect(alert).not.toBeNull()
    expect(alert.textContent).toMatch(/al menos un tipo activo con precio/i)
    // Visible de verdad: no adentro del panel oculto de otro capítulo.
    expect(alert.closest('[hidden]')).toBeNull()
  })

  it('no rebota a Datos: deja abierta la sección donde está el problema', () => {
    renderTicketsDraft()
    save()

    const sales = within(editorTablist()).getByRole('tab', { name: /ventas y cupos/i })
    expect(sales.getAttribute('aria-selected')).toBe('true')
    expect(salesChapter(/^entradas/i).getAttribute('aria-selected')).toBe('true')
  })

  it('hace lo mismo cuando lo que falta son las jornadas', () => {
    renderTicketsDraft({ eventDays: [] })
    save()

    const alert = document.querySelector('[data-field="eventDays"]')
    expect(alert).not.toBeNull()
    expect(alert.textContent).toMatch(/al menos un día del evento/i)
    expect(alert.closest('[hidden]')).toBeNull()
  })
})

/**
 * Los medios de cobro del evento eran un solo juego de interruptores para todo:
 * cerrar el efectivo para entradas lo cerraba también para la inscripción de
 * atletas. Ahora es una matriz medio × concepto.
 */
describe('AdminEventEditor — medios de cobro por concepto', () => {
  function openPaymentChapter() {
    activateEditorTab(/ventas y cupos/i)
    fireEvent.click(salesChapter(/^cobro/i))
  }

  /** La matriz se bloquea hasta leer la plataforma: se espera a que habilite. */
  async function platformMatrix() {
    const matrix = screen.getByRole('group', { name: /medios de pago por concepto/i })
    await waitFor(() => expect(matrix.getAttribute('aria-busy')).toBeNull())
    return matrix
  }

  it('sin override muestra la matriz de la plataforma, con los ocho medios abiertos', async () => {
    renderEditor()
    openPaymentChapter()

    const matrix = await platformMatrix()
    const boxes = within(matrix).getAllByRole('checkbox')
    expect(boxes).toHaveLength(8)
    expect(boxes.every((box) => box.checked)).toBe(true)
    // Heredar no es una decisión guardada: sin override no hay nada que
    // devolver a los medios de la plataforma.
    expect(screen.queryByRole('button', { name: /volver a los medios de la plataforma/i })).toBeNull()
  })

  it('destildar un medio guarda solo esa celda y deja el resto heredando', async () => {
    const onChange = vi.fn()
    renderEditor({}, { onChange })
    openPaymentChapter()

    const matrix = await platformMatrix()
    fireEvent.click(within(matrix).getByRole('checkbox', { name: /efectivo en el lugar · entradas/i }))

    // Sólo se guarda lo que difiere de la plataforma: cerrar una celda no
    // escribe las otras siete.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].paymentChannelOverrides).toEqual({
      ticket: { cash_pitbull: false },
    })
  })

  it('con el efectivo abierto pide dónde se paga y muestra la sede como respaldo', async () => {
    const onChange = vi.fn()
    renderEditor({}, { onChange })
    openPaymentChapter()
    await platformMatrix()

    const place = screen.getByLabelText(/^dónde se paga/i)
    expect(place.placeholder).toBe('Maximal Strength Club · Buenos Aires')
    expect(screen.getByText(/vacío = la sede del evento: maximal strength club/i)).toBeTruthy()
    expect(screen.getByText(/sede del evento \(no cargaste un lugar propio\)/i)).toBeTruthy()
    expect(screen.queryByText(/efectivo está cerrado en este evento/i)).toBeNull()

    fireEvent.change(place, { target: { value: 'Recepción del gimnasio' } })
    expect(onChange.mock.calls.at(-1)[0].cashPayment).toEqual({
      place: 'Recepción del gimnasio',
      notes: '',
    })
  })

  it('resume el destino que verá quien paga antes de guardar', async () => {
    renderEditor({ bankTransfer: { alias: 'pitbull.clasico', cbu: '', holder: '' } })
    openPaymentChapter()
    await platformMatrix()

    // El estado vive en la fila de cada medio, junto a sus interruptores.
    expect(screen.getByText(/medios ofrecidos/i)).toBeTruthy()
    expect(screen.getByText('Alias: pitbull.clasico')).toBeTruthy()
    expect(screen.getByText('Lugar: Maximal Strength Club · Buenos Aires')).toBeTruthy()
    expect(screen.getByText('Cuenta general de la plataforma.')).toBeTruthy()
  })

  it('con el efectivo cerrado no muestra el bloque de lugar', async () => {
    renderEditor({
      paymentChannelOverrides: {
        registration: { cash_pitbull: false },
        ticket: { cash_pitbull: false },
      },
    })
    openPaymentChapter()
    await platformMatrix()

    expect(screen.queryByLabelText(/^dónde se paga/i)).toBeNull()
    expect(screen.getByText(/efectivo está cerrado en este evento/i)).toBeTruthy()
  })

  it('con transferencia cerrada indica que hay que abrirla para cargar alias', async () => {
    renderEditor({
      paymentChannelOverrides: {
        registration: { bank_transfer: false },
        ticket: { bank_transfer: false },
      },
    })
    openPaymentChapter()
    await platformMatrix()

    expect(screen.getByText(/transferencia está cerrada en este evento/i)).toBeTruthy()
    expect(screen.queryByLabelText(/alias/i)).toBeNull()
  })

  it('avisa si el efectivo está abierto y no hay sede ni lugar', async () => {
    renderEditor({
      venue: '',
      location: '',
      cashPayment: { place: '', notes: '' },
    })
    openPaymentChapter()
    await platformMatrix()

    expect(screen.getByText(/no hay lugar ni sede/i)).toBeTruthy()
  })

  it('abre un medio que la plataforma tiene cerrado, solo para este evento', async () => {
    platformDouble.closed.add('registration:bank_transfer')
    const onChange = vi.fn()
    renderEditor({}, { onChange })
    openPaymentChapter()

    const matrix = await platformMatrix()
    const box = within(matrix).getByRole('checkbox', { name: /transferencia · inscripción/i })
    expect(box.checked).toBe(false)

    fireEvent.click(box)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].paymentChannelOverrides).toEqual({
      registration: { bank_transfer: 'open' },
    })
  })

  it('muestra lo que el evento abre y avisa que es solo acá', async () => {
    platformDouble.closed.add('registration:cash_pitbull')
    renderEditor({ paymentChannelOverrides: { registration: { cash_pitbull: 'open' } } })
    openPaymentChapter()

    const matrix = await platformMatrix()
    expect(
      within(matrix).getByRole('checkbox', { name: /efectivo en el lugar · inscripción/i }).checked,
    ).toBe(true)
    expect(within(matrix).getByText(/abierto solo en este evento \(inscripción\)/i)).toBeTruthy()
  })

  it('volver a coincidir con la plataforma borra la decisión del evento', async () => {
    platformDouble.closed.add('registration:bank_transfer')
    const onChange = vi.fn()
    renderEditor(
      { paymentChannelOverrides: { registration: { bank_transfer: 'open' } } },
      { onChange },
    )
    openPaymentChapter()

    const matrix = await platformMatrix()
    fireEvent.click(within(matrix).getByRole('checkbox', { name: /transferencia · inscripción/i }))

    expect(onChange.mock.calls[0][0].paymentChannelOverrides).toBeNull()
  })

  it('muestra lo que el evento abre y avisa que es solo acá', async () => {
    platformDouble.closed.add('registration:cash_pitbull')
    renderEditor({ paymentChannelOverrides: { registration: { cash_pitbull: 'open' } } })
    openPaymentChapter()

    const matrix = await platformMatrix()
    expect(
      within(matrix).getByRole('checkbox', { name: /efectivo en el lugar · inscripción/i }).checked,
    ).toBe(true)
    expect(within(matrix).getByText(/abierto solo en este evento \(inscripción\)/i)).toBeTruthy()
  })

  it('volver a coincidir con la plataforma borra la decisión del evento', async () => {
    platformDouble.closed.add('registration:bank_transfer')
    const onChange = vi.fn()
    renderEditor(
      { paymentChannelOverrides: { registration: { bank_transfer: 'open' } } },
      { onChange },
    )
    openPaymentChapter()

    const matrix = await platformMatrix()
    fireEvent.click(within(matrix).getByRole('checkbox', { name: /transferencia · inscripción/i }))

    expect(onChange.mock.calls[0][0].paymentChannelOverrides).toBeNull()
  })

  it('con override ofrece volver a heredar la matriz de plataforma', () => {
    const onChange = vi.fn()
    renderEditor({ paymentChannelOverrides: { ticket: { cash_pitbull: false } } }, { onChange })
    openPaymentChapter()

    fireEvent.click(screen.getByRole('button', { name: /volver a los medios de la plataforma/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].paymentChannelOverrides).toBeNull()
  })

  it('cierra un medio solo para entradas, sin tocar la inscripción', () => {
    const onChange = vi.fn()
    renderEditor(
      {
        paymentChannelOverrides: {
          registration: { cash_pitbull: true },
          ticket: { cash_pitbull: true },
        },
      },
      { onChange },
    )
    openPaymentChapter()

    const matrix = screen.getByRole('group', { name: /medios de pago por concepto/i })
    expect(within(matrix).getAllByRole('checkbox')).toHaveLength(8)

    fireEvent.click(
      within(matrix).getByRole('checkbox', { name: /efectivo en el lugar · entradas/i }),
    )

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].paymentChannelOverrides).toEqual({
      registration: { cash_pitbull: true },
      ticket: { cash_pitbull: false },
    })
  })

  it('lee la forma plana vieja como "lo mismo para los dos"', () => {
    renderEditor({ paymentChannelOverrides: { cash_pitbull: false } })
    openPaymentChapter()

    const matrix = screen.getByRole('group', { name: /medios de pago por concepto/i })
    expect(
      within(matrix).getByRole('checkbox', { name: /efectivo en el lugar · inscripción/i }).checked,
    ).toBe(false)
    expect(
      within(matrix).getByRole('checkbox', { name: /efectivo en el lugar · entradas/i }).checked,
    ).toBe(false)
    expect(
      within(matrix).getByRole('checkbox', { name: /mercado pago · entradas/i }).checked,
    ).toBe(true)
  })

  it('en Precios ofrece programar un cambio con el contrato de Tarifas', () => {
    const onSetEventRegistrationPrice = vi.fn(async () => ({}))
    const draft = buildAdminEventDraft({
      id: 'evt-1',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'inscripcion_abierta',
      slots: 120,
      startsAt: '2026-09-15T12:00:00.000Z',
      endsAt: '2026-09-15T23:00:00.000Z',
      pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
    })

    render(
      <I18nProvider>
        <AdminEventEditor
          accordion
          canEdit
          draft={draft}
          forcedTab="sales"
          forcedChapter="prices"
          sourceEvent={{
            ...draft,
            price: 75000,
            scheduledPrice: null,
            priceEffectiveAt: null,
          }}
          onCancel={() => {}}
          onChange={() => {}}
          onSetEventRegistrationPrice={onSetEventRegistrationPrice}
          onSubmit={() => {}}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: /programar un cambio/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /programar un cambio/i }))
    expect(screen.getByLabelText(/rige desde/i)).toBeTruthy()
    expect(onSetEventRegistrationPrice).not.toHaveBeenCalled()
  })
})

describe('AdminEventEditor — alta de un evento nuevo', () => {
  function renderNewEvent() {
    return renderEditor({ id: null, pricing: { registration: 75000, ticketsEnabled: false } })
  }

  it('no ofrece Entradas ni diagnostica la venta cuando todavía no hay evento', () => {
    renderNewEvent()
    activateEditorTab(/ventas y cupos/i)
    const nav = screen.getByRole('tablist', { name: /capítulos de ventas y cupos/i })
    expect(within(nav).queryByRole('tab', { name: /entradas/i })).toBeNull()
    expect(within(nav).getByRole('tab', { name: /cupo/i })).toBeTruthy()
    expect(within(nav).getByRole('tab', { name: /cobro/i })).toBeTruthy()
    expect(screen.queryByText(/la venta está cerrada/i)).toBeNull()
  })

  it('un evento existente conserva el capítulo Entradas', () => {
    renderEditor()
    activateEditorTab(/ventas y cupos/i)
    expect(salesChapter(/entradas/i)).toBeTruthy()
  })
})

describe('AdminEventEditor — Publicación con bloque Avanzado', () => {
  const advancedSummary = () => screen.getByText(/textos de la página, módulos y transmisión/i)

  it('deja estado, publicación y acceso arriba y lo demás colapsado', () => {
    // Meet genérico (no editorial): el bloque Avanzado arranca cerrado.
    renderEditor({
      slug: 'winter-open-2026',
      landing: { templateId: 'meet', slots: {} },
      publicCopy: {},
    })
    activateEditorTab(/publicación/i)
    const advanced = advancedSummary().closest('details')
    expect(advanced.open).toBe(false)
    const panel = screen.getByRole('tabpanel', { name: /publicación/i })
    const toggles = [...panel.querySelectorAll('.admin-event-form__toggle, .admin-event-form__access')]
    const firstAdvanced = advanced.compareDocumentPosition(toggles[0])
    // El primer control de decisión queda antes del desplegable.
    expect(firstAdvanced & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(advanced.contains(document.getElementById('event-landing-heroTitle'))).toBe(true)
    expect(advanced.contains(document.getElementById('event-live-url'))).toBe(true)
    expect(advanced.contains(document.getElementById('event-access'))).toBe(false)
  })

  it('arranca abierto si el evento ya trae textos públicos cargados', () => {
    renderEditor({ publicCopy: { heroLead: 'Tres días de fierro' } })
    activateEditorTab(/publicación/i)
    expect(advancedSummary().closest('details').open).toBe(true)
  })
})

describe('AdminEventEditor — landing por secciones', () => {
  function openLanding(overrides = {}, options) {
    renderEditor(
      { slug: 'winter-open-2026', landing: { templateId: 'meet', slots: {} }, ...overrides },
      options,
    )
    activateEditorTab(/publicación/i)
    // Avanzado arranca cerrado en un meet genérico: abrirlo como lo haría el staff.
    const advanced = screen.getByText(/textos de la página, módulos y transmisión/i).closest('details')
    advanced.open = true
    return within(screen.getByRole('group', { name: /secciones de la página/i }))
  }

  it('cada sección con interruptor lleva sus textos al lado', () => {
    const sections = openLanding()
    const faq = sections.getByRole('checkbox', { name: /faq/i }).closest('li')

    expect(faq.contains(document.getElementById('event-landing-faq1Question'))).toBe(true)
    expect(faq.contains(document.getElementById('event-landing-faq3Answer'))).toBe(true)
  })

  it('portada e inscripción son siempre visibles: sin interruptor', () => {
    const sections = openLanding()
    const hero = sections.getByText(/^portada$/i).closest('li')
    const inscription = sections.getByText(/cupo e inscripción/i).closest('li')

    expect(hero.querySelector('input[type="checkbox"]')).toBeNull()
    expect(inscription.querySelector('input[type="checkbox"]:not([id*="capacity"])')).toBeNull()
    expect(hero.contains(document.getElementById('event-landing-heroTitle'))).toBe(true)
    expect(inscription.contains(document.getElementById('event-inscription-mark'))).toBe(true)
  })

  it('apagar una sección actualiza publicSurface y conserva sus textos', () => {
    const onChange = vi.fn()
    const sections = openLanding(
      { landing: { templateId: 'meet', slots: { faq1Question: '¿Hay pesaje?', faq1Answer: 'Sí.' } } },
      { onChange },
    )

    fireEvent.click(sections.getByRole('checkbox', { name: /faq/i }))

    const next = onChange.mock.calls.at(-1)[0]
    expect(next.publicSurface.faq).toBe(false)
    expect(next.landing.slots.faq1Question).toBe('¿Hay pesaje?')
    expect(next.landing.slots.faq1Answer).toBe('Sí.')
  })

  it('la ficha meet no ofrece secciones de landing propia; editorial sí', () => {
    const meet = openLanding()
    expect(meet.queryByRole('checkbox', { name: /experiencia/i })).toBeNull()
    expect(meet.queryByRole('checkbox', { name: /categorías/i })).toBeNull()
    cleanup()

    const editorial = openLanding({ landing: { templateId: 'editorial', slots: {} } })
    expect(editorial.getByRole('checkbox', { name: /experiencia/i })).toBeTruthy()
    expect(editorial.getByRole('checkbox', { name: /categorías/i })).toBeTruthy()
    expect(editorial.getByRole('checkbox', { name: /lugar/i })).toBeTruthy()
  })

  it('una sección oculta lo avisa en su resumen', () => {
    const sections = openLanding({ publicSurface: { faq: false } })
    const faq = sections.getByRole('checkbox', { name: /faq/i })

    expect(faq.checked).toBe(false)
    expect(faq.closest('li').textContent).toMatch(/oculta en el sitio/i)
  })
})

/** Editor con estado: lo tipeado vuelve como `draft`, igual que en el panel. */
function StatefulEditor({ initial, onSnapshot = () => {} }) {
  const [draft, setDraft] = useState(initial)
  return (
    <I18nProvider>
      <AdminEventEditor
        canEdit
        canManageUsers={false}
        draft={draft}
        sourceEvent={null}
        onCancel={() => {}}
        onChange={(next) => {
          setDraft(next)
          onSnapshot(next)
        }}
        onListSecurityUsers={async () => []}
        onSubmit={() => {}}
      />
    </I18nProvider>
  )
}

function typeInto(element, text) {
  let value = ''
  for (const char of text) {
    value += char
    fireEvent.change(element, { target: { value } })
  }
}

describe('AdminEventEditor — escribir en la landing', () => {
  function openStateful(landing) {
    const initial = buildAdminEventDraft({
      id: 'evt-1',
      slug: 'winter-open-2026',
      title: 'Winter Open',
      venue: 'Sede',
      location: 'Ciudad',
      status: 'inscripcion_abierta',
      slots: 100,
      startsAt: '2026-09-15T12:00:00.000Z',
      endsAt: '2026-09-15T23:00:00.000Z',
      pricing: { membership: 1, registration: 1, combo: 1, ticketsEnabled: true },
      landing,
    })
    const snapshots = []
    render(<StatefulEditor initial={initial} onSnapshot={(next) => snapshots.push(next)} />)
    activateEditorTab(/publicación/i)
    screen.getByText(/textos de la página, módulos y transmisión/i).closest('details').open = true
    return snapshots
  }

  it('se pueden escribir varias palabras: los espacios no se pierden al tipear', () => {
    openStateful({ templateId: 'meet', slots: {} })
    const lead = document.getElementById('event-landing-heroLead')

    typeInto(lead, 'uno dos tres')
    expect(lead.value).toBe('uno dos tres')
  })

  it('se puede tipear un link letra por letra en un botón propio', () => {
    openStateful({
      templateId: 'builder',
      slots: {},
      layout: { blocks: [{ id: 'hero', type: 'hero' }, { id: 'cta-1', type: 'cta', props: { label: 'Ir' } }] },
    })
    const href = document.getElementById('event-landing-block-cta-1-href')

    typeInto(href, 'https://plu.com.ar/reglamento')
    expect(href.value).toBe('https://plu.com.ar/reglamento')
    expect(href.getAttribute('aria-invalid')).toBeNull()
  })

  it('marca el link inválido en vez de borrarlo', () => {
    openStateful({
      templateId: 'builder',
      slots: {},
      layout: { blocks: [{ id: 'hero', type: 'hero' }, { id: 'cta-1', type: 'cta', props: { label: 'Ir' } }] },
    })
    const href = document.getElementById('event-landing-block-cta-1-href')

    typeInto(href, 'javascript:alert(1)')
    expect(href.value).toBe('javascript:alert(1)')
    expect(href.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/empiece con https/i)).toBeTruthy()
  })
})

describe('AdminEventEditor — landing Constructor', () => {
  const BLOCKS = [
    { id: 'hero', type: 'hero' },
    { id: 'facts', type: 'facts' },
    { id: 'faq', type: 'faq' },
    { id: 'location', type: 'location' },
  ]

  function openBuilder(landing = {}, overrides = {}, options) {
    renderEditor(
      {
        slug: 'winter-open-2026',
        landing: { templateId: 'builder', slots: {}, layout: { blocks: BLOCKS }, ...landing },
        ...overrides,
      },
      options,
    )
    activateEditorTab(/publicación/i)
    screen
      .getByText(/textos de la página, módulos y transmisión/i)
      .closest('details').open = true
    return within(screen.getByRole('group', { name: /bloques de la página/i }))
  }

  const lastLayout = (onChange) => onChange.mock.calls.at(-1)[0].landing.layout
  const ids = (layout) => layout.blocks.map((block) => block.id)

  it('lista los bloques en orden y la portada no se puede mover ni ocultar', () => {
    const blocks = openBuilder()
    const items = blocks.getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('data-block'))).toEqual([
      'hero',
      'facts',
      'faq',
      'location',
    ])
    expect(within(items[0]).queryByRole('checkbox')).toBeNull()
    // Las flechas de orden se llaman «Subir «bloque»» / «Bajar «bloque»»; la
    // portada tiene "Subir imagen del hero", que no es mover el bloque.
    expect(within(items[0]).queryByRole('button', { name: /^(subir|bajar) «/i })).toBeNull()
  })

  it('sube y baja bloques, sin pasar por encima de la portada', () => {
    const onChange = vi.fn()
    const blocks = openBuilder({}, {}, { onChange })

    expect(blocks.getByRole('button', { name: /subir «fecha y sede»/i }).disabled).toBe(true)
    fireEvent.click(blocks.getByRole('button', { name: /subir «lugar y mapa»/i }))
    expect(ids(lastLayout(onChange))).toEqual(['hero', 'facts', 'location', 'faq'])

    fireEvent.click(blocks.getByRole('button', { name: /bajar «fecha y sede»/i }))
    expect(ids(lastLayout(onChange))).toEqual(['hero', 'faq', 'facts', 'location'])
    expect(blocks.getByRole('button', { name: /bajar «lugar y mapa»/i }).disabled).toBe(true)
  })

  it('ocultar un bloque integrado apaga también su módulo público, en un solo cambio', () => {
    const onChange = vi.fn()
    const blocks = openBuilder({}, {}, { onChange })

    fireEvent.click(blocks.getByRole('checkbox', { name: /preguntas frecuentes/i }))

    const next = onChange.mock.calls.at(-1)[0]
    expect(next.landing.layout.blocks.find((block) => block.id === 'faq').visible).toBe(false)
    expect(next.publicSurface.faq).toBe(false)
  })

  it('un bloque sin módulo público (fecha y sede) solo cambia el layout', () => {
    const onChange = vi.fn()
    const blocks = openBuilder({}, {}, { onChange })

    fireEvent.click(blocks.getByRole('checkbox', { name: /fecha y sede/i }))

    const next = onChange.mock.calls.at(-1)[0]
    expect(next.landing.layout.blocks.find((block) => block.id === 'facts').visible).toBe(false)
  })

  it('agrega bloques propios y los edita; los integrados no se pueden borrar', () => {
    const onChange = vi.fn()
    const blocks = openBuilder({}, {}, { onChange })

    expect(blocks.queryByRole('button', { name: /eliminar «fecha y sede»/i })).toBeNull()
    fireEvent.click(blocks.getByRole('button', { name: /^texto$/i }))
    const layout = lastLayout(onChange)
    expect(layout.blocks.at(-1)).toMatchObject({ id: 'text-1', type: 'text', visible: true })
  })

  it('edita el contenido de un bloque propio y lo puede eliminar', () => {
    const onChange = vi.fn()
    const blocks = openBuilder(
      {
        layout: {
          blocks: [
            ...BLOCKS,
            { id: 'text-1', type: 'text', props: { title: 'Viejo', body: '' } },
          ],
        },
      },
      {},
      { onChange },
    )

    fireEvent.change(document.getElementById('event-landing-block-text-1-title'), {
      target: { value: 'Cómo se compite' },
    })
    expect(
      lastLayout(onChange).blocks.find((block) => block.id === 'text-1').props.title,
    ).toBe('Cómo se compite')

    fireEvent.click(blocks.getByRole('button', { name: /eliminar «texto 1»/i }))
    expect(ids(lastLayout(onChange))).not.toContain('text-1')
  })

  it('cambiar la plantilla a Constructor arma los bloques por defecto', () => {
    const onChange = vi.fn()
    renderEditor(
      { slug: 'winter-open-2026', landing: { templateId: 'meet', slots: {} } },
      { onChange },
    )
    activateEditorTab(/publicación/i)
    screen
      .getByText(/textos de la página, módulos y transmisión/i)
      .closest('details').open = true

    fireEvent.click(screen.getByRole('radio', { name: /^constructor$/i }))
    const next = onChange.mock.calls.at(-1)[0].landing
    expect(next.templateId).toBe('builder')
    expect(next.layout.blocks[0].type).toBe('hero')
    expect(next.layout.blocks.length).toBeGreaterThan(5)
  })

  describe('colores', () => {
    // Sin colores propios el editor arranca plegado bajo "Usar colores propios".
    const palette = () => {
      const toggle = screen.queryByRole('button', { name: /usar colores propios/i })
      if (toggle?.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle)
      return within(screen.getByRole('group', { name: /colores del evento/i }))
    }

    it('guarda un color válido en la paleta y muestra el aviso de contraste', () => {
      const onChange = vi.fn()
      openBuilder({}, {}, { onChange })

      fireEvent.change(palette().getByRole('textbox', { name: /^acento$/i }), {
        target: { value: '#FF8800' },
      })
      expect(lastLayout(onChange).palette).toEqual({ accent: '#ff8800' })
    })

    it('no guarda un hex inválido y lo explica', () => {
      const onChange = vi.fn()
      openBuilder({}, {}, { onChange })
      const before = onChange.mock.calls.length

      fireEvent.change(palette().getByRole('textbox', { name: /^acento$/i }), {
        target: { value: '#ff88' },
      })
      expect(onChange.mock.calls.length).toBe(before)
      expect(palette().getByRole('alert').textContent).toMatch(/hexadecimal/i)
    })

    it('avisa cuando el acento no se distingue del fondo', () => {
      openBuilder({
        layout: { blocks: BLOCKS, palette: { accent: '#101820', background: '#0d0f12' } },
      })
      expect(palette().getByRole('status').textContent).toMatch(/acento casi no se distingue/i)
    })

    it('"Volver al tema" limpia la paleta', () => {
      const onChange = vi.fn()
      openBuilder({ layout: { blocks: BLOCKS, palette: { accent: '#ff8800' } } }, {}, { onChange })

      fireEvent.click(palette().getByRole('button', { name: /volver al tema/i }))
      expect(lastLayout(onChange).palette).toEqual({})
    })
  })

  describe('animaciones', () => {
    const motion = () => within(screen.getByRole('group', { name: /animaciones/i }))

    it('arranca en Suave y explica qué hace la opción elegida', () => {
      openBuilder({ layout: { blocks: BLOCKS } })
      expect(motion().getByRole('button', { name: /^suave$/i }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByText(/fundido corto al llegar a la pantalla/i)).toBeTruthy()
    })

    it('elegir Marcada o Sin animaciones se guarda en el layout', () => {
      const onChange = vi.fn()
      openBuilder({ layout: { blocks: BLOCKS } }, {}, { onChange })

      fireEvent.click(motion().getByRole('button', { name: /^marcada$/i }))
      expect(lastLayout(onChange).motion).toBe('bold')

      fireEvent.click(motion().getByRole('button', { name: /^sin animaciones$/i }))
      expect(lastLayout(onChange).motion).toBe('none')
    })

    it('avisa que el movimiento reducido del visitante manda', () => {
      openBuilder({ layout: { blocks: BLOCKS } })
      expect(screen.getByText(/movimiento reducido/i)).toBeTruthy()
    })
  })
})
