import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middleware/auth.js'
import { publicReadLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import {
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../modules/audit/operationalAuditWriter.js'
import {
  assertMercadoPagoOAuthAvailable,
  buildMercadoPagoAuthorizationUrl,
  createMercadoPagoOAuthState,
  createPkcePair,
  exchangeMercadoPagoAuthorizationCode,
  fetchMercadoPagoAccountIdentity,
  getMercadoPagoOAuthConfig,
  mercadoPagoOAuthLandingUrl,
  readMercadoPagoOAuthState,
} from '../modules/payments/mercadoPagoOAuth.js'
import { refreshMercadoPagoOAuthProfile } from '../modules/payments/mercadoPagoOAuthAccounts.js'
import { createSupabasePaymentProfileRepository } from '../modules/payments/supabasePaymentProfileRepository.js'
import { isPaymentProfileSecretsKeyConfigured } from '../modules/payments/paymentProfileSecrets.js'

const bankConfigSchema = z.object({
  alias: z.string().trim().max(120).optional().default(''),
  cbu: z.string().trim().max(30).optional().default(''),
  holder: z.string().trim().max(160).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
})

const mpConfigSchema = z.object({
  publicKey: z.string().trim().min(8).max(120),
  collectorId: z.string().trim().max(40).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
})

const mpSecretsSchema = z.object({
  accessToken: z.string().trim().min(10).max(256),
  webhookSecret: z.string().trim().min(8).max(256),
})

const createSchema = z.discriminatedUnion('kind', [
  z.object({
    name: z.string().trim().min(2).max(120),
    kind: z.literal('bank_transfer'),
    config: bankConfigSchema.default({}),
  }),
  z.object({
    name: z.string().trim().min(2).max(120),
    kind: z.literal('mercado_pago'),
    config: mpConfigSchema,
    secrets: mpSecretsSchema,
  }),
])

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: mpSecretsSchema.optional(),
  active: z.boolean().optional(),
})

