import CashPaymentPlace from './CashPaymentPlace.jsx'

/**
 * Dónde pagar en efectivo, tal como lo ve el atleta al elegir efectivo en la
 * inscripción o en la compra de entradas.
 */
export default {
  title: 'Checkout/CashPaymentPlace',
  component: CashPaymentPlace,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 440, margin: '24px auto', padding: '0 16px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    event: { venue: 'La Troupé multieventos', location: 'Banfield, Buenos Aires' },
    cashPayment: {
      place: 'Gimnasio Pitbull',
      address: 'Av. Hipólito Yrigoyen 7890, Banfield',
      hours: 'Lunes a viernes de 18 a 21',
      contact: 'Agus · WhatsApp 11 5555-1234',
      notes: 'Llevá el monto justo: no hay cambio.',
    },
  },
}

export const Completo = {}

/** Sin datos propios: la sede del evento, sin inventar dirección. */
export const SoloSede = {
  args: { cashPayment: { place: '', notes: '' } },
}
