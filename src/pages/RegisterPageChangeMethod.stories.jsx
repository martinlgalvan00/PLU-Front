import { expect, fn, waitFor, within } from 'storybook/test'
import RegisterPage from './RegisterPage.jsx'

/**
 * Orden abierta por transferencia: la pantalla a la que vuelve quien todavía no
 * pagó.
 *
 * Existe para ver las dos salidas que esa orden tiene que ofrecer —cambiar el
 * medio y cerrarla— sin depender de una sesión con una orden viva. "Elegir otro
 * medio" muestra también división, modalidad y categoría de peso: el POST que
 * reanuda la orden los reescribe sobre la inscripción pendiente, así que
 * esconderlos dejaba al atleta sin forma de corregir lo único corregible.
 */
const athlete = {
  id: 'storybook-athlete',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana.torres@plu.test',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  birthDate: '1999-11-03',
  sex: 'Femenino',
  gym: 'Maximal Strength Club',
  phone: '+54 9 11 2500 7894',
  country: 'Argentina',
  province: 'Buenos Aires',
  city: 'Quilmes',
}

const event = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 92500,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

const openOrder = {
  id: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
  athleteId: athlete.id,
  concept: 'Inscripción Pitbull Classic 2026',
  amount: 92500,
  method: 'manual_link',
  status: 'validacion_manual',
  reference: 'RORD-5144e3b632cab072',
  manualPaymentChannel: 'bank_transfer',
}

const pendingRegistration = {
  id: 'reg-pendiente',
  athleteId: athlete.id,
  eventSlug: event.slug,
  status: 'pendiente_pago',
  paymentOrderId: openOrder.id,
  division: 'Open',
  category: 'Raw',
  bodyweightKg: 83,
}

export default {
  title: 'Pages/Registro/Orden abierta',
  component: RegisterPage,
  parameters: { layout: 'fullscreen' },
  args: {
    athlete,
    createdOrder: null,
    event,
    flow: 'competition',
    form: {
      division: 'Open',
      category: 'Raw',
      estimatedWeight: '83',
      paymentMethod: 'manual_link',
    },
    memberships: [],
    payments: [openOrder],
    registrations: [pendingRegistration],
    total: 92500,
    onNavigate: fn(),
    onSubmit: fn(async () => ({})),
    onUpdateForm: fn(),
  },
}

/** El settle tal como lo ve quien vuelve a una transferencia sin acreditar. */
export const Pendiente = {}

/** Cerrar la orden pregunta antes: el primer clic abre la confirmación. */
export const ConfirmandoCancelacion = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: /cancelar esta orden/i })
    await canvas.getByRole('button', { name: /cancelar esta orden/i }).click()
    await waitFor(() => expect(canvas.getByRole('button', { name: /sí, cancelar/i })).toBeVisible())
  },
}

/** Cambiar de medio también deja corregir los datos de la inscripción. */
export const CambiandoDeMedio = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: /elegir otro medio/i })
    await canvas.getByRole('button', { name: /elegir otro medio/i }).click()
    await waitFor(() =>
      expect(canvas.getByRole('radiogroup', { name: /^División$/i })).toBeVisible(),
    )
    await waitFor(() =>
      expect(canvas.getByRole('radiogroup', { name: /^Modalidad$/i })).toBeVisible(),
    )
  },
}
