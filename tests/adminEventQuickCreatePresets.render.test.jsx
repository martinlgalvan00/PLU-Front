import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventQuickCreate from '../src/components/admin/AdminEventQuickCreate.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderCreate(props = {}) {
  const handlers = {
    onCancel: vi.fn(),
    onOpenFullEditor: vi.fn(),
    onSubmit: vi.fn(async () => ({ event: { id: 'evt-nuevo' } })),
    ...props,
  }
  render(
    <I18nProvider>
      <AdminEventQuickCreate canEdit {...handlers} />
    </I18nProvider>,
  )
  return handlers
}

function fillRequired(title = 'Copa Otoño') {
  fireEvent.change(screen.getByLabelText('Título público'), { target: { value: title } })
  fireEvent.change(document.getElementById('quick-event-starts-at'), {
    target: { value: '2026-12-12T10:00' },
  })
  fireEvent.change(document.getElementById('quick-event-ends-at'), {
    target: { value: '2026-12-12T18:00' },
  })
  fireEvent.change(document.getElementById('quick-event-venue'), {
    target: { value: 'Club Central' },
  })
  fireEvent.change(document.getElementById('quick-event-location'), {
    target: { value: 'Rosario' },
  })
  // El alta es guiada: "Crear evento" vive en el último paso.
  for (let i = 0; i < 2; i += 1) {
    const next = screen.queryByRole('button', { name: /^Siguiente/ })
    if (next) fireEvent.click(next)
  }
}

function chip(name) {
  return screen.getByRole('button', { name })
}

describe('presets en el alta de evento', () => {
  it('arranca en blanco, sin cambiar nada, y no cuenta como draft sucio', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { onCancel } = renderCreate()
    expect(chip('En blanco').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /Volver a eventos/ }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('elegir un preset cambia acceso y plantilla en el draft enviado', async () => {
    const { onSubmit } = renderCreate()
    fireEvent.click(chip('Seminario / clínica'))

    expect(chip('Seminario / clínica').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Acceso: Sin afiliación\. Plantilla: Landing editorial/)).toBeTruthy()

    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const sent = onSubmit.mock.calls[0][0]
    expect(sent.requiresMembership).toBe(false)
    expect(sent.landing.templateId).toBe('editorial')
    expect(sent.salesIntent).toBe('charge')
    expect(sent.title).toBe('Copa Otoño')
  })

  it('el invitacional anuncia sin cobrar', async () => {
    const { onSubmit } = renderCreate()
    fireEvent.click(chip('Invitacional'))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const sent = onSubmit.mock.calls[0][0]
    expect(sent.requiresMembership).toBe(true)
    expect(sent.landing.templateId).toBe('submission')
    expect(sent.salesIntent).toBe('announce')
  })

  it('elegir un preset cuenta como cambio como cualquier otro', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onCancel } = renderCreate()
    fireEvent.click(chip('Seminario / clínica'))

    fireEvent.click(screen.getByRole('button', { name: /Volver a eventos/ }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('no aparece al duplicar', () => {
    renderCreate({
      duplicateOf: 'Copa Norte',
      initialDraft: { title: 'Copa Norte', requiresMembership: false },
    })
    expect(screen.queryByRole('button', { name: 'Meet nacional' })).toBeNull()
    expect(screen.queryByText('Tipo de evento')).toBeNull()
  })

  it('sin permiso de escritura deja los presets deshabilitados', () => {
    renderCreate({ canEdit: false })
    expect(chip('Meet nacional').hasAttribute('disabled')).toBe(true)
  })

  it('la alta consecutiva conserva el preset: acceso, venta y plantilla', async () => {
    const { onSubmit } = renderCreate()
    fireEvent.click(chip('Invitacional'))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /Crear y cargar otro/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByLabelText('Título público').value).toBe(''))

    fillRequired('Copa Primavera')
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    const second = onSubmit.mock.calls[1][0]
    expect(second.title).toBe('Copa Primavera')
    expect(second.landing.templateId).toBe('submission')
    expect(second.requiresMembership).toBe(true)
    expect(second.salesIntent).toBe('announce')
  })
})
