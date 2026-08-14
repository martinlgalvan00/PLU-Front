import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import RegistrationAccessGateModal from '../src/components/checkout/RegistrationAccessGateModal.jsx'
import { verifyRegistrationAccessCode } from '../src/services/registrationAccessService.js'

vi.mock('../src/services/registrationAccessService.js', () => ({
  verifyRegistrationAccessCode: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.mocked(verifyRegistrationAccessCode).mockReset())

function renderGate(props = {}) {
  const onUnlock = props.onUnlock ?? vi.fn()
  const onCancel = props.onCancel ?? vi.fn()
  return {
    onUnlock,
    onCancel,
    ...render(
      <I18nProvider>
        <RegistrationAccessGateModal
          scopes={['membership']}
          {...props}
          onUnlock={onUnlock}
          onCancel={onCancel}
        />
      </I18nProvider>,
    ),
  }
}

describe('RegistrationAccessGateModal', () => {
  it('pide solo la contraseña del alcance restringido', () => {
    renderGate({ scopes: ['registration'], eventSlug: 'pitbull-classic' })

    expect(screen.getByLabelText('Contraseña de inscripción')).toBeTruthy()
    expect(screen.queryByLabelText('Contraseña de afiliación')).toBeNull()
  })

  it('pide las dos contraseñas en el combo', () => {
    renderGate({ scopes: ['membership', 'registration'], eventSlug: 'pitbull-classic' })

    expect(screen.getByLabelText('Contraseña de afiliación')).toBeTruthy()
    expect(screen.getByLabelText('Contraseña de inscripción')).toBeTruthy()
  })

  it('no deja desbloquear con el campo vacío', () => {
    renderGate()

    expect(screen.getByRole('button', { name: /Desbloquear/ }).disabled).toBe(true)
  })

  it('desbloquea y devuelve el código cuando la contraseña valida', async () => {
    vi.mocked(verifyRegistrationAccessCode).mockResolvedValue({ valid: true, required: true })
    const { onUnlock } = renderGate()

    fireEvent.change(screen.getByLabelText('Contraseña de afiliación'), {
      target: { value: '  TANDA-PLU-2026  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear/ }))

    await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce())
    // El código viaja recortado: el atleta que copia y pega se lleva espacios
    // que el hash del backend no perdona.
    expect(onUnlock).toHaveBeenCalledWith({
      membershipCode: 'TANDA-PLU-2026',
      registrationCode: '',
    })
    expect(verifyRegistrationAccessCode).toHaveBeenCalledWith({
      scope: 'membership',
      code: 'TANDA-PLU-2026',
    })
  })

  it('muestra el error y no desbloquea cuando la contraseña es incorrecta', async () => {
    vi.mocked(verifyRegistrationAccessCode).mockRejectedValueOnce({
      status: 403,
      message: 'El código de habilitación no es válido.',
    })
    const { onUnlock } = renderGate()

    fireEvent.change(screen.getByLabelText('Contraseña de afiliación'), {
      target: { value: 'CODIGO-INCORRECTO' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear/ }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no es correcta'))
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('avisa cuando el limitador corta los intentos', async () => {
    vi.mocked(verifyRegistrationAccessCode).mockRejectedValueOnce({
      status: 429,
      message: 'Demasiados intentos.',
    })
    renderGate()

    fireEvent.change(screen.getByLabelText('Contraseña de afiliación'), {
      target: { value: 'OTRO-INTENTO' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear/ }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Demasiados intentos'))
  })

  it('no valida la inscripción si la afiliación ya falló', async () => {
    vi.mocked(verifyRegistrationAccessCode).mockRejectedValueOnce({
      status: 403,
      message: 'El código de habilitación no es válido.',
    })
    renderGate({ scopes: ['membership', 'registration'], eventSlug: 'pitbull-classic' })

    fireEvent.change(screen.getByLabelText('Contraseña de afiliación'), {
      target: { value: 'MAL' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña de inscripción'), {
      target: { value: 'BIEN' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(verifyRegistrationAccessCode).toHaveBeenCalledOnce()
  })

  it('cierra con Escape sin desbloquear', () => {
    const { onCancel, onUnlock } = renderGate()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalled()
    expect(onUnlock).not.toHaveBeenCalled()
  })
})
