import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const uploadAthletePaymentProof = vi.fn()
const registerAthletePaymentProof = vi.fn()

vi.mock('../src/services/athleteProofService.js', () => ({
  uploadAthletePaymentProof,
  validateAthletePaymentProofFile: () => ({}),
}))
vi.mock('../src/services/athleteApi.js', () => ({ registerAthletePaymentProof }))

const TransferProofUpload = (await import('../src/components/ui/TransferProofUpload.jsx')).default

describe('TransferProofUpload', () => {
  it('sube, registra el comprobante y publica la actualización para refrescar el estado', async () => {
    uploadAthletePaymentProof.mockResolvedValue({ storagePath: 'order-1/comprobante.pdf' })
    registerAthletePaymentProof.mockResolvedValue({ order: { id: 'order-1', status: 'validacion_manual' } })
    const onUploaded = vi.fn()
    const onPaymentUpdated = vi.fn()
    window.addEventListener('plu:payment-updated', onPaymentUpdated)

    render(
      <I18nProvider>
        <TransferProofUpload orderId="order-1" onUploaded={onUploaded} />
      </I18nProvider>,
    )
    const file = new File(['recibo'], 'comprobante.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/adjuntar comprobante/i), { target: { files: [file] } })

    await waitFor(() => {
      expect(uploadAthletePaymentProof).toHaveBeenCalledWith('order-1', file)
      expect(registerAthletePaymentProof).toHaveBeenCalledWith('order-1', 'order-1/comprobante.pdf', undefined)
    })
    expect(screen.getByText(/administración lo valida en hasta 48 horas/i)).toBeTruthy()
    expect(onUploaded).toHaveBeenCalledWith({ id: 'order-1', status: 'validacion_manual' })
    expect(onPaymentUpdated).toHaveBeenCalledTimes(1)
    window.removeEventListener('plu:payment-updated', onPaymentUpdated)
  })
})
