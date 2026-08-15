import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { PROOF_BUCKET } from '../lib/supabaseAdmin.js'
import { assertSupabaseResult, requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { publicReadLimiter, staffLimiter } from '../middleware/rateLimit.js'

/** Cuentas temporales de puerta: viven en Prisma, atadas al evento por uuid. */
const SECURITY_ROLE = 'seguridad_plu_arg'
const ATHLETE_PHOTO_BUCKET = 'athlete-photos'
const RECENT_PORTRAIT_TTL_SECONDS = 3600
const recentPortraitUrlCache = new Map()

const EVENT_SELECT = `
  *,
  capacityRules:event_capacity_rules(*),
  eventRegistrations:event_registrations(status),
  eventDays:event_days(*),
  comboOffer:event_combo_offers(*),
  ticketTypes:ticket_types(
    *,
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id)
  )
`

const CATALOG_EVENT_SELECT = `
  id, slug, title, description, venue, location,
  starts_at, ends_at,
  registration_opens_at, registration_closes_at,
  ticket_sales_opens_at, ticket_sales_closes_at,
  capacity, status, published, requires_membership, price, currency, rules,
  live_stream_url, live_stream_provider, live_status, created_at, updated_at,
  eventRegistrations:event_registrations(count),
  eventDays:event_days(id, day_index, label, date),
  comboOffer:event_combo_offers(id, membership_plan_id, price, currency, active, starts_at, ends_at),
  ticketTypes:ticket_types(
    id, name, price, quota, sort_order, active,
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id)
  )
`

const ACTIVE_REGISTRATION_STATUSES = ['pendiente_pago', 'pagada', 'confirmada']

/**
 * Vocabulario de estados públicos del evento. `agotado` lo mantiene la base
 * (20260807140000): entra acá porque el editor igual puede mandarlo de vuelta
 * al guardar un evento que ya estaba lleno.
 */
const EVENT_STATUSES = [
  'proximamente',
  'inscripcion_abierta',
  'cupos_limitados',
  'agotado',
  'cerrado',
  'finalizado',
]

const boundedMoney = z.coerce.number().finite().int().min(0).max(10_000_000)
const paidMoney = z.coerce.number().finite().int().min(1).max(10_000_000)
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Fecha inválida.')
const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'Fecha y hora inválidas.')

const ticketAddonSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(240).optional(),
  price: boundedMoney,
  redeemLabel: z.string().trim().max(160).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
})

const pricingSchema = z
  .object({
    membership: boundedMoney,
    registration: paidMoney,
    combo: boundedMoney,
    ticketsEnabled: z.boolean().optional(),
    ticketAddons: z.array(ticketAddonSchema).max(30).optional(),
  })
  .passthrough()

const eventDaySchema = z.object({
  dayIndex: z.coerce.number().int().min(0).max(30),
  label: z.string().trim().min(1).max(80),
  date: optionalDate,
})

const nullableQuota = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(0).max(100_000).nullable(),
)

const ticketTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  price: boundedMoney,
  quota: nullableQuota.optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
  dayIndexes: z.array(z.coerce.number().int().min(0).max(30)).max(31).optional(),
  includedAddonIds: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
})

export const eventSchema = z
  .object({
    id: z.string().uuid().optional(),
    expectedUpdatedAt: optionalDateTime,
    slug: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido.'),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    venue: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(120),
    startsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Inicio inválido.'),
    endsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Fin inválido.'),
    status: z.enum(EVENT_STATUSES),
    published: z.boolean(),
    requiresMembership: z.boolean().default(true),
    slots: z.coerce.number().int().min(1).max(5000),
    pricing: pricingSchema,
    featured: z.boolean().optional(),
    registrationOpensAt: optionalDateTime,
    registrationClosesAt: optionalDateTime,
    ticketSalesOpensAt: optionalDateTime,
    ticketSalesClosesAt: optionalDateTime,
    eventDays: z.array(eventDaySchema).max(31).optional(),
    ticketTypes: z.array(ticketTypeSchema).max(50).optional(),
    liveStreamUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        'La URL del stream debe comenzar con http:// o https://.',
      ),
    liveStreamProvider: z.enum(['youtube', 'instagram', 'twitch']).optional(),
    liveStatus: z.enum(['offline', 'live', 'ended']).optional(),
  })
  .superRefine((event, context) => {
    if (new Date(event.endsAt) < new Date(event.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'El fin debe ser posterior al inicio.',
      })
    }

    const orderedWindows = [
      ['registrationOpensAt', 'registrationClosesAt'],
      ['ticketSalesOpensAt', 'ticketSalesClosesAt'],
    ]
    for (const [opensKey, closesKey] of orderedWindows) {
      if (
        event[opensKey] &&
        event[closesKey] &&
        new Date(event[closesKey]) < new Date(event[opensKey])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [closesKey],
          message: 'La fecha de cierre debe ser posterior a la apertura.',
        })
      }
    }

    const dayIndexes = new Set()
    for (const [index, day] of (event.eventDays ?? []).entries()) {
      if (dayIndexes.has(day.dayIndex)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventDays', index, 'dayIndex'],
          message: 'No puede haber dos jornadas con el mismo orden.',
        })
      }
      dayIndexes.add(day.dayIndex)
    }

    const addonIds = new Set((event.pricing.ticketAddons ?? []).map((addon) => addon.id))
    for (const [index, ticketType] of (event.ticketTypes ?? []).entries()) {
      if ((ticketType.dayIndexes ?? []).some((dayIndex) => !dayIndexes.has(dayIndex))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'dayIndexes'],
          message: 'El tipo de entrada referencia una jornada inexistente.',
        })
      }
      if ((ticketType.includedAddonIds ?? []).some((addonId) => !addonIds.has(addonId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'includedAddonIds'],
          message: 'El tipo de entrada referencia un beneficio inexistente.',
        })
      }
    }
  })

