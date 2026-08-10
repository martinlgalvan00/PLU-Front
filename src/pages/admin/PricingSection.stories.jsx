import PricingSection from './PricingSection.jsx'
import '../../styles/pages/admin-pricing.css'

const configuration = {
  availability: { editable: true, reason: null },
  plans: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'plu-annual-v2',
      familyCode: 'plu-annual',
      version: 2,
      name: 'Afiliación PLU anual',
      description: 'Credencial y calendario oficial.',
      price: 42000,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-01T00:00:00.000Z',
      retiredAt: null,
      active: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'plu-annual-auto',
      familyCode: 'plu-annual-auto',
      version: 1,
      name: 'Afiliación automática',
      description: 'Renovación automática.',
      price: 42000,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'recurring',
      intervalCount: 1,
      graceDays: 10,
      effectiveFrom: '2026-08-01T00:00:00.000Z',
      retiredAt: null,
      active: true,
    },
  ],
  events: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic 2026',
      registrationPrice: 45000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      comboOffer: null,
    },
  ],
}

export default {
  title: 'Admin/Tarifas',
  component: PricingSection,
  args: {
    canEdit: true,
    configuration,
    error: null,
    isLoading: false,
    onCreatePlanVersion: async () => ({}),
    onRefresh: () => {},
    onSaveComboOffer: async () => ({}),
    onSetPlanActive: async () => ({}),
  },
}

export const Operativa = {}

export const Proximamente = {
  args: {
    configuration: {
      ...configuration,
      availability: { editable: false, reason: 'production_coming_soon' },
    },
  },
}
