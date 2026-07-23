export const STATUS_LABELS = {
  pre_registrado: 'Pre-registrado',
  registrado: 'Registrado',
  afiliado_activo: 'Afiliado activo',
  afiliado_vencido: 'Afiliado vencido',
  bloqueado: 'Bloqueado',
  pendiente_pago: 'Pendiente de pago',
  activa: 'Activa',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  reembolsada: 'Reembolsada',
  borrador: 'Borrador',
  pagada: 'Pagada',
  confirmada: 'Confirmada',
  observada: 'Observada',
  creado: 'Creado',
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
  validacion_manual: 'Validación manual',
  proximamente: 'Próximamente',
  inscripcion_abierta: 'Inscripción abierta',
  cupos_limitados: 'Cupos limitados',
  cerrado: 'Cerrado',
  finalizado: 'Finalizado',
  usada: 'Ingresó ✓',
}

const SUCCESS = new Set([
  'activa',
  'afiliado_activo',
  'confirmada',
  'pagada',
  'aprobado',
  'inscripcion_abierta',
  'usada',
])

const WARNING = new Set(['pendiente_pago', 'pendiente', 'validacion_manual', 'observada', 'borrador', 'creado', 'cupos_limitados'])

const DANGER = new Set(['cancelada', 'rechazado', 'cancelado', 'bloqueado', 'vencida', 'reembolsada', 'afiliado_vencido', 'cerrado'])

const INFO = new Set(['pre_registrado', 'registrado', 'proximamente'])

export function getStatusMeta(value, t) {
  let tone = 'neutral'
  if (SUCCESS.has(value)) tone = 'success'
  else if (WARNING.has(value)) tone = 'warning'
  else if (DANGER.has(value)) tone = 'danger'
  else if (INFO.has(value)) tone = 'info'

  let label = STATUS_LABELS[value] ?? value ?? '—'
  if (t && value) {
    const translated = t(`status.${value}`)
    if (translated !== `status.${value}`) {
      label = translated
    }
  }

  return { label, tone }
}

/** Único punto de verdad para "¿se puede inscribir a este evento ahora?" —
 * antes se repetía como `status === 'inscripcion_abierta' || status === 'cupos_limitados'`
 * en EventCard, EventsPage y PitbullPage. */
export function isRegistrationOpen(status) {
  return status === 'inscripcion_abierta' || status === 'cupos_limitados'
}

const LEGACY_STATUS_MAP = {
  active: 'activa',
  expired: 'vencida',
  confirmed: 'confirmada',
  approved: 'aprobado',
  pending_payment: 'pendiente_pago',
  manual_pending: 'validacion_manual',
  manual_approved: 'aprobado',
  rejected: 'rechazado',
}

export function normalizeStatus(value) {
  if (!value) return value
  return LEGACY_STATUS_MAP[value] ?? value
}
