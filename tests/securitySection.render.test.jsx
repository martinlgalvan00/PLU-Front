import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { ThemeProvider } from '../src/providers/ThemeProvider.jsx'
import SecuritySection from '../src/pages/profile/SecuritySection.jsx'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderSection(session = { email: 'demo@pluarg.com.ar' }) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <SecuritySection session={session} />
      </I18nProvider>
    </ThemeProvider>,
  )
}

describe('SecuritySection', () => {
  it('agrupa preferencias y seguridad, y permite cambiar el idioma al instante', async () => {
    renderSection()

    expect(screen.getByRole('heading', { level: 3, name: 'Preferencias' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Seguridad' })).toBeTruthy()
    const spanish = screen.getByRole('radio', { name: 'Español' })
    expect(spanish.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true')
    expect(await screen.findByRole('heading', { level: 2, name: 'Settings' })).toBeTruthy()
  })

  it('muestra el formulario, el CTA y el email de sesión', () => {
    renderSection()

    expect(screen.getByRole('heading', { level: 2, name: 'Ajustes' })).toBeTruthy()
    expect(screen.getByLabelText('Contraseña actual')).toBeTruthy()
    expect(screen.getByLabelText('Nueva contraseña')).toBeTruthy()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actualizar contraseña' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Sesión actual' })).toBeTruthy()
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
