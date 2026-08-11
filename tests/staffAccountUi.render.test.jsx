import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AccountDialog from '../src/components/admin/AccountDialog.jsx'
import StaffPasswordChangePage from '../src/pages/StaffPasswordChangePage.jsx'
import UsersSection from '../src/pages/admin/UsersSection.jsx'

const SESSION = {
  id: 'usr-1',
  name: 'Admin PLU',
  email: 'viejo@pluarg.test',
  roleKey: 'admin_plu_arg',
  roleLabel: 'Administrador',
  mustChangePassword: true,
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

function renderGate(overrides = {}) {
  return render(
    <I18nProvider>
      <StaffPasswordChangePage
        session={SESSION}
        onChangePassword={async () => ({})}
        onLogout={() => {}}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('StaffPasswordChangePage', () => {
  it('identifica la cuenta y no ofrece ninguna salida al panel', () => {
    renderGate()

    expect(screen.getByText('viejo@pluarg.test')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Elegí tu contraseña' })).toBeTruthy()
    // La única salida es cerrar sesión: mientras la clave sea temporal el
    // servidor responde 403 en todo lo demás.
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy()
  })

  it('exige mínimo 12 caracteres y que ambas coincidan antes de pegarle a la API', async () => {
    const onChangePassword = vi.fn(async () => ({}))
    renderGate({ onChangePassword })

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'temporal' } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'corta' } })
    fireEvent.change(screen.getByLabelText('Repetí la contraseña nueva'), {
      target: { value: 'corta' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar y entrar/ }))

    await waitFor(() =>
      expect(screen.getByText('Elegí una contraseña de al menos 12 caracteres.')).toBeTruthy(),
    )
    expect(onChangePassword).not.toHaveBeenCalled()
  })

  it('envía la contraseña nueva cuando el formulario es válido', async () => {
    const onChangePassword = vi.fn(async () => ({}))
    renderGate({ onChangePassword })

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'temporal-x' } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), {
      target: { value: 'mi-clave-propia-2026' },
    })
    fireEvent.change(screen.getByLabelText('Repetí la contraseña nueva'), {
      target: { value: 'mi-clave-propia-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar y entrar/ }))

    await waitFor(() =>
      expect(onChangePassword).toHaveBeenCalledWith({
        currentPassword: 'temporal-x',
        password: 'mi-clave-propia-2026',
      }),
    )
  })
})

describe('AccountDialog', () => {
  function renderDialog(overrides = {}) {
    return render(
      <I18nProvider>
        <AccountDialog
          session={{ ...SESSION, mustChangePassword: false }}
          onRequestEmailChange={async () => ({ pendingEmail: 'nuevo@pluarg.test' })}
          onClose={() => {}}
          {...overrides}
        />
      </I18nProvider>,
    )
  }

  it('muestra la identidad vigente y pide la contraseña actual', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Admin PLU' })).toBeTruthy()
    expect(screen.getByText('viejo@pluarg.test')).toBeTruthy()
    expect(screen.getByText('Administrador')).toBeTruthy()
    expect(screen.getByLabelText('Contraseña actual')).toBeTruthy()
  })

  it('rechaza el mismo email sin llamar a la API', async () => {
    const onRequestEmailChange = vi.fn(async () => ({}))
    renderDialog({ onRequestEmailChange })

    fireEvent.change(screen.getByLabelText('Email nuevo'), {
      target: { value: 'viejo@pluarg.test' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'clave' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }))

    await waitFor(() => expect(screen.getByText('Ese ya es el email de tu cuenta.')).toBeTruthy())
    expect(onRequestEmailChange).not.toHaveBeenCalled()
  })

  it('avisa que el cambio recién se aplica al confirmar desde la casilla nueva', async () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('Email nuevo'), {
      target: { value: 'nuevo@pluarg.test' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'clave' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }))

    await waitFor(() =>
      expect(screen.getByText(/El cambio se aplica recién cuando lo confirmes/)).toBeTruthy(),
    )
  })
})

describe('UsersSection — credencial temporal', () => {
  const USERS = [
    {
      id: 'usr-test',
      name: 'Cuenta Test',
      email: 'test@pluarg.test',
      role: 'operador_plu_arg',
      roleKey: 'plu_arg',
      status: 'active',
    },
  ]

  function renderUsers(overrides = {}) {
    return render(
      <I18nProvider>
        <UsersSection
          accessRoles={[]}
          adminEvents={[]}
          canDeleteUsers={false}
          canManageUsers
          onCreateSecurityUser={async () => ({})}
          onCreateUser={async () => ({})}
          onUpdateRole={async () => ({})}
          onUpdateStatus={async () => ({})}
          users={USERS}
          {...overrides}
        />
      </I18nProvider>,
    )
  }

  it('no ofrece reenviar credencial sin handler', () => {
    renderUsers()
    expect(screen.queryByLabelText('Reenviar credencial')).toBeNull()
  })

  it('muestra la credencial en pantalla y avisa cuando el mail no salió', async () => {
    const onResetPassword = vi.fn(async () => ({
      user: USERS[0],
      tempPassword: 'Zx9-temporal',
      emailed: false,
    }))
    renderUsers({ onResetPassword })

    fireEvent.click(screen.getAllByLabelText('Reenviar credencial')[0])

    await waitFor(() => expect(screen.getByText('Zx9-temporal')).toBeTruthy())
    expect(screen.getByText(/No pudimos enviar el mail/)).toBeTruthy()
  })

  it('confirma el envío cuando el mail sí salió', async () => {
    const onResetPassword = vi.fn(async () => ({
      user: USERS[0],
      tempPassword: 'Zx9-temporal',
      emailed: true,
    }))
    renderUsers({ onResetPassword })

    fireEvent.click(screen.getAllByLabelText('Reenviar credencial')[0])

    await waitFor(() =>
      expect(screen.getByText(/Le enviamos las credenciales a test@pluarg\.test/)).toBeTruthy(),
    )
  })
})