/**
 * Cambio de estado sin pasar por el upsert completo. Los dos campos son
 * opcionales e independientes -- se puede despublicar sin tocar el estado --
 * pero mandar el body vacío no tiene sentido y se rechaza acá en vez de gastar
 * un viaje a la base.
 */
const eventStateSchema = z
  .object({
    status: z.enum(EVENT_STATUSES).optional(),
    published: z.boolean().optional(),
  })
  .refine(
    (body) => body.status !== undefined || body.published !== undefined,
    'No hay ningún cambio para aplicar.',
  )

/** Tandas de un evento: el grupo con el que un atleta entra a plataforma. */
const eventSessionSchema = z.object({
  id: z.string().uuid().optional(),
  dayIndex: z.coerce.number().int().min(0).max(30),
  name: z.string().trim().min(1).max(80),
  platform: z.string().trim().max(80).optional(),
  weighInAt: optionalDateTime,
  startsAt: optionalDateTime,
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
})

const eventSessionsSchema = z.object({
  sessions: z.array(eventSessionSchema).max(60),
})

/**
 * Asignación de grilla. `dayIndex`/`sessionId` en null limpian la asignación:
 * es cómo se deshace un reparto equivocado sin tener que borrar la inscripción.
 */
const assignScheduleSchema = z
  .object({
    registrationIds: z.array(z.string().uuid()).min(1).max(500),
    dayIndex: z.coerce.number().int().min(0).max(30).nullable().optional(),
    sessionId: z.string().uuid().nullable().optional(),
  })
  .transform((body) => ({
    registrationIds: body.registrationIds,
    dayIndex: body.dayIndex ?? null,
    sessionId: body.sessionId ?? null,
  }))

/**
 * Reparto sugerido. El tope por tanda es lo que decide el operador: en
 * powerlifting una tanda suele ir de 10 a 14 atletas, pero depende de la sede
 * y de cuántas plataformas haya.
 */
const autofillSchema = z.object({
  dayIndex: z.coerce.number().int().min(0).max(30),
  maxPerSession: z.coerce.number().int().min(1).max(100),
})

function parseEventSlug(value) {
  const slug = String(value ?? '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, 'Slug de evento inválido.')
  }
  return slug
}

/**
 * Comprobantes de transferencia de las órdenes de entradas del evento borrado.
 * Mismo criterio que el borrado de atletas: es best-effort -- un archivo
 * huérfano en storage no justifica revertir un borrado que ya se confirmó en
 * la base, pero sí queda avisado en el log.
 */
async function removeTicketProofs(client, orderIds) {
  for (const orderId of Array.isArray(orderIds) ? orderIds : []) {
    const listed = await client.storage.from(PROOF_BUCKET).list(orderId, { limit: 100 })
    if (listed.error) {
      console.warn(`No se pudieron listar comprobantes de ${orderId}:`, listed.error.message)
      continue
    }
    const paths = (listed.data ?? []).map((file) => `${orderId}/${file.name}`)
    if (paths.length === 0) continue
    const removal = await client.storage.from(PROOF_BUCKET).remove(paths)
    if (removal.error) {
      console.warn(`No se pudieron borrar comprobantes de ${orderId}:`, removal.error.message)
    }
  }
}

async function readEvents(client) {
  return assertSupabaseResult(
    await client.from('events').select(EVENT_SELECT).order('starts_at'),
    'No se pudieron leer los eventos.',
  )
}

