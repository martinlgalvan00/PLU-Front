// Datos de ejemplo para las stories de Roles, Auditoría y Analítica. Solo los
// importan archivos *.stories.jsx: no entra al bundle de la app.
import {
  ACCESS_ROLE_TEMPLATES,
  PERMISSION_CATALOG,
  getDefaultPermissionsForRole,
} from '../../lib/permissions.js'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const isoAgo = (ms) => new Date(Date.now() - ms).toISOString()

/* ───────────────────────────── Roles ───────────────────────────── */

const USER_COUNTS = { admin_maximal: 1, admin_plu_arg: 2, plu_arg: 6, seguridad_plu_arg: 9 }

const baseRoles = ACCESS_ROLE_TEMPLATES.map((role) => ({
  id: role.key,
  ...role,
  active: true,
  permissions: getDefaultPermissionsForRole(role.key),
  userCount: USER_COUNTS[role.key] ?? 0,
  canAssign: role.assignableByAdmin,
  canManagePermissions: !role.isProtected,
}))

export const PREVIEW_ROLES = [
  ...baseRoles,
  {
    id: 'tesoreria',
    key: 'tesoreria',
    name: 'Tesorería',
    description: 'Concilia cobros y aprueba pagos manuales. No toca atletas ni eventos.',
    baseRole: 'operador_plu_arg',
    isSystem: false,
    isProtected: false,
    assignableByAdmin: true,
    active: true,
    hierarchyLevel: 3,
    permissions: [
      'admin.dashboard.read',
      'admin.payments.read',
      'admin.payments.approve',
      'admin.pricing.read',
      'admin.exports.admin',
      'admin.audit.read',
      'admin.athletes.read',
    ],
    userCount: 2,
    canAssign: true,
    canManagePermissions: true,
  },
  {
    id: 'comunicacion',
    key: 'comunicacion',
    name: 'Comunicación',
    description: 'Consulta resultados y la analítica del sitio.',
    baseRole: 'operador_plu_arg',
    isSystem: false,
    isProtected: false,
    assignableByAdmin: true,
    active: true,
    hierarchyLevel: 3,
    permissions: [
      'admin.results.read',
      'admin.events.read',
      'admin.analytics.read',
      'admin.analytics.identity',
      'admin.athletes.delete',
    ],
    userCount: 1,
    canAssign: true,
    canManagePermissions: true,
  },
  {
    id: 'prensa',
    key: 'prensa',
    name: 'Prensa',
    description: 'Rol de prueba sin uso.',
    baseRole: 'operador_plu_arg',
    isSystem: false,
    isProtected: false,
    assignableByAdmin: true,
    active: false,
    hierarchyLevel: 3,
    permissions: ['admin.results.read'],
    userCount: 0,
    canAssign: false,
    canManagePermissions: true,
  },
]

export const PREVIEW_AUTHORIZATION = {
  id: 'staff-1',
  roleKey: 'admin_maximal',
  role: 'admin_maximal',
  permissions: PERMISSION_CATALOG.map(({ key }) => key),
}

export const PREVIEW_ROLE_ACTIVITY = [
  {
    id: 'act-1',
    action: 'access_role.permissions_updated',
    roleId: 'tesoreria',
    roleName: 'Tesorería',
    actorName: 'Agustín Di Santo',
    createdAt: isoAgo(2 * DAY),
    addedPermissions: ['admin.payments.approve', 'admin.exports.admin'],
    removedPermissions: ['admin.events.read'],
  },
  {
    id: 'act-2',
    action: 'access_role.created',
    roleId: 'tesoreria',
    roleName: 'Tesorería',
    actorName: 'Agustín Di Santo',
    createdAt: isoAgo(9 * DAY),
    addedPermissions: ['admin.payments.read'],
    removedPermissions: [],
  },
  {
    id: 'act-3',
    action: 'access_role.permissions_updated',
    roleId: 'comunicacion',
    roleName: 'Comunicación',
    actorName: 'Agustín Di Santo',
    createdAt: isoAgo(5 * DAY),
    addedPermissions: ['admin.analytics.identity', 'admin.athletes.delete'],
    removedPermissions: [],
  },
]

