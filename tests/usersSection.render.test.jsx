import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import UsersSection from '../src/pages/admin/UsersSection.jsx'

const USERS = [
  {
    id: 'usr-max',
    name: 'Super Admin',
    email: 'max@pluarg.test',
    role: 'admin_maximal',
    roleKey: 'admin_maximal',
    status: 'active',
  },
  {
    id: 'usr-test',
    name: 'Cuenta Test',
    email: 'test@pluarg.test',
    role: 'operador_plu_arg',
    roleKey: 'plu_arg',
    status: 'disabled',
  },
  {
    id: 'usr-op',
    name: 'Operadora Activa',
    email: 'op@pluarg.test',
    role: 'operador_plu_arg',
    roleKey: 'plu_arg',
    status: 'active',
  },
]

const ACCESS_ROLES = [
  { key: 'plu_arg', name: 'PLU', active: true, canAssign: true },
  { key: 'seguridad_plu_arg', name: 'Seguridad', active: true, canAssign: true },
]

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

function renderUsers(overrides = {}) {
  return render(
    <I18nProvider>
      <UsersSection
        accessRoles={ACCESS_ROLES}
        adminEvents={[]}
        canDeleteUsers
        canManageUsers
        onCreateSecurityUser={async () => ({})}
        onCreateUser={async () => ({})}
        onDeleteUser={async () => ({ id: 'usr-test' })}
        onUpdateRole={async () => ({})}
        onUpdateStatus={async () => ({})}
        users={USERS}
        {...overrides}
      />
    </I18nProvider>,
  )
}

function rowOf(name) {
  return screen.getByText(name).closest('tr')
}

function openMenu(name) {
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: 'Más acciones' }))
  return screen.getByRole('menu')
}

describe('UsersSection — barra y tabla compacta', () => {
  it('la única acción dorada es "Nuevo usuario"; "Permisos por rol" es secundaria', () => {
    const onNavigateRoles = vi.fn()
    renderUsers({ onNavigateRoles })

    const create = screen.getByRole('button', { name: 'Nuevo usuario' })
    const roles = screen.getByRole('button', { name: 'Permisos por rol' })
    expect(create.className).toContain('btn--gold')
    expect(roles.className).not.toContain('btn--gold')

    fireEvent.click(roles)
    expect(onNavigateRoles).toHaveBeenCalledTimes(1)
  })

  it('usa la tabla en densidad compacta', () => {
    const { container } = renderUsers()
    expect(container.querySelector('.admin-data-table--compact')).toBeTruthy()
  })

  it('con un solo estado no ofrece el filtro; con varios sí, y filtra', () => {
    const { unmount } = renderUsers({ users: [USERS[0], USERS[2]] })
    expect(screen.queryByRole('combobox', { name: 'Estado' })).toBeNull()
    unmount()

    renderUsers()
    const filter = screen.getByRole('combobox', { name: 'Estado' })
    fireEvent.change(filter, { target: { value: 'disabled' } })

    expect(screen.getByText('Cuenta Test')).toBeTruthy()
    expect(screen.queryByText('Operadora Activa')).toBeNull()
    // Con un filtro aplicado el control sigue a mano para poder soltarlo.
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeTruthy()
  })

  it('busca por nombre o email y avisa cuando no hay coincidencias', () => {
    renderUsers()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'op@pluarg' } })
    expect(screen.getByText('Operadora Activa')).toBeTruthy()
    expect(screen.queryByText('Cuenta Test')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('Sin resultados')).toBeTruthy()
  })

  it('el estado es texto con punto y la cuenta protegida no tiene acciones', () => {
    renderUsers()
    expect(within(rowOf('Cuenta Test')).getByText('Dado de baja')).toBeTruthy()
    expect(within(rowOf('max@pluarg.test')).queryByRole('button')).toBeNull()
  })

  it('solo lectura: sin alta, sin acciones y sin columna de acciones', () => {
    renderUsers({ canManageUsers: false, canDeleteUsers: false })
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Más acciones' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /^Rol:/ })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Acción' })).toBeNull()
  })

  it('sin usuarios muestra solo el estado vacío, con el alta disponible', () => {
    renderUsers({ users: [] })
    expect(screen.getByText('Todavía no hay usuarios')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeTruthy()
  })
})

