import { expect, fn, userEvent, within } from 'storybook/test'
import RegisterPage from './RegisterPage.jsx'

/**
 * Afiliación e inscripción sólo se alcanzan con sesión de atleta y API arriba,
 * así que su render quedaba fuera de cualquier QA visual. Acá se montan con
 * props fijas para poder auditarlos igual que el alta de ficha: mismo CTA,
 * mismo ritmo vertical, light y dark.
 */

const athlete = {
  id: 'storybook-athlete',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana.torres@plu.test',
  birthDate: '1999-11-03',
  sex: 'Femenino',
  gym: 'Maximal Strength Club',
  phone: '+54 9 11 2500 7894',
  country: 'Argentina',
  province: 'Buenos Aires',
  city: 'Quilmes',
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000002',
}

const event = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  date: '2026-12-12',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  price: 75000,
  currency: 'ARS',
  requiresMembership: false,
}

export default {
  title: 'Pages/Registro/Flujos de checkout',
  component: RegisterPage,
  parameters: { layout: 'fullscreen' },
  args: {
    athlete,
    createdOrder: null,
    memberships: [],
    registrations: [],
    onNavigate: fn(),
    onSubmit: fn(async () => ({})),
    onUpdateForm: fn(),
  },
}

export const Afiliacion = {
  args: {
    event: null,
    flow: 'membership',
    form: { paymentMethod: 'mercado_pago' },
    total: 45000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cta = await canvas.findByRole('button', { name: /continuar al pago/i })
    await expect(cta).toBeEnabled()
  },
}

export const Inscripcion = {
  args: {
    event,
    flow: 'competition',
    form: {
      division: 'Open',
      category: 'Raw',
      estimatedWeight: '83',
      paymentMethod: 'mercado_pago',
    },
    total: 75000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El título vive dos veces: aside de desktop y contexto mobile.
    await expect(canvas.getAllByText('Pitbull Classic 2026').length).toBeGreaterThan(0)
    await expect(canvas.getByRole('button', { name: /continuar al pago/i })).toBeEnabled()
  },
}

export const InscripcionTransferencia = {
  args: {
    event,
    flow: 'competition',
    form: {
      division: 'Open',
      category: 'Raw',
      estimatedWeight: '83',
      paymentMethod: 'manual_link',
    },
    createdOrder: {
      type: 'competition',
      athleteName: athlete.fullName,
      athleteDocument: athlete.documentId,
      athleteId: athlete.id,
      paymentId: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
      paymentMethod: 'manual_link',
      amount: 75000,
      concept: 'Inscripción Pitbull Classic 2026',
      reference: 'RORD-story',
      status: 'validacion_manual',
    },
    total: 75000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const openTransfer = await canvas.findAllByRole('button', { name: /ver datos de transferencia/i })
    await userEvent.click(openTransfer[0])
    await expect(canvas.findByRole('dialog', { name: /completar tu inscripción/i })).resolves.toBeTruthy()
  },
}
