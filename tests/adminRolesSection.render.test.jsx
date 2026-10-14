import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import {
  PERMISSION_CATALOG,
  RESERVED_PERMISSION_KEYS,
  getDefaultPermissionsForRole,
} from '../src/lib/permissions.js'
import RolesSection from '../src/pages/admin/RolesSection.jsx'

/**
 * Render real de Roles y permisos. Protege lo que el rediseño cambió de lugar:
 * la comparación entre roles, los permisos que antes no tenían columna
 * (eliminar, recorrido identificado), el bloqueo de lo reservado y el guard de
 * cambios sin guardar al cambiar de rol.
 */

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(() => {
  cleanup()
})

const ALL_KEYS = PERMISSION_CATALOG.map(({ key }) => key)
const AUTHORIZATION = { id: 'staff-1', roleKey: 'admin_maximal', permissions: ALL_KEYS }

function makeRole(overrides) {
  return {
    id: overrides.key,
    description: '',
    baseRole: 'operador_plu_arg',
    isSystem: false,
    isProtected: false,
    assignableByAdmin: true,
    active: true,
    hierarchyLevel: 3,
    permissions: [],
    userCount: 0,
    canAssign: true,
    canManagePermissions: true,
    ...overrides,
  }
}

const ROLES = [
  makeRole({
    key: 'admin_maximal',
    name: 'Super Admin',
    isSystem: true,
    isProtected: true,
    hierarchyLevel: 1,
    permissions: getDefaultPermissionsForRole('admin_maximal'),
    userCount: 1,
    canManagePermissions: false,
  }),
  makeRole({
    key: 'plu_arg',
    name: 'PLU',
    isSystem: true,
    permissions: getDefaultPermissionsForRole('plu_arg'),
    userCount: 6,
  }),
  makeRole({
    key: 'comunicacion',
    name: 'Comunicación',
    permissions: ['admin.athletes.read', 'admin.athletes.delete', 'admin.analytics.read'],
    userCount: 2,
  }),
  makeRole({
    key: 'tesoreria',
    name: 'Tesorería',
    permissions: ['admin.payments.read'],
    userCount: 3,
  }),
  makeRole({ key: 'prensa', name: 'Prensa', active: false, permissions: [], userCount: 0 }),
]

function renderRoles(props = {}) {
  const onUpdatePermissions = vi.fn(async (id, permissions) => ({ id, permissions }))
  const utils = render(
    <I18nProvider>
      <RolesSection
        authorization={AUTHORIZATION}
        onCreateRole={vi.fn()}
        onUpdatePermissions={onUpdatePermissions}
        onUpdateStatus={vi.fn()}
        permissionCatalog={PERMISSION_CATALOG}
        roles={ROLES}
        {...props}
      />
    </I18nProvider>,
  )
  return { ...utils, onUpdatePermissions }
}

function openEditor() {
  fireEvent.click(screen.getByRole('tab', { name: 'Editar rol' }))
}

/** Celda de una fila (por etiqueta) en la columna de un rol (por nombre). */
function cellFor(rowLabel, roleName) {
  const table = screen.getByRole('table')
  const headers = within(table).getAllByRole('columnheader')
  const index = headers.findIndex((header) => header.textContent.includes(roleName))
  const row = within(table)
    .getByRole('rowheader', { name: new RegExp(rowLabel) })
    .closest('tr')
  return within(row).getAllByRole('cell')[index - 1]
}

describe('comparar roles', () => {
  it('abre en la comparación, con una columna por rol', () => {
    renderRoles()

    expect(screen.getByRole('tab', { name: 'Comparar roles', selected: true })).toBeTruthy()
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
    // La primera es la esquina vacía.
    expect(headers).toHaveLength(ROLES.length + 1)
    expect(screen.getByText('1 usuario')).toBeTruthy()
    expect(screen.getByText('6 usuarios')).toBeTruthy()
  })

  it('muestra qué roles pueden eliminar atletas, un permiso que la matriz anterior ocultaba', () => {
    renderRoles()

    expect(cellFor('Eliminar atletas', 'Comunicación').textContent).toContain('Habilitada')
    expect(cellFor('Eliminar atletas', 'Super Admin').textContent).toContain('Habilitada')
    expect(cellFor('Eliminar atletas', 'PLU').textContent).toContain('No habilitada')
  })

  it('traduce los permisos a un nivel por módulo y marca el borrado aparte', () => {
    renderRoles()

    // Comunicación: ve atletas y puede eliminarlos -> nivel "Ver" + marca roja.
    const athletes = cellFor('Atletas', 'Comunicación')
    expect(athletes.textContent).toContain('Ver')
    expect(within(athletes).getByRole('img', { name: 'Puede eliminar' })).toBeTruthy()
    // Tesorería no tiene nada de atletas.
    expect(cellFor('Atletas', 'Tesorería').textContent).toContain('Sin acceso')
  })

  it('un rol inactivo se identifica como tal en su columna', () => {
    renderRoles()
    const header = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .find((item) => item.textContent.includes('Prensa'))
    expect(header.textContent).toContain('Inactivo')
  })

  it('tocar el nombre de un rol lo abre en el editor', () => {
    renderRoles()

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Comunicación/ }))

    expect(screen.getByRole('tab', { name: 'Editar rol', selected: true })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Comunicación' })).toBeTruthy()
  })
})

