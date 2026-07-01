export const STORAGE_KEY = 'plu-arg-maximal'

export const PRICING = {
  membership: 38000,
  membershipJunior: 28000,
  event: 45000,
  combo: 78000,
}

export const PROCEDURE_TYPES = {
  both: { label: 'Afiliación + inscripción', amount: PRICING.combo },
  membership: { label: 'Solo afiliación', amount: PRICING.membership },
  event: { label: 'Solo inscripción', amount: PRICING.event },
}

export const PAYMENT_METHODS = {
  mercado_pago: { label: 'Mercado Pago' },
  manual_link: { label: 'Link de pago + validación manual' },
}

export const ROLES = {
  admin_plu: { label: 'Admin PLU', canEdit: true, canManageUsers: true },
  athlete_plu: { label: 'Atleta PLU', canEdit: false, canManageUsers: false },
}

export const NAV_PRIMARY = ['home', 'members', 'pitbull', 'events', 'results']

export const NAV_SECONDARY = ['rulebook', 'community', 'faq', 'contact']

export const NAV_ITEMS = [...NAV_PRIMARY, ...NAV_SECONDARY].map((key) => [key, key])

export const REGISTRATION_FILTER_STATUSES = [
  ['all', 'Todos los estados'],
  ['pendiente_pago', 'Pendiente de pago'],
  ['validacion_manual', 'Validación manual'],
  ['confirmada', 'Confirmada'],
  ['aprobado', 'Pago aprobado'],
]

export const DEFAULT_FORM = {
  fullName: '',
  documentId: '',
  birthDate: '',
  email: '',
  phone: '',
  country: 'Argentina',
  province: '',
  city: '',
  gym: '',
  sex: 'Masculino',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: '',
  paymentMethod: 'mercado_pago',
}

export const FORM_OPTIONS = {
  sex: ['Masculino', 'Femenino'],
  division: ['Open', 'Junior', 'Sub-Junior', 'Master I', 'Master II'],
  category: ['Raw', 'Classic Raw', 'Equipped'],
  paymentMethod: [
    ['mercado_pago', 'Mercado Pago'],
    ['manual_link', 'Link de pago + validación manual'],
  ],
}
