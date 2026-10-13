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

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('alta de evento como página', () => {
  it('es una página y no un diálogo modal', () => {
    renderCreate()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Crear meet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Volver a eventos/ })).toBeTruthy()
  })

  it('arma la card pública a medida que se escribe', () => {
    renderCreate()
    const aside = screen.getByLabelText('Así lo ve el público', { selector: 'aside' })
    expect(aside.textContent).toContain('Título del evento')
    expect(aside.textContent).toContain('Empezá por el título')

    type('Título público', 'Copa Otoño')
    expect(aside.textContent).toContain('Copa Otoño')
    expect(aside.textContent).toContain('Se actualiza mientras escribís')
  })

  it('vuelve sin preguntar si no se cargó nada', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { onCancel } = renderCreate()

    fireEvent.click(screen.getByRole('button', { name: /Volver a eventos/ }))

    expect(confirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('pregunta antes de descartar lo cargado y respeta el "no"', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onCancel } = renderCreate()
    type('Título público', 'Copa Otoño')

    fireEvent.click(screen.getByRole('button', { name: /Volver a eventos/ }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('no envía un alta incompleta y marca el primer campo inválido', async () => {
    const { onSubmit } = renderCreate()

    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => {
      expect(document.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThan(0)
    })
    // El foco va al primer campo inválido, no se queda en el botón.
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envía el alta con el enlace derivado del título y el año', async () => {
    const { onSubmit } = renderCreate()

    type('Título público', 'Copa Otoño')
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

    expect(screen.getByText('/copa-otono-2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Copa Otoño',
      slug: 'copa-otono-2026',
      venue: 'Club Central',
      location: 'Rosario',
    })
  })

  it('con el editor completo conserva lo tipeado', () => {
    const { onOpenFullEditor } = renderCreate()
    type('Título público', 'Copa Otoño')

    fireEvent.click(screen.getByRole('button', { name: /abrir el editor completo/ }))

    expect(onOpenFullEditor).toHaveBeenCalledWith(expect.objectContaining({ title: 'Copa Otoño' }))
  })

  it('sin permiso de escritura deja los campos deshabilitados', () => {
    renderCreate({ canEdit: false })
    expect(screen.getByLabelText('Título público').hasAttribute('disabled')).toBe(true)
  })
})