describe('editar rol', () => {
  it('cada permiso tiene su pastilla con nombre, incluidos los que antes no tenían columna', () => {
    renderRoles()
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Comunicación/ }))

    expect(screen.getByRole('checkbox', { name: 'Eliminar atletas' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Ver el recorrido de un atleta' }).checked).toBe(
      false,
    )
    // Los módulos que se mostraban como "PRICING" ahora tienen nombre.
    expect(screen.getByText('Tarifas')).toBeTruthy()
    expect(screen.getByText('Tandas de inscripción')).toBeTruthy()
    expect(screen.queryByText('PRICING')).toBeNull()
  })

  it('habilitar una acción sensible arrastra la lectura y se guarda con ambas', async () => {
    const { onUpdatePermissions } = renderRoles()
    openEditor()
    // El primer rol editable es PLU.
    expect(screen.getByRole('heading', { level: 2, name: 'PLU' })).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Eliminar eventos' }))

    expect(screen.getByRole('status').textContent).toContain('Hay cambios sin guardar')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambios' }))

    await waitFor(() => expect(onUpdatePermissions).toHaveBeenCalledTimes(1))
    const [roleId, keys] = onUpdatePermissions.mock.calls[0]
    expect(roleId).toBe('plu_arg')
    expect(keys).toContain('admin.events.delete')
    expect(keys).toContain('admin.events.read')
  })

  it('los permisos reservados a Administrador no se pueden tildar en un rol operativo', () => {
    renderRoles()
    openEditor()

    expect(screen.getByRole('checkbox', { name: 'Crear cuentas y asignar roles' }).disabled).toBe(
      true,
    )
    expect(screen.getByRole('checkbox', { name: 'Gestionar roles y permisos' }).disabled).toBe(true)
    // Y tampoco los dos que el cliente dejaba pasar y el servidor rechazaba.
    expect(screen.getByRole('checkbox', { name: 'Publicar tarifas' }).disabled).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Abrir y cerrar tandas' }).disabled).toBe(true)
  })

  it('un rol protegido se ve completo pero no se puede editar', () => {
    renderRoles()
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Super Admin/ }))

    expect(screen.getByText(/Los permisos de este rol están protegidos/)).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.every((box) => box.disabled)).toBe(true)
    expect(boxes.some((box) => box.checked)).toBe(true)
    expect(screen.queryByRole('group', { name: 'Atajos de permisos' })).toBeNull()
  })

  it('el atajo de solo lectura deja únicamente permisos de lectura', async () => {
    const { onUpdatePermissions } = renderRoles()
    openEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Solo lectura' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambios' }))

    await waitFor(() => expect(onUpdatePermissions).toHaveBeenCalled())
    const keys = onUpdatePermissions.mock.calls[0][1]
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((key) => key.endsWith('.read'))).toBe(true)
  })

  it('no ofrece un atajo que concede todo', () => {
    renderRoles()
    openEditor()
    expect(screen.queryByRole('button', { name: 'Todo' })).toBeNull()
  })

  it('resume qué acciones sensibles tiene el rol', () => {
    renderRoles()
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Comunicación/ }))

    // Comunicación puede eliminar atletas: aparece como etiqueta en la ficha.
    const sensitive = document.querySelector('.roles-editor__sensitive')
    expect(sensitive.textContent).toContain('Eliminar atletas')
  })
})

