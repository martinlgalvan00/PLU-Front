import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import AdminEventEditor from '../src/components/admin/AdminEventEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'

/**
 * Render real del editor (jsdom). Complementa a eventAdminService.test.js, que
 * cubre la lógica pura: acá se verifica que la reestructuración del editor
 * llegue efectivamente al DOM — que los dos cierres queden visibles sin abrir
 * ningún <details>, y que las claves de i18n nuevas existan de verdad (un
 * `t()` sin traducción devuelve la clave cruda y este test lo detecta).
 */
beforeAll(() => {
  // jsdom no implementa IntersectionObserver, que el editor usa para resaltar
  // la sección activa en la navegación.
  globalThis.IntersectionObserver ??= class {
    observe() {}
    disconnect() {}
  }
})

function renderEditor(overrides = {}, { sourceEvent = null } = {}) {
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
    pricing: { membership: 38000, registration: 45000, combo: 78000, ticketsEnabled: true },
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
        onChange={() => {}}
        onListSecurityUsers={async () => []}
        onSubmit={() => {}}
      />
    </I18nProvider>,
  )
}

describe('AdminEventEditor — estructura del formulario', () => {
  it('muestra las cuatro secciones numeradas, sin bloques huérfanos', () => {
    renderEditor()
    const nav = screen.getByRole('navigation', { name: /secciones del editor/i })
    const items = within(nav).getAllByRole('button')

    expect(items.map((item) => item.textContent)).toEqual([
      '1Datos',
      '2Ventas y cupos',
      '3Publicación',
      '4Operación',
    ])
  })

  it('expone inicio y fin como única fuente de fecha, sin un campo "Fecha" aparte', () => {
    renderEditor()
    const basics = document.querySelector('#event-section-basics').closest('section')

    expect(basics.querySelector('[name="startsAt"]')).not.toBeNull()
    expect(basics.querySelector('[name="endsAt"]')).not.toBeNull()
    expect(document.querySelector('[name="dateISO"]')).toBeNull()
  })

  // El motivo del rediseño: las dos palancas de cierre estaban a distinta
  // profundidad y una ni figuraba en la navegación.
  it('deja los dos cierres visibles sin abrir ningún desplegable', () => {
    renderEditor()

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
    expect(new Set(labels).size).toBe(ids.length)
  })

  it('agrupa el cupo de atletas junto a su ventana de inscripción', () => {
    renderEditor()
    const lane = document.querySelector('#event-section-sales .admin-event-form__lane')

    expect(lane.querySelector('[name="slots"]')).not.toBeNull()
    expect(lane.querySelector('#event-reg-closes')).not.toBeNull()
  })
})

describe('AdminEventEditor — avisos de consistencia', () => {
  it('no muestra avisos cuando el estado coincide con la configuración', () => {
    renderEditor({ registrationClosesAt: '2099-01-01T00:00:00.000Z' })

    expect(screen.queryByText(/el estado público no coincide/i)).toBeNull()
  })

  it('avisa cuando el cupo está lleno y el estado sigue en inscripción abierta', () => {
    renderEditor({}, { sourceEvent: { registered: 120, slots: 120 } })

    expect(screen.getByText(/el estado público no coincide/i)).toBeDefined()
    expect(screen.getByText(/no quedan cupos/i)).toBeDefined()
  })

  it('avisa cuando la inscripción figura abierta con la ventana ya vencida', () => {
    renderEditor({ registrationClosesAt: '2020-01-01T00:00:00.000Z' })

    expect(screen.getByText(/la fecha de cierre ya pasó/i)).toBeDefined()
  })
})
