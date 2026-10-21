import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PaymentValidationDialog from '../src/components/admin/PaymentValidationDialog.jsx'

afterEach(() => {
  cleanup()
})

function renderDialog(item) {
  return render(
    <I18nProvider>
      <PaymentValidationDialog
        item={item}
        mode="validate"
        onCancel={() => {}}
        onConfirm={() => {}}
        onReject={() => {}}
      />
    </I18nProvider>,
  )
}

describe('PaymentValidationDialog entradas', () => {
  it('habilita el QR de una transferencia sin archivo y lista a los asistentes', () => {
    renderDialog({
      type: 'ticket',
      orderId: 'order-1',
      requiresProofOverride: true,
      hasProof: false,
      subject: 'Hernán Ali (55954736) · Cristhian Godoy (95994950)',
      subjects: ['Hernán Ali (55954736)', 'Cristhian Godoy (95994950)'],
      method: 'Transferencia',
      detail: 'Pitbull Classic · TORD-1',
      meta: '$ 60.000',
    })

    expect(screen.getByRole('heading', { name: 'Habilitar el QR' })).toBeTruthy()
    expect(screen.getByText('Entrada')).toBeTruthy()
    expect(screen.getByText('Asistentes')).toBeTruthy()
    expect(screen.getByText('Hernán Ali (55954736)')).toBeTruthy()
    expect(screen.getByText('Cristhian Godoy (95994950)')).toBeTruthy()
    expect(screen.getByText('Transferencia')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Habilitar QR' })).toBeTruthy()
    expect(screen.getByText(/abre el QR y avisa por mail/i)).toBeTruthy()
    expect(screen.queryByText(/afiliación o inscripción/i)).toBeNull()
    expect(screen.queryByText(/ADMIN\.ACTIONQUEUE/i)).toBeNull()
  })

  it('mantiene el aviso de afiliación cuando el override es de un pago de atleta', () => {
    renderDialog({
      type: 'payment',
      paymentId: 'pay-1',
      requiresProofOverride: true,
      hasProof: false,
      subject: 'Agostina Suarez',
      detail: 'Afiliación anual',
      meta: '$ 85.000',
    })

    expect(screen.getByText(/activa la afiliación o inscripción/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Habilitar QR' })).toBeNull()
  })
})