/* ───────────────────────────── Auditoría ───────────────────────────── */

let auditSeq = 0
function row(offsetMs, action, entityType, entityId, actorType, extra = {}) {
  auditSeq += 1
  return {
    id: `log-${auditSeq}`,
    source: extra.source ?? 'domain',
    action,
    entity_type: entityType,
    entity_id: entityId,
    actor_type: actorType,
    actor_id: extra.actorId ?? null,
    status: extra.status ?? null,
    severity: extra.severity ?? null,
    metadata: extra.metadata ?? {},
    created_at: isoAgo(offsetMs),
  }
}

export const PREVIEW_AUDIT_ROWS = [
  row(6 * MIN, 'payment.applied', 'athlete_payment_order', 'a1b2c3d4-0001', 'webhook', {
    source: 'payment',
    actorId: 'mp-8891',
    metadata: { reference: 'ORD-10428', amount: 75000, concept: 'membership' },
  }),
  row(11 * MIN, 'membership.activated', 'membership', 'mem-014', 'webhook', {
    metadata: { memberCode: 'PLU-ARG-2026-014' },
  }),
  row(34 * MIN, 'payment_webhook.failed', 'payment_integration_event', '4659014d-e322', 'webhook', {
    source: 'payment',
    status: 'failed',
    severity: 'danger',
    actorId: '777:payment.updated',
    metadata: {
      attempt: 5,
      error: 'No pudimos validar la firma del webhook de Mercado Pago.',
    },
  }),
  row(52 * MIN, 'auth.login_failed', 'staff_user', 'usr-77', 'anonymous', {
    source: 'identity',
    metadata: { reason: 'invalid_credentials' },
  }),
  row(70 * MIN, 'email.delivered', 'transactional_email', 'mail-221', 'brevo', {
    source: 'email',
    metadata: { templateKey: 'membership_confirmation', recipientEmail: 'ana@example.com' },
  }),
  row(2 * HOUR, 'registration.confirmed', 'event_registration', 'reg-883', 'webhook', {
    metadata: { reference: 'ORD-10427', concept: 'registration' },
  }),
  row(3 * HOUR, 'email.rejected', 'transactional_email', 'mail-219', 'brevo', {
    source: 'email',
    status: 'rejected',
    metadata: { templateKey: 'registration_confirmation', recipientEmail: 'bruno@example.com' },
  }),
  row(5 * HOUR, 'payment.approved_manually', 'athlete_payment_order', 'a1b2c3d4-0002', 'staff', {
    source: 'payment',
    actorId: 'staff-1',
    metadata: { reference: 'ORD-10419', amount: 120000, concept: 'combo' },
  }),
  row(7 * HOUR, 'access_role.permissions_updated', 'access_role', 'tesoreria', 'staff', {
    source: 'identity',
    actorId: 'staff-1',
    metadata: { roleKey: 'tesoreria' },
  }),
  row(1 * DAY + 2 * HOUR, 'payment_attempt.failed', 'athlete_payment_order', 'order-99', 'system', {
    source: 'payment',
    severity: 'danger',
    metadata: { attempt: 2, error: { message: 'El monto no coincide con la preferencia.' } },
  }),
  row(1 * DAY + 4 * HOUR, 'membership.expired', 'membership', 'mem-007', 'cron', {
    severity: 'warning',
    metadata: { memberCode: 'PLU-ARG-2025-007', expirationDate: '2026-10-09' },
  }),
  row(1 * DAY + 6 * HOUR, 'ticket_order.approved', 'ticket_order', 'tord-55', 'webhook', {
    source: 'payment',
    metadata: { reference: 'TORD-ABC123', amount: 45000 },
  }),
  row(1 * DAY + 9 * HOUR, 'event.upserted', 'event', 'evt-pitbull', 'staff', {
    actorId: 'staff-2',
    metadata: { eventId: 'evt-pitbull' },
  }),
  row(2 * DAY + 3 * HOUR, 'registration.checked_in', 'event_registration', 'reg-701', 'staff', {
    actorId: 'staff-9',
    metadata: { eventId: 'evt-pitbull' },
  }),
  row(
    2 * DAY + 5 * HOUR,
    'payment.rejected_manually',
    'athlete_payment_order',
    'a1b2c3d4-0003',
    'staff',
    {
      source: 'payment',
      actorId: 'staff-1',
      severity: 'danger',
      metadata: { reference: 'ORD-10401', amount: 75000 },
    },
  ),
  row(2 * DAY + 8 * HOUR, 'account.created', 'athlete', 'ath-912', 'athlete', {
    source: 'identity',
    metadata: { accountKind: 'athlete' },
  }),
]

