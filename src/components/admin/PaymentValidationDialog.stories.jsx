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

const PAYMENT_WITH_PROOF = {
  id: 'payment-2',
  paymentId: 'payment-2',
  type: 'payment',
  subject: 'Agustin Di Santo',
  detail: 'Inscripción · RORD-5144e3b632cab072',
  documentId: 'STAFF-660583de-002b-4408-aa10-94fc4f521f0b',
  meta: '$ 45.000',
  hasProof: true,
  paymentProofPath: 'proofs/transfer.jpg',
  proofUrl: 'https://placehold.co/800x1100/png?text=Comprobante',
  paymentProofUploadedAt: '2026-08-28T14:22:00.000Z',
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

export const ValidacionConComprobante = {
  args: {
    item: PAYMENT_WITH_PROOF,
    mode: 'validate',
    onCancel: () => {},
    onConfirm: () => {},
    onReject: () => {},
  },
}

export const ConsultaConComprobante = {
  args: {
    item: PAYMENT_WITH_PROOF,
    mode: 'view',
    onCancel: () => {},
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

export const AcreditacionManualConComprobante = {
  args: {
    item: {
      ...PAYMENT_WITH_PROOF,
      detail: 'Afiliación anual · PLU-2026-00841',
    },
    mode: 'settle',
    onCancel: () => {},
    onConfirm: () => {},
  },
}
