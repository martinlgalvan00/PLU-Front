import '../../styles/pages/admin.css'
import PaymentValidationDialog from './PaymentValidationDialog.jsx'

const PAYMENT_WITHOUT_PROOF = {
  id: 'payment-1',
  paymentId: 'payment-1',
  type: 'payment',
  subject: 'Agostina Suarez',
  detail: 'Afiliación anual',
  documentId: '43014626',
  meta: '$ 85.000',
  hasProof: false,
  paymentProofPath: null,
}

export default {
  title: 'Admin/PaymentValidationDialog',
  component: PaymentValidationDialog,
  parameters: { layout: 'fullscreen' },
}

export const ConsultaSinComprobante = {
  args: {
    item: PAYMENT_WITHOUT_PROOF,
    mode: 'view',
    onCancel: () => {},
  },
}

export const ValidacionSinComprobante = {
  args: {
    item: PAYMENT_WITHOUT_PROOF,
    mode: 'validate',
    onCancel: () => {},
    onConfirm: () => {},
    onReject: () => {},
  },
}

/**
 * Acreditación manual de una orden que Mercado Pago dio por perdida. Sin
 * comprobante el botón queda deshabilitado aunque se escriba el motivo: la
 * evidencia del cobro es condición, no un campo más del formulario.
 */
export const AcreditacionManual = {
  args: {
    item: {
      ...PAYMENT_WITHOUT_PROOF,
      detail: 'Afiliación anual · PLU-2026-00841',
    },
    mode: 'settle',
    onCancel: () => {},
    onConfirm: () => {},
  },
}
