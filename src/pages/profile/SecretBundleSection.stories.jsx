import { expect, within } from 'storybook/test'
import SecretBundleSection from './SecretBundleSection.jsx'

/**
 * La ficha del código-paquete, en sus tres estados vivos.
 *
 * Se audita en Storybook porque es la única manera de verla en los dos temas y
 * en los tres anchos sin canjear un código real contra la base: el estado
 * depende de una orden que sólo existe después de comprar.
 *
 * Lo que se mira acá: que el documento mande sobre el trámite, que el ahorro se
 * lea contra la suma de las partes, que las condiciones sean filas regladas y
 * no tarjetas, y que en `granted` no quede ningún control ofreciendo comprar
 * algo que ya se compró.
 */
const ATHLETE = {
  id: 'ath-1',
  fullName: 'Agustín Di Santo',
  documentId: '30111222',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 93,
}

const OFFER = {
  id: 'code-1',
  code: 'ONLY-PITBULL-GOLD',
  kind: 'fixed_price',
  appliesTo: 'combo',
  fixedPrice: 120000,
  fixedPriceManual: 120000,
  manualChannels: ['bank_transfer', 'cash_pitbull'],
  mercadoPagoEnabled: false,
  financed: true,
  financingTermDays: 14,
  expiresAt: '2026-09-28T02:59:00.000Z',
  remaining: 12,
  purchase: null,
  membershipPlan: { id: 'plan-1', name: 'Afiliación PLU anual', price: 85000, currency: 'ARS' },
  event: {
    id: 'ev-1',
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    registrationPrice: 45000,
    currency: 'ARS',
  },
}

export default {
  title: 'Cuenta/SecretBundleSection',
  component: SecretBundleSection,
  parameters: { layout: 'padded' },
  args: {
    athlete: ATHLETE,
    onStartOfferPayment: async () => ({ order: { id: 'order-1' } }),
    onNavigate: () => {},
    onSelectEvent: () => {},
  },
}

/** Recién canjeado: el documento y el trámite completo debajo. */
export const Disponible = {
  args: { offers: [OFFER] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('ONLY-PITBULL-GOLD')).toBeInTheDocument()
    // El ahorro contra la suma de las partes: sin esto un precio pactado no se
    // lee como una oferta.
    await expect(canvas.getByText(/Ahorrás/)).toBeInTheDocument()
    // El código cerró la pasarela: no se ofrece un medio que la RPC rechaza.
    await expect(canvas.queryByRole('radio', { name: /Mercado Pago/i })).toBeNull()
  },
}

/** Un paquete que también acepta la pasarela: ahí el pago se deriva al torneo. */
export const ConPasarela = {
  args: {
    offers: [{ ...OFFER, mercadoPagoEnabled: true, financed: false, financingTermDays: null }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: /Mercado Pago/i })).toBeInTheDocument()
  },
}

/**
 * Habilitado con la deuda abierta: PLU adelantó el derecho y el reloj corre.
 * El formulario se retira — no hay nada más que comprar.
 */
export const HabilitadoConSaldo = {
  args: {
    offers: [
      {
        ...OFFER,
        purchase: {
          orderId: 'order-1',
          status: 'pendiente',
          manualPaymentChannel: 'cash_pitbull',
          financingAllowed: true,
          manualPaymentDeclaredAt: null,
          financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
          financedEntitlementsRevokedAt: null,
          financingTermDays: 14,
          financedPaymentDueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /Confirmar y pagar/i })).toBeNull()
    await expect(canvas.getByText(/Habilitado, con saldo/)).toBeInTheDocument()
  },
}

/** Acreditado: queda el registro y nada para hacer. */
export const Acreditado = {
  args: {
    offers: [
      {
        ...OFFER,
        purchase: {
          orderId: 'order-1',
          status: 'aprobado',
          manualPaymentChannel: 'bank_transfer',
          financingAllowed: true,
          financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
          financedEntitlementsRevokedAt: null,
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Acreditado/)).toBeInTheDocument()
  },
}
