import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import UsersSection from '../src/pages/admin/UsersSection.jsx'

/**
 * Usuarios: filtro por rol y cambio de rol en lote. Protege que el lote no
 * ofrezca lo que el servidor va a rechazar (Super Admin, Seguridad), que pida
 * confirmación antes de cortar sesiones y que informe cuenta por cuenta.
 */

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
    id: 'usr-ana',
    name: 'Ana Operadora',
    email: 'ana@pluarg.test',
    role: 'operador_plu_arg',
    roleKey: 'plu_arg',
    status: 'active',
  },
  {
    id: 'usr-beto',
    name: 'Beto Operador',
    email: 'beto@pluarg.test',
    role: 'operador_plu_arg',
    roleKey: 'plu_arg',
    status: 'active',
  },
  {
    id: 'usr-tesoreria',
    name: 'Tere Tesorera',
    email: 'tere@pluarg.test',
    role: 'operador_plu_arg',
    roleKey: 'tesoreria',
    roleLabel: 'Tesorería',
    status: 'active',
  },
]

const ACCESS_ROLES = [
  { key: 'plu_arg', name: 'PLU', active: true, canAssign: true },
  { key: 'tesoreria', name: 'Tesorería', active: true, canAssign: true },
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
        canManageUsers
        onBulkUpdateRole={vi.fn(async () => [])}
        onUpdateRole={async () => ({})}
        users={USERS}
        {...overrides}
      />
    </I18nProvider>,
  )
}

const pick = (name) => screen.getByRole('checkbox', { name: `Seleccionar a ${name}` })

describe('filtro por rol', () => {
  it('lista los roles del padrón con su cantidad y filtra', () => {
    renderUsers()

    const filter = screen.getByRole('combobox', { name: 'Rol' })
    const labels = within(filter)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(labels).toContain('PLU · 2')
    expect(labels).toContain('Tesorería · 1')

    fireEvent.change(filter, { target: { value: 'tesoreria' } })
    expect(screen.getByText('Tere Tesorera')).toBeTruthy()
    expect(screen.queryByText('Ana Operadora')).toBeNull()
  })

  it('llega prefijado desde Roles y se puede soltar', () => {
    renderUsers({ initialRoleFilter: 'plu_arg' })

    expect(screen.getByText('Ana Operadora')).toBeTruthy()
    expect(screen.queryByText('Tere Tesorera')).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Rol' }), { target: { value: 'all' } })
    expect(screen.getByText('Tere Tesorera')).toBeTruthy()
  })
})

describe('cambio de rol en lote', () => {
  it('sin la acción en lote no hay selección ni barra', () => {
    renderUsers({ onBulkUpdateRole: undefined })
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar a Ana Operadora' })).toBeNull()
  })

  it('no deja tildar al Super Admin y no ofrece Seguridad como destino', () => {
    renderUsers()

    expect(pick('Super Admin').disabled).toBe(true)

    fireEvent.click(pick('Ana Operadora'))
    const select = screen.getByRole('combobox', { name: 'Cambiar rol a' })
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toContain('Tesorería')
    expect(options).not.toContain('Seguridad')
  })

  it('pide confirmación y recién ahí manda el lote', async () => {
    const onBulkUpdateRole = vi.fn(async (ids) =>
      ids.map((userId) => ({ userId, status: 'updated', user: {} })),
    )
    renderUsers({ onBulkUpdateRole })

    fireEvent.click(pick('Ana Operadora'))
    fireEvent.click(pick('Beto Operador'))
    expect(screen.getByRole('region', { name: 'Cambio de rol en lote' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Cambiar rol a' }), {
      target: { value: 'tesoreria' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 2' }))

    // Todavía no se mandó nada: primero se avisa que se cortan las sesiones.
    expect(onBulkUpdateRole).not.toHaveBeenCalled()
    expect(screen.getByText(/Se cierran sus sesiones abiertas/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))

    await waitFor(() => expect(onBulkUpdateRole).toHaveBeenCalledTimes(1))
    expect(onBulkUpdateRole).toHaveBeenCalledWith(['usr-ana', 'usr-beto'], 'tesoreria')
    expect(await screen.findByText(/Cuentas pasadas a «Tesorería»: 2/)).toBeTruthy()
    // Terminó bien: la selección se suelta y la barra desaparece.
    expect(screen.queryByRole('region', { name: 'Cambio de rol en lote' })).toBeNull()
  })

  it('informa lo que falló y deja tildado sólo eso', async () => {
    const onBulkUpdateRole = vi.fn(async () => [
      { userId: 'usr-ana', status: 'updated', user: {} },
      { userId: 'usr-beto', status: 'failed', error: 'El usuario no existe.' },
    ])
    renderUsers({ onBulkUpdateRole })

    fireEvent.click(pick('Ana Operadora'))
    fireEvent.click(pick('Beto Operador'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Cambiar rol a' }), {
      target: { value: 'tesoreria' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))

    expect(await screen.findByText(/Con error: 1/)).toBeTruthy()
    const failures = document.querySelector('.admin-users__bulk-failures')
    expect(failures.textContent).toBe('Beto Operador: El usuario no existe.')
    // Queda la barra con la cuenta que falló, lista para revisar o reintentar.
    expect(
      screen.getByRole('region', { name: 'Cambio de rol en lote' }).textContent,
    ).toContain('1')
    expect(pick('Beto Operador').checked).toBe(true)
    expect(pick('Ana Operadora').checked).toBe(false)
  })

  it('si el pedido entero falla muestra el error y no pierde la selección', async () => {
    const onBulkUpdateRole = vi.fn(async () => {
      throw new Error('No tenés permisos para asignar ese rol.')
    })
    renderUsers({ onBulkUpdateRole })

    fireEvent.click(pick('Ana Operadora'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Cambiar rol a' }), {
      target: { value: 'tesoreria' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('No tenés permisos para asignar ese rol.')).toBeTruthy()
    expect(pick('Ana Operadora').checked).toBe(true)
  })
})