async function getRecentPortraitUrl(client, photoPath) {
  const cached = recentPortraitUrlCache.get(photoPath)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  try {
    const signed = assertSupabaseResult(
      await client.storage
        .from(ATHLETE_PHOTO_BUCKET)
        .createSignedUrl(photoPath, RECENT_PORTRAIT_TTL_SECONDS),
      'No se pudo firmar la foto del inscripto.',
    )
    const url = signed?.signedUrl ?? null
    if (url) {
      recentPortraitUrlCache.set(photoPath, {
        expiresAt: Date.now() + (RECENT_PORTRAIT_TTL_SECONDS - 60) * 1000,
        url,
      })
    }
    return url
  } catch {
    // El resumen público sigue disponible aunque una foto haya sido removida.
    return null
  }
}

async function attachRecentRegistrationPortraits(client, summary) {
  const recent = Array.isArray(summary?.recent) ? summary.recent : []
  const entries = await Promise.all(
    recent.map(async (item) => {
      const { photoPath, photo_path: photoPathSnake, ...entry } = item ?? {}
      const portraitPath = String(photoPath ?? photoPathSnake ?? '').trim()
      return {
        ...entry,
        photoUrl: portraitPath ? await getRecentPortraitUrl(client, portraitPath) : null,
      }
    }),
  )

  return { ...summary, recent: entries }
}

