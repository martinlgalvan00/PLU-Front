import { expect, within } from 'storybook/test'
import PromotionRevealModal from './PromotionRevealModal.jsx'

/**
 * Reveal del canje: el momento en que un código secreto se acepta.
 *
 * Se audita en Storybook porque es la única forma de verlo en los dos temas y
 * en los tres anchos sin tener que canjear un código real contra la base. El
 * material es el de la credencial (`code-band.css`): cara en degradé 158deg,
 * filo de oro, marco interior y grano estático. El beneficio es el titular, las
 * condiciones van en filas regladas y hay una sola acción plena.
 */

export default {
  title: 'Cuenta/PromotionRevealModal',
  component: PromotionRevealModal,
  parameters: { layout: 'fullscreen' },
  args: {
    code: 'PITBULL-2026',
    headline: '15% de descuento listo para usar.',
    campaignName: 'Beneficio anual',
    continueLabel: 'Usar en Afiliación',
    onClose: () => {},
    onContinue: () => {},
  },
}

/** El caso corriente: un porcentaje, la pasarela abierta y nada más que decir. */
export const Descuento = {
  args: {
    payment: {
      channels: ['mercado_pago'],
      financed: false,
      financingTermDays: null,
      gatewayClosed: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('dialog')).toBeInTheDocument()
    // El titular es el beneficio, no el nombre de la campaña: es el dato que
    // decide si vale la pena seguir al checkout.
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent(/15% de descuento/i)
  },
}

/**
 * El caso completo, que es el que justifica la pieza: precio pactado que sólo
 * cierra en efectivo, pago delegable con plazo, cupo corto y ventana con fecha.
 * Cuatro condiciones que como `small` bajo el input se leían como notas al pie.
 */
export const PrecioPactadoConPlazo = {
  args: {
    code: 'COMBO-PITBULL-INVIERNO',
    headline: 'Desbloqueaste un precio promocional.',
    campaignName: 'Combo Pitbull Classic',
    campaignDescription:
      'Afiliación anual más inscripción al Pitbull Classic, con el precio cerrado para las primeras cuatro cuentas.',
    payment: {
      channels: ['bank_transfer', 'cash_pitbull'],
      financed: true,
      financingTermDays: 7,
      gatewayClosed: true,
    },
    remaining: 4,
    expiresAt: '2026-09-30T23:59:00.000Z',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Pasarela cerrada: "únicamente con", no "además podés".
    await expect(canvas.getByText(/únicamente con/i)).toBeInTheDocument()
    // Y el plazo se dice con su consecuencia.
    await expect(canvas.getByText(/se da de baja sola/i)).toBeInTheDocument()
  },
}

/** Un plazo de un día: el singular tiene su propia línea, no dice "1 días". */
export const PlazoDeUnDia = {
  args: {
    payment: {
      channels: ['bank_transfer'],
      financed: true,
      financingTermDays: 1,
      gatewayClosed: true,
    },
    remaining: 1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/1 día para acreditarlo/i)).toBeInTheDocument()
    await expect(canvas.getByText(/queda 1 lugar/i)).toBeInTheDocument()
  },
}

/**
 * Sin destino resuelto —un código de alcance general— la pieza queda sin acción
 * plena y no inventa una: sólo se cierra.
 */
export const SinDestino = {
  args: {
    headline: 'El beneficio quedó listo para el checkout compatible.',
    campaignName: '',
    onContinue: undefined,
    payment: {
      channels: ['mercado_pago', 'bank_transfer'],
      financed: false,
      financingTermDays: null,
      gatewayClosed: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /usar en/i })).toBeNull()
    await expect(canvas.getByRole('button', { name: /lo uso después/i })).toBeInTheDocument()
  },
}
