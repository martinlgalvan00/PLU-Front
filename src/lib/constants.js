export const STORAGE_KEY = 'plu-arg-maximal'

export const PRICING = {
  membership: 38000,
  membershipJunior: 28000,
  event: 45000,
  combo: 78000,
  ticket: 12000,
  ticketBothDays: 20000,
  ticketPresencial: 15000,
  ticketBothDaysPresencial: 25000,
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
  admin_maximal: {
    label: 'Admin Maximal',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: true,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
    canCheckIn: true,
  },
  admin_plu_arg: {
    label: 'Admin PLU ARG',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: true,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
    canCheckIn: true,
  },
  operador_plu_arg: {
    label: 'Operador PLU ARG',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: false,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
    canCheckIn: true,
  },
  viewer_plu_usa: {
    label: 'PLU USA lectura',
    canViewAdmin: true,
    canEditOperationalData: false,
    canManageUsers: false,
    canApproveManualPayments: false,
    canExportAdmin: false,
    canExportPluUsa: true,
    canCheckIn: false,
    isPluUsaPartner: true,
  },
  seguridad_plu_arg: {
    label: 'Seguridad',
    canViewAdmin: true,
    canEditOperationalData: false,
    canManageUsers: false,
    canApproveManualPayments: false,
    canExportAdmin: false,
    canExportPluUsa: false,
    canCheckIn: true,
  },
}

export const ROLE_OPTIONS = Object.entries(ROLES).map(([value, { label }]) => [value, label])

/** Pases de entrada por día — ver TicketPurchaseSection para las etiquetas con fecha. */
export const TICKET_DAY_PASSES = ['day1', 'day2', 'both']

export const NAV_PRIMARY = ['home', 'members', 'pitbull', 'events', 'results']

export const NAV_SECONDARY = ['rulebook', 'community', 'faq', 'contact']

/** Nav agrupada como en design-reference (Claude Design) */
export const NAV_EVENTOS = [
  { key: 'events' },
  { key: 'results' },
  { key: 'records' },
]

export const NAV_RECURSOS = [
  { key: 'rulebook' },
  { key: 'community' },
  { key: 'faq' },
]

export const NAV_EVENTOS_VIEWS = NAV_EVENTOS.map(({ key }) => key)
export const NAV_RECURSOS_VIEWS = NAV_RECURSOS.map(({ key }) => key)

export const NAV_ITEMS = [...NAV_PRIMARY, ...NAV_SECONDARY].map((key) => [key, key])

export const REGISTRATION_FILTER_STATUSES = [
  ['all', 'allStatuses'],
  ['pendiente_pago', 'status'],
  ['validacion_manual', 'status'],
  ['confirmada', 'status'],
  ['aprobado', 'paymentApproved'],
]

export const MEMBERSHIP_FILTER_STATUSES = [
  ['all', 'allStatuses'],
  ['activa', 'membershipActive'],
  ['pendiente_pago', 'status'],
  ['vencida', 'membershipExpired'],
  ['cancelada', 'membershipCancelled'],
]

export const ATHLETE_FILTER_STATUSES = [
  ['all', 'allStatuses'],
  ['afiliado_activo', 'status'],
  ['registrado', 'status'],
  ['pre_registrado', 'status'],
  ['afiliado_vencido', 'status'],
  ['bloqueado', 'status'],
]

export const MEMBERSHIP_EXPIRING_FILTER_OPTIONS = [
  ['all', 'allExpiring'],
  ['soon', 'expiringSoon'],
]

export const DEFAULT_FORM = {
  fullName: '',
  documentId: '',
  birthDate: '',
  email: '',
  phone: '',
  country: '',
  province: '',
  city: '',
  gym: '',
  sex: '',
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
