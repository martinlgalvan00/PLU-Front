export const STORAGE_KEY = 'plu-arg-maximal'

export const PRICING = {
  membership: 75000,
  membershipJunior: 28000,
  event: 75000,
  combo: 120000,
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
    label: 'Super Admin',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: true,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
    canCheckIn: true,
  },
  admin_plu_arg: {
    label: 'Administrador',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: true,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
    canCheckIn: true,
  },
  plu_arg: {
    label: 'PLU',
    canViewAdmin: true,
    canEditOperationalData: false,
    canManageUsers: false,
    canApproveManualPayments: false,
    canExportAdmin: true,
    canExportPluUsa: false,
    canCheckIn: false,
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

export const NAV_PRIMARY = ['home', 'members', 'results', 'records', 'resources']

export const NAV_SECONDARY = ['events', 'pitbull', 'shop', 'rulebook', 'community', 'faq', 'contact']

/**
 * Fuente única para la navegación pública. IA de federación:
 * Afiliación · Competencia · Resultados · Récords · Más.
 * `icon` es una clave presentacional que NavbarPublic resuelve con lucide.
 */
export const PUBLIC_NAVIGATION = {
  primary: [
    { key: 'members', labelKey: 'nav.members' },
    {
      key: 'competition',
      labelKey: 'nav.moreCompetition',
      type: 'menu',
      views: ['events', 'pitbull', 'shop', 'tickets'],
      groups: [
        {
          labelKey: 'nav.moreCompetition',
          items: [
            {
              key: 'events',
              labelKey: 'nav.calendarOfficial',
              hintKey: 'nav.calendarHint',
              icon: 'calendar',
            },
            {
              key: 'pitbull',
              featured: true,
              labelKey: 'nav.pitbull',
              hintKey: 'nav.pitbullHint',
              icon: 'trophy',
            },
            { key: 'shop', labelKey: 'nav.shop', hintKey: 'nav.shopHint', icon: 'shop' },
          ],
        },
      ],
    },
    { key: 'results', labelKey: 'nav.results' },
    { key: 'records', labelKey: 'nav.records' },
    {
      key: 'more',
      labelKey: 'nav.more',
      type: 'menu',
      views: [
        'rulebook',
        'resources',
        'faq',
        'community',
        'contact',
        'team',
        'sponsors',
        'standards',
      ],
      groups: [
        {
          labelKey: 'nav.moreInstitution',
          items: [
            {
              key: 'rulebook',
              labelKey: 'nav.rulebook',
              hintKey: 'nav.rulebookHint',
              icon: 'book',
            },
            { key: 'team', labelKey: 'nav.team', hintKey: 'nav.teamHint', icon: 'member' },
            {
              key: 'sponsors',
              labelKey: 'nav.sponsors',
              hintKey: 'nav.sponsorsHint',
              icon: 'community',
            },
            {
              key: 'standards',
              labelKey: 'nav.standards',
              hintKey: 'nav.standardsHint',
              icon: 'standards',
            },
            {
              key: 'community',
              labelKey: 'nav.community',
              hintKey: 'nav.communityHintNew',
              icon: 'community',
            },
          ],
        },
        {
          labelKey: 'nav.resourcesHelp',
          items: [
            {
              key: 'resources',
              labelKey: 'nav.resources',
              hintKey: 'nav.resourcesHint',
              icon: 'book',
            },
            { key: 'faq', labelKey: 'nav.faq', hintKey: 'nav.faqHint', icon: 'help' },
            { key: 'contact', labelKey: 'nav.contact', hintKey: 'nav.contactHint', icon: 'mail' },
          ],
        },
      ],
    },
  ],
}

const competitionNavigation = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'competition')
const moreNavigation = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'more')

/** Alias de compatibilidad para consumidores existentes. */
export const NAV_EVENTOS = competitionNavigation.groups[0].items.filter(({ featured }) => featured)
export const NAV_RECURSOS = moreNavigation.groups.flatMap(({ items }) => items)
export const NAV_EVENTOS_VIEWS = ['events', 'pitbull', 'tickets', 'results', 'records']
export const NAV_RECURSOS_VIEWS = moreNavigation.views

export const NAV_ITEMS = [...NAV_PRIMARY, ...NAV_SECONDARY].map((key) => [key, key])

export const REGISTRATION_FILTER_STATUSES = [
  ['all', 'allStatuses'],
  ['pendiente_pago', 'status'],
  ['validacion_manual', 'status'],
  ['confirmada', 'status'],
  ['gate_pending', 'gatePending'],
  ['aprobado', 'paymentApproved'],
]

/** Lista para competir. `acreditada` es alias legacy; el backend escribe `confirmada`. */
export const CONFIRMED_REGISTRATION_STATUSES = ['confirmada', 'acreditada']

export const MEMBERSHIP_FILTER_STATUSES = [
  ['all', 'allStatuses'],
  ['activa', 'membershipActive'],
  ['programada', 'membershipScheduled'],
  ['pendiente_pago', 'status'],
  ['vencida', 'membershipExpired'],
  ['cancelada', 'membershipCancelled'],
  ['reembolsada', 'membershipRefunded'],
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

export const MEMBERSHIP_TOURNAMENT_FILTER_OPTIONS = [
  ['all', 'allTournament'],
  ['yes', 'registeredToTournament'],
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
