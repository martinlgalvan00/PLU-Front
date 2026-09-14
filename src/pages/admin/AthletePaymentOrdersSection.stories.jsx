import AthletePaymentOrdersSection from './AthletePaymentOrdersSection.jsx'
// La tabla es antd: sin el ConfigProvider de la app, `.ant-table` pinta su
// blanco por defecto y en dark la tinta clara queda invisible sobre él.
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
// La cola vive dentro del shell del panel: sin esas hojas la tabla no tiene
// su contenedor de scroll ni la densidad real de Pagos.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/**
 * Cola de cobros de atletas (Pagos › Atletas). El service está mockeado
 * interceptando `fetch`, igual que en Finanzas: el componente ejercita el
 * camino real —lectura, conteos, filtros— y no un doble que se desincroniza
 * del contrato.
 */

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-08-12T15:00:00.000Z')
const iso = (offsetDays) => new Date(now + offsetDays * DAY).toISOString()

const ORDERS = [
  {
    id: 'ord-1',
    athlete: {
      id: 'ath-1',
      full_name: 'Julián Aguirre',
      document_id: '34556781',
      email: 'julian@example.com',
    },
    concept: 'combo',
    amount: 120000,
    currency: 'ARS',
    method: 'manual_link',
    manual_payment_channel: 'bank_transfer',
    status: 'validacion_manual',
    reference: 'ORD-10428',
    payment_proof_path: 'proofs/ord-1.jpg',
    payment_proof_uploaded_at: iso(-1),
    manual_payment_declared_at: iso(-1),
    discount_code: 'PITBULL10',
    created_at: iso(-3),
  },
  {
    id: 'ord-2',
    athlete: {
      id: 'ath-2',
      full_name: 'Camila Ferreyra',
      document_id: '38221190',
      email: 'camila@example.com',
    },
    concept: 'registration',
    amount: 75000,
    currency: 'ARS',
    method: 'manual_link',
    manual_payment_channel: 'bank_transfer',
    status: 'pendiente',
    reference: 'ORD-10431',
    created_at: iso(-2),
  },
  {
    id: 'ord-3',
    athlete: {
      id: 'ath-3',
      full_name: 'Bruno Cabrera',
      document_id: '30112456',
      email: 'bruno@example.com',
    },
    concept: 'membership',
    amount: 75000,
    currency: 'ARS',
    method: 'manual_link',
    manual_payment_channel: 'cash_pitbull',
    status: 'validacion_manual',
    reference: 'ORD-10433',
    manual_payment_declared_at: iso(-1),
    created_at: iso(-1),
  },
  {
    // Combo financiado: derechos otorgados con la deuda abierta y vencimiento
    // a la vista — el único grupo donde el club queda expuesto.
    id: 'ord-4',
    athlete: {
      id: 'ath-4',
      full_name: 'Ana Belén Toledo',
      document_id: '41987654',
      email: 'ana@example.com',
    },
    concept: 'combo',
    amount: 120000,
    currency: 'ARS',
    method: 'manual_link',
    manual_payment_channel: 'bank_transfer',
    status: 'pendiente',
    reference: 'ORD-10440',
    financing_allowed: true,
    manual_payment_declared_at: iso(-6),
    financed_entitlements_at: iso(-6),
    financed_payment_due_at: iso(2),
    created_at: iso(-6),
  },
  {
    id: 'ord-5',
    athlete: {
      id: 'ath-5',
      full_name: 'Marcos Lencina',
      document_id: 'STAFF-004',
      email: 'marcos@example.com',
    },
    concept: 'registration',
    amount: 75000,
    currency: 'ARS',
    method: 'mercado_pago',
    status: 'pendiente',
    reference: 'ORD-10444',
    created_at: iso(-1),
  },
]

const CLOSED = [
  {
    id: 'ord-6',
    athlete: {
      id: 'ath-6',
      full_name: 'Lucía Domínguez',
      document_id: '39887123',
      email: 'lucia@example.com',
    },
    concept: 'membership',
    amount: 75000,
    currency: 'ARS',
    method: 'mercado_pago',
    status: 'rechazado',
    reference: 'ORD-10390',
    rejection_reason: 'Fondos insuficientes',
    rejected_by: 'mercado_pago',
    rejected_at: iso(-8),
    created_at: iso(-9),
  },
  {
    id: 'ord-7',
    athlete: {
      id: 'ath-7',
      full_name: 'Federico Ruiz',
      document_id: '32114567',
      email: 'fede@example.com',
    },
    concept: 'registration',
    amount: 75000,
    currency: 'ARS',
    method: 'manual_link',
    manual_payment_channel: 'bank_transfer',
    status: 'aprobado',
    reference: 'ORD-10402',
    payment_proof_path: 'proofs/ord-7.jpg',
    payment_proof_uploaded_at: iso(-7),
    created_at: iso(-7),
  },
]

function countsFor(orders) {
  const open = orders.filter((order) => ['pendiente', 'validacion_manual'].includes(order.status))
  return {
    pending: open.length,
    validacion_manual: orders.filter((order) => order.status === 'validacion_manual').length,
    financed: orders.filter((order) => order.financed_entitlements_at).length,
    rechazado: orders.filter((order) => order.status === 'rechazado').length,
    cancelado: orders.filter((order) => order.status === 'cancelado').length,
    aprobado: orders.filter((order) => order.status === 'aprobado').length,
    all: orders.length,
    openAmount: open.reduce((sum, order) => sum + (order.amount ?? 0), 0),
    openAmountTruncated: false,
  }
}

function withOrders(orders) {
  return (Story) => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
      if (url.includes('/api/athletes/admin/payment-orders')) {
        return new Response(JSON.stringify({ orders, counts: countsFor(orders) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return original ? original(input, init) : new Response('{}', { status: 200 })
    }
    // `.admin-payments-operations` no es decorado: casi toda la piel de la
    // cola (encabezado, barra de filtros, resumen) está escrita bajo ese
    // contenedor. Sin él la historia muestra una sección sin estilar.
    return (
      <AppConfigProvider>
        <div
          className="admin-shell"
          style={{
            background: 'var(--admin-canvas)',
            display: 'block',
            minHeight: '100%',
          }}
        >
          <div className="admin-shell__content ant-layout-content">
            <div className="admin-page admin-section-enter">
              <div className="admin-payments-operations">
                <div className="admin-payments-operations__body">
                  <div className="admin-payments-operations__panel">
                    <Story />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppConfigProvider>
    )
  }
}

export default {
  title: 'Admin/Cola de cobros',
  component: AthletePaymentOrdersSection,
  parameters: { layout: 'fullscreen' },
  args: {
    canEdit: true,
    canForceSettle: true,
    onApprovePayment: async () => ({}),
    onForceSettlePayment: async () => ({}),
    onRejectPayment: async () => ({}),
    onSummaryChange: () => {},
  },
}

/** Cola abierta: transferencia con comprobante, efectivo, financiada y Mercado Pago. */
export const Pendientes = {
  decorators: [withOrders(ORDERS)],
}

/** Órdenes ya cerradas: aprobada y rechazada con su motivo. */
export const Cerradas = {
  decorators: [withOrders(CLOSED)],
}

/** Rol sin permiso de aprobación: se lee la cola, no se valida. */
export const SoloLectura = {
  args: { canEdit: false, canForceSettle: false },
  decorators: [withOrders(ORDERS)],
}

/** Sin órdenes en el filtro elegido. */
export const SinOrdenes = {
  decorators: [withOrders([])],
}
