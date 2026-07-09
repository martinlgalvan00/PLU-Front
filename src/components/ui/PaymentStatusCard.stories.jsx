import PaymentStatusCard from './PaymentStatusCard.jsx'

export default {
  title: 'UI/PaymentStatusCard',
  component: PaymentStatusCard,
  tags: ['autodocs'],
  args: {
    amount: '$25.000',
    method: 'Mercado Pago',
    reference: 'MP-90210192',
    status: 'aprobado',
  },
}

export const Default = {}

export const Pending = {
  args: { status: 'pendiente', note: 'Estamos verificando tu comprobante.' },
}
