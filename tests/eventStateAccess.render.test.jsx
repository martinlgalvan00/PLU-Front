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
 * corto existe y que manda solo ese campo.
 *
 * Modelo draft + Guardar: tocar un chip solo selecciona; el PATCH corre al
 * confirmar con Guardar. Descartar vuelve al estado persistido.
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

function pendingSave() {
  return document.querySelector('.admin-event-state__pending-save')
}

function pendingDiscard() {
  return document.querySelector('.admin-event-state__pending-discard')
}

afterEach(cleanup)

describe('AdminEventStateControl — acceso al meet', () => {
  it('muestra el requisito vigente como opción activa', () => {
    renderControl()

    expect(accessChip(/solo afiliados/i).getAttribute('aria-pressed')).toBe('true')
    expect(accessChip(/^abierto$/i).getAttribute('aria-pressed')).toBe('false')
  })

  it('no guarda al tocar el chip: deja el cambio pendiente hasta Guardar', async () => {
    const onSetState = renderControl(EVENT, vi.fn(async () => ({ event: EVENT, events: [] })))

    fireEvent.click(accessChip(/^abierto$/i))

    expect(onSetState).not.toHaveBeenCalled()
    expect(pendingSave()).toBeTruthy()
    expect(screen.getByText(/un cambio sin guardar/i)).toBeDefined()

    fireEvent.click(pendingSave())

    await waitFor(() => expect(onSetState).toHaveBeenCalledTimes(1))
    expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', { requiresMembership: false })
    expect(await screen.findByText(/quedó abierto: no pide afiliación/i)).toBeDefined()
  })

  it('descarta el cambio pendiente y vuelve al acceso persistido', () => {
    const onSetState = renderControl()

    fireEvent.click(accessChip(/^abierto$/i))
    expect(accessChip(/^abierto$/i).getAttribute('aria-pressed')).toBe('true')
    expect(pendingSave()).toBeTruthy()

    fireEvent.click(pendingDiscard())

    expect(onSetState).not.toHaveBeenCalled()
    expect(accessChip(/solo afiliados/i).getAttribute('aria-pressed')).toBe('true')
    expect(pendingSave()).toBeNull()
  })

  it('vuelve a exigir afiliación desde el mismo control al guardar', async () => {
    const onSetState = renderControl(
      { ...EVENT, requiresMembership: false },
      vi.fn(async () => ({ event: EVENT, events: [] })),
    )

    fireEvent.click(accessChip(/solo afiliados/i))
    fireEvent.click(pendingSave())

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', {
        requiresMembership: true,
      }),
    )
  })

  it('no marca dirty si la opción ya está activa', () => {
    const onSetState = renderControl()

    fireEvent.click(accessChip(/solo afiliados/i))

    expect(onSetState).not.toHaveBeenCalled()
    expect(pendingSave()).toBeNull()
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

  it('agrupa el cambio de estado en draft hasta Guardar', async () => {
    const onSetState = renderControl(EVENT, vi.fn(async () => ({ event: EVENT, events: [] })))

    fireEvent.click(screen.getByRole('button', { name: /^cerrado$/i }))

    expect(onSetState).not.toHaveBeenCalled()
    expect(pendingSave()).toBeTruthy()

    fireEvent.click(pendingSave())

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', { status: 'cerrado' }),
    )
  })
})
