import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const sendEventCredentials = vi.fn()
vi.mock('../src/services/athleteApi.js', () => ({ sendEventCredentials }))

const { default: AdminEventCredentialSend } =
  await import('../src/components/admin/AdminEventCredentialSend.jsx')

beforeEach(() => sendEventCredentials.mockReset())
afterEach(cleanup)

describe('Enviar credenciales (panel del evento)', () => {
  it('primero cuenta y muestra a cuántos les llega; recién al confirmar envía', async () => {
    sendEventCredentials
      .mockResolvedValueOnce({ confirmed: 239, ready: 236, blocked: 0, noEmail: 3, dryRun: true })
      .mockResolvedValueOnce({ confirmed: 239, ready: 236, sent: 236, already: 0, failed: 0 })

    render(
      <I18nProvider>
        <AdminEventCredentialSend eventSlug="pitbull-classic-2026" />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /enviar credenciales/i }))
    expect(await screen.findByText(/le llega a 236 de 239 confirmados/i)).toBeTruthy()
    expect(screen.getByText(/3 sin email/i)).toBeTruthy()
    expect(sendEventCredentials).toHaveBeenLastCalledWith('pitbull-classic-2026', { dryRun: true })

    fireEvent.click(screen.getByRole('button', { name: /enviar a 236/i }))
    await waitFor(() =>
      expect(sendEventCredentials).toHaveBeenLastCalledWith('pitbull-classic-2026'),
    )
    expect(await screen.findByRole('button', { name: /enviar credenciales/i })).toBeTruthy()
  })
})