export function createEventRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const editGuard = requirePermission('admin.events.write', { prisma })
  const viewGuard = requirePermission('admin.events.read', { prisma })
  // La grilla es dato de inscripciones, no de configuración del evento: quien
  // arma el reparto de atletas no necesariamente puede editar precios y fechas.
  const registrationsViewGuard = requirePermission('admin.registrations.read', { prisma })
  const registrationsEditGuard = requirePermission('admin.registrations.write', { prisma })
  // Borrar un evento no es "editarlo mucho": se lleva inscripciones pagadas,
  // entradas y acreditaciones. Mismo techo que el borrado de atletas y de
  // cuentas de staff -- solo Super Admin, no `admin.events.write`.
  const deleteGuard = requirePermission('admin.events.delete', { prisma })

  router.get('/', ...viewGuard, staffLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = await readEvents(client)
      res.json({ events })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Catálogo público (sin auth): eventos publicados con `registration_opens_at`
   * y pricing visible. Alimenta countdown / soft-launch del sitio sin depender
   * del seed local ni de RLS del cliente.
   */
  router.get('/catalog', publicReadLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = assertSupabaseResult(
        await client
          .from('events')
          .select(CATALOG_EVENT_SELECT)
          .eq('published', true)
          .in('event_registrations.status', ACTIVE_REGISTRATION_STATUSES)
          .order('starts_at'),
        'No se pudieron leer los eventos públicos.',
      )
      res.set('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60')
      res.json({ events: Array.isArray(events) ? events : [] })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:eventSlug/registration-summary', publicReadLimiter, async (req, res, next) => {
    try {
      const slug = parseEventSlug(req.params.eventSlug)

      const client = requireSupabaseClient(getSupabaseAdmin())
      const summary = assertSupabaseResult(
        await client.rpc('get_event_registration_capacity', { p_event_slug: slug }),
        'No se pudo consultar el cupo de inscripción.',
      )
      res.json({ summary: await attachRecentRegistrationPortraits(client, summary) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/upsert',
    ...editGuard,
    staffLimiter,
    validateBody(eventSchema),
    async (req, res, next) => {
      try {
        const client = requireSupabaseClient(getSupabaseAdmin())
        const mode = req.validatedBody.id ? 'updated' : 'created'
        const savedEvent = assertSupabaseResult(
          await client.rpc('staff_save_event', {
            p_event: req.validatedBody,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo guardar el evento.',
        )
        const events = await readEvents(client)
        const event = events.find((candidate) => candidate.id === savedEvent.id)
        if (!event) {
          throw new HttpError(503, 'El evento se guardó, pero no se pudo volver a leer.')
        }

        res.status(mode === 'created' ? 201 : 200).json({ event, events, mode })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Habilitar, deshabilitar y cambiar el estado público de un evento. Es el
   * mismo permiso que editar el evento, pero sin reescribirlo entero: el upsert
   * recrea días y tipos de entrada en cada pasada, y para prender o apagar un
   * evento eso es un efecto colateral que no queremos.
   *
   * Devuelve la colección completa porque el panel mantiene la lista en memoria
   * y una fila desincronizada acá se nota enseguida (la barra de ocupación y el
   * badge salen del mismo objeto).
   */
  router.post(
    '/:eventSlug/state',
    ...editGuard,
    staffLimiter,
    validateBody(eventStateSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_set_event_state', {
            p_event_slug: slug,
            p_status: req.validatedBody.status ?? null,
            p_published: req.validatedBody.published ?? null,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo cambiar el estado del evento.',
        )

        const events = await readEvents(client)
        const event = events.find((candidate) => candidate.id === result.event?.id)
        if (!event) {
          throw new HttpError(503, 'El estado se guardó, pero no se pudo volver a leer.')
        }

        res.json({ event, events, statusOverridden: result.statusOverridden === true })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Impacto del borrado, sin borrar nada: cuántas inscripciones, entradas,
   * órdenes y acreditaciones se lleva puestas el evento. El panel lo pide al
   * abrir la confirmación para que el operador decida sobre números reales y
   * no sobre "esto elimina todo".
   *
   * `requiresForce` en true es la señal de que el evento ya movió plata o
   * gente: ahí el panel exige escribir el identificador antes de confirmar.
   */
  router.get(
    '/:eventSlug/delete-impact',
    ...deleteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const impact = assertSupabaseResult(
          await client.rpc('delete_event', {
            p_event_slug: slug,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
            p_force: false,
            p_dry_run: true,
          }),
          'No se pudo calcular el impacto del borrado.',
        )
        res.json({ impact })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Borrado definitivo del evento y todo lo que cuelga de él. Exige
   * admin.events.delete: es irreversible y se lleva inscripciones, entradas y acreditaciones.
   *
   * La cascada y la auditoría viven en la RPC delete_event
   * (20260815110000_event_hard_delete.sql). Acá queda lo que SQL no alcanza:
   * los comprobantes en storage y las cuentas de puerta, que viven en Prisma.
   *
   * `?force=true` es el consentimiento explícito para eventos con actividad
   * real; sin él la RPC responde 409 y el panel escala la confirmación.
   */
  router.delete('/:eventSlug', ...deleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const slug = parseEventSlug(req.params.eventSlug)
      const client = requireSupabaseClient(getSupabaseAdmin())
      const deletedEvent = assertSupabaseResult(
        await client.rpc('delete_event', {
          p_event_slug: slug,
          p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          p_force: req.query.force === 'true',
          p_dry_run: false,
        }),
        'No se pudo eliminar el evento.',
      )

      await removeTicketProofs(client, deletedEvent?.proofOrderIds)

      // Las credenciales de puerta quedarían apuntando a un evento inexistente:
      // el job de ciclo de vida las trata como huérfanas y las purga igual, pero
      // esperar a la próxima corrida deja una ventana en la que la credencial
      // firmada sigue existiendo.
      const securityUsers = await getPrisma().user.deleteMany({
        where: { role: SECURITY_ROLE, eventId: deletedEvent.id },
      })

      const events = await readEvents(client)
      res.json({
        deletedEvent: { ...deletedEvent, securityUsers: securityUsers?.count ?? 0 },
        events,
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Grilla del evento: días, tandas y cuántos atletas hay en cada una. El
   * conteo es lo que hace usable la asignación masiva -- sin él no se ve si una
   * tanda quedó con 4 atletas o con 40.
   */
  router.get(
    '/:eventSlug/schedule',
    ...registrationsViewGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const schedule = assertSupabaseResult(
          await client.rpc('staff_get_event_schedule', { p_event_slug: slug }),
          'No se pudo leer la grilla del evento.',
        )
        res.json({ schedule })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Alta/edición de tandas. Reemplaza el set completo del evento. */
  router.post(
    '/:eventSlug/sessions',
    ...editGuard,
    staffLimiter,
    validateBody(eventSessionsSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const schedule = assertSupabaseResult(
          await client.rpc('staff_save_event_sessions', {
            p_event_slug: slug,
            p_sessions: req.validatedBody.sessions,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudieron guardar las tandas.',
        )
        res.json({ schedule })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Tablero de armado de grilla: días, tandas con su roster completo y la
   * bolsa de inscriptos sin ubicar. Es lo que alimenta la sección Grilla.
   */
  router.get(
    '/:eventSlug/board',
    ...registrationsViewGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const board = assertSupabaseResult(
          await client.rpc('staff_get_event_board', { p_event_slug: slug }),
          'No se pudo leer el tablero del evento.',
        )
        res.json({ board })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Reparto sugerido: llena las tandas de un día en orden de competencia. */
  router.post(
    '/:eventSlug/schedule/autofill',
    ...registrationsEditGuard,
    staffLimiter,
    validateBody(autofillSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_autofill_event_day', {
            p_event_slug: slug,
            p_day_index: req.validatedBody.dayIndex,
            p_max_per_session: req.validatedBody.maxPerSession,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo repartir a los atletas.',
        )
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Asignación masiva: se filtra en el panel (por ejemplo, todas las Open Raw),
   * se selecciona y se manda el lote entero al mismo día/tanda.
   */
  router.post(
    '/:eventSlug/registrations/schedule',
    ...registrationsEditGuard,
    staffLimiter,
    validateBody(assignScheduleSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_assign_registration_schedule', {
            p_event_slug: slug,
            p_registration_ids: req.validatedBody.registrationIds,
            p_day_index: req.validatedBody.dayIndex,
            p_session_id: req.validatedBody.sessionId,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo asignar la grilla.',
        )
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
