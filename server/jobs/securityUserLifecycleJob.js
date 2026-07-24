import { fetchSupabaseEventsByIds } from '../services/securityEventService.js'

/**
 * securityUserLifecycleJob.js — PLU ARG
 *
 * Ciclo de vida automático de las cuentas seguridad_plu_arg (personal de
 * puerta que escanea QR). Se crean con contraseña temporal + credencial de
 * puerta atadas a un evento de Supabase (User.eventId), y hasta ahora la baja
 * era 100% manual (POST /auth/security-users/deactivate-all). Este job cierra
 * el ciclo en dos fases, sin acción del admin:
 *
 *   Fase 1 — desactivar: apenas el evento termina (now > ends_at) las cuentas
 *     activas pasan a 'disabled'. Corta acceso al instante: readSession
 *     invalida la sesión activa en el próximo request y /security-gate
 *     revalida status === 'active', así que la credencial firmada deja de
 *     entrar.
 *   Fase 2 — purgar: pasada la gracia (now > ends_at + GRACE_MS) las cuentas
 *     se borran definitivamente. prisma.user.delete es seguro para estas
 *     cuentas — las relaciones que podrían bloquearlo son Cascade o SetNull, y
 *     el historial de escaneos vive en Supabase check_ins (scanned_by_id ->
 *     auth.users, on delete set null), así que se conserva.
 *
 * Por qué un job de Express y no pg_cron: las cuentas viven en Prisma
 * (schema plu_prisma) y los eventos en Supabase (schema public). Solo el server
 * tiene ambos clientes.
 */

const SECURITY_ROLE = 'seguridad_plu_arg'
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000 // 1 h
const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000 // 24 h
const MIN_INTERVAL_MS = 60_000

/**
 * Lógica pura de clasificación (sin I/O, testeable). Dado el padrón de cuentas
 * de seguridad, los eventos leídos de Supabase y el reloj, decide qué eventos
 * hay que desactivar y cuáles purgar.
 *
 * - Evento en curso (now <= ends_at): sin cambios.
 * - Evento terminado, dentro de la gracia: desactivar sus cuentas activas.
 * - Evento terminado + gracia cumplida: purgar todas sus cuentas.
 * - Evento ausente del Map (consultado pero no volvió = borrado de Supabase,
 *   NO lectura fallida): huérfano -> desactivar ya y purgar (sin ends_at no
 *   hay ventana de gracia real; la cuenta no puede operar nunca más).
 *
 * @param {{ users: Array<{ eventId: string | null, status: string }>, eventsById: Map<string, { endsAt: string | null }>, now: Date, graceMs: number }} params
 * @returns {{ disableEventIds: string[], purgeEventIds: string[] }}
 */
export function classifySecurityUsers({ users, eventsById, now, graceMs }) {
  const eventIds = new Set(users.map((user) => user.eventId).filter(Boolean))
  const disableEventIds = []
  const purgeEventIds = []
  const nowMs = now.getTime()

  for (const eventId of eventIds) {
    const event = eventsById.get(eventId)

    // Huérfano: el evento ya no existe en Supabase -> desactivar y purgar.
    if (!event) {
      disableEventIds.push(eventId)
      purgeEventIds.push(eventId)
      continue
    }

    const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : null
    if (endsAt === null || Number.isNaN(endsAt) || endsAt >= nowMs) continue // en curso / sin fin conocido

    disableEventIds.push(eventId)
    if (nowMs > endsAt + graceMs) purgeEventIds.push(eventId)
  }

  return { disableEventIds, purgeEventIds }
}

export async function runSecurityUserLifecycleJob({
  prisma,
  client,
  env = process.env,
  now = new Date(),
} = {}) {
  if (!prisma || !client) {
    throw new Error('Prisma y Supabase son obligatorios para el ciclo de vida de seguridad.')
  }
  const graceMs = Number(env.SECURITY_USER_PURGE_GRACE_MS) || DEFAULT_GRACE_MS
  const users = await prisma.user.findMany({
    where: { role: SECURITY_ROLE },
    select: { id: true, eventId: true, status: true },
  })
  const eventIds = users.map((user) => user.eventId).filter(Boolean)
  if (eventIds.length === 0) return { disabled: 0, purged: 0 }

  // Si esta lectura falla, fetchSupabaseEventsByIds tira -> el caller aborta la
  // corrida y no se toca ninguna cuenta (nunca borrar sobre lectura fallida).
  const eventsById = await fetchSupabaseEventsByIds(client, eventIds)
  const { disableEventIds, purgeEventIds } = classifySecurityUsers({
    users,
    eventsById,
    now,
    graceMs,
  })

  let disabled = 0
  let purged = 0

  if (disableEventIds.length) {
    const result = await prisma.user.updateMany({
      where: { role: SECURITY_ROLE, eventId: { in: disableEventIds }, status: 'active' },
      data: { status: 'disabled' },
    })
    disabled = result.count
  }

  if (purgeEventIds.length) {
    const result = await prisma.user.deleteMany({
      where: { role: SECURITY_ROLE, eventId: { in: purgeEventIds } },
    })
    purged = result.count
  }

  return { disabled, purged }
}

export function startSecurityUserLifecycleJob({ prisma, client, env = process.env } = {}) {
  if (!prisma || !client || env.SECURITY_USER_LIFECYCLE_JOB_ENABLED === 'false') return null

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const { disabled, purged } = await runSecurityUserLifecycleJob({ prisma, client, env })
      if (disabled || purged) {
        console.info(`security-user-lifecycle-job: disabled=${disabled} purged=${purged}`)
      }
    } catch (error) {
      console.error('security-user-lifecycle-job:', error)
    } finally {
      running = false
    }
  }

  void run()
  const intervalMs = Math.max(
    MIN_INTERVAL_MS,
    Number(env.SECURITY_USER_LIFECYCLE_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  )
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return timer
}
