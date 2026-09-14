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

/**
 * Estado, acceso y sitio son tres radiogroups del mismo formulario: cada
 * opción es un `role="radio"` con nombre único, así que alcanza con el rol.
 */
function accessChip(name) {
  return [...document.querySelectorAll('.admin-event-state__option')].find((chip) =>
    name.test(chip.textContent ?? ''),
  )
}

function statusChip(name) {
  return accessChip(name)
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

    expect(accessChip(/solo afiliados/i).getAttribute('aria-checked')).toBe('true')
    expect(accessChip(/^sin afiliación$/i).getAttribute('aria-checked')).toBe('false')
  })

  it('no guarda al tocar el chip: deja el cambio pendiente hasta Guardar', async () => {
    const onSetState = renderControl(EVENT, vi.fn(async () => ({ event: EVENT, events: [] })))

    fireEvent.click(accessChip(/^sin afiliación$/i))

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

    fireEvent.click(accessChip(/^sin afiliación$/i))
    expect(accessChip(/^sin afiliación$/i).getAttribute('aria-checked')).toBe('true')
    expect(pendingSave()).toBeTruthy()

    fireEvent.click(pendingDiscard())

    expect(onSetState).not.toHaveBeenCalled()
    expect(accessChip(/solo afiliados/i).getAttribute('aria-checked')).toBe('true')
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

  // La consecuencia decide el cambio —el requisito no solo filtra la
  // inscripción, decide quién pasa la puerta el día del meet—, así que se
  // escribe debajo de la opción elegida en vez de esconderse en un `title`
  // que en touch no existe.
  it('escribe la consecuencia del acceso elegido, no la esconde en un title', () => {
    renderControl()
    expect(
      screen.getByText(/en la puerta un inscripto sin afiliación queda bloqueado/i),
    ).toBeDefined()

    fireEvent.click(accessChip(/^sin afiliación$/i))
    expect(screen.getByText(/alcanza con la inscripción confirmada/i)).toBeDefined()
    expect(
      screen.queryByText(/en la puerta un inscripto sin afiliación queda bloqueado/i),
    ).toBeNull()
  })

  it('recorre las opciones con flechas, como corresponde a un radiogroup', () => {
    renderControl()
    const members = accessChip(/solo afiliados/i)
    expect(members.tabIndex).toBe(0)
    expect(accessChip(/^sin afiliación$/i).tabIndex).toBe(-1)

    fireEvent.keyDown(members, { key: 'ArrowRight' })
    expect(accessChip(/^sin afiliación$/i).getAttribute('aria-checked')).toBe('true')
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

  it('en deferSave no muestra la barra pending: el PATCH lo dispara el padre', () => {
    render(
      <I18nProvider>
        <AdminEventStateControl
          canEdit
          deferSave
          event={EVENT}
          onSetState={vi.fn()}
          onPendingChange={vi.fn()}
        />
      </I18nProvider>,
    )

    fireEvent.click(accessChip(/^sin afiliación$/i))

    expect(pendingSave()).toBeNull()
    expect(screen.queryByText(/un cambio sin guardar/i)).toBeNull()
  })

  it('sin permiso de escritura el control queda deshabilitado', () => {
    render(
      <I18nProvider>
        <AdminEventStateControl canEdit={false} event={EVENT} onSetState={vi.fn()} />
      </I18nProvider>,
    )

    expect(accessChip(/^sin afiliación$/i).disabled).toBe(true)
  })

  it('el resumen muestra el estado elegido, no el acceso como si fuera el estado', () => {
    renderControl({
      ...EVENT,
      status: 'cerrado',
      requiresMembership: false,
      registered: 206,
      slots: 250,
    })

    const result = document.querySelector('.admin-event-state__result')
    expect(result?.querySelector('.admin-event-state__result-primary')?.textContent).toBe('Cerrado')
    expect(result?.querySelector('.admin-event-state__result-access')?.textContent).toBe(
      'Sin afiliación',
    )
    expect(result?.textContent).not.toMatch(/·\s*Abierto\s*$/)
  })

  it('al pasar a Cerrado el resumen deja de decir que está abierto', () => {
    renderControl({ ...EVENT, requiresMembership: false })

    fireEvent.click(statusChip(/^cerrado$/i))

    expect(document.querySelector('.admin-event-state__result-primary')?.textContent).toBe(
      'Cerrado',
    )
    expect(document.querySelector('.admin-event-state__result-access')?.textContent).toBe(
      'Sin afiliación',
    )
  })

  it('agrupa el cambio de estado en draft hasta Guardar', async () => {
    const onSetState = renderControl(EVENT, vi.fn(async () => ({ event: EVENT, events: [] })))

    fireEvent.click(statusChip(/^cerrado$/i))

    expect(onSetState).not.toHaveBeenCalled()
    expect(pendingSave()).toBeTruthy()

    fireEvent.click(pendingSave())

    await waitFor(() =>
      expect(onSetState).toHaveBeenCalledWith('pitbull-classic-2026', { status: 'cerrado' }),
    )
  })
})