describe('cambios sin guardar', () => {
  it('no deja cambiar de rol hasta resolver el borrador, y permite descartarlo', () => {
    renderRoles()
    openEditor()
    expect(screen.getByRole('heading', { level: 2, name: 'PLU' })).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Eliminar eventos' }))
    fireEvent.click(screen.getByRole('button', { name: /Tesorería/ }))

    // Sigue en PLU y avisa qué rol se quería abrir.
    expect(screen.getByRole('heading', { level: 2, name: 'PLU' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('antes de abrir el rol Tesorería')

    fireEvent.click(screen.getByRole('button', { name: 'Descartar y abrir' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Tesorería' })).toBeTruthy()
  })

  it('descartar vuelve al estado guardado', () => {
    renderRoles()
    openEditor()

    const box = screen.getByRole('checkbox', { name: 'Eliminar eventos' })
    fireEvent.click(box)
    expect(box.checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getByRole('checkbox', { name: 'Eliminar eventos' }).checked).toBe(false)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('informa el error del servidor sin perder el borrador', async () => {
    const onUpdatePermissions = vi.fn().mockRejectedValue(new Error('Matriz rechazada'))
    renderRoles({ onUpdatePermissions })
    openEditor()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Eliminar eventos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambios' }))

    expect(await screen.findByText('Matriz rechazada')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Eliminar eventos' }).checked).toBe(true)
  })
})

describe('permisos de quien mira', () => {
  it('sin permiso de auditoría no muestra el historial de cambios', () => {
    renderRoles({ authorization: { ...AUTHORIZATION, permissions: ['admin.roles.read'] } })
    openEditor()
    expect(document.querySelector('.roles-history')).toBeNull()
  })

  it('con auditoría muestra el historial del rol abierto', () => {
    renderRoles({
      activity: [
        {
          id: 'a1',
          action: 'access_role.permissions_updated',
          roleId: 'plu_arg',
          actorName: 'Ana',
          createdAt: '2026-10-01T12:00:00.000Z',
          addedPermissions: ['admin.athletes.delete'],
          removedPermissions: [],
        },
      ],
    })
    openEditor()

    const history = document.querySelector('.roles-history')
    expect(history).toBeTruthy()
    expect(history.textContent).toContain('Permisos actualizados')
    expect(history.textContent).toContain('Eliminar atletas')
  })
})

describe('duplicar un rol', () => {
  const createdRole = { id: 'copia', name: 'copia', permissions: [] }

  function renderWithCreate(props = {}) {
    const onCreateRole = vi.fn(async () => createdRole)
    return { onCreateRole, ...renderRoles({ onCreateRole, ...props }) }
  }

  function selectRole(name) {
    openEditor()
    const rail = document.querySelector('.roles-rail') ?? document
    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(name) }))
  }

  it('abre el alta con el nombre y los permisos del rol, y los envía al crear', async () => {
    const { onCreateRole } = renderWithCreate()
    selectRole('Comunicación')

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar rol' }))

    const name = screen.getByRole('textbox', { name: /Nombre/ })
    expect(name.value).toBe('Comunicación (copia)')
    expect(document.getElementById('admin-role-create').textContent).toContain('(3)')

    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }))
    await waitFor(() => expect(onCreateRole).toHaveBeenCalledTimes(1))
    expect(onCreateRole).toHaveBeenCalledWith({
      name: 'Comunicación (copia)',
      description: '',
      permissionKeys: ['admin.athletes.read', 'admin.athletes.delete', 'admin.analytics.read'],
    })
  })

  it('no copia los permisos reservados, que el servidor rechaza', async () => {
    const { onCreateRole } = renderWithCreate()
    selectRole('Super Admin')

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar rol' }))
    expect(document.getElementById('admin-role-create').textContent).toContain(
      'No se copian los reservados',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }))
    await waitFor(() => expect(onCreateRole).toHaveBeenCalledTimes(1))
    const { permissionKeys } = onCreateRole.mock.calls[0][0]
    expect(permissionKeys.length).toBeGreaterThan(0)
    for (const reserved of RESERVED_PERMISSION_KEYS) {
      expect(permissionKeys).not.toContain(reserved)
    }
  })

  it('cerrar el formulario suelta la copia: «Nuevo rol» vuelve a crear sin permisos', async () => {
    const { onCreateRole } = renderWithCreate()
    selectRole('Comunicación')
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar rol' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo rol' }))

    const name = screen.getByRole('textbox', { name: /Nombre/ })
    expect(name.value).toBe('')
    fireEvent.change(name, { target: { value: 'Rol vacío' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }))

    await waitFor(() => expect(onCreateRole).toHaveBeenCalledTimes(1))
    expect(onCreateRole.mock.calls[0][0].permissionKeys).toEqual([])
  })

  it('sin permiso para gestionar roles no se ofrece duplicar', () => {
    renderWithCreate({ authorization: { ...AUTHORIZATION, permissions: ['admin.roles.read'] } })
    selectRole('Comunicación')
    expect(screen.queryByRole('button', { name: 'Duplicar rol' })).toBeNull()
  })
})
