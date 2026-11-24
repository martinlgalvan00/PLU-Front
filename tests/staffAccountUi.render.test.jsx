import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { ThemeProvider } from '../src/providers/ThemeProvider.jsx'
import AccountDialog from '../src/components/admin/AccountDialog.jsx'
import StaffPasswordChangePage from '../src/pages/StaffPasswordChangePage.jsx'
import StaffInvitationPage from '../src/pages/StaffInvitationPage.jsx'
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

    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'temporal-x' },
    })
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

describe('StaffInvitationPage', () => {
  it('permite definir la contraseña sin pedir una credencial temporal', async () => {
    const onAccept = vi.fn().mockResolvedValue({})
    render(
      <I18nProvider>
        <StaffInvitationPage token="token-firmado" onAccept={onAccept} onCancel={() => {}} />
      </I18nProvider>,
    )

    fireEvent.change(screen.getByLabelText('Contraseña nueva'), {
      target: { value: 'Nueva-clave-segura-2026' },
    })
    fireEvent.change(screen.getByLabelText('Repetí la contraseña nueva'), {
      target: { value: 'Nueva-clave-segura-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Crear contraseña y entrar/ }))

    await waitFor(() =>
      expect(onAccept).toHaveBeenCalledWith({
        token: 'token-firmado',
        password: 'Nueva-clave-segura-2026',
      }),
    )
    expect(screen.queryByLabelText('Contraseña actual')).toBeNull()
  })
})

describe('AccountDialog', () => {
  function renderDialog(overrides = {}) {
    return render(
      <ThemeProvider>
        <I18nProvider>
          <AccountDialog
            session={{ ...SESSION, mustChangePassword: false }}
            onRequestEmailChange={async () => ({ pendingEmail: 'nuevo@pluarg.test' })}
            onClose={() => {}}
            {...overrides}
          />
        </I18nProvider>
      </ThemeProvider>,
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

  // "Reenviar invitación" vive en el menú de la fila ("Más acciones").
  function openRowMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }))
  }

  it('no ofrece reenviar invitación sin handler', () => {
    renderUsers()
    openRowMenu()
    expect(screen.queryByRole('menuitem', { name: 'Reenviar invitación' })).toBeNull()
  })

  it('no expone credenciales y avisa cuando el mail no salió', async () => {
    const onResetPassword = vi.fn(async () => ({
      user: USERS[0],
      emailed: false,
    }))
    renderUsers({ onResetPassword })

    openRowMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reenviar invitación' }))

    await waitFor(() => expect(screen.getByText('Invitación reemitida')).toBeTruthy())
    expect(screen.queryByText('Zx9-temporal')).toBeNull()
    expect(screen.getByText(/No pudimos enviar el mail/)).toBeTruthy()
  })

  it('confirma el envío cuando el mail sí salió', async () => {
    const onResetPassword = vi.fn(async () => ({
      user: USERS[0],
      emailed: true,
    }))
    renderUsers({ onResetPassword })

    openRowMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reenviar invitación' }))

    await waitFor(() =>
      expect(screen.getByText(/Le enviamos un enlace personal a test@pluarg\.test/)).toBeTruthy(),
    )
  })

  it('muestra el enlace generado y lo copia al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const onResetPassword = vi.fn(async () => ({
      user: USERS[0],
      emailed: false,
      invitationUrl: 'https://panel.pluarg.test/?invitacion-staff=abc.def',
      invitationExpiresAt: '2099-01-10T12:00:00.000Z',
    }))
    renderUsers({ onResetPassword })

    openRowMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Generar enlace' }))

    await waitFor(() => expect(onResetPassword).toHaveBeenCalledWith(USERS[0].id, false))
    const field = await screen.findByLabelText('Enlace de activación')
    expect(field.value).toBe('https://panel.pluarg.test/?invitacion-staff=abc.def')
    expect(screen.queryByText(/No pudimos enviar el mail/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Copiar enlace/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value))
    expect(await screen.findByText('Enlace copiado')).toBeTruthy()
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain(
      'https://wa.me/?text=',
    )
  })
})

describe('StaffInvitationPage con vista previa', () => {
  it('muestra para quién es la invitación y el rol ya asignado', async () => {
    const onLoadInvitation = vi.fn().mockResolvedValue({
      invitation: {
        name: 'Alexis D’Alessandro',
        email: 'alexis@pluarg.test',
        roleName: 'Super Admin',
      },
    })
    render(
      <I18nProvider>
        <StaffInvitationPage
          token="token-firmado"
          onAccept={vi.fn()}
          onCancel={() => {}}
          onLoadInvitation={onLoadInvitation}
        />
      </I18nProvider>,
    )

    expect(await screen.findByText('Super Admin')).toBeTruthy()
    expect(screen.getByText('alexis@pluarg.test')).toBeTruthy()
  })

  it('en una invitación abierta pide nombre y email y los envía con la clave', async () => {
    const onAccept = vi.fn().mockResolvedValue({})
    const onLoadInvitation = vi.fn().mockResolvedValue({
      invitation: { needsProfile: true, name: '', email: '', roleName: 'Super Admin' },
    })
    render(
      <I18nProvider>
        <StaffInvitationPage
          token="token-firmado"
          onAccept={onAccept}
          onCancel={() => {}}
          onLoadInvitation={onLoadInvitation}
        />
      </I18nProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Nombre y apellido'), {
      target: { value: 'Lucía Fernández' },
    })
    fireEvent.change(screen.getByLabelText(/^Tu email/), { target: { value: 'Lucia@pluarg.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), {
      target: { value: 'Nueva-clave-segura-2026' },
    })
    fireEvent.change(screen.getByLabelText('Repetí la contraseña nueva'), {
      target: { value: 'Nueva-clave-segura-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Crear contraseña y entrar/ }))

    await waitFor(() =>
      expect(onAccept).toHaveBeenCalledWith({
        token: 'token-firmado',
        password: 'Nueva-clave-segura-2026',
        name: 'Lucía Fernández',
        email: 'lucia@pluarg.test',
      }),
    )
  })

  it('reemplaza el formulario si el enlace ya no sirve', async () => {
    const onLoadInvitation = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { status: 400 }))
    render(
      <I18nProvider>
        <StaffInvitationPage
          token="token-viejo"
          onAccept={vi.fn()}
          onCancel={() => {}}
          onLoadInvitation={onLoadInvitation}
        />
      </I18nProvider>,
    )

    await waitFor(() => expect(screen.queryByLabelText('Contraseña nueva')).toBeNull())
    expect(screen.getByText(/inválida, ya fue utilizada o venció/)).toBeTruthy()
  })
})
