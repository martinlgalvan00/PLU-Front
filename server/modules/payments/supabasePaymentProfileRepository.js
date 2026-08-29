import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult } from '../../lib/supabaseRpc.js'
import { encryptPaymentProfileSecrets } from './paymentProfileSecrets.js'

function trimText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

function mapBankConfig(config) {
  return {
    alias: trimText(config.alias),
    cbu: trimText(config.cbu),
    holder: trimText(config.holder),
    notes: trimText(config.notes),
  }
}

function mapMercadoPagoConfig(config) {
  return {
    publicKey: trimText(config.publicKey),
    collectorId: trimText(config.collectorId),
    notes: trimText(config.notes),
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

      const row = assertSupabaseResult(
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
      if (config !== undefined) {
        patch.config = buildConfig(existing.kind, { ...existing.config, ...config })
      }
      if (typeof active === 'boolean') patch.active = active
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

      const row = assertSupabaseResult(
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

    /**
     * Crea o reutiliza un perfil bank_transfer a partir de alias/cbu/holder.
     * Si ya hay uno con el mismo alias activo, lo reusa.
     */
    async ensureBankTransferProfile({ name, alias, cbu, holder }) {
      const normalizedAlias = trimText(alias)
      if (!normalizedAlias) {
        throw new HttpError(400, 'El perfil bancario necesita un alias.')
      }

      const rows = assertSupabaseResult(
        await client
          .from('payment_profiles')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('kind', 'bank_transfer')
          .eq('active', true)
          .eq('config->>alias', normalizedAlias)
          .limit(1),
        'No se pudo buscar el perfil de cobro.',
      )
      const existing = Array.isArray(rows) ? rows[0] : rows
      if (existing) {
        const mapped = mapPaymentProfileRow(existing)
        const nextCbu = trimText(cbu) || mapped.config.cbu
        const nextHolder = trimText(holder) || mapped.config.holder
        if (nextCbu !== mapped.config.cbu || nextHolder !== mapped.config.holder) {
          return this.update(existing.id, {
            config: { alias: normalizedAlias, cbu: nextCbu, holder: nextHolder },
          })
        }
        return mapped
      }

      return this.create({
        name: trimText(name) || `Transferencia · ${normalizedAlias}`,
        kind: 'bank_transfer',
        config: { alias: normalizedAlias, cbu, holder },
      })
    },
  }
}
