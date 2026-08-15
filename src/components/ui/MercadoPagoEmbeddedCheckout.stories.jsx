import MercadoPagoEmbeddedCheckout from './MercadoPagoEmbeddedCheckout.jsx'

// Story de auditoria temporal: sin preferenceId (no hay backend en Storybook)
// el Brick monta en modo "custom checkout" solo con `amount`, que alcanza
// para ver la lista real de medios de pago (tarjeta) reskineada a marca PLU.
const ORDER = {
  paymentId: 'story-order-1',
  orderId: 'story-order-1',
  amount: 85000,
  type: 'membership',
  paymentMode: 'payment',
  orderAccessToken: 'story-token',
  athleteEmail: 'atleta@pluarg.local',
  description: 'Afiliación anual PLU',
}

export default {
  title: 'UI/MercadoPagoEmbeddedCheckout',
  component: MercadoPagoEmbeddedCheckout,
  parameters: { layout: 'padded' },
}

export const Default = {
  args: {
    order: ORDER,
    onResult: () => {},
    presentation: 'default',
  },
}

export const Settle = {
  args: {
    order: ORDER,
    onResult: () => {},
    presentation: 'settle',
  },
}
