import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import AdminEventEditor from '../src/components/admin/AdminEventEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'

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
  })

  // El motivo del rediseño: las dos palancas de cierre estaban a distinta
  // profundidad y una ni figuraba en la navegación.
  it('deja los dos cierres visibles en Ventas sin abrir ningún desplegable', () => {
    renderEditor()
    activateEditorTab(/ventas y cupos/i)

    const ids = ['#event-reg-opens', '#event-reg-closes', '#event-ticket-opens', '#event-ticket-closes']
    for (const id of ids) {
      const field = document.querySelector(id)
      expect(field).not.toBeNull()
      expect(field.closest('details')).toBeNull()
    }

    // Etiquetas distintas entre sí: cuatro campos "Abre"/"Cierra" en el mismo
    // formulario son indistinguibles para un lector de pantalla.
    const labels = ids.map(
      (id) => document.querySelector(`label[for="${id.slice(1)}"] span`)?.textContent,
    )

    expect(labels.filter(Boolean).length).toBe(4)
    expect(new Set(labels).size).toBe(4)
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
    expect(lane.querySelector('.capacity-widget')).not.toBeNull()
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
    expect(chips).toEqual(['Solo afiliados', 'Abierto'])
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
        /abierto/i.test(chip.textContent),
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
