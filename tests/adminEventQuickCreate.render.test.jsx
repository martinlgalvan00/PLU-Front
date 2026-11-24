import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventQuickCreate from '../src/components/admin/AdminEventQuickCreate.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { shouldReopenLandingStudio } from '../src/lib/landingStudioSession.js'

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

/** Avanza los pasos del alta hasta el último ("Página"), donde está "Crear evento". */
function goToLastStep() {
  const next = screen.queryByRole('button', { name: /^Siguiente/ })
  if (next) fireEvent.click(next)
  const opens = document.getElementById('quick-event-registration-opens')
  if (opens) {
    fireEvent.change(opens, { target: { value: '2026-06-01T10:00' } })
    fireEvent.change(document.getElementById('quick-event-registration-closes'), {
      target: { value: '2026-12-01T18:00' },
    })
  }
  const nextAgain = screen.queryByRole('button', { name: /^Siguiente/ })
  if (nextAgain) fireEvent.click(nextAgain)
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

  it('no avanza con el paso incompleto y marca el primer campo inválido', async () => {
    const { onSubmit } = renderCreate()

    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))
    // Sigue en el primer paso.
    expect(screen.getByRole('button', { name: /^Evento$/ }).getAttribute('aria-current')).toBe('step')

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
    goToLastStep()
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

  it('son tres pasos: Evento, Venta y Página, y solo se vuelve a los ya vistos', () => {
    renderCreate()
    const steps = screen.getByRole('list', { name: 'Pasos del alta' })
    const buttons = within(steps).getAllByRole('button')
    expect(buttons.map((button) => button.textContent.trim())).toEqual(['1Evento', '2Venta', '3Página'])
    expect(buttons[1].disabled).toBe(true)
    expect(buttons[2].disabled).toBe(true)
  })

  it('el paso Venta trae el precio de lista y cuándo abre la inscripción', () => {
    renderCreate()
    type('Título público', 'Copa Otoño')
    fireEvent.change(document.getElementById('quick-event-starts-at'), {
      target: { value: '2026-12-12T10:00' },
    })
    fireEvent.change(document.getElementById('quick-event-ends-at'), {
      target: { value: '2026-12-12T18:00' },
    })
    fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club' } })
    fireEvent.change(document.getElementById('quick-event-location'), { target: { value: 'Rosario' } })
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))

    expect(screen.getByRole('button', { name: /^Venta$/ }).getAttribute('aria-current')).toBe('step')
    expect(Number(document.querySelector('[name="pricing.registration"]').value)).toBeGreaterThan(0)
    expect(screen.getByRole('group', { name: 'Inscripciones' })).toBeTruthy()
    // Volver no pierde lo cargado.
    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }))
    expect(screen.getByLabelText('Título público').value).toBe('Copa Otoño')
  })

  it('al crear muestra "Listo" con el estado de venta y la salida al evento', async () => {
    const onDone = vi.fn()
    const created = {
      id: 'evt-nuevo',
      slug: 'copa-otono-2026',
      title: 'Copa Otoño',
      status: 'proximamente',
      published: false,
    }
    renderCreate({ onDone, onSubmit: vi.fn(async () => ({ event: created })) })
    type('Título público', 'Copa Otoño')
    fireEvent.change(document.getElementById('quick-event-starts-at'), {
      target: { value: '2026-12-12T10:00' },
    })
    fireEvent.change(document.getElementById('quick-event-ends-at'), {
      target: { value: '2026-12-12T18:00' },
    })
    fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club' } })
    fireEvent.change(document.getElementById('quick-event-location'), { target: { value: 'Rosario' } })
    goToLastStep()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    expect(await screen.findByRole('heading', { name: 'Copa Otoño' })).toBeTruthy()
    const sale = screen.getByRole('region', { name: 'Venta de inscripciones' })
    expect(within(sale).getByRole('status').textContent).toBe('Cerradas')

    fireEvent.click(screen.getByRole('button', { name: /Ir al evento/ }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining(created), { open: true })
  })

  it('"Abre en una fecha" no acepta una fecha pasada', () => {
    renderCreate()
    type('Título público', 'Copa Otoño')
    fireEvent.change(document.getElementById('quick-event-starts-at'), {
      target: { value: '2030-12-12T10:00' },
    })
    fireEvent.change(document.getElementById('quick-event-ends-at'), {
      target: { value: '2030-12-12T18:00' },
    })
    fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club' } })
    fireEvent.change(document.getElementById('quick-event-location'), { target: { value: 'Rosario' } })
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Abre en una fecha' }))
    fireEvent.change(document.getElementById('quick-event-registration-opens'), {
      target: { value: '2020-01-01T10:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))

    expect(screen.getByText(/Elegí una fecha futura/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Venta$/ }).getAttribute('aria-current')).toBe('step')
  })
})

/** Completa el paso Evento con lo mínimo para poder avanzar. */
function fillEventStep(title = 'Copa Otoño') {
  type('Título público', title)
  fireEvent.change(document.getElementById('quick-event-starts-at'), {
    target: { value: '2026-12-12T10:00' },
  })
  fireEvent.change(document.getElementById('quick-event-ends-at'), {
    target: { value: '2026-12-12T18:00' },
  })
  fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club' } })
  fireEvent.change(document.getElementById('quick-event-location'), {
    target: { value: 'Rosario' },
  })
}

describe('alta de evento · paso Página (aspecto de la landing)', () => {
  it('la plantilla y el tema se eligen como radios y viajan en el alta', async () => {
    const { onSubmit } = renderCreate()
    fillEventStep()
    goToLastStep()

    const templates = screen.getByRole('radiogroup', { name: 'Plantilla' })
    expect(within(templates).getAllByRole('radio')).toHaveLength(4)
    fireEvent.click(within(templates).getByRole('radio', { name: /Constructor/ }))
    expect(screen.getByText(/Armá la página por bloques/)).toBeTruthy()

    const themes = screen.getByRole('radiogroup', { name: 'Tema de color' })
    fireEvent.click(within(themes).getByRole('radio', { name: 'Ember' }))

    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].landing).toMatchObject({
      templateId: 'builder',
      themeId: 'ember',
    })
  })

  it('los colores propios pisan al tema, avisan si no se leen y se guardan', async () => {
    const { onSubmit } = renderCreate()
    fillEventStep()
    goToLastStep()

    const toggle = screen.getByRole('button', { name: /Usar colores propios/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    fireEvent.change(document.getElementById('event-landing-palette-action-hex'), {
      target: { value: '#111111' },
    })
    // Botón casi negro sobre el fondo oscuro por defecto: se avisa, no se bloquea.
    expect(screen.getByText(/El botón casi no se distingue del fondo/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Colores propios activos/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].landing.layout.palette).toEqual({ action: '#111111' })
  })

  it('la vista previa pasa a ser la portada con el título cargado', () => {
    renderCreate()
    fillEventStep('Copa Primavera')
    goToLastStep()
    const aside = screen.getByLabelText('Así lo ve el público', { selector: 'aside' })
    expect(aside.textContent).toContain('Así se ve la portada')
    expect(aside.textContent).toContain('Copa Primavera')
    expect(aside.textContent).toContain('Inscribirme')
  })

  it('"Diseñar la landing" abre el evento en Visibilidad con el editor visual', async () => {
    const onDone = vi.fn()
    const created = { id: 'evt-landing', slug: 'copa-otono-2026', title: 'Copa Otoño' }
    renderCreate({ onDone, onSubmit: vi.fn(async () => ({ event: created })) })
    fillEventStep()
    goToLastStep()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    fireEvent.click(await screen.findByRole('button', { name: /Diseñar la landing/ }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining(created), {
      open: true,
      section: 'visibility',
    })
    expect(shouldReopenLandingStudio('evt-landing')).toBe(true)
  })
})