export const PREVIEW_AUDIT_FACETS = {
  actions: [...new Set(PREVIEW_AUDIT_ROWS.map((r) => r.action))],
  categories: ['acceso', 'cobro', 'email', 'membresia', 'inscripcion', 'webhook', 'cuenta'],
  entityTypes: [...new Set(PREVIEW_AUDIT_ROWS.map((r) => r.entity_type))],
  actorTypes: ['staff', 'webhook', 'system', 'cron', 'athlete', 'brevo', 'anonymous'],
  sources: ['domain', 'payment', 'email', 'identity'],
  statuses: ['failed', 'rejected', 'partial'],
}

export const PREVIEW_AUDIT_OVERVIEW_ATTENTION = {
  status: 'attention',
  eventsLast24h: 148,
  emailsDeliveredLast24h: 61,
  emailsRetrying: 2,
  emailAttention: 4,
  paymentAttention: 2,
  activeMembershipsWithoutConfirmation: 1,
  approvedOrdersWithoutActiveMembership: 0,
}

export const PREVIEW_AUDIT_OVERVIEW_HEALTHY = {
  ...PREVIEW_AUDIT_OVERVIEW_ATTENTION,
  status: 'healthy',
  emailAttention: 0,
  paymentAttention: 0,
  activeMembershipsWithoutConfirmation: 0,
}

/* ───────────────────────────── Analítica ───────────────────────────── */

function dayKey(offsetDays) {
  return new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10)
}

function buildSeries(days) {
  const series = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * DAY)
    const weekday = date.getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1
    const wave = 1 + 0.35 * Math.sin((days - offset) / 4.2)
    // Pico de campaña hace ~12 días.
    const spike = offset === 12 ? 2.6 : offset === 11 || offset === 13 ? 1.5 : 1
    const visitors = Math.max(6, Math.round(34 * weekend * wave * spike))
    series.push({
      day: dayKey(offset),
      visitors,
      sessions: Math.round(visitors * 1.25),
      pageviews: Math.round(visitors * 3.1),
    })
  }
  return series
}

export function previewTimeseries(days = 30) {
  const series = buildSeries(Math.max(days, 90))
  const slice = series.slice(-days)
  const peak = series.reduce(
    (best, item) => (item.visitors > best.visitors ? item : best),
    series[0],
  )
  return { series: slice, peak, firstDay: series[0].day }
}

