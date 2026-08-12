import { expect, fn, within } from 'storybook/test'
import RegisterPage from './RegisterPage.jsx'

const athlete = {
  id: 'storybook-athlete',
  fullName: 'Ana Torres',
  documentId: '30111222',
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000001',
}

const comboEvent = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 75000,
  currency: 'ARS',
  requiresMembership: true,
  comboOffer: {
    id: 'combo-story',
    active: true,
    price: 120000,
    currency: 'ARS',
    startsAt: '2026-08-01T00:00:00-03:00',
    endsAt: '2026-08-28T23:59:59-03:00',
  },
}

export default {
  title: 'Pages/Registro/Combo afiliacion e inscripcion',
  component: RegisterPage,
  parameters: { layout: 'fullscreen' },
  args: {
    athlete,
    createdOrder: null,
    event: comboEvent,
    flow: 'competition',
    form: {
      division: 'Open',
      category: 'Raw',
      estimatedWeight: '83',
      paymentMethod: 'mercado_pago',
    },
    memberships: [],
    registrations: [],
    total: 75000,
    onNavigate: fn(),
    onSubmit: fn(async () => ({})),
    onUpdateForm: fn(),
  },
}

export const OfertaVigente = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('radio', { name: /combo/i })).toBeChecked()
    await expect(canvas.getByRole('button', { name: /generar combo/i })).toBeEnabled()
  },
}
