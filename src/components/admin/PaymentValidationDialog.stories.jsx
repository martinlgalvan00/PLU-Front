import { expect, userEvent, within } from 'storybook/test'
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

/**
 * Transferencia de entradas sin archivo: la ficha pide el motivo y lista a
 * cada asistente antes de habilitar el QR.
 */
export const EntradaSinComprobante = {
  args: {
    item: {
      type: 'ticket',
      orderId: 'ticket-order-1',
      requiresProofOverride: true,
      hasProof: false,
      paymentProofPath: null,
      subject: 'Hernán Ali (55954736) · Cristhian Godoy (95994950) · José Martínez (30743158)',
      subjects: [
        'Hernán Ali (55954736)',
        'Cristhian Godoy (95994950)',
        'José Martínez (30743158)',
        'Angelo Ruiz (40111222)',
      ],
      method: 'Transferencia',
      detail: 'Pitbull Classic · TORD-1',
      meta: '$ 60.000',
    },
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

/**
 * Orden ya resuelta: se puede dar de baja el comprobante (va a la papelera y se
 * restaura desde Cobros). La imagen es local para no depender de la red.
 */
const PROOF_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1100'><rect width='100%' height='100%' fill='%23e9ecef'/><text x='50%' y='50%' text-anchor='middle' font-family='sans-serif' font-size='42' fill='%23495057'>Comprobante</text></svg>"

const APPROVED_WITH_PROOF = {
  ...PAYMENT_WITH_PROOF,
  proofUrl: PROOF_IMAGE,
  canTrashProof: true,
}

export const ConsultaConBajaDelComprobante = {
  args: {
    item: APPROVED_WITH_PROOF,
    mode: 'view',
    onCancel: () => {},
    onTrashProof: async () => {},
  },
}

export const ConfirmarBajaDelComprobante = {
  args: {
    item: APPROVED_WITH_PROOF,
    mode: 'view',
    onCancel: () => {},
    onTrashProof: async () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByRole('button', { name: 'Mover a la papelera' }))
    await expect(await canvas.findByRole('button', { name: 'Sí, mover' })).toBeTruthy()
  },
}
