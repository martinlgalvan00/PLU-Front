import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import { OAuthContext, disabledOAuth } from '../src/providers/oauthContext.js'

// jsdom no implementa matchMedia y MotionProvider la consulta para
// prefers-reduced-motion.
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

/**
 * Lo que protege este render es el estado observable del acceso, no su estética.
 *
 * Tres cosas se rompen en silencio si alguien toca la página: el aviso de Bloq
 * Mayús (la causa más común de "credenciales inválidas" con la contraseña
 * oculta), el estado ocupado del CTA mientras la sesión está en vuelo, y el
 * cambio de modo login → recuperar, que ahora pasa por un crossfade y podría
 * dejar los dos paneles montados.
 */

vi.mock('../src/services/athleteApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    forgotAthletePassword: vi.fn(async () => ({})),
  }
})

const LoginPage = (await import('../src/pages/LoginPage.jsx')).default
const { forgotAthletePassword } = await import('../src/services/athleteApi.js')

function renderLogin({ onLogin = vi.fn(), onNavigate = vi.fn() } = {}) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <LoginPage onLogin={onLogin} onNavigate={onNavigate} />
      </MotionProvider>
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('LoginPage', () => {
  it('avisa Bloq Mayús mientras se tipea y lo retira al salir del campo', () => {
    renderLogin()
    const password = screen.getByLabelText('Contraseña')

    fireEvent.keyDown(password, { key: 'a', modifierCapsLock: true })
    expect(screen.getByText('Bloq Mayús activado')).toBeTruthy()

    fireEvent.blur(password)
    expect(screen.queryByText('Bloq Mayús activado')).toBeNull()
  })

  it('marca el CTA como ocupado mientras la sesión está en vuelo', async () => {
    let resolveLogin
    const onLogin = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveLogin = () => resolve({ role: 'athlete_plu' })
        }),
    )
    renderLogin({ onLogin })

    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
      target: { value: 'atleta@plu.test' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta123' } })
    fireEvent.click(screen.getByRole('button', { name: /Ingresar/i }))

    const busy = await screen.findByRole('button', { name: /Ingresando/i })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(busy.disabled).toBe(true)

    resolveLogin()
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
  })

  it('el botón de OAuth vive dentro del form pero no lo envía', async () => {
    const onLogin = vi.fn()
    const oauthLogin = vi.fn(async () => {})
    render(
      <I18nProvider>
        <MotionProvider>
          <OAuthContext.Provider
            value={{ ...disabledOAuth, configured: true, login: oauthLogin }}
          >
            <LoginPage onLogin={onLogin} onNavigate={vi.fn()} />
          </OAuthContext.Provider>
        </MotionProvider>
      </I18nProvider>,
    )

    const oauthButton = screen.getByRole('button', { name: /Ingresar con OAuth/i })
    expect(oauthButton.getAttribute('type')).toBe('button')
    fireEvent.click(oauthButton)

    await waitFor(() => expect(oauthLogin).toHaveBeenCalledTimes(1))
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('cambia a recuperar acceso sin dejar el formulario de login montado', async () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Recuperar acceso' })).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeNull()
    })
    expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeTruthy()
  })

  it('confirma el envío con un título de bandeja, no el de recuperar', async () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Recuperar acceso' })).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeNull()
    })

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'atleta@plu.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revisá tu correo' })).toBeTruthy()
    })
    expect(forgotAthletePassword).toHaveBeenCalled()
    expect(screen.getByText(/atleta@plu.test/)).toBeTruthy()
  })
})
