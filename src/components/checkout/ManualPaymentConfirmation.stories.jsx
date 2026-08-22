import ManualPaymentConfirmation from './ManualPaymentConfirmation.jsx'

/**
 * La declaración del pago manual, en sus tres estados.
 *
 * Con un código que permite delegar el pago, avisar la transferencia no es un
 * trámite administrativo: es el momento en que la persona queda afiliada e
 * inscripta. Ahí el panel se estampa con el mismo sello que la federación usa
 * en sus otros cierres, con la deuda dicha en la misma pieza — habilitar no es
 * acreditar.
 *
 * Sin financiamiento no hay nada que cerrar y el acuse sigue siendo la línea
 * fría de siempre: la orden queda en validación y Finanzas conserva la última
 * palabra.
 *
 * La ráfaga sólo sale cuando el hecho acaba de ocurrir, así que estas stories
 * —que arrancan ya declaradas— muestran el sello sin papel. Ese festejo tiene
 * su propio QA (`npm run visual-check:celebration`).
 */
export default {
  title: 'Checkout/ManualPaymentConfirmation',
  component: ManualPaymentConfirmation,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
}

/** Lo que ve quien todavía no avisó, con un código que financia. */
export const PorDeclarar = {
  args: { orderId: 'order-1', financingAllowed: true },
}

/** El cierre: afiliación e inscripción habilitadas, saldo abierto. */
export const HabilitadoPorFinanciamiento = {
  args: {
    orderId: 'order-2',
    financingAllowed: true,
    manualPaymentDeclaredAt: '2026-08-21T12:00:00.000Z',
    financedEntitlementsAt: '2026-08-21T12:00:00.000Z',
  },
}

/** Sin financiamiento: aviso recibido, nada habilitado, nada que festejar. */
export const AvisoSinHabilitacion = {
  args: {
    orderId: 'order-3',
    manualPaymentDeclaredAt: '2026-08-21T12:00:00.000Z',
  },
}

/** El efectivo nombra su propia acción. */
export const EfectivoPorDeclarar = {
  args: { orderId: 'order-4', channel: 'cash_pitbull', financingAllowed: true },
}
