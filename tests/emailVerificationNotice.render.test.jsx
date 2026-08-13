import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const verifyAthleteEmail = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({ verifyAthleteEmail }))

const EmailVerificationNotice = (
  await import('../src/components/ui/EmailVerificationNotice.jsx')
).default

afterEach(() => {
  verifyAthleteEmail.mockReset()
  window.history.replaceState({}, '', '/')
})

describe('EmailVerificationNotice', () => {
  it('conserva el token y permite reintentar un fallo transitorio', async () => {
    window.history.replaceState({}, '', '/?verificar=token-de-prueba')
    verifyAthleteEmail
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ ok: true })

    render(<EmailVerificationNotice />)

    await screen.findByText('No pudimos confirmar el correo ahora. Reintentá en unos segundos.')
    expect(window.location.search).toContain('verificar=token-de-prueba')

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(verifyAthleteEmail).toHaveBeenCalledTimes(2))
    await screen.findByText('Tu correo quedó confirmado. Ya podés afiliarte e inscribirte.')
    expect(window.location.search).toBe('')
  })
})
