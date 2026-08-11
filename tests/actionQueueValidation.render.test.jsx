import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import ActionQueue from '../src/components/admin/ActionQueue.jsx'

vi.mock('../src/services/athleteApi.js', () => ({
  getAthletePaymentProofUrl: vi.fn(async () => 'https://cdn.example/proof.jpg'),
}))

vi.mock('../src/services/ticketApi.js', () => ({
  getTicketPaymentProofUrl: vi.fn(async () => 'https://cdn.example/ticket.pdf'),
}))

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

const PAYMENT_ITEM = {
  id: 'action-pay-p1',
  type: 'payment',
  priority: 'high',
  subject: 'Test Athlete 1',
  summary: 'Validar pago manual',
  detail: 'Afiliación anual',
  meta: '$ 38.000',
  section: 'payments',
  paymentId: 'p1',
  hasProof: true,
}

const PAYMENT_NO_PROOF = {
  ...PAYMENT_ITEM,
  id: 'action-pay-p2',
  paymentId: 'p2',
  hasProof: false,
}

function renderQueue(items, overrides = {}) {
  return render(
    <I18nProvider>
      <ActionQueue
        compact
        embedded
        showHeader={false}
        showGroupHeads={false}
        items={items}
        canEdit
        onApprovePayment={vi.fn(async () => ({}))}
        onApproveTicketOrder={vi.fn(async () => ({}))}
        onNavigate={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('ActionQueue — Validar abre modal de revisión', () => {
  it('abre el dialog con preview y confirma el approve', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_ITEM], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Test Athlete 1')).toBeTruthy()
    expect(within(dialog).getByText('Afiliación anual')).toBeTruthy()

    await waitFor(() => {
      expect(within(dialog).getByRole('img', { name: 'Comprobante de pago' })).toBeTruthy()
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar validación' }))

    await waitFor(() => {
      expect(onApprovePayment).toHaveBeenCalledWith('p1')
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('permite validar sin comprobante mostrando el aviso', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_NO_PROOF], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sin comprobante cargado')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar validación' }))

    await waitFor(() => {
      expect(onApprovePayment).toHaveBeenCalledWith('p2')
    })
  })

  it('cancela sin aprobar', async () => {
    const onApprovePayment = vi.fn(async () => ({}))
    renderQueue([PAYMENT_ITEM], { onApprovePayment })

    fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(onApprovePayment).not.toHaveBeenCalled()
  })
})
