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
  discountCodes: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      code: 'PITBULL',
      description: 'Afiliación + inscripción al Pitbull Classic.',
      kind: 'fixed_price',
      fixedPrice: 120000,
      // Mismo importe por transferencia y efectivo: el caso pactado. Se carga
      // explícito para que el panel muestre la nota del canal manual.
      fixedPriceManual: 120000,
      appliesTo: 'combo',
      maxRedemptions: 40,
      redeemedCount: 12,
      expiresAt: '2026-10-30T23:59:00.000Z',
      active: true,
      manualChannels: ['bank_transfer', 'cash_pitbull'],
      createdAt: '2026-08-15T00:00:00.000Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      code: 'PREVENTA-CLUBES',
      description: 'Acuerdo con clubes: abre sola el 10/09 y sólo para los invitados.',
      kind: 'fixed_price',
      fixedPrice: 98000,
      // Por transferencia sale más barato que por Mercado Pago.
      fixedPriceManual: 92000,
      appliesTo: 'membership',
      redeemedCount: 0,
      // Programada: todavía no abrió, y el panel lo dice sin que nadie
      // tenga que acordarse de prenderla ese día.
      startsAt: '2099-09-10T03:00:00.000Z',
      expiresAt: '2099-09-30T23:59:00.000Z',
      active: true,
      audience: 'code',
      invitees: ['ana@plu.ar', 'bruno@plu.ar', 'clara@plu.ar'],
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      code: 'PRIMEROS-25',
      description: 'Lanzamiento de afiliaciones y torneo.',
      kind: 'percent',
      percentOff: 25,
      appliesTo: 'both',
      maxRedemptions: 25,
      redeemedCount: 8,
      expiresAt: '2026-11-15T23:59:00.000Z',
      active: true,
      createdAt: '2026-08-14T00:00:00.000Z',
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      code: 'AGOSTO',
      description: 'Promo de agosto: la aplica sola el checkout, sin tipear nada.',
      kind: 'percent',
      percentOff: 15,
      appliesTo: 'membership',
      redeemedCount: 4,
      active: true,
      audience: 'public',
      createdAt: '2026-08-16T00:00:00.000Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      code: 'EQUIPO-10',
      description: 'Cupo completo.',
      percentOff: 10,
      appliesTo: 'membership',
      maxRedemptions: 10,
      redeemedCount: 10,
      active: false,
      createdAt: '2026-08-13T00:00:00.000Z',
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
    onUpsertDiscountCode: async () => ({}),
    onSetDiscountCodeState: async () => ({}),
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
