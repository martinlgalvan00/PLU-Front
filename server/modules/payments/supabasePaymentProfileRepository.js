import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult } from '../../lib/supabaseRpc.js'
import { decryptPaymentProfileSecrets, encryptPaymentProfileSecrets } from './paymentProfileSecrets.js'
import { mercadoPagoConnectionStatus } from './mercadoPagoOAuth.js'

function trimText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

const PROFILE_NAME_MAX = 120
// Tope de lectura del catálogo al reusar/nombrar un perfil bancario: es una
// lista de decenas de cuentas, pero que una base rara no traiga todo sin límite.
const BANK_CATALOG_LIMIT = 500
const NAME_INDEX = 'payment_profiles_org_name_kind_uidx'
export const PAYMENT_PROFILE_NAME_TAKEN_CODE = 'PAYMENT_PROFILE_NAME_TAKEN'
const NAME_TAKEN_MESSAGE =
  'Ya hay un perfil de cobro activo con ese nombre. Elegí otro nombre o archivá el existente.'

/** Misma regla que el índice único de la tabla: sin mayúsculas ni bordes. */
function nameKey(value) {
  return trimText(value).toLowerCase()
}

function withSuffix(base, suffix) {
  return `${base.slice(0, PROFILE_NAME_MAX - suffix.length).trimEnd()}${suffix}`
}

/**
 * Primer nombre libre para un perfil automático. El índice único
 * `(org, lower(trim(name)), kind) where active` hace que dos perfiles activos no
 * puedan llamarse igual, y el nombre automático (`Transferencia · <evento>`)
 * es el mismo cada vez que el evento cambia de alias: sin esto el segundo
 * guardado fallaba con un 409 sin explicación.
 */
function freeProfileName(base, alias, taken) {
  const candidates = [base, withSuffix(base, ` · ${alias}`)]
  for (let n = 2; n <= 50; n += 1) candidates.push(withSuffix(base, ` (${n})`))
  return (
    candidates.find((candidate) => !taken.has(nameKey(candidate))) ??
    withSuffix(base, ` (${Date.now()})`)
  )
}

/**
 * Escritura en `payment_profiles`. Un nombre repetido es algo que el operador
 * puede corregir: se dice con todas las letras (y en el campo `name`) en vez de
 * dejar que `assertSupabaseResult` lo tape con el texto genérico del call site,
 * que es lo que hacía que el editor mostrara "No se pudo crear el perfil".
 */
function assertProfileWrite(result, fallback) {
  const error = result?.error
  if (
    error &&
    String(error.code) === '23505' &&
    String(error.message ?? '').includes(NAME_INDEX)
  ) {
    throw new HttpError(409, NAME_TAKEN_MESSAGE, {
      code: PAYMENT_PROFILE_NAME_TAKEN_CODE,
      fields: { name: NAME_TAKEN_MESSAGE },
    })
  }
  return assertSupabaseResult(result, fallback)
}

function mapBankConfig(config) {
  return {
    alias: trimText(config.alias),
    cbu: trimText(config.cbu),
    holder: trimText(config.holder),
    notes: trimText(config.notes),
  }
}

// Metadata no secreta de una cuenta vinculada por OAuth. Los tokens nunca
// pasan por acá: viven cifrados en `secrets_ciphertext`.
const OAUTH_CONFIG_KEYS = [
  'connection',
  'liveMode',
  'scope',
  'accountNickname',
  'accountEmail',
  'accountName',
  'connectedAt',
  'connectedBy',
  'expiresAt',
  'refreshedAt',
  'status',
  'lastRefreshError',
]

function pickOAuthConfig(config) {
  if (config.connection !== 'oauth') return {}
  const picked = {}
  for (const key of OAUTH_CONFIG_KEYS) {
    if (config[key] !== undefined && config[key] !== null) picked[key] = config[key]
  }
  return picked
}