describe('UsersSection — acciones por fila', () => {
  it('la fila muestra un solo control y todas las acciones viven en el menú', async () => {
    const onUpdateStatus = vi.fn(async () => ({}))
    const onResetPassword = vi.fn(async () => ({ emailed: true }))
    renderUsers({ onUpdateStatus, onResetPassword })

    const activeRow = rowOf('Operadora Activa')
    // Visible: solo el disparador del menú (sin ícono de pausa suelto).
    expect(within(activeRow).getAllByRole('button')).toHaveLength(1)
    expect(within(activeRow).queryByRole('button', { name: 'Suspender' })).toBeNull()

    const menu = openMenu('Operadora Activa')
    expect(within(menu).getByRole('menuitem', { name: 'Reenviar invitación' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Dar de baja' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Eliminar usuario' })).toBeTruthy()

    // Suspender no es irreversible: se ejecuta con un solo toque.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Suspender' }))
    await waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('usr-op', 'suspended'))
  })

  it('una cuenta dada de baja ofrece volver a darla de alta desde el menú', async () => {
    const onUpdateStatus = vi.fn(async () => ({}))
    renderUsers({ onUpdateStatus })

    const menu = openMenu('Cuenta Test')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Dar de alta' }))
    await waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('usr-test', 'active'))
  })

  it('"Dar de baja" pide un segundo toque antes de ejecutarse', async () => {
    const onUpdateStatus = vi.fn(async () => ({}))
    renderUsers({ onUpdateStatus })

    const menu = openMenu('Operadora Activa')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Dar de baja' }))
    expect(onUpdateStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirmar baja' }))
    await waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('usr-op', 'disabled'))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('el menú no ofrece dar de baja a una cuenta que ya está dada de baja', () => {
    renderUsers()
    const menu = openMenu('Cuenta Test')
    expect(within(menu).queryByRole('menuitem', { name: 'Dar de baja' })).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: 'Eliminar usuario' })).toBeTruthy()
  })

  it('se maneja con teclado: flechas mueven el foco y Escape lo devuelve al disparador', () => {
    renderUsers({ onResetPassword: async () => ({ emailed: true }) })

    const trigger = within(rowOf('Operadora Activa')).getByRole('button', { name: 'Más acciones' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(document.activeElement).toBe(items[items.length - 1])

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('cierra el menú al hacer clic afuera', () => {
    renderUsers()
    openMenu('Operadora Activa')
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('cambia el rol desde el selector de la fila', async () => {
    const onUpdateRole = vi.fn(async () => ({}))
    renderUsers({ onUpdateRole })
    fireEvent.change(screen.getByRole('combobox', { name: 'Rol: Operadora Activa' }), {
      target: { value: 'seguridad_plu_arg' },
    })
    await waitFor(() => expect(onUpdateRole).toHaveBeenCalledWith('usr-op', 'seguridad_plu_arg'))
  })

  it('sin permiso de baja ni handler de estado el menú no aparece', () => {
    renderUsers({ canManageUsers: true, canDeleteUsers: false, onUpdateStatus: undefined })
    expect(screen.queryByRole('button', { name: 'Más acciones' })).toBeNull()
  })
})

describe('UsersSection — alta de usuario', () => {
  it('abre el formulario, valida y crea la cuenta', async () => {
    const onCreateUser = vi.fn(async () => ({
      user: { email: 'nuevo@pluarg.test' },
      emailed: true,
    }))
    renderUsers({ onCreateUser })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    // Mientras está abierto, la acción dorada pasa a ser "Crear cuenta".
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()

    // Con un email cargado hace falta también el nombre.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nuevo@pluarg.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(screen.getByRole('alert').textContent).toMatch(/nombre y apellido/i)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Persona' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() => expect(onCreateUser).toHaveBeenCalledTimes(1))
    expect(onCreateUser.mock.calls[0][0]).toMatchObject({
      name: 'Nueva Persona',
      email: 'nuevo@pluarg.test',
    })
    await waitFor(() => expect(screen.getByText('Cuenta creada')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeTruthy()
  })

  it('sin nombre ni email genera una invitación abierta con el enlace', async () => {
    const onCreateUser = vi.fn(async () => ({
      user: { email: 'invitacion-abc@pendiente.invalid', name: 'Invitación pendiente' },
      emailed: false,
      invitationUrl: 'https://panel.pluarg.test/?invitacion-staff=abc.def',
      invitationExpiresAt: '2099-01-10T12:00:00.000Z',
    }))
    renderUsers({ onCreateUser })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    // Sin email no hay a quién mandarle el mail: la casilla queda deshabilitada.
    expect(screen.getByRole('checkbox').disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Generar enlace' }))

    await waitFor(() => expect(onCreateUser).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Enlace listo para compartir')).toBeTruthy()
    expect(screen.getByLabelText('Enlace de activación').value).toBe(
      'https://panel.pluarg.test/?invitacion-staff=abc.def',
    )
    expect(screen.queryByText(/No pudimos enviar el mail/)).toBeNull()
  })

  it('muestra la invitación abierta pendiente sin exponer el email reservado', () => {
    renderUsers({
      users: [
        ...USERS,
        {
          id: 'usr-open',
          name: 'Invitación pendiente',
          email: 'invitacion-abc@pendiente.invalid',
          role: 'operador_plu_arg',
          roleKey: 'plu_arg',
          status: 'invited',
        },
      ],
    })
    expect(screen.getByText('Invitación abierta')).toBeTruthy()
    expect(screen.getByText('Esperando que complete sus datos')).toBeTruthy()
    expect(screen.queryByText(/pendiente\.invalid/)).toBeNull()
  })

  it('Cancelar cierra el formulario sin crear nada', () => {
    const onCreateUser = vi.fn()
    renderUsers({ onCreateUser })
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).toBeNull()
    expect(onCreateUser).not.toHaveBeenCalled()
  })
})

describe('UsersSection — eliminación de cuentas', () => {
  it('muestra la acción sólo cuando el actor puede eliminar usuarios', () => {
    renderUsers({ canDeleteUsers: false })
    const menu = openMenu('Operadora Activa')
    expect(within(menu).getByRole('menuitem', { name: 'Dar de baja' })).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: 'Eliminar usuario' })).toBeNull()
  })

  it('confirma la cuenta exacta antes de eliminarla', async () => {
    const onDeleteUser = vi.fn(async () => ({ id: 'usr-test' }))
    renderUsers({ onDeleteUser })

    const menu = openMenu('Cuenta Test')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Eliminar usuario' }))
    expect(screen.getByRole('dialog', { name: '¿Eliminar usuario?' })).toBeTruthy()
    expect(screen.getByText(/Cuenta Test \(test@pluarg\.test\)/)).toBeTruthy()
    // Abrir el diálogo no elimina nada todavía.
    expect(onDeleteUser).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() => expect(onDeleteUser).toHaveBeenCalledWith('usr-test'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('conservar la cuenta cierra el diálogo sin eliminar', () => {
    const onDeleteUser = vi.fn()
    renderUsers({ onDeleteUser })
    const menu = openMenu('Cuenta Test')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Eliminar usuario' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Conservar cuenta' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onDeleteUser).not.toHaveBeenCalled()
  })
})

describe('UsersSection — vista de cada cuenta', () => {
  it('muestra el último acceso, o por qué no hay uno', () => {
    renderUsers({
      users: [
        { ...USERS[2], lastLoginAt: '2026-08-14T22:23:00.000Z' },
        { ...USERS[1], status: 'invited', lastLoginAt: null },
        { ...USERS[0], lastLoginAt: null },
      ],
    })

    expect(screen.getByRole('columnheader', { name: /Último acceso/ })).toBeTruthy()
    expect(within(rowOf('Operadora Activa')).getByText(/2026/)).toBeTruthy()
    expect(within(rowOf('Cuenta Test')).getByText('Invitación pendiente')).toBeTruthy()
    // El nombre también es el rol de esta cuenta: se la ubica por su email.
    expect(
      within(screen.getByText('max@pluarg.test').closest('tr')).getByText('Sin ingresos'),
    ).toBeTruthy()
  })

  it('marca a quien también es atleta y lleva a su ficha desde el menú', () => {
    const onOpenAthlete = vi.fn()
    renderUsers({
      athletes: [{ id: 'ath-1', email: 'OP@pluarg.test' }],
      onOpenAthlete,
    })

    expect(within(rowOf('Operadora Activa')).getByText('Atleta')).toBeTruthy()
    expect(within(rowOf('Cuenta Test')).queryByText('Atleta')).toBeNull()

    const menu = openMenu('Operadora Activa')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver ficha de atleta' }))
    expect(onOpenAthlete).toHaveBeenCalledWith('ath-1')
  })

  it('sin coincidencia con un atleta el menú no ofrece la ficha', () => {
    renderUsers({ athletes: [{ id: 'ath-9', email: 'otro@pluarg.test' }], onOpenAthlete: vi.fn() })

    const menu = openMenu('Operadora Activa')
    expect(within(menu).queryByRole('menuitem', { name: 'Ver ficha de atleta' })).toBeNull()
  })
})