const oauthStartSchema = z.object({
  // Reconectar una cuenta existente (renovar autorización vencida o revocada).
  profileId: z.string().uuid().optional(),
  // Nombre sugerido para una cuenta nueva; si falta se usa el de MP.
  name: z.string().trim().max(120).optional(),
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertProfileId(value) {
  if (!UUID_PATTERN.test(String(value ?? ''))) {
    throw new HttpError(400, 'Identificador de cuenta de cobro inválido.')
  }
  return value
}

/**
 * Lo que ve un organizador del catálogo: lo justo para ELEGIR una cuenta. De las
 * transferencias, alias/CBU/titular (el comprador los ve igual en el checkout); de
 * Mercado Pago, solo el estado de la conexión. Nunca config OAuth, usos ni secretos.
 */
function organizerProfileView(profile) {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    active: profile.active,
    config:
      profile.kind === 'bank_transfer'
        ? {
            alias: profile.config?.alias ?? '',
            cbu: profile.config?.cbu ?? '',
            holder: profile.config?.holder ?? '',
          }
        : {},
    ...(profile.connectionStatus ? { connectionStatus: profile.connectionStatus } : {}),
  }
}

/** Eventos que todavía venden (no terminados) entre los que usan la cuenta. */
function liveEventsFor(usage) {
  return (usage?.events ?? []).filter((event) => !event.finished)
}

export function createPaymentProfileRoutes({
  getPrisma,
  getSupabaseAdmin,
  env = process.env,
  fetchImpl,
}) {
  const router = Router()
  const prisma = getPrisma()
  // Un organizador lee el catálogo SOLO para elegir una cuenta para su evento (vista
  // recortada); crear, editar, archivar y conectar siguen cerrados para él.
  const readGuard = requirePermission('admin.events.read', { prisma }, { eventScoped: true })
  const writeGuard = requirePermission('admin.events.write', { prisma })
  const supabase = () => requireSupabaseClient(getSupabaseAdmin())
  const repo = () => createSupabasePaymentProfileRepository(supabase(), { env })

  const audit = (req, entry) =>
    recordOperationalAuditEvent(getSupabaseAdmin?.(), {
      source: 'payment',
      entityType: 'payment_profile',
      actorType: req.auth?.user ? 'staff' : 'system',
      actorId: req.auth?.user?.id ?? null,
      severity: 'info',
      status: 'succeeded',
      ...entry,
      metadata: requestAuditMetadata(req, {
        actorEmail: req.auth?.user?.email ?? null,
        ...(entry.metadata ?? {}),
      }),
    })

  router.get('/', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const kind = String(req.query?.kind ?? '').trim() || null
      const repository = repo()
      const organizerView = Boolean(req.eventScope)
      const profiles = await repository.list({
        kind: kind || undefined,
        // Un organizador nunca ve cuentas archivadas.
        activeOnly: organizerView || req.query?.includeArchived !== 'true',
      })
      if (organizerView) {
        res.json({
          profiles: profiles.map(organizerProfileView),
          // Sin capacidades de alta: el editor no ofrece crear ni conectar cuentas, y
          // tampoco muestra el aviso de "carga manual no habilitada".
          secretsKeyConfigured: true,
          mercadoPagoOAuth: { available: false, missing: [] },
        })
        return
      }
      // El uso es lo que el panel muestra ("Usada en 3 eventos") y lo que
      // decide si ofrecer eliminar o solo archivar. Pedido aparte por ser más
      // caro: el selector del editor no lo necesita.
      let usageById = null
      if (req.query?.includeUsage === 'true') {
        usageById = await repository.usage(profiles.map((profile) => profile.id))
      }
      const oauth = getMercadoPagoOAuthConfig(env)
      res.json({
        profiles: usageById
          ? profiles.map((profile) => ({
              ...profile,
              usage: usageById.get(profile.id) ?? { events: [], shop: false, pinnedOrders: 0 },
            }))
          : profiles,
        secretsKeyConfigured: isPaymentProfileSecretsKeyConfigured(env),
        mercadoPagoOAuth: { available: oauth.available, missing: oauth.missing },
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/', ...writeGuard, staffLimiter, validateBody(createSchema), async (req, res, next) => {
    try {
      const profile = await repo().create(req.validatedBody)
      void audit(req, {
        action: 'payment_profiles.created',
        entityId: profile.id,
        metadata: { kind: profile.kind, name: profile.name, connection: 'manual' },
      })
      res.status(201).json({ profile })
    } catch (error) {
      next(error)
    }
  })

  // ------------------------------------------------------------ OAuth de MP
  /**
   * Arranca la vinculación: devuelve la URL de autorización de Mercado Pago.
   * El panel la abre en una ventana aparte para no perder lo que el staff
   * tenga sin guardar en el editor del evento.
   */
  router.post(
    '/mercado-pago/oauth/start',
    ...writeGuard,
    staffLimiter,
    validateBody(oauthStartSchema),
    async (req, res, next) => {
      try {
        const config = assertMercadoPagoOAuthAvailable(env)
        const { profileId = null, name = '' } = req.validatedBody
        if (profileId) {
          const existing = await repo().findById(profileId)
          if (!existing || existing.kind !== 'mercado_pago') {
            throw new HttpError(404, 'Cuenta de cobro no encontrada.')
          }
        }
        const pkce = config.pkce ? createPkcePair() : null
        const state = createMercadoPagoOAuthState(
          {
            actorId: req.auth?.user?.id ?? null,
            actorEmail: req.auth?.user?.email ?? null,
            profileId,
            name,
            verifier: pkce?.verifier ?? null,
          },
          env,
        )
        res.json({
          authorizationUrl: buildMercadoPagoAuthorizationUrl(config, {
            state,
            codeChallenge: pkce?.challenge ?? null,
          }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Vuelta de Mercado Pago. No lleva sesión del panel (es una redirección del
   * navegador desde MP): lo que autoriza es el `state` cifrado y vigente que
   * emitió `/start` para un staff con permiso. Siempre termina redirigiendo a
   * la pantalla de resultado del panel, nunca con un JSON de error crudo.
   */
  router.get('/mercado-pago/oauth/callback', publicReadLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    let config
    try {
      config = getMercadoPagoOAuthConfig(env)
    } catch {
      config = { appOrigin: '' }
    }
    const land = (params) => res.redirect(303, mercadoPagoOAuthLandingUrl(config, params))

    let state = null
    try {
      state = readMercadoPagoOAuthState(req.query?.state, env)
    } catch (error) {
      land({ status: 'error', code: error?.details?.code ?? 'MP_OAUTH_STATE_INVALID' })
      return
    }

    // El vendedor tocó "Cancelar" en MP, o MP rechazó el pedido.
    if (req.query?.error || !req.query?.code) {
      land({ status: 'cancelled', code: String(req.query?.error ?? 'access_denied').slice(0, 60) })
      return
    }

    const auditBase = {
      actorType: state.actorId ? 'staff' : 'system',
      actorId: state.actorId ?? null,
    }

    try {
      const oauth = assertMercadoPagoOAuthAvailable(env)
      const tokens = await exchangeMercadoPagoAuthorizationCode(
        oauth,
        { code: String(req.query.code), codeVerifier: state.verifier ?? null },
        { fetchImpl },
      )
      const identity = await fetchMercadoPagoAccountIdentity(tokens.accessToken, { fetchImpl })
      const { profile, created } = await repo().saveMercadoPagoOAuthConnection({
        profileId: state.profileId ?? null,
        name: state.name ?? '',
        tokens,
        identity,
        actorId: state.actorId ?? null,
      })
      void recordOperationalAuditEvent(getSupabaseAdmin?.(), {
        source: 'payment',
        action: created ? 'payment_profiles.mp_oauth_connected' : 'payment_profiles.mp_oauth_reconnected',
        entityType: 'payment_profile',
        entityId: profile.id,
        ...auditBase,
        status: 'succeeded',
        severity: 'info',
        metadata: {
          actorEmail: state.actorEmail ?? null,
          collectorId: profile.config?.collectorId ?? null,
          liveMode: profile.config?.liveMode ?? null,
          account: profile.config?.accountNickname ?? profile.config?.accountEmail ?? null,
        },
      })
      land({ status: 'connected', profileId: profile.id, created: created ? '1' : '0' })
    } catch (error) {
      void recordOperationalAuditEvent(getSupabaseAdmin?.(), {
        source: 'payment',
        action: 'payment_profiles.mp_oauth_failed',
        entityType: 'payment_profile',
        entityId: state.profileId ?? 'new',
        ...auditBase,
        status: 'failed',
        severity: 'warning',
        metadata: {
          actorEmail: state.actorEmail ?? null,
          code: error?.details?.code ?? null,
          providerError: error?.details?.providerError ?? null,
          message: error?.message ?? null,
        },
      })
      land({ status: 'error', code: error?.details?.code ?? 'MP_OAUTH_FAILED' })
    }
  })

  /** Renovación manual del token (la automática corre en el job diario). */
  router.post('/:profileId/refresh', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const profileId = assertProfileId(req.params.profileId)
      const outcome = await refreshMercadoPagoOAuthProfile({
        client: supabase(),
        profileId,
        env,
        fetchImpl,
      })
      void audit(req, {
        action: outcome.needsReconnect
          ? 'payment_profiles.mp_oauth_refresh_rejected'
          : 'payment_profiles.mp_oauth_refreshed',
        entityId: profileId,
        status: outcome.needsReconnect ? 'failed' : 'succeeded',
        severity: outcome.needsReconnect ? 'warning' : 'info',
      })
      res.json(outcome)
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/:profileId',
    ...writeGuard,
    staffLimiter,
    validateBody(updateSchema),
    async (req, res, next) => {
      try {
        const profileId = assertProfileId(req.params.profileId)
        const repository = repo()
        // Archivar una cuenta que un evento todavía en venta usa lo dejaría
        // cobrando con una cuenta que el panel ya no muestra: primero hay que
        // cambiarle la cuenta al evento.
        if (req.validatedBody.active === false) {
          const live = liveEventsFor((await repository.usage([profileId])).get(profileId))
          if (live.length > 0) {
            throw new HttpError(
              409,
              `La cuenta se usa en eventos que siguen vendiendo (${live
                .slice(0, 3)
                .map((event) => event.title)
                .join(', ')}${live.length > 3 ? '…' : ''}). Cambiales la cuenta antes de archivarla.`,
              { code: 'PAYMENT_PROFILE_IN_USE_LIVE_EVENTS' },
            )
          }
        }
        const profile = await repository.update(profileId, req.validatedBody)
        void audit(req, {
          action:
            req.validatedBody.active === false
              ? 'payment_profiles.archived'
              : req.validatedBody.active === true
                ? 'payment_profiles.restored'
                : 'payment_profiles.updated',
          entityId: profile.id,
          metadata: {
            kind: profile.kind,
            fields: Object.keys(req.validatedBody).filter((key) => key !== 'secrets'),
            rotatedSecrets: Boolean(req.validatedBody.secrets),
          },
        })
        res.json({ profile })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Baja definitiva. Solo si nada la referencia; si no, 409 y el panel ofrece
   * archivar. Borrar no revoca la autorización en Mercado Pago (no hay API para
   * eso): el vendedor la quita desde su cuenta si quiere.
   */
  router.delete('/:profileId', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const profileId = assertProfileId(req.params.profileId)
      const { profile } = await repo().remove(profileId)
      void audit(req, {
        action: 'payment_profiles.deleted',
        entityId: profileId,
        metadata: {
          kind: profile.kind,
          name: profile.name,
          connection: profile.config?.connection ?? 'manual',
        },
      })
      res.json({ deleted: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}
