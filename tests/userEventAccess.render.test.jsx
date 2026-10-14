import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import UserEventAccessDialog from '../src/components/admin/UserEventAccessDialog.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import UsersSection from '../src/pages/admin/UsersSection.jsx'

/**
 * Eventos de un organizador: lo asigna PLU desde Usuarios. El diálogo tiene que dejar
 * claro qué marca y no permitir "guardar" sin cambios; la tabla ofrece la acción solo
 * en cuentas por evento y muestra cuántos eventos tienen.
 */
const EVENTS = [
  { id: 'evt-a', title: 'Torneo A 2026', slug: 'torneo-a-2026' },
  { id: 'evt-b', title: 'Torneo B 2026', slug: 'torneo-b-2026' },
  { id: 'evt-c', title: 'Copa Regional', slug: 'copa-regional' },
]

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

function renderDialog(overrides = {}) {
  const props = {
    events: EVENTS,
    initialEventIds: ['evt-a'],
    onCancel: vi.fn(),
    onSave: vi.fn(),
    userName: 'Olga Organizadora',
    ...overrides,
  }
  render(
    <I18nProvider>
      <UserEventAccessDialog {...props} />
    </I18nProvider>,
  )
  return props
}

describe('diálogo de eventos de un organizador', () => {
  it('muestra los eventos con los asignados tildados y explica el alcance', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: /eventos de olga organizadora/i })

    expect(within(dialog).getByText(/solo va a poder ver y gestionar los eventos que marques/i)).toBeTruthy()
    expect(within(dialog).getByRole('checkbox', { name: /torneo a 2026/i }).checked).toBe(true)
    expect(within(dialog).getByRole('checkbox', { name: /torneo b 2026/i }).checked).toBe(false)
    expect(within(dialog).getByText(/1 seleccionados/i)).toBeTruthy()
  })

  it('no deja guardar sin cambios y guarda el conjunto completo al cambiarlo', () => {
    const { onSave } = renderDialog()
    const save = screen.getByRole('button', { name: /guardar eventos/i })
    expect(save.disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: /torneo b 2026/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /torneo a 2026/i }))
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    expect(onSave).toHaveBeenCalledWith(['evt-b'])
  })

  it('volver al conjunto original vuelve a deshabilitar guardar', () => {
    renderDialog()
    const b = screen.getByRole('checkbox', { name: /torneo b 2026/i })
    fireEvent.click(b)
    expect(screen.getByRole('button', { name: /guardar eventos/i }).disabled).toBe(false)
    fireEvent.click(b)
    expect(screen.getByRole('button', { name: /guardar eventos/i }).disabled).toBe(true)
  })

  it('filtra por nombre o identificador y avisa cuando no hay coincidencias', () => {
    renderDialog()
    fireEvent.change(screen.getByRole('searchbox', { name: /buscar evento/i }), {
      target: { value: 'copa' },
    })
    expect(screen.queryByRole('checkbox', { name: /torneo a 2026/i })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /copa regional/i })).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: /buscar evento/i }), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText(/no hay eventos que coincidan/i)).toBeTruthy()
  })

  it('sin ningún evento lo dice (esa cuenta no vería nada) y se puede guardar vacío', () => {
    const { onSave } = renderDialog()
    fireEvent.click(screen.getByRole('checkbox', { name: /torneo a 2026/i }))
    expect(screen.getByText(/ningún evento seleccionado/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /guardar eventos/i }))
    expect(onSave).toHaveBeenCalledWith([])
  })

  it('Escape cierra salvo mientras guarda, y el error del servidor se ve', () => {
    const { onCancel } = renderDialog({ error: 'No se pudieron guardar los eventos.' })
    expect(screen.getByRole('alert').textContent).toMatch(/no se pudieron guardar/i)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('mientras guarda bloquea todo y no cierra con Escape', () => {
    const { onCancel } = renderDialog({ busy: true })
    expect(screen.getByRole('button', { name: /guardando/i }).disabled).toBe(true)
    expect(screen.getByRole('checkbox', { name: /torneo b 2026/i }).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})

// El botón del menú de una fila vive dentro de un grupo "Acciones para <nombre>".
const openMenuOf = (name) =>
  fireEvent.click(
    within(screen.getByRole('group', { name: new RegExp(`acciones para ${name}`, 'i') })).getByRole(
      'button',
    ),
  )

describe('Usuarios: eventos de un organizador', () => {
  const USERS = [
    {
      id: 'usr-ana',
      name: 'Ana Operadora',
      email: 'ana@pluarg.test',
      role: 'operador_plu_arg',
      roleKey: 'plu_arg',
      status: 'active',
      eventScoped: false,
    },
    {
      id: 'usr-olga',
      name: 'Olga Organizadora',
      email: 'olga@pluarg.test',
      role: 'operador_plu_arg',
      roleKey: 'organizador_evento',
      roleLabel: 'Organizador',
      status: 'active',
      eventScoped: true,
      eventAccess: [{ eventId: 'evt-a', eventSlug: 'torneo-a-2026' }],
    },
    {
      id: 'usr-omar',
      name: 'Omar Organizador',
      email: 'omar@pluarg.test',
      role: 'operador_plu_arg',
      roleKey: 'organizador_evento',
      roleLabel: 'Organizador',
      status: 'active',
      eventScoped: true,
      eventAccess: [],
    },
  ]
  const ROLES = [
    { key: 'plu_arg', name: 'PLU', active: true, canAssign: true },
    { key: 'organizador_evento', name: 'Organizador', active: true, canAssign: true },
  ]

  function renderUsers(overrides = {}) {
    return render(
      <I18nProvider>
        <UsersSection
          accessRoles={ROLES}
          adminEvents={EVENTS}
          canManageUsers
          onSetEventAccess={vi.fn(async () => ({}))}
          // Con una acción más (estado), la cuenta común también tiene menú: se prueba que
          // NO trae "Eventos asignados".
          onUpdateStatus={vi.fn(async () => ({}))}
          onUpdateRole={async () => ({})}
          users={USERS}
          {...overrides}
        />
      </I18nProvider>,
    )
  }

  it('cada organizador muestra cuántos eventos tiene; el resto de las cuentas no', () => {
    renderUsers()
    expect(screen.getByText('1 evento')).toBeTruthy()
    expect(screen.getByText('Sin eventos')).toBeTruthy()
    expect(screen.queryAllByText(/\d+ eventos$/).length).toBe(0)
  })

  it('la acción "Eventos asignados" existe solo en organizadores y abre el diálogo con lo asignado', async () => {
    const onSetEventAccess = vi.fn(async () => ({}))
    renderUsers({ onSetEventAccess })

    // Menú de la fila de Ana (cuenta común): sin la acción.
    openMenuOf('ana operadora')
    expect(screen.queryByRole('menuitem', { name: /eventos asignados/i })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Menú de la fila de Olga (organizadora): con la acción.
    openMenuOf('olga organizadora')
    fireEvent.click(await screen.findByRole('menuitem', { name: /eventos asignados/i }))

    const dialog = await screen.findByRole('dialog', { name: /eventos de olga organizadora/i })
    expect(within(dialog).getByRole('checkbox', { name: /torneo a 2026/i }).checked).toBe(true)

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /copa regional/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /guardar eventos/i }))
    await waitFor(() =>
      expect(onSetEventAccess).toHaveBeenCalledWith('usr-olga', ['evt-a', 'evt-c']),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('si guardar falla, el diálogo queda abierto con el motivo', async () => {
    renderUsers({
      onSetEventAccess: vi.fn(async () => {
        throw new Error('Hay eventos que no existen.')
      }),
    })
    openMenuOf('omar organizador')
    fireEvent.click(await screen.findByRole('menuitem', { name: /eventos asignados/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /torneo b 2026/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /guardar eventos/i }))

    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/no existen/i)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('sin permiso para administrar usuarios no se ofrece', () => {
    renderUsers({ canManageUsers: false })
    expect(screen.queryByRole('menuitem', { name: /eventos asignados/i })).toBeNull()
  })
})
