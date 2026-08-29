import { randomBytes } from 'node:crypto'
import { HttpError } from '../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../lib/supabaseRpc.js'

/**
 * Puente staff → atleta: misma persona, mismo email.
 * Reutiliza el flujo de cobro/afiliación/inscripción sin unificar cookies ni RBAC.
 */

function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}

function staffFullName(staffUser) {
  const fromName = String(staffUser?.name ?? '').trim()
  if (fromName) return fromName
  const email = normalizeEmail(staffUser?.email)
  return email ? email.split('@')[0] : 'Staff PLU'
}

function provisionalDocumentId(staffUserId) {
  // document_id es NOT NULL UNIQUE. Prefijo no numérico: no choca con DNI AR
  // y el atleta lo reemplaza al completar el perfil competitivo.
  return `STAFF-${staffUserId}`
}

async function findAthleteByEmail(client, organizationId, email) {
  return assertSupabaseResult(
    await client
      .from('athletes')
      .select('id, full_name, email, status, email_verified_at, document_id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle(),
    'No se pudo buscar el perfil de atleta.',
  )
}

async function ensureEmailVerified(client, athlete) {
  if (athlete.email_verified_at) return athlete
  const updated = assertSupabaseResult(
    await client
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', athlete.id)
      .is('email_verified_at', null)
      .select('id, full_name, email, status, email_verified_at, document_id')
      .maybeSingle(),
    'No se pudo marcar el correo del atleta como verificado.',
  )
  return updated ?? { ...athlete, email_verified_at: new Date().toISOString() }
}

async function createAthleteFromStaff(client, organizationId, staffUser) {
  const email = normalizeEmail(staffUser.email)
  const fullName = staffFullName(staffUser)
  const documentId = provisionalDocumentId(staffUser.id)

  const inserted = assertSupabaseResult(
    await client
      .from('athletes')
      .insert({
        organization_id: organizationId,
        full_name: fullName,
        document_id: documentId,
        email,
        phone: staffUser.phone ?? null,
        status: 'registrado',
        email_verified_at: new Date().toISOString(),
      })
      .select('id, full_name, email, status, email_verified_at, document_id')
      .single(),
    'No se pudo crear el perfil de atleta para el staff.',
  )

  // Credencial no usable para login por password: el acceso diario es vía
  // staff bridge o recuperación de contraseña. register_athlete_v2 exige
  // hash >= 40 chars; un token aleatorio cumple sin filtrar una clave real.
  const placeholderHash = `bridge:${randomBytes(32).toString('base64url')}`
  assertSupabaseResult(
    await client.from('athlete_credentials').insert({
      athlete_id: inserted.id,
      organization_id: organizationId,
      password_hash: placeholderHash,
    }),
    'No se pudo crear la credencial provisional del atleta.',
  )

  return inserted
}

/**
 * @param {{
 *   client: import('@supabase/supabase-js').SupabaseClient,
 *   staffUser: { id: string, email: string, name?: string, phone?: string | null },
 *   organizationId?: string,
 * }} params
 * @returns {Promise<{ athlete: object, created: boolean }>}
 */
export async function ensureAthleteForStaff({
  client,
  staffUser,
  organizationId = PRIMARY_ORGANIZATION_ID,
}) {
  requireSupabaseClient(client)

  const email = normalizeEmail(staffUser?.email)
  if (!email || !staffUser?.id) {
    throw new HttpError(400, 'La cuenta de staff no tiene correo válido.')
  }

  let athlete = await findAthleteByEmail(client, organizationId, email)
  let created = false

  if (!athlete) {
    try {
      athlete = await createAthleteFromStaff(client, organizationId, {
        ...staffUser,
        email,
      })
      created = true
    } catch (error) {
      // Carrera: otro request creó el atleta entre el find y el insert.
      const raced = await findAthleteByEmail(client, organizationId, email)
      if (!raced) throw error
      athlete = raced
    }
  }

  if (athlete.status === 'bloqueado') {
    throw new HttpError(403, 'Este perfil de atleta está bloqueado.')
  }

  athlete = await ensureEmailVerified(client, athlete)

  return { athlete, created }
}
