import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

const PHOTO_BUCKET = 'athlete-photos'
const PAYMENT_PROOF_BUCKET = 'athlete-payment-proofs'

export function createSupabaseAthleteRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)
  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  async function addSignedPhotoUrls(payload) {
    const athletes = payload.athletes ?? (payload.athlete ? [payload.athlete] : [])
    await Promise.all(athletes.map(async (athlete) => {
      delete athlete.password_hash
      athlete.photo_url = null
      if (!athlete.photo_path) return
      const signed = assertSupabaseResult(
        await client.storage.from(PHOTO_BUCKET).createSignedUrl(athlete.photo_path, 3600),
        'No se pudo leer la foto del atleta.',
      )
      athlete.photo_url = signed.signedUrl
    }))
    return payload
  }

  return {
    async register(form, passwordHash) {
      return rpc('register_athlete_v2', {
        p_form: form,
        p_password_hash: passwordHash,
      }, 'No se pudo registrar el atleta.')
    },
    /**
     * Solo booleanos: sirve para el alta y el check temprano del formulario.
     * No devuelve datos del atleta (email enumeration mitigada con rate limit).
     */
    async checkAvailability({ email, documentId } = {}) {
      const result = { emailTaken: false, documentTaken: false }
      const normalizedEmail = email ? String(email).trim().toLowerCase() : ''
      const normalizedDocument = documentId
        ? String(documentId).trim().replace(/[.\-\s]/g, '')
        : ''

      if (normalizedEmail) {
        const row = assertSupabaseResult(
          await client
            .from('athletes')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('email', normalizedEmail)
            .maybeSingle(),
          'No se pudo validar el correo.',
        )
        result.emailTaken = Boolean(row)
      }

      if (normalizedDocument) {
        const row = assertSupabaseResult(
          await client
            .from('athletes')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('document_id', normalizedDocument)
            .maybeSingle(),
          'No se pudo validar el documento.',
        )
        result.documentTaken = Boolean(row)
      }

      return result
    },
    async findLogin(email) {
      const athlete = assertSupabaseResult(
        await client
          .from('athletes')
          .select('id,full_name,email,status')
          .eq('organization_id', organizationId)
          .eq('email', email.toLowerCase())
          .maybeSingle(),
        'No se pudo validar la cuenta.',
      )
      if (!athlete) return null
      const credentials = assertSupabaseResult(
        await client.from('athlete_credentials').select('password_hash').eq('athlete_id', athlete.id).maybeSingle(),
        'No se pudo validar la cuenta.',
      )
      return { ...athlete, password_hash: credentials?.password_hash ?? null }
    },
    // Via RPC y no con un upsert suelto: cambiar la contraseña tiene que
    // cortar las sesiones abiertas en la misma transaccion. athlete_sessions no
    // esta expuesta a PostgREST (revocada en 20260716000000), asi que desde
    // aca no se puede tocar; la RPC lo resuelve del lado de la base.
    // Devuelve { revokedSessions }.
    setPassword: (athleteId, passwordHash) => rpc(
      'set_athlete_password',
      { p_athlete_id: athleteId, p_password_hash: passwordHash },
      'No se pudo actualizar la credencial del atleta.',
    ),
    credential: async (athleteId) => assertSupabaseResult(
      await client.from('athlete_credentials').select('password_hash').eq('athlete_id', athleteId).maybeSingle(),
      'No se pudo validar la credencial.',
    ),
    createPasswordResetToken: async (athleteId, tokenHash, expiresAt) => assertSupabaseResult(
      await client.from('athlete_password_reset_tokens').insert({
        athlete_id: athleteId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      }),
      'No se pudo crear el token de recuperacion.',
    ),
    async consumePasswordResetToken({ athleteId, tokenHash }) {
      const row = assertSupabaseResult(
        await client
          .from('athlete_password_reset_tokens')
          .select('id, used_at, expires_at')
          .eq('athlete_id', athleteId)
          .eq('token_hash', tokenHash)
          .maybeSingle(),
        'No se pudo validar el token de recuperacion.',
      )
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return false

      const consumed = assertSupabaseResult(
        await client
          .from('athlete_password_reset_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('id', row.id)
          .is('used_at', null)
          .select('id')
          .maybeSingle(),
        'No se pudo consumir el token de recuperacion.',
      )
      return Boolean(consumed)
    },
    resetPasswordWithToken: ({ athleteId, tokenHash, passwordHash }) => rpc(
      'reset_athlete_password_with_token',
      {
        p_athlete_id: athleteId,
        p_token_hash: tokenHash,
        p_password_hash: passwordHash,
      },
      'No se pudo restablecer la contraseña.',
    ),
    snapshot: async (athleteId) => addSignedPhotoUrls(
      await rpc('get_athlete_snapshot', { p_athlete_id: athleteId }, 'No se pudo leer el perfil.'),
    ),
    async update(athleteId, data) {
      const row = await rpc('update_athlete_profile', {
        p_athlete_id: athleteId,
        p_email: data.email,
        p_phone: data.phone,
        p_city: data.city,
        p_province: data.province,
        p_gym: data.gym,
      }, 'No se pudo actualizar el perfil.')
      delete row.password_hash
      return row
    },
    createMembershipOrder: (athleteId, data) => rpc('create_membership_order_v3', {
      p_athlete_id: athleteId,
      p_payment_method: data.paymentMethod,
      p_plan_code: data.planCode,
      p_idempotency_key: data.idempotencyKey,
    }, 'No se pudo crear la orden de afiliacion.'),
    createRegistration: (athleteId, data) => rpc('create_competition_registration_v2', {
      p_athlete_id: athleteId,
      p_event_slug: data.eventSlug,
      p_division: data.division,
      p_category: data.category,
      p_bodyweight_kg: data.bodyweightKg,
      p_payment_method: data.paymentMethod,
      p_idempotency_key: data.idempotencyKey,
    }, 'No se pudo crear la inscripcion.'),
    // Datos mínimos de contacto para notificar. No usa get_athlete_snapshot
    // porque ese arma el perfil completo con URLs firmadas de foto.
    async findContact(athleteId) {
      return assertSupabaseResult(
        await client
          .from('athletes')
          .select('id, full_name, email, status, email_verified_at')
          .eq('id', athleteId)
          .maybeSingle(),
        'No se pudo leer el atleta.',
      )
    },

    verifyEmail: (athleteId) =>
      rpc('verify_athlete_email', { p_athlete_id: athleteId }, 'No se pudo verificar el correo.'),
    async findEventSummary(eventId) {
      return assertSupabaseResult(
        await client.from('events').select('id, title, slug, starts_at, venue').eq('id', eventId).maybeSingle(),
        'No se pudo leer el evento.',
      )
    },
    async approvePayment(orderId, actor = null) {
      const order = assertSupabaseResult(
        await client.from('athlete_payment_orders').select('method,status').eq('id', orderId).maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order) throw new HttpError(404, 'Orden no encontrada.')
      if (order.method === 'mercado_pago') {
        throw new HttpError(400, 'Mercado Pago solo se acredita por webhook.')
      }
      // `p_actor` viaja hasta domain_audit_logs: sin él la aprobación manual
      // queda registrada sin responsable, que es justo lo que hay que poder
      // reconstruir ante un reclamo.
      return rpc('approve_athlete_payment_order', {
        p_order_id: orderId,
        p_actor: actor,
      }, 'No se pudo aprobar el pago.')
    },

    /**
     * Órdenes de atleta (afiliación, inscripción, combo) para la bandeja de
     * Finanzas. Hasta ahora la única forma de llegar a una era entrar atleta
     * por atleta desde el padrón.
     */
    async listPaymentOrders({ status, method, concept, limit = 100 } = {}) {
      let query = client
        .from('athlete_payment_orders')
        .select('*, athlete:athletes(id, full_name, document_id, email)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status) query = query.eq('status', status)
      if (method) query = query.eq('method', method)
      if (concept) query = query.eq('concept', concept)

      // Mismo patrón que auditoría: el builder de PostgREST hay que awaitedarlo
      // antes de assertSupabaseResult, si no `data` queda undefined.
      return assertSupabaseResult(await query, 'No se pudieron leer las órdenes de pago.')
    },

    /**
     * Comprobante de transferencia. Espejo del flujo de entradas: el backend
     * firma la subida contra `<orderId>/` y la RPC valida que la orden sea del
     * atleta con sesión activa antes de registrar la ruta.
     */
    async createPaymentProofUpload(athleteId, orderId, fileName) {
      const order = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('id, athlete_id, method, status')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order || order.athlete_id !== athleteId) throw new HttpError(404, 'Orden no encontrada.')
      if (order.method !== 'manual_link') throw new HttpError(400, 'La orden no admite comprobante.')
      if (order.status === 'aprobado') throw new HttpError(409, 'La orden ya fue aprobada.')

      const safeName = String(fileName).replace(/[^\w.\-()+ ]/g, '_').slice(0, 120)
      const path = `${orderId}/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(PAYMENT_PROOF_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar el comprobante.',
      )
      return { path, token: signed.token }
    },
    registerPaymentProof: (athleteId, orderId, proofPath) => rpc('register_athlete_payment_proof', {
      p_order_id: orderId,
      p_athlete_id: athleteId,
      p_proof_path: proofPath,
    }, 'No se pudo registrar el comprobante.'),
    async paymentProofUrl(orderId) {
      const order = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('payment_proof_path')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order?.payment_proof_path) throw new HttpError(404, 'La orden no tiene comprobante.')
      const signed = assertSupabaseResult(
        await client.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(order.payment_proof_path, 300),
        'No se pudo abrir el comprobante.',
      )
      return signed.signedUrl
    },

    /** Credencial de un socio para el panel: QR, vigencia y datos de emisión. */
    async membershipCredential(membershipId) {
      const membership = assertSupabaseResult(
        await client
          .from('memberships')
          // `credential_token` viaja acá porque es el QR que el socio tiene de
          // verdad: el `qr_token` de la afiliación quedó solo para las cards
          // emitidas con el modelo anterior.
          .select('*, athlete:athletes(id, full_name, document_id, email, credential_token)')
          .eq('id', membershipId)
          .eq('organization_id', organizationId)
          .maybeSingle(),
        'No se pudo leer la afiliación.',
      )
      if (!membership) throw new HttpError(404, 'Afiliación no encontrada.')
      return membership
    },
    rotateMembershipQrToken: (membershipId, actor) => rpc('staff_rotate_membership_qr_token', {
      p_membership_id: membershipId,
      p_actor: actor,
    }, 'No se pudo rotar el código de la credencial.'),

    // Activación/baja manual: los casos sin cobro (cortesía, canje, corrección)
    // no pasan por la aprobación de una orden de pago.
    setMembershipStatus: (membershipId, status, actor) => rpc('staff_set_membership_status', {
      p_membership_id: membershipId,
      p_status: status,
      p_actor: actor,
    }, 'No se pudo actualizar el estado de la afiliación.'),

    // La credencial vigente cuelga del atleta, no del período de afiliación
    // (ver 20260806140000): rotar acá es lo que invalida la card impresa.
    rotateAthleteCredentialToken: (athleteId, actor) => rpc('staff_rotate_athlete_credential_token', {
      p_athlete_id: athleteId,
      p_actor: actor,
    }, 'No se pudo rotar la credencial del atleta.'),

    /**
     * Proyección de credencial para el scanner de staff: la pública no trae
     * documento (el member_code es enumerable), pero en la puerta el operador
     * tiene que cotejar el DNI físico.
     */
    staffCredential: (code, eventSlug) => rpc('staff_get_membership_by_code_or_token', {
      p_code: code,
      p_event_slug: eventSlug ?? null,
    }, 'No se pudo leer la credencial.'),

    /**
     * URL firmada corta para la foto en la página pública de verificación.
     * La RPC solo incluye `photo_path` cuando el código era un token; por
     * member_code no hay path y respondemos null (sin filtrar el padrón).
     */
    async signCredentialPhoto(code) {
      const result = await rpc(
        'get_membership_by_code_or_token',
        { p_code: code, p_event_slug: null },
        'No se pudo leer la credencial.',
      )
      const photoPath = result?.athlete?.photo_path
      if (!photoPath) return { photoUrl: null }

      const signed = assertSupabaseResult(
        await client.storage.from(PHOTO_BUCKET).createSignedUrl(photoPath, 600),
        'No se pudo firmar la foto de la credencial.',
      )
      return { photoUrl: signed.signedUrl }
    },

    async registerPhoto(athleteId, photoPath) {
      const current = assertSupabaseResult(
        await client.from('athletes').select('photo_path').eq('id', athleteId).maybeSingle(),
        'No se pudo leer la foto actual.',
      )
      const row = await rpc('register_athlete_photo', {
        p_athlete_id: athleteId,
        p_photo_path: photoPath,
      }, 'No se pudo actualizar la foto.')
      if (current?.photo_path && current.photo_path !== photoPath) {
        const removal = await client.storage.from(PHOTO_BUCKET).remove([current.photo_path])
        if (removal.error) console.warn('No se pudo borrar la foto anterior:', removal.error.message)
      }
      await addSignedPhotoUrls({ athlete: row })
      return row
    },
    async createPhotoUpload(athleteId, { fileName }) {
      const safeName = String(fileName).replace(/[^\w.\-()+ ]/g, '_').slice(0, 120)
      const path = `${athleteId}/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar la carga de la foto.',
      )
      return { path, token: signed.token }
    },
    async adminData() {
      const [athletes, memberships, registrations, paymentOrders] = await Promise.all([
        client.from('athletes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
        client.from('memberships').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
        client.from('event_registrations').select('*, event:events(*), checkIn:check_ins(*)').eq('organization_id', organizationId).order('created_at', { ascending: false }),
        client.from('athlete_payment_orders').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      ])
      const payload = {
        athletes: assertSupabaseResult(athletes, 'No se pudieron leer los atletas.'),
        memberships: assertSupabaseResult(memberships, 'No se pudieron leer las afiliaciones.'),
        registrations: assertSupabaseResult(registrations, 'No se pudieron leer las inscripciones.').map((row) => ({
          registration: row,
          event: row.event,
          checkIn: Array.isArray(row.checkIn) ? row.checkIn[0] : row.checkIn,
        })),
        paymentOrders: assertSupabaseResult(paymentOrders, 'No se pudieron leer los pagos.'),
      }
      return addSignedPhotoUrls(payload)
    },

    /**
     * Borrado definitivo (solo Super Admin, ver el endpoint). La cascada y la
     * auditoría las resuelve la RPC delete_athlete en una sola transacción;
     * acá queda lo que SQL no alcanza: el storage. Fotos bajo `<athleteId>/`
     * y comprobantes bajo `<orderId>/` (ver createPaymentProofUpload). Es
     * best-effort: si un archivo queda huérfano no revierte el borrado.
     */
    async deleteAthlete(athleteId, actor) {
      const orders = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('id')
          .eq('athlete_id', athleteId),
        'No se pudieron leer las órdenes del atleta.',
      )

      const deleted = await rpc('delete_athlete', {
        p_athlete_id: athleteId,
        p_actor: actor,
      }, 'No se pudo eliminar el atleta.')

      const removePrefix = async (bucket, prefix) => {
        const listed = await client.storage.from(bucket).list(prefix, { limit: 100 })
        if (listed.error) {
          console.warn(`No se pudieron listar archivos de ${bucket}/${prefix}:`, listed.error.message)
          return
        }
        const paths = (listed.data ?? []).map((file) => `${prefix}/${file.name}`)
        if (paths.length === 0) return
        const removal = await client.storage.from(bucket).remove(paths)
        if (removal.error) {
          console.warn(`No se pudieron borrar archivos de ${bucket}/${prefix}:`, removal.error.message)
        }
      }

      await Promise.all([
        removePrefix(PHOTO_BUCKET, athleteId),
        ...(orders ?? []).map((order) => removePrefix(PAYMENT_PROOF_BUCKET, order.id)),
      ])

      return deleted
    },
  }
}

export function assertAthleteOwnsPath(athleteId, path) {
  if (!path || !String(path).startsWith(`${athleteId}/`)) {
    throw new HttpError(400, 'Ruta de foto invalida.')
  }
}
