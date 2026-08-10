import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        accessRoles={[]}
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

describe('UsersSection — eliminación de cuentas', () => {
  it('muestra la acción sólo cuando el actor puede eliminar usuarios', () => {
    renderUsers({ canDeleteUsers: false })
    expect(screen.queryByLabelText('Eliminar usuario')).toBeNull()
  })

  it('confirma la cuenta exacta antes de eliminarla', async () => {
    const onDeleteUser = vi.fn(async () => ({ id: 'usr-test' }))
    renderUsers({ onDeleteUser })

    fireEvent.click(screen.getAllByLabelText('Eliminar usuario')[0])
    expect(screen.getByRole('dialog', { name: '¿Eliminar usuario?' })).toBeTruthy()
    expect(screen.getByText(/Cuenta Test \(test@pluarg\.test\)/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() => expect(onDeleteUser).toHaveBeenCalledWith('usr-test'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
