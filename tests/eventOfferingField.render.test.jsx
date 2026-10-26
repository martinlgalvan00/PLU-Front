import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventOfferingField from '../src/components/admin/event-editor/EventOfferingField.jsx'
import { normalizeEventOffering } from '../shared/eventOffering.js'

afterEach(() => cleanup())

function renderField({ offering = normalizeEventOffering(null), canEdit = true } = {}) {
  const patchDraft = vi.fn()
  const draft = { offering }
  render(
    <I18nProvider>
      <EventOfferingField canEdit={canEdit} draft={draft} patchDraft={patchDraft} />
    </I18nProvider>,
  )
  return { patchDraft, draft }
}

const group = (name) => screen.getByRole('group', { name })

describe('EventOfferingField', () => {
  it('por defecto el evento ofrece todo, y lo dice', () => {
    renderField()
    for (const name of [/categorías de competencia/i, /divisiones/i, /modalidades/i]) {
      const boxes = within(group(name)).getAllByRole('checkbox')
      expect(boxes.length).toBeGreaterThan(1)
      for (const box of boxes) expect(box.checked).toBe(true)
    }
    expect(screen.getByText(/ofrece todo/i)).toBeTruthy()
  })

  it('desmarcar una categoría la saca de la oferta', () => {
    const { patchDraft, draft } = renderField()
    fireEvent.click(within(group(/categorías de competencia/i)).getByRole('checkbox', { name: 'Single-Ply' }))
    const next = patchDraft.mock.calls[0][0]
    expect(next.offering.categories).toEqual(['Raw', 'Raw With Wraps', 'Multi-Ply', 'Unlimited'])
    expect(next.offering.modalities).toEqual(draft.offering.modalities)
  })

  it('se pueden ofrecer solo algunas modalidades', () => {
    const { patchDraft } = renderField({
      offering: normalizeEventOffering({ modalities: ['full_power', 'bench'] }),
    })
    fireEvent.click(within(group(/modalidades/i)).getByRole('checkbox', { name: /especialista en banco/i }))
    expect(patchDraft.mock.calls[0][0].offering.modalities).toEqual(['full_power'])
  })

  it('no deja quitar la última opción de una lista: un evento no puede quedar sin nada', () => {
    const { patchDraft } = renderField({ offering: normalizeEventOffering({ categories: ['Raw'] }) })
    const raw = within(group(/categorías de competencia/i)).getByRole('checkbox', { name: 'Raw' })
    expect(raw.disabled).toBe(true)
    fireEvent.click(raw)
    expect(patchDraft).not.toHaveBeenCalled()
  })

  it('Open siempre se ofrece: todos pueden anotarse', () => {
    renderField()
    const open = within(group(/divisiones/i)).getByRole('checkbox', { name: 'Open' })
    expect(open.checked).toBe(true)
    expect(open.disabled).toBe(true)
  })

  it('marca como personalizado lo que restringe algo', () => {
    renderField({ offering: normalizeEventOffering({ categories: ['Raw'] }) })
    expect(screen.getByText(/oferta personalizada/i)).toBeTruthy()
  })

  it('sin permiso de edición todo queda bloqueado', () => {
    renderField({ canEdit: false })
    for (const box of screen.getAllByRole('checkbox')) expect(box.disabled).toBe(true)
  })
})
