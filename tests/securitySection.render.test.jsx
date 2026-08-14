import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import SecuritySection from '../src/pages/profile/SecuritySection.jsx'

afterEach(cleanup)

function renderSection(session = { email: 'demo@pluarg.com.ar' }) {
  return render(
    <I18nProvider>
      <SecuritySection session={session} />
    </I18nProvider>,
  )
}

describe('SecuritySection', () => {
  it('muestra el formulario, el CTA y el email de sesión', () => {
    renderSection()

    expect(screen.getByRole('heading', { level: 2, name: 'Seguridad' })).toBeTruthy()
    expect(screen.getByLabelText('Contraseña actual')).toBeTruthy()
    expect(screen.getByLabelText('Nueva contraseña')).toBeTruthy()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actualizar contraseña' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Sesión actual' })).toBeTruthy()
    expect(screen.getByText('demo@pluarg.com.ar')).toBeTruthy()
    expect(screen.getByText(/cuenta demo/i)).toBeTruthy()
  })

  it('valida campos vacíos y no muestra éxito', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))

    expect(screen.getByText('Ingresá tu contraseña actual.')).toBeTruthy()
    expect(screen.getByText('La nueva contraseña debe tener al menos 8 caracteres.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('confirma el cambio local cuando el formulario es válido', () => {
    renderSection()

    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { name: 'currentPassword', value: 'oldpass1' },
    })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { name: 'newPassword', value: 'newpass12' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { name: 'confirmPassword', value: 'newpass12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))

    expect(screen.getByRole('status').textContent).toBe('Contraseña actualizada.')
  })
})
