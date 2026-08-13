import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const verifyAthleteEmailCode = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({
  resendAthleteVerification: vi.fn(),
  verifyAthleteEmailCode,
}))

const EmailVerificationBanner = (
  await import('../src/components/ui/EmailVerificationBanner.jsx')
).default

describe('EmailVerificationBanner', () => {
  it('habilita Verificar al pegar un OTP de 8 dígitos con separadores', async () => {
    verifyAthleteEmailCode.mockResolvedValue({ ok: true, email: 'agus@plu.test' })

    render(
      <I18nProvider>
        <EmailVerificationBanner
          athlete={{ email: 'agus@plu.test', emailVerifiedAt: null, emailVerificationSent: true }}
        />
      </I18nProvider>,
    )

    const input = screen.getByLabelText('Código de 8 dígitos')
    const verify = screen.getByRole('button', { name: 'Verificar' })
    expect(verify.disabled).toBe(true)

    fireEvent.change(input, { target: { value: '12 34-56 78' } })
    expect(input.value).toBe('12345678')
    expect(verify.disabled).toBe(false)

    fireEvent.click(verify)
    await waitFor(() => expect(verifyAthleteEmailCode).toHaveBeenCalledWith('12345678'))
  })
})
