import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/config/env.js', () => ({
  env: {
    appUrl: 'http://localhost:5173',
    apiUrl: '',
    isDev: true,
    demoMode: false,
    supabase: { url: '', anonKey: '', configured: false },
    mercadoPago: { publicKey: '', configured: false },
    payments: {
      transferAlias: 'maximal.plu',
      transferCbu: '',
      transferHolder: 'Camila Pérez',
    },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
}))

const TransferPayModal = (await import('../src/components/checkout/TransferPayModal.jsx')).default

afterEach(cleanup)

describe('modal de transferencia', () => {
  it('muestra un recibo compacto sin el aviso dorado largo', () => {
    const onClose = vi.fn()
    render(
      <I18nProvider>
        <TransferPayModal
          amount={75000}
          athlete={{ documentId: '30111222', fullName: 'Agustín Demo' }}
          onClose={onClose}
        />
      </I18nProvider>,
    )

    const dialog = screen.getByRole('dialog', { name: /^transferencia$/i })
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('maximal.plu')
    expect(dialog.textContent).toContain('Camila Pérez')
    expect(dialog.textContent).toContain('El alias y el titular tienen que coincidir exactamente')
    expect(dialog.textContent).not.toContain('Verificá antes de transferir')
    expect(dialog.textContent).not.toContain('Datos para completar')
    expect(dialog.querySelector('.account-transfer-warning svg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copiar Alias' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^cerrar$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('porta el overlay a document.body para escapar el stacking del main', () => {
    render(
      <I18nProvider>
        <TransferPayModal
          amount={75000}
          athlete={{ documentId: '30111222', fullName: 'Agustín Demo' }}
          onClose={() => {}}
        />
      </I18nProvider>,
    )

    const overlay = document.body.querySelector('.account-payment-modal__overlay')
    expect(overlay).toBeTruthy()
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.querySelector('[role="dialog"]')).toBeTruthy()
    expect(overlay.querySelector('.account-payment-modal__body')).toBeTruthy()
    expect(overlay.querySelector('.account-payment-modal__footer')).toBeTruthy()
  })
})
