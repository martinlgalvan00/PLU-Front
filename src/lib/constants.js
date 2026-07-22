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
    checkinOnly: true,
  },
}

export const ROLE_OPTIONS = Object.entries(ROLES).map(([value, { label }]) => [value, label])

export const NAV_PRIMARY = ['home', 'members', 'events', 'results', 'records', 'resources']

export const NAV_SECONDARY = ['pitbull', 'shop', 'rulebook', 'community', 'faq', 'contact']

/**
 * Fuente única para la navegación pública. Los destinos son vistas reales de
 * App.jsx; desktop y mobile cambian la presentación, no la arquitectura.
 * `icon` es una clave presentacional que NavbarPublic resuelve con lucide.
 */
export const PUBLIC_NAVIGATION = {
  primary: [
    { key: 'members', labelKey: 'nav.members' },
    { key: 'events', labelKey: 'nav.calendarOfficial', icon: 'calendar' },
    {
      key: 'competitions',
      labelKey: 'nav.competitions',
      type: 'menu',
      views: ['pitbull', 'shop', 'tickets'],
      items: [
        { key: 'pitbull', featured: true, icon: 'trophy' },
        { key: 'shop', icon: 'shop' },
      ],
    },
    { key: 'results', labelKey: 'nav.results' },
    { key: 'records', labelKey: 'nav.records' },
    {
      key: 'resources',
      labelKey: 'nav.groupRecursos',
      type: 'menu',
      views: ['resources', 'rulebook', 'faq', 'community', 'contact'],
      groups: [
        {
          labelKey: 'nav.resourcesCompetition',
          items: [
            { key: 'rulebook', labelKey: 'nav.rulebook', hintKey: 'nav.rulebookHint', icon: 'book' },
            { key: 'members', labelKey: 'nav.athleteInfo', hintKey: 'nav.athleteInfoHint', icon: 'member' },
          ],
        },
        {
          labelKey: 'nav.resourcesHelp',
          items: [
            { key: 'faq', labelKey: 'nav.faq', hintKey: 'nav.faqHint', icon: 'help' },
            { key: 'contact', labelKey: 'nav.contact', hintKey: 'nav.contactHint', icon: 'mail' },
          ],
        },
        {
          labelKey: 'nav.resourcesCommunity',
          items: [
            { key: 'community', labelKey: 'nav.community', hintKey: 'nav.communityHintNew', icon: 'community' },
          ],
        },
      ],
    },
  ],
}

const competitionsNavigation = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'competitions')
const resourcesNavigation = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'resources')

/** Alias de compatibilidad para consumidores existentes. */
export const NAV_EVENTOS = competitionsNavigation.items
export const NAV_RECURSOS = [
  { key: 'resources' },
  ...resourcesNavigation.groups.flatMap(({ items }) => items),
]
export const NAV_EVENTOS_VIEWS = competitionsNavigation.views
export const NAV_RECURSOS_VIEWS = resourcesNavigation.views

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
  password: '',
  paymentMethod: 'mercado_pago',
}

export const FORM_OPTIONS = {
  sex: ['Masculino', 'Femenino'],
  division: ['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters'],
  category: ['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited'],
  paymentMethod: [
    ['mercado_pago', 'Mercado Pago'],
    ['manual_link', 'Link de pago + validación manual'],
  ],
}