function mapMercadoPagoConfig(config) {
  return {
    publicKey: trimText(config.publicKey),
    collectorId: trimText(config.collectorId),
    notes: trimText(config.notes),
    ...pickOAuthConfig(config),
  }
}

export function mapPaymentProfileRow(row, { includeSecrets = false } = {}) {
  if (!row) return null
  const config = row.config && typeof row.config === 'object' ? row.config : {}
  const kind = row.kind
  const mapped = {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    kind,
    active: row.active !== false,
    config: kind === 'mercado_pago' ? mapMercadoPagoConfig(config) : mapBankConfig(config),
    hasSecrets: Boolean(row.secrets_ciphertext),
    ...(kind === 'mercado_pago'
      ? { connectionStatus: mercadoPagoConnectionStatus(config) }
      : {}),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
  if (includeSecrets) {
    mapped.secretsCiphertext = row.secrets_ciphertext ?? null
  }
  return mapped
}

function buildConfig(kind, config = {}) {
  if (kind === 'mercado_pago') {
    return {
      publicKey: trimText(config.publicKey).slice(0, 120),
      collectorId: trimText(config.collectorId).slice(0, 40),
      notes: trimText(config.notes).slice(0, 500),
      ...pickOAuthConfig(config),
    }
  }
  return {
    alias: trimText(config.alias).slice(0, 120),
    cbu: trimText(config.cbu).slice(0, 30),
    holder: trimText(config.holder).slice(0, 160),
    notes: trimText(config.notes).slice(0, 500),
  }
}

export function createSupabasePaymentProfileRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID, env = process.env } = {},
) {
  return {
    async list({ kind = null, activeOnly = true, includeSecrets = false } = {}) {
      let query = client
        .from('payment_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name')
      if (kind) query = query.eq('kind', kind)
      if (activeOnly) query = query.eq('active', true)
      const rows = assertSupabaseResult(await query, 'No se pudieron leer los perfiles de cobro.')
      return (rows ?? []).map((row) => mapPaymentProfileRow(row, { includeSecrets }))
    },

    async findById(id, { includeSecrets = false } = {}) {
      if (!id) return null
      const row = assertSupabaseResult(
        await client
          .from('payment_profiles')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', id)
          .maybeSingle(),
        'No se pudo leer el perfil de cobro.',
      )
      return mapPaymentProfileRow(row, { includeSecrets })
    },

    async create({ name, kind = 'bank_transfer', config = {}, secrets = null }) {
      const trimmedName = trimText(name)
      if (trimmedName.length < 2) {
        throw new HttpError(400, 'El perfil necesita un nombre.')
      }
      if (!['bank_transfer', 'mercado_pago'].includes(kind)) {
        throw new HttpError(400, 'Tipo de perfil no soportado.')
      }
      if (kind === 'bank_transfer' && !trimText(config.alias)) {
        throw new HttpError(400, 'El perfil de transferencia necesita un alias.')
      }
      if (kind === 'mercado_pago') {
        if (!trimText(config.publicKey)) {
          throw new HttpError(400, 'El perfil de Mercado Pago necesita la public key.')
        }
        if (!secrets?.accessToken || !secrets?.webhookSecret) {
          throw new HttpError(
            400,
            'El perfil de Mercado Pago necesita access token y webhook secret.',
          )
        }
      }

      const insert = {
        organization_id: organizationId,
        name: trimmedName.slice(0, 120),
        kind,
        config: buildConfig(kind, config),
        active: true,
      }
      if (kind === 'mercado_pago' && secrets) {
        insert.secrets_ciphertext = encryptPaymentProfileSecrets(
          {
            accessToken: trimText(secrets.accessToken),
            webhookSecret: trimText(secrets.webhookSecret),
          },
          env,
        )
      }

      const row = assertProfileWrite(
        await client.from('payment_profiles').insert(insert).select('*').single(),
        'No se pudo crear el perfil de cobro.',
      )
      return mapPaymentProfileRow(row)
    },

    async update(id, { name, config, active, secrets } = {}) {
      const existing = await this.findById(id, { includeSecrets: true })
      if (!existing) throw new HttpError(404, 'Perfil de cobro no encontrado.')

      const patch = { updated_at: new Date().toISOString() }
      if (name !== undefined) {
        const trimmedName = trimText(name)
        if (trimmedName.length < 2) {
          throw new HttpError(400, 'El perfil necesita un nombre.')
        }
        patch.name = trimmedName.slice(0, 120)
      }
      const isOAuth = existing.config?.connection === 'oauth'
      if (config !== undefined) {
        // La metadata OAuth solo la escribe la vinculación: desde el panel no se
        // puede marcar como OAuth una cuenta manual ni, en una OAuth, cambiar la
        // public key o el collector que definió Mercado Pago (solo las notas).
        const incoming = { ...(config ?? {}) }
        for (const key of OAUTH_CONFIG_KEYS) delete incoming[key]
        if (isOAuth) {
          delete incoming.publicKey
          delete incoming.collectorId
        }
        patch.config = buildConfig(existing.kind, { ...existing.config, ...incoming })
      }
      if (typeof active === 'boolean') patch.active = active
      if (secrets && isOAuth) {
        throw new HttpError(
          400,
          'Esta cuenta está vinculada con Mercado Pago: para renovar credenciales, volvé a conectarla.',
        )
      }
      if (secrets && existing.kind === 'mercado_pago') {
        const current = existing.secretsCiphertext
          ? null // no decrypt here for merge — require full replace when rotating
          : null
        void current
        if (!secrets.accessToken || !secrets.webhookSecret) {
          throw new HttpError(
            400,
            'Para rotar credenciales MP mandá access token y webhook secret juntos.',
          )
        }
        patch.secrets_ciphertext = encryptPaymentProfileSecrets(
          {
            accessToken: trimText(secrets.accessToken),
            webhookSecret: trimText(secrets.webhookSecret),
          },
          env,
        )
      }

      const row = assertProfileWrite(
        await client
          .from('payment_profiles')
          .update(patch)
          .eq('organization_id', organizationId)
          .eq('id', id)
          .select('*')
          .maybeSingle(),
        'No se pudo actualizar el perfil de cobro.',
      )
      if (!row) throw new HttpError(404, 'Perfil de cobro no encontrado.')
      return mapPaymentProfileRow(row)
    },

    async findMercadoPagoOAuthByCollector(collectorId, { includeSecrets = false } = {}) {
      const normalized = trimText(collectorId)
      if (!normalized) return null
      const rows = assertSupabaseResult(
        await client
          .from('payment_profiles')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('kind', 'mercado_pago')
          .eq('config->>connection', 'oauth')
          .eq('config->>collectorId', normalized)
          .limit(1),
        'No se pudo buscar la cuenta de Mercado Pago.',
      )
      const row = Array.isArray(rows) ? rows[0] : rows
      return mapPaymentProfileRow(row ?? null, { includeSecrets })
    },

    /**
     * Guarda el resultado de una vinculación OAuth. La misma cuenta de MP
     * (mismo user_id) reusa su perfil aunque esté archivado: reconectar renueva
     * tokens y lo reactiva, no duplica. Reconectar un perfil puntual con OTRA
     * cuenta de MP se rechaza: cambiaría en silencio a quién le llega la plata
     * de todos los eventos que lo usan.
     */
    async saveMercadoPagoOAuthConnection({
      profileId = null,
      name = '',
      tokens,
      identity = null,
      actorId = null,
      now = new Date(),
    }) {
      const collectorId = trimText(tokens?.userId)
      if (!collectorId || !tokens?.accessToken) {
        throw new HttpError(502, 'Mercado Pago no devolvió la cuenta vinculada.', {
          code: 'MP_OAUTH_TOKEN_FAILED',
        })
      }

      let target = null
      if (profileId) {
        target = await this.findById(profileId)
        if (!target || target.kind !== 'mercado_pago') {
          throw new HttpError(404, 'Cuenta de cobro no encontrada.')
        }
        if (target.config?.collectorId && target.config.collectorId !== collectorId) {
          throw new HttpError(
            409,
            'Iniciaste sesión con otra cuenta de Mercado Pago. Para cobrar en esa cuenta, conectala como cuenta nueva.',
            { code: 'MP_OAUTH_ACCOUNT_MISMATCH' },
          )
        }
      }
      const sameAccount = await this.findMercadoPagoOAuthByCollector(collectorId)
      if (sameAccount && target && sameAccount.id !== target.id) {
        throw new HttpError(
          409,
          `Esa cuenta de Mercado Pago ya está vinculada como «${sameAccount.name}».`,
          { code: 'MP_OAUTH_ALREADY_LINKED' },
        )
      }
      target ??= sameAccount

      const nowIso = now.toISOString()
      const accountLabel =
        identity?.nickname || identity?.email || identity?.name || `Usuario ${collectorId}`
      const config = buildConfig('mercado_pago', {
        ...(target?.config ?? {}),
        publicKey: tokens.publicKey || target?.config?.publicKey || '',
        collectorId,
        connection: 'oauth',
        liveMode: tokens.liveMode !== false,
        scope: tokens.scope || null,
        accountNickname: identity?.nickname ?? target?.config?.accountNickname ?? null,
        accountEmail: identity?.email ?? target?.config?.accountEmail ?? null,
        accountName: identity?.name ?? target?.config?.accountName ?? null,
        connectedAt: nowIso,
        connectedBy: actorId ?? null,
        expiresAt: tokens.expiresAt ?? null,
        refreshedAt: nowIso,
        status: 'connected',
        lastRefreshError: null,
      })
      const secretsCiphertext = encryptPaymentProfileSecrets(
        {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? '',
          webhookSecret: '',
        },
        env,
      )

      if (target) {
        const row = assertSupabaseResult(
          await client
            .from('payment_profiles')
            .update({
              config,
              secrets_ciphertext: secretsCiphertext,
              active: true,
              updated_at: nowIso,
            })
            .eq('organization_id', organizationId)
            .eq('id', target.id)
            .select('*')
            .maybeSingle(),
          'No se pudo guardar la cuenta de Mercado Pago.',
        )
        if (!row) throw new HttpError(404, 'Cuenta de cobro no encontrada.')
        return { profile: mapPaymentProfileRow(row), created: false }
      }

      const row = assertSupabaseResult(
        await client
          .from('payment_profiles')
          .insert({
            organization_id: organizationId,
            name: (trimText(name) || `Mercado Pago · ${accountLabel}`).slice(0, 120),
            kind: 'mercado_pago',
            config,
            secrets_ciphertext: secretsCiphertext,
            active: true,
          })
          .select('*')
          .single(),
        'No se pudo guardar la cuenta de Mercado Pago.',
      )
      return { profile: mapPaymentProfileRow(row), created: true }
    },

    /**
     * Persiste tokens renovados solo si nadie renovó en el medio: el refresh
     * token rota, así que pisar una renovación concurrente con tokens ya
     * invalidados dejaría la cuenta muerta. Devuelve null si perdió la carrera.
     */
    async storeRefreshedMercadoPagoTokens(id, { previousCiphertext, tokens, now = new Date() }) {
      const existing = await this.findById(id)
      if (!existing) throw new HttpError(404, 'Cuenta de cobro no encontrada.')
      const nowIso = now.toISOString()
      const row = assertSupabaseResult(
        await client
          .from('payment_profiles')
          .update({
            config: buildConfig('mercado_pago', {
              ...existing.config,
              publicKey: tokens.publicKey || existing.config.publicKey,
              expiresAt: tokens.expiresAt ?? existing.config.expiresAt ?? null,
              scope: tokens.scope || existing.config.scope || null,
              refreshedAt: nowIso,
              status: 'connected',
              lastRefreshError: null,
            }),
            secrets_ciphertext: encryptPaymentProfileSecrets(
              {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken ?? '',
                webhookSecret: '',
              },
              env,
            ),
            updated_at: nowIso,
          })
          .eq('organization_id', organizationId)
          .eq('id', id)
          .eq('secrets_ciphertext', previousCiphertext)
          .select('*')
          .maybeSingle(),
        'No se pudo guardar la renovación de Mercado Pago.',
      )
      return row ? mapPaymentProfileRow(row) : null
    },

    async markMercadoPagoNeedsReconnect(id, { reason = null, now = new Date() } = {}) {
      const existing = await this.findById(id)
      if (!existing || existing.config?.connection !== 'oauth') return null
      const row = assertSupabaseResult(
        await client
          .from('payment_profiles')
          .update({
            config: buildConfig('mercado_pago', {
              ...existing.config,
              status: 'needs_reconnect',
              lastRefreshError: trimText(reason).slice(0, 240) || null,
            }),
            updated_at: now.toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('id', id)
          .select('*')
          .maybeSingle(),
        'No se pudo actualizar la cuenta de Mercado Pago.',
      )
      return row ? mapPaymentProfileRow(row) : null
    },

    /** Tokens descifrados de una cuenta OAuth (solo backend). */
    decryptOAuthSecrets(profile) {
      if (!profile?.secretsCiphertext) return null
      return decryptPaymentProfileSecrets(profile.secretsCiphertext, env)
    },

    /**
     * Dónde se usa cada cuenta: eventos (MP o transferencia), la tienda y
     * órdenes que quedaron fijadas a ella. Es lo que decide si se puede borrar
     * y lo que el panel muestra como "Usada en…".
     */
    async usage(ids = null, { now = new Date() } = {}) {
      const byId = new Map()
      const ensure = (id) => {
        if (!byId.has(id)) byId.set(id, { events: [], shop: false, pinnedOrders: 0 })
        return byId.get(id)
      }
      const filterIds = Array.isArray(ids) ? ids.filter(Boolean) : null
      if (filterIds && filterIds.length === 0) return byId

      const events = assertSupabaseResult(
        await client
          .from('events')
          .select(
            'id, title, slug, status, ends_at, mercado_pago_profile_id, bank_transfer_profile_id',
          )
          .eq('organization_id', organizationId)
          .or('mercado_pago_profile_id.not.is.null,bank_transfer_profile_id.not.is.null'),
        'No se pudo leer el uso de las cuentas de cobro.',
      )
      for (const event of events ?? []) {
        const summary = {
          id: event.id,
          title: event.title,
          slug: event.slug,
          status: event.status,
          endsAt: event.ends_at ?? null,
          finished: Boolean(event.ends_at && Date.parse(event.ends_at) < now.getTime()),
        }
        for (const profileId of [event.mercado_pago_profile_id, event.bank_transfer_profile_id]) {
          if (!profileId || (filterIds && !filterIds.includes(profileId))) continue
          ensure(profileId).events.push(summary)
        }
      }

      const shop = await client
        .from('shop_checkout_settings')
        .select('mercado_pago_profile_id, bank_transfer_profile_id')
        .limit(5)
      // La tienda es opcional en entornos viejos: sin tabla no hay uso.
      for (const row of shop.error ? [] : (shop.data ?? [])) {
        for (const profileId of [row.mercado_pago_profile_id, row.bank_transfer_profile_id]) {
          if (!profileId || (filterIds && !filterIds.includes(profileId))) continue
          ensure(profileId).shop = true
        }
      }

      for (const table of ['athlete_payment_orders', 'ticket_orders', 'shop_orders']) {
        let query = client
          .from(table)
          .select('mercado_pago_profile_id')
          .eq('organization_id', organizationId)
          .not('mercado_pago_profile_id', 'is', null)
        if (filterIds) query = query.in('mercado_pago_profile_id', filterIds)
        const result = await query
        // Antes de la migración de cuenta fija la columna no existe: cero órdenes.
        for (const row of result.error ? [] : (result.data ?? [])) {
          ensure(row.mercado_pago_profile_id).pinnedOrders += 1
        }
      }
      return byId
    },

    /**
     * Baja definitiva, solo si la cuenta no quedó referenciada en ningún lado.
     * Con referencias se archiva (`active:false`): el historial de órdenes y
     * eventos pasados sigue apuntando a ella.
     */
    async remove(id) {
      const existing = await this.findById(id)
      if (!existing) throw new HttpError(404, 'Cuenta de cobro no encontrada.')
      const inUse = () =>
        new HttpError(
          409,
          'La cuenta tiene eventos u órdenes asociados: archivala en lugar de eliminarla.',
          { code: 'PAYMENT_PROFILE_IN_USE' },
        )
      const usage = (await this.usage([id])).get(id)
      if (usage && (usage.events.length > 0 || usage.shop || usage.pinnedOrders > 0)) {
        throw inUse()
      }
      const { error } = await client
        .from('payment_profiles')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', id)
      if (error) {
        // FK de una referencia que `usage` no ve (p. ej. un pedido viejo de la tienda).
        if (error.code === '23503') throw inUse()
        assertSupabaseResult({ data: null, error }, 'No se pudo eliminar la cuenta de cobro.')
      }
      return { deleted: true, profile: existing }
    },

    /**
     * Crea o reutiliza un perfil bank_transfer a partir de alias/cbu/holder.
     *
     * - Mismo alias activo (sin distinguir mayúsculas: los alias bancarios no
     *   las distinguen) → se reusa, completando CBU/titular si faltaban.
     * - Alias nuevo → se crea con un nombre libre (ver `freeProfileName`). Si
     *   otro guardado simultáneo toma el nombre entre la lectura y el alta, se
     *   relee y se reintenta: el catálogo lo ve completo en la segunda vuelta.
     */
    async ensureBankTransferProfile({ name, alias, cbu, holder }) {
      const normalizedAlias = trimText(alias)
      if (!normalizedAlias) {
        throw new HttpError(400, 'El perfil bancario necesita un alias.')
      }

      for (let attempt = 0; ; attempt += 1) {
        const rows = assertSupabaseResult(
          await client
            .from('payment_profiles')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('kind', 'bank_transfer')
            .eq('active', true)
            .limit(BANK_CATALOG_LIMIT),
          'No se pudo buscar el perfil de cobro.',
        )
        const catalog = (rows ?? []).map((row) => mapPaymentProfileRow(row))

        const existing = catalog.find(
          (profile) => nameKey(profile.config.alias) === nameKey(normalizedAlias),
        )
        if (existing) {
          const nextCbu = trimText(cbu) || existing.config.cbu
          const nextHolder = trimText(holder) || existing.config.holder
          if (nextCbu !== existing.config.cbu || nextHolder !== existing.config.holder) {
            return this.update(existing.id, { config: { cbu: nextCbu, holder: nextHolder } })
          }
          return existing
        }

        const baseName = trimText(name) || `Transferencia · ${normalizedAlias}`
        const taken = new Set(catalog.map((profile) => nameKey(profile.name)))
        try {
          return await this.create({
            name: freeProfileName(baseName.slice(0, PROFILE_NAME_MAX), normalizedAlias, taken),
            kind: 'bank_transfer',
            config: { alias: normalizedAlias, cbu, holder },
          })
        } catch (error) {
          if (error?.details?.code === PAYMENT_PROFILE_NAME_TAKEN_CODE && attempt < 2) continue
          throw error
        }
      }
    },
  }
}
