import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventStateControl from '../src/components/admin/AdminEventStateControl.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Habilitar y deshabilitar un meet como "solo afiliados" desde la consola de
 * operación.
 *
 * Hasta 20260826100000 era lo único de la operación diaria que obligaba a abrir
 * el editor completo y guardar el evento entero — y el upsert recrea días,
 * tandas y tipos de entrada, así que apagar un flag podía llevarse puesta la
 * grilla de un evento con atletas ya asignados. Estos tests fijan que el camino
 * corto existe, que manda solo ese campo, y que la pantalla dice la
 * consecuencia antes de que alguien quede afuera en la puerta.
 *
 * Desde el modelo staged: tocar un chip pre-selecciona el cambio y nada viaja
 * al backend hasta "Guardar". Un solo guardado manda todos los cambios juntos.
 */

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  status: 'inscripcion_abierta',
  published: true,
  slots: 180,
  registered: 46,
}

function renderControl(event = EVENT, onSetState = vi.fn()) {
  render(
    <I18nProvider>
      <AdminEventStateControl canEdit event={event} onSetState={onSetState} />
    </I18nProvider>,
  )
  return onSetState
}

function accessChip(name) {
  const group = document.querySelector('.admin-event-state__access')
  return [...group.querySelectorAll('.admin-filter-chip')].find((chip) =>
    name.test(chip.textContent),
  )
}

function saveButton() {
  return document.querySelector('.admin-event-state__pending-save')
}

afterEach(cleanup)

describe('AdminEventStateControl — acceso al meet', () => {
  it('muestra el requisito vigente como opción activa', () => {
    renderControl()

    expect(accessChip(/solo afiliados/i).getAttribute('aria-pressed')).toBe('true')
    expect(accessChip(/^abierto$/i).getAttribute('aria-pressed')).toBe('false')
  })

  it('pre-selecciona el cambio pero no lo guarda hasta "Guardar"', async () => {
    const onSetState = renderControl(EVENT, vi.fn(async () => ({ event: EVENT, events: [] })))

    fireEvent.click(accessChip(/^abierto$/i))

    // Tocar el chip solo arma la selección pendiente: el evento persistido
    // no se toca todavía.
    expect(screen.getByText(/un cambio sin guardar/i)).toBeTruthy()
    expect(onSetState).not.toHaveBeenCalled()

    fireEvent.click(saveButton())

    await waitFor(() => expect(onSetState).toHaveBeenCalledTimes(1))
    // Ni status ni published: el estado público y la visibilidad son otras dos
    // decisiones y no pueden viajar de arrastre.
    expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', { requiresMembership: false })
    expect(await screen.findByText(/quedó abierto: no pide afiliación/i)).toBeDefined()
    expect(screen.queryByText(/sin guardar/i)).toBeNull()
  })

  it('descartar devuelve la banda al estado persistido sin llamar al backend', () => {
    const onSetState = renderControl()

    fireEvent.click(accessChip(/^abierto$/i))
    expect(screen.getByText(/un cambio sin guardar/i)).toBeTruthy()

    fireEvent.click(document.querySelector('.admin-event-state__pending-discard'))

    expect(onSetState).not.toHaveBeenCalled()
    expect(screen.queryByText(/sin guardar/i)).toBeNull()
    expect(accessChip(/solo afiliados/i).getAttribute('aria-pressed')).toBe('true')
  })

  it('manda varios cambios juntos en un solo guardado', async () => {
    const onSetState = renderControl(EVENT, vi.fn(async () => ({ event: EVENT, events: [] })))

    fireEvent.click(accessChip(/^abierto$/i))
    // Despublicar desde el toggle de visibilidad (pre-selección, no guardado).
    fireEvent.click(document.querySelector('.admin-event-state__visibility'))

    expect(screen.getByText(/2 cambios sin guardar/i)).toBeTruthy()

    fireEvent.click(saveButton())

    await waitFor(() => expect(onSetState).toHaveBeenCalledTimes(1))
    expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', {
      requiresMembership: false,
      published: false,
    })
  })

  it('vuelve a exigir afiliación desde el mismo control', async () => {
    const onSetState = renderControl(
      { ...EVENT, requiresMembership: false },
      vi.fn(async () => ({ event: EVENT, events: [] })),
    )

    fireEvent.click(accessChip(/solo afiliados/i))
    fireEvent.click(saveButton())

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', {
        requiresMembership: true,
      }),
    )
  })

  it('no vuelve a pedir el cambio si la opción ya está activa', () => {
    const onSetState = renderControl()

    fireEvent.click(accessChip(/solo afiliados/i))

    expect(onSetState).not.toHaveBeenCalled()
    expect(screen.queryByText(/sin guardar/i)).toBeNull()
  })

  it('escribe la consecuencia de cada opción, no solo su nombre', () => {
    renderControl()
    expect(
      screen.getByText(/en la puerta un inscripto sin afiliación queda bloqueado/i),
    ).toBeDefined()

    cleanup()
    renderControl({ ...EVENT, requiresMembership: false })
    expect(screen.getByText(/alcanza con la inscripción confirmada/i)).toBeDefined()
  })

  // La advertencia que antes no existía en ninguna parte del panel: con gente ya
  // inscripta, el requisito deja afuera a quien no tenga afiliación vigente.
  it('advierte por los inscriptos que ya están cargados', () => {
    renderControl()
    expect(screen.getByText(/ya hay 46 inscriptos/i)).toBeDefined()

    cleanup()
    renderControl({ ...EVENT, registered: 0 })
    expect(screen.queryByText(/ya hay 0 inscriptos/i)).toBeNull()

    cleanup()
    renderControl({ ...EVENT, requiresMembership: false })
    expect(screen.queryByText(/inscriptos:/i)).toBeNull()
  })

  it('sin permiso de escritura el control queda deshabilitado', () => {
    render(
      <I18nProvider>
        <AdminEventStateControl canEdit={false} event={EVENT} onSetState={vi.fn()} />
      </I18nProvider>,
    )

    expect(accessChip(/^abierto$/i).disabled).toBe(true)
  })
})
