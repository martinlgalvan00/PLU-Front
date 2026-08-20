import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

const PHOTO_BUCKET = 'athlete-photos'
const PAYMENT_PROOF_BUCKET = 'athlete-payment-proofs'
const PHOTO_URL_TTL_SECONDS = 3600
// En una Function la cache es best-effort (puede desaparecer en un cold start),
// pero evita firmar de nuevo las mismas fotos para cada refresh del dashboard
// mientras la instancia sigue caliente. Nunca se persiste fuera del proceso.
const PHOTO_URL_CACHE_MS = (PHOTO_URL_TTL_SECONDS - 60) * 1000
const signedPhotoUrlCache = new Map()

export function createSupabaseAthleteRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)
  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  async function addSignedPhotoUrls(payload) {
    const athletes = payload.athletes ?? (payload.athlete ? [payload.athlete] : [])
    const now = Date.now()
    const missingPaths = []

    athletes.forEach((athlete) => {
      delete athlete.password_hash
      athlete.photo_url = null
      if (!athlete.photo_path) return
      const cached = signedPhotoUrlCache.get(athlete.photo_path)
      if (cached?.expiresAt > now) {
        athlete.photo_url = cached.url
        return
      }
      missingPaths.push(athlete.photo_path)
    })

    if (missingPaths.length > 0) {
      const uniquePaths = [...new Set(missingPaths)]
      const signed = assertSupabaseResult(
        await client.storage
          .from(PHOTO_BUCKET)
          .createSignedUrls(uniquePaths, PHOTO_URL_TTL_SECONDS),
        'No se pudieron leer las fotos de atletas.',
      )
      const urlsByPath = new Map(signed.map((entry) => [entry.path, entry.signedUrl]))
      uniquePaths.forEach((path) => {
        const url = urlsByPath.get(path)
        if (url) signedPhotoUrlCache.set(path, { url, expiresAt: now + PHOTO_URL_CACHE_MS })
      })
      athletes.forEach((athlete) => {
        if (!athlete.photo_path || athlete.photo_url) return
        athlete.photo_url = urlsByPath.get(athlete.photo_path) ?? null
      })
    }
    return payload
  }

  return {
    async register(form, passwordHash) {
      return rpc(
        'register_athlete_v2',
        {
          p_form: form,
          p_password_hash: passwordHash,
        },
        'No se pudo registrar el atleta.',
      )
    },
    /**
     * Solo booleanos: sirve para el alta y el check temprano del formulario.
     * No devuelve datos del atleta (email enumeration mitigada con rate limit).
     */
    async checkAvailability({ email, documentId } = {}) {
      const result = { emailTaken: false, documentTaken: false }
      const normalizedEmail = email ? String(email).trim().toLowerCase() : ''
      const normalizedDocument = documentId
        ? String(documentId)
            .trim()
            .replace(/[.\-\s]/g, '')
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
        await client
          .from('athlete_credentials')
          .select('password_hash')
          .eq('athlete_id', athlete.id)
          .maybeSingle(),
        'No se pudo validar la cuenta.',
      )
      return { ...athlete, password_hash: credentials?.password_hash ?? null }
    },
    // Via RPC y no con un upsert suelto: cambiar la contraseña tiene que
    // cortar las sesiones abiertas en la misma transaccion. athlete_sessions no
    // esta expuesta a PostgREST (revocada en 20260716000000), asi que desde
    // aca no se puede tocar; la RPC lo resuelve del lado de la base.
    // Devuelve { revokedSessions }.
    setPassword: (athleteId, passwordHash, actor = null) =>
      rpc(
        'set_athlete_password',
        { p_athlete_id: athleteId, p_password_hash: passwordHash, p_actor: actor },
        'No se pudo actualizar la credencial del atleta.',
      ),
    credential: async (athleteId) =>
      assertSupabaseResult(
        await client
          .from('athlete_credentials')
          .select('password_hash')
          .eq('athlete_id', athleteId)
          .maybeSingle(),
        'No se pudo validar la credencial.',
      ),
    createPasswordResetToken: async (athleteId, tokenHash, expiresAt) =>
      assertSupabaseResult(
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
    resetPasswordWithToken: ({ athleteId, tokenHash, passwordHash }) =>
      rpc(
        'reset_athlete_password_with_token',
        {
          p_athlete_id: athleteId,
          p_token_hash: tokenHash,
          p_password_hash: passwordHash,
        },
        'No se pudo restablecer la contraseña.',
      ),
    snapshot: async (athleteId) =>
      addSignedPhotoUrls(
        await rpc(
          'get_athlete_snapshot',
          { p_athlete_id: athleteId },
          'No se pudo leer el perfil.',
        ),
      ),
    async update(athleteId, data) {
      const row = await rpc(
        'update_athlete_profile_v4',
        {
          p_athlete_id: athleteId,
          p_email: data.email,
          p_phone: data.phone,
          p_city: data.city,
          p_province: data.province,
          p_gym: data.gym,
          p_emergency_contact_name: data.emergencyContactName,
          p_emergency_contact_phone: data.emergencyContactPhone,
          p_instagram_handle: data.instagramHandle,
          p_declared_best_total_kg: data.bestTotalKg,
          p_sex: data.sex ?? null,
          p_full_name: data.fullName ?? null,
          p_birth_date: data.birthDate ?? null,
          p_country: data.country ?? null,
        },
        'No se pudo actualizar el perfil.',
      )
      delete row.password_hash
      return row
    },
    /**
     * Edición administrativa (status/gym) — a diferencia de `update`, que es
     * autoservicio del propio atleta. Usada por el PATCH admin individual y
     * por el bulk (que la itera una vez por id con Promise.allSettled, no
     * hay update-many equivalente en Supabase/RPC para esta tabla).
     */
    updateAthleteAdmin: (athleteId, { status, gym }, actor) =>
      rpc(
        'staff_update_athlete',
        {
          p_athlete_id: athleteId,
          p_status: status ?? null,
          p_gym: gym ?? null,
          p_actor: actor,
        },
        'No se pudo actualizar el atleta.',
      ),
    createMembershipOrder: (athleteId, data) =>
      rpc(
        'create_membership_order_checkout',
        {
          p_athlete_id: athleteId,
          p_payment_method: data.paymentMethod,
          p_plan_code: data.planCode,
          p_idempotency_key: data.idempotencyKey,
          p_discount_code: data.discountCode || null,
          p_default_price: data.defaultPrice,
          p_manual_price: data.manualPrice ?? null,
          p_manual_payment_channel: data.manualPaymentChannel,
          p_currency: data.currency ?? null,
        },
        'No se pudo crear la orden de afiliacion.',
      ),
    async findMembershipPlan(planCode) {
      const readPlan = async (column) =>
        assertSupabaseResult(
          await client
            .from('membership_plans')
            .select(
              'id, code, family_code, version, collection_mode, active, price, manual_price, currency',
            )
            .eq('organization_id', organizationId)
            .eq(column, planCode)
            .eq('active', true)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle(),
          'No se pudo validar el plan de afiliacion.',
        )

      // `code` identifica una version inmutable (plu-annual-v2); la UI y los
      // enlaces historicos usan el alias estable de familia (plu-annual).
      // Primero respetamos un code vigente explicito y, si fue retirado o era
      // un alias, resolvemos la ultima version activa de esa familia.
      return (await readPlan('code')) ?? readPlan('family_code')
    },
    async findEventPricing(eventSlug) {
      return assertSupabaseResult(
        await client
          .from('events')
          .select('id, slug, price, manual_price, currency')
          .eq('organization_id', organizationId)
          .eq('slug', eventSlug)
          .maybeSingle(),
        'No se pudo validar el evento.',
      )
    },
    // Precio vigente del combo (afiliación + inscripción) para el preview de
    // cupón: mismo criterio de vigencia (active + ventana starts/ends) que ya
    // aplica create_membership_registration_combo_order_core al validar la
    // oferta antes de crear la orden.
    async findEventComboOffer(eventSlug) {
      const event = assertSupabaseResult(
        await client
          .from('events')
          .select(
            'id, comboOffer:event_combo_offers(price, manual_price, currency, active, starts_at, ends_at, audience, access_code)',
          )
          .eq('organization_id', organizationId)
          .eq('slug', eventSlug)
          .maybeSingle(),
        'No se pudo validar el combo del evento.',
      )
      const offer = Array.isArray(event?.comboOffer) ? event.comboOffer[0] : event?.comboOffer
      if (!offer || !offer.active) return null
      // Privado significa habilitado para administración, pero fuera de todo
      // canal comercial. Ni un request directo al checkout puede comprarlo.
      if (offer.audience === 'private') return null
      const now = new Date()
      if (offer.starts_at && new Date(offer.starts_at) > now) return null
      if (offer.ends_at && new Date(offer.ends_at) < now) return null
      return {
        price: offer.price,
        manualPrice: offer.manual_price,
        currency: offer.currency,
        // `accessCode` no sale de acá hacia ninguna respuesta: sólo lo compara
        // la ruta de checkout antes de crear la orden.
        audience: offer.audience === 'code' ? 'code' : 'public',
        accessCode: offer.access_code ?? null,
      }
    },
    // `paymentMethod` es el `method` con el que se guardaría la orden
    // (`storagePaymentMethod`), no el medio que eligió el atleta: la RPC lo usa
    // para elegir entre `fixed_price` y `fixed_price_manual`, con el mismo
    // criterio que `resolve_channel_price` usa para el precio de catálogo.
    previewDiscountCode: (athleteId, { code, appliesTo, baseAmount, paymentMethod = null }) =>
      rpc(
        'athlete_preview_discount_code',
        {
          p_organization_id: organizationId,
          p_athlete_id: athleteId,
          p_code: code,
          p_applies_to: appliesTo,
          p_base_amount: baseAmount,
          p_payment_method: paymentMethod,
        },
        'No se pudo validar el código de descuento.',
      ),
    /**
     * Canje de la llave de una oferta exclusiva. NO es una redención: no
     * consume cupo ni escribe importe, sólo registra que este atleta tiene el
     * código (ver la cabecera de 20260902100000). Lo que habilita es la ficha
     * "Oferta exclusiva" de Mi cuenta; el cobro sigue saliendo del checkout.
     *
     * Devuelve `{ unlocked: false, reason }` en vez de fallar: la pantalla
     * necesita distinguir "no existe" de "venció" de "sin cupo".
     */
    unlockOfferCode: (athleteId, code) =>
      rpc(
        'athlete_unlock_offer_code',
        {
          p_organization_id: organizationId,
          p_athlete_id: athleteId,
          p_code: code,
        },
        'No se pudo canjear el código.',
      ),
    redeemPromotionCode: (athleteId, { code, context = {} }) =>
      rpc(
        'athlete_redeem_promotion_code',
        {
          p_organization_id: organizationId,
          p_athlete_id: athleteId,
          p_code: code,
          p_context: context,
        },
        'No se pudo resolver el código.',
      ),
    listOfferUnlocks: (athleteId) =>
      rpc(
        'athlete_list_offer_unlocks',
        {
          p_organization_id: organizationId,
          p_athlete_id: athleteId,
        },
        'No se pudieron leer tus ofertas desbloqueadas.',
      ),
    // Lectura simple (no RPC): sólo decide si el canal manual se destraba
    // para esta compra puntual. La redención real, con todas sus validaciones
    // (vencido, agotado, ya usado por este atleta), sigue pasando únicamente
    // por apply_discount_code_to_order dentro de la misma transacción que crea
    // la orden — si el cupón resulta inválido ahí, la orden entera se cae, así
    // que una lectura desactualizada acá nunca deja una orden manual sin
    // cupón real detrás.
    async discountCodeManualEligibility(code, scope, channel) {
      if (!code || !channel) return false
      const row = assertSupabaseResult(
        await client
          .from('discount_codes')
          .select('active, applies_to, starts_at, expires_at, manual_channels')
          .eq('organization_id', organizationId)
          .eq('code', String(code).trim().toUpperCase())
          .maybeSingle(),
        'No se pudo validar el cupón.',
      )
      if (!row || !row.active) return false
      // Un código que sólo destraba transferencia no habilita efectivo: el
      // canal pedido tiene que estar en su lista.
      if (!(row.manual_channels ?? []).includes(channel)) return false
      const now = new Date()
      // Una promo programada todavía no abre nada: sin este chequeo el canal se
      // ofrecía desde que la promo existía, no desde que empezaba.
      if (row.starts_at && new Date(row.starts_at) > now) return false
      if (row.expires_at && new Date(row.expires_at) < now) return false
      // La lista de invitados NO se chequea acá: esta lectura no conoce al
      // atleta. Quien no esté invitado ve el canal ofrecido y la orden se cae
      // con PLU26 al enviarla — el preview (`/me/discount-preview`) sí devuelve
      // `not_invited` antes, así que el caso queda explicado en pantalla.
      return row.applies_to === scope || row.applies_to === 'both'
    },
    createRegistration: (athleteId, data) =>
      rpc(
        'create_competition_registration_checkout',
        {
          p_athlete_id: athleteId,
          p_event_slug: data.eventSlug,
          p_division: data.division,
          p_category: data.category,
          p_bodyweight_kg: data.bodyweightKg,
          p_payment_method: data.paymentMethod,
          p_idempotency_key: data.idempotencyKey,
          p_discount_code: data.discountCode || null,
          p_default_price: data.defaultPrice,
          p_manual_price: data.manualPrice ?? null,
          p_manual_payment_channel: data.manualPaymentChannel,
          p_currency: data.currency ?? null,
        },
        'No se pudo crear la inscripcion.',
      ),
    createRegistrationCombo: (athleteId, data) =>
      rpc(
        'create_membership_registration_combo_checkout',
        {
          p_athlete_id: athleteId,
          p_event_slug: data.eventSlug,
          p_division: data.division,
          p_category: data.category,
          p_bodyweight_kg: data.bodyweightKg,
          p_payment_method: data.paymentMethod,
          p_idempotency_key: data.idempotencyKey,
          p_default_price: data.defaultPrice,
          p_manual_price: data.manualPrice ?? null,
          p_manual_payment_channel: data.manualPaymentChannel,
          p_discount_code: data.discountCode || null,
          p_currency: data.currency ?? null,
        },
        'No se pudo crear el combo de afiliacion e inscripcion.',
      ),
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
    async findCompetitionProfile(athleteId) {
      return assertSupabaseResult(
        await client
          .from('athletes')
          .select('id, full_name, birth_date, phone, country, province, gym, sex')
          .eq('id', athleteId)
          .maybeSingle(),
        'No se pudo leer el perfil competitivo.',
      )
    },

    verifyEmail: (athleteId) =>
      rpc('verify_athlete_email', { p_athlete_id: athleteId }, 'No se pudo verificar el correo.'),

    storeEmailOtp: (athleteId, codeHash, expiresAt) =>
      rpc(
        'store_athlete_email_otp',
        {
          p_athlete_id: athleteId,
          p_code_hash: codeHash,
          p_expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
        },
        'No se pudo guardar el código de verificación.',
      ),

    verifyEmailWithOtp: (athleteId, codeHash, maxAttempts = 8) =>
      rpc(
        'verify_athlete_email_with_otp',
        {
          p_athlete_id: athleteId,
          p_code_hash: codeHash,
          p_max_attempts: maxAttempts,
        },
        'No se pudo verificar el código.',
      ),

    async findEventSummary(eventId) {
      return assertSupabaseResult(
        await client
          .from('events')
          .select('id, title, slug, starts_at, venue')
          .eq('id', eventId)
          .maybeSingle(),
        'No se pudo leer el evento.',
      )
    },
    /**
     * Datos mínimos de una orden para decidir antes de tocarla. La ruta necesita
     * el `concept` para saber qué interruptor de validación la cubre, y devolver
     * 409 sin haber intentado la RPC.
     */
    async paymentOrderSummary(orderId) {
      return assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('id, concept, method, status')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
    },
    async approvePayment(orderId, actor = null) {
      const order = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('method,status')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order) throw new HttpError(404, 'Orden no encontrada.')
      if (order.method === 'mercado_pago') {
        throw new HttpError(400, 'Mercado Pago solo se acredita por webhook.')
      }
      // `p_actor` viaja hasta domain_audit_logs: sin él la aprobación manual
      // queda registrada sin responsable, que es justo lo que hay que poder
      // reconstruir ante un reclamo.
      return rpc(
        'approve_athlete_payment_order',
        {
          p_order_id: orderId,
          p_actor: actor,
        },
        'No se pudo aprobar el pago.',
      )
    },
    /**
     * Acreditación manual de una orden que el proveedor dio por perdida. Es la
     * única vía para tocar una orden de Mercado Pago a mano, y existe justamente
     * porque `approvePayment` se niega a hacerlo: cuando MP marca rechazado o
     * cancelado pero el dinero entró igual, la orden quedaba muerta y el socio
     * sin afiliación. Deja el intento fallido del proveedor intacto y suma un
     * asiento contable propio, así el reporte financiero incluye ese cobro.
     */
    async forceSettlePayment(orderId, { reason, reference = null } = {}, actor = null) {
      const order = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('status')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order) throw new HttpError(404, 'Orden no encontrada.')
      return rpc(
        'staff_force_settle_payment_order',
        {
          p_order_id: orderId,
          p_actor: actor,
          p_reason: reason,
          p_reference: reference,
        },
        'No se pudo acreditar el pago a mano.',
      )
    },
    async setRegistrationStatus(registrationId, status, reason, actor = null) {
      return rpc(
        'staff_set_registration_status',
        {
          p_registration_id: registrationId,
          p_status: status,
          p_actor: actor,
          p_reason: reason,
        },
        'No se pudo cambiar el estado de la inscripción.',
      )
    },
    async rejectPayment(orderId, reason = null, actor = null) {
      const order = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('method,status')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order) throw new HttpError(404, 'Orden no encontrada.')
      if (order.method === 'mercado_pago') {
        throw new HttpError(400, 'Mercado Pago solo se rechaza por webhook.')
      }
      return rpc(
        'reject_athlete_payment_order',
        {
          p_order_id: orderId,
          p_reason: reason,
          p_actor: actor,
        },
        'No se pudo rechazar el pago.',
      )
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
          .select('id, athlete_id, method, status, expires_at')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order || order.athlete_id !== athleteId) throw new HttpError(404, 'Orden no encontrada.')
      if (order.method !== 'manual_link')
        throw new HttpError(400, 'La orden no admite comprobante.')
      if (!['pendiente', 'validacion_manual'].includes(order.status)) {
        throw new HttpError(409, 'La orden ya no admite comprobantes.')
      }
      if (order.expires_at && new Date(order.expires_at) < new Date()) {
        throw new HttpError(
          409,
          'La ventana para adjuntar el comprobante venció. Generá una nueva orden.',
        )
      }

      const safeName = String(fileName)
        .replace(/[^\w.\-()+ ]/g, '_')
        .slice(0, 120)
      const path = `${orderId}/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(PAYMENT_PROOF_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar el comprobante.',
      )
      return { path, token: signed.token }
    },
    registerPaymentProof: (athleteId, orderId, proofPath, notes) =>
      rpc(
        'register_athlete_payment_proof',
        {
          p_order_id: orderId,
          p_athlete_id: athleteId,
          p_proof_path: proofPath,
          p_notes: notes || null,
        },
        'No se pudo registrar el comprobante.',
      ),
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
        await client.storage
          .from(PAYMENT_PROOF_BUCKET)
          .createSignedUrl(order.payment_proof_path, 300),
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
    rotateMembershipQrToken: (membershipId, actor) =>
      rpc(
        'staff_rotate_membership_qr_token',
        {
          p_membership_id: membershipId,
          p_actor: actor,
        },
        'No se pudo rotar el código de la credencial.',
      ),

    /**
     * Distingue alta de renovación para el copy del mail de confirmación:
     * `memberships` tiene una fila por año (`unique(athlete_id, year)`), así
     * que "primera afiliación" es que no exista ninguna otra fila del atleta.
     */
    async isFirstMembership(athleteId, membershipId) {
      // `assertSupabaseResult` devuelve solo `.data` (null con `head: true`);
      // acá lo que importa es `.count`, así que se lee de la respuesta cruda.
      const response = await client
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .neq('id', membershipId)
      assertSupabaseResult(response, 'No se pudo verificar el historial de afiliación.')
      return (response.count ?? 0) === 0
    },

    // Activación/baja manual: los casos sin cobro (cortesía, canje, corrección)
    // no pasan por la aprobación de una orden de pago.
    setMembershipStatus: (membershipId, status, actor) =>
      rpc(
        'staff_set_membership_status',
        {
          p_membership_id: membershipId,
          p_status: status,
          p_actor: actor,
        },
        'No se pudo actualizar el estado de la afiliación.',
      ),

    // La credencial vigente cuelga del atleta, no del período de afiliación
    // (ver 20260806140000): rotar acá es lo que invalida la card impresa.
    deleteMembership: (membershipId, actor) =>
      rpc(
        'delete_membership',
        {
          p_membership_id: membershipId,
          p_actor: actor,
        },
        'No se pudo eliminar la afiliación.',
      ),
    deleteRegistration: (registrationId, actor) =>
      rpc(
        'delete_event_registration',
        {
          p_registration_id: registrationId,
          p_actor: actor,
        },
        'No se pudo eliminar la inscripción.',
      ),
    setRegistrationPublicVisibility: (registrationId, publicVisible, actor) =>
      rpc(
        'staff_set_registration_public_visibility',
        {
          p_registration_id: registrationId,
          p_public_visible: publicVisible,
          p_actor: actor,
        },
        'No se pudo actualizar la visibilidad de la inscripción.',
      ),

    rotateAthleteCredentialToken: (athleteId, actor) =>
      rpc(
        'staff_rotate_athlete_credential_token',
        {
          p_athlete_id: athleteId,
          p_actor: actor,
        },
        'No se pudo rotar la credencial del atleta.',
      ),

    /**
     * Proyección de credencial para el scanner de staff: la pública no trae
     * documento (el member_code es enumerable), pero en la puerta el operador
     * tiene que cotejar el DNI físico.
     */
    staffCredential: (code, eventSlug) =>
      rpc(
        'staff_get_membership_by_code_or_token',
        {
          p_code: code,
          p_event_slug: eventSlug ?? null,
        },
        'No se pudo leer la credencial.',
      ),

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
      const row = await rpc(
        'register_athlete_photo',
        {
          p_athlete_id: athleteId,
          p_photo_path: photoPath,
        },
        'No se pudo actualizar la foto.',
      )
      if (current?.photo_path && current.photo_path !== photoPath) {
        const removal = await client.storage.from(PHOTO_BUCKET).remove([current.photo_path])
        if (removal.error)
          console.warn('No se pudo borrar la foto anterior:', removal.error.message)
      }
      await addSignedPhotoUrls({ athlete: row })
      return row
    },
    async createPhotoUpload(athleteId, { fileName }) {
      const safeName = String(fileName)
        .replace(/[^\w.\-()+ ]/g, '_')
        .slice(0, 120)
      const path = `${athleteId}/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar la carga de la foto.',
      )
      return { path, token: signed.token }
    },
    /**
     * `filters` es opcional y hoy nadie lo manda desde el frontend (el panel
     * sigue pidiendo el snapshot completo: dashboard y badges de navegación
     * necesitan ver todo). Sirve para dejar la capacidad de recorte
     * server-side lista sin tener que tocar este método de nuevo cuando algún
     * listado la necesite de verdad.
     */
    async adminData(scope = {}, filters = {}) {
      const read = {
        athletes: scope.athletes !== false,
        memberships: scope.memberships !== false,
        registrations: scope.registrations !== false,
        paymentOrders: scope.paymentOrders !== false,
      }
      // Encadenan solo si el filtro/paginación vino en la query; sin params
      // el resultado es exactamente el mismo query de siempre (sin `.range()`).
      const withStatus = (query, status) => (status ? query.eq('status', status) : query)
      const withRange = (query) =>
        filters.limit != null
          ? query.range(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit - 1)
          : query
      const [athletes, memberships, registrations, paymentOrders] = await Promise.all([
        read.athletes
          ? withRange(
              withStatus(
                client
                  .from('athletes')
                  .select(
                    'id, full_name, document_id, email, birth_date, phone, country, province, city, gym, sex, division, category, estimated_weight, declared_best_total_kg, emergency_contact_name, emergency_contact_phone, instagram_handle, status, created_at, updated_at, photo_path, email_verified_at, credential_token',
                  )
                  .eq('organization_id', organizationId)
                  .order('created_at', { ascending: false }),
                filters.athleteStatus,
              ),
            )
          : Promise.resolve({ data: [], error: null }),
        read.memberships
          ? withRange(
              withStatus(
                client
                  .from('memberships')
                  .select(
                    'id, athlete_id, year, status, start_date, expiration_date, member_code, qr_token, payment_order_id, created_at, updated_at',
                  )
                  .eq('organization_id', organizationId)
                  .order('created_at', { ascending: false }),
                filters.membershipStatus,
              ),
            )
          : Promise.resolve({ data: [], error: null }),
        read.registrations
          ? withRange(
              withStatus(
                client
                  .from('event_registrations')
                  .select(
                    `
                      id, athlete_id, category, division, bodyweight_kg, public_visible, status, payment_order_id, created_at, updated_at,
                      event:events(title, slug, starts_at, ends_at, requires_membership),
                      checkIn:check_ins(scanned_at),
                      eventDay:event_days(id, day_index, label, date),
                      eventSession:event_sessions(id, name, platform, weigh_in_at, starts_at)
                    `,
                  )
                  .eq('organization_id', organizationId)
                  .order('created_at', { ascending: false }),
                filters.registrationStatus,
              ),
            )
          : Promise.resolve({ data: [], error: null }),
        read.paymentOrders
          ? client
              .from('athlete_payment_orders')
              .select(
                'id, athlete_id, concept, amount, currency, method, manual_payment_channel, status, reference, payment_proof_path, payment_proof_uploaded_at, discount_code, discount_amount, notes, created_at',
              )
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ])
      const payload = {
        athletes: assertSupabaseResult(athletes, 'No se pudieron leer los atletas.'),
        memberships: assertSupabaseResult(memberships, 'No se pudieron leer las afiliaciones.'),
        registrations: assertSupabaseResult(
          registrations,
          'No se pudieron leer las inscripciones.',
        ).map((row) => ({
          registration: row,
          event: row.event,
          checkIn: Array.isArray(row.checkIn) ? row.checkIn[0] : row.checkIn,
          schedule: row.eventDay
            ? {
                day_id: row.eventDay.id,
                day_index: row.eventDay.day_index,
                day_label: row.eventDay.label,
                day_date: row.eventDay.date,
                session_id: row.eventSession?.id ?? null,
                session_name: row.eventSession?.name ?? null,
                platform: row.eventSession?.platform ?? null,
                weigh_in_at: row.eventSession?.weigh_in_at ?? null,
                starts_at: row.eventSession?.starts_at ?? null,
              }
            : null,
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
        await client.from('athlete_payment_orders').select('id').eq('athlete_id', athleteId),
        'No se pudieron leer las órdenes del atleta.',
      )

      const deleted = await rpc(
        'delete_athlete',
        {
          p_athlete_id: athleteId,
          p_actor: actor,
        },
        'No se pudo eliminar el atleta.',
      )

      const removePrefix = async (bucket, prefix) => {
        const listed = await client.storage.from(bucket).list(prefix, { limit: 100 })
        if (listed.error) {
          console.warn(
            `No se pudieron listar archivos de ${bucket}/${prefix}:`,
            listed.error.message,
          )
          return
        }
        const paths = (listed.data ?? []).map((file) => `${prefix}/${file.name}`)
        if (paths.length === 0) return
        const removal = await client.storage.from(bucket).remove(paths)
        if (removal.error) {
          console.warn(
            `No se pudieron borrar archivos de ${bucket}/${prefix}:`,
            removal.error.message,
          )
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