export const PREVIEW_ANALYTICS = {
  overview: {
    visitors: 1284,
    identifiedVisitors: 302,
    pageviews: 4012,
    sessions: 1611,
    engagedSessions: 902,
    engagementRate: 0.56,
    avgDurationSeconds: 187,
    avgActiveSeconds: 74,
    interactions: 6240,
  },
  previousOverview: {
    visitors: 1043,
    identifiedVisitors: 318,
    pageviews: 3511,
    sessions: 1302,
    engagedSessions: 744,
    engagementRate: 0.57,
    avgDurationSeconds: 170,
    avgActiveSeconds: 70,
    interactions: 5100,
  },
  pages: [
    { path: '/', pageviews: 1420, visitors: 902, clicks: 611, exits: 300 },
    { path: '/afiliarse', pageviews: 704, visitors: 410, clicks: 288, exits: 140 },
    { path: '/pitbull', pageviews: 633, visitors: 388, clicks: 150, exits: 120 },
    { path: '/records', pageviews: 402, visitors: 240, clicks: 40, exits: 90 },
    { path: '/reglamento', pageviews: 233, visitors: 160, clicks: 22, exits: 70 },
  ],
  funnel: [
    { step_index: 1, step_name: 'landing_view', visitors: 902 },
    { step_index: 2, step_name: 'membership_view', visitors: 410 },
    { step_index: 3, step_name: 'membership_checkout_opened', visitors: 164 },
    { step_index: 4, step_name: 'membership_payment_submitted', visitors: 97 },
    { step_index: 5, step_name: 'membership_payment_approved', visitors: 81 },
  ],
  access: {
    succeeded: { events: 736, people: 303, athletes: 290, staff: 13 },
    failed: { events: 77, people: 15, athletes: 7, staff: 15 },
    accountsCreated: 52,
    failureRate: 0.0947,
    blockedPeople: 3,
    series: [],
    failureReasons: [
      { reason: 'invalid_credentials', attempts: 61, people: 12 },
      { reason: 'account_locked', attempts: 16, people: 3 },
    ],
  },
  operational: {
    engagedVisitors: 812,
    access: {
      total: 231,
      byGate: [
        { gate: 'Puerta A', entries: 140 },
        { gate: 'Puerta B', entries: 91 },
      ],
    },
    keyActions: [
      { action: 'membership_checkout_opened', people: 164 },
      { action: 'credential_downloaded', people: 120 },
    ],
  },
  alerts: [
    {
      kind: 'transfer_overdue',
      entity_id: 'order-1',
      subject: 'MORD-10311',
      detail: 'Comprobante pendiente de validación por más de 48 horas',
    },
  ],
  live: {
    generatedAt: new Date().toISOString(),
    windowMinutes: 5,
    visitors: 9,
    sessions: 11,
    identified: 3,
    peakLastHour: 14,
    peakToday: 31,
    visitorsToday: 96,
    series: Array.from({ length: 30 }, (_, index) => ({
      minute: isoAgo((30 - index) * MIN),
      sessions: 3 + Math.round(4 * Math.abs(Math.sin(index / 4))) + (index > 22 ? 3 : 0),
    })),
    pages: [
      { path: '/pitbull', visitors: 4, sessions: 4 },
      { path: '/afiliarse', visitors: 3, sessions: 3 },
    ],
    devices: [],
    countries: [],
    referrers: [],
  },
  flows: [
    { from_path: '/', to_path: '/afiliarse', transitions: 301 },
    { from_path: '/', to_path: '/pitbull', transitions: 244 },
    { from_path: '/afiliarse', to_path: '/checkout', transitions: 120 },
  ],
  elements: [
    {
      element_selector: '#cta-afiliarme',
      label: 'Afiliarme',
      clicks: 291,
      visitors: 204,
      paths: 3,
      sample_path: '/',
    },
    {
      element_selector: '#cta-pitbull',
      label: 'Inscribirme al Pitbull',
      clicks: 188,
      visitors: 150,
      paths: 1,
      sample_path: '/pitbull',
    },
  ],
  heatmap: {
    path: '/',
    grid: 40,
    total: 611,
    max: 40,
    aspectRatio: 3.4,
    aspectSamples: 300,
    cells: Array.from({ length: 36 }, (_, index) => ({
      cell_x: 8 + (index % 9) * 2,
      cell_y: 4 + Math.floor(index / 9) * 7,
      weight: 40 - index,
    })),
    elements: [{ element_selector: '#cta-afiliarme', label: 'Afiliarme', clicks: 291 }],
  },
  failureReasons: [
    {
      code: 'CARD_DECLINED',
      title: 'Tarjeta rechazada por el banco',
      severity: 'expected',
      count: 9,
    },
    {
      code: 'AMOUNT_MISMATCH',
      title: 'El monto no coincide con la preferencia',
      severity: 'blocker',
      count: 2,
    },
  ],
}
