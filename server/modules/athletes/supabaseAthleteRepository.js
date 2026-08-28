import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'
import { forgetAthleteSessionCache } from '../../services/athleteSessionService.js'

const PHOTO_BUCKET = 'athlete-photos'
const PAYMENT_PROOF_BUCKET = 'athlete-payment-proofs'
const PAYMENT_PROOF_URL_TTL_SECONDS = 300
// Tope de la bandeja de validación: firmar más de esto en una request deja de
// ser una optimización y pasa a ser trabajo especulativo.
const PAYMENT_PROOF_BATCH_LIMIT = 60
/** Estados que todavía esperan una decisión de Finanzas. */
const OPEN_PAYMENT_ORDER_STATUSES = ['pendiente', 'validacion_manual']
/**
 * Techo de la suma de lo pendiente. No hay `sum()` en PostgREST sin una RPC y
 * no vale la pena una función nueva para un total que se muestra al lado del
 * contador: con más órdenes abiertas que esto, el número sale marcado como
 * parcial.
 */
const OPEN_AMOUNT_SAMPLE_LIMIT = 1000
/**
 * Columnas que consume la bandeja de órdenes del panel (`toCamelPaymentOrder`
 * en src/services/athleteApi.js). Explícitas para que agregar una columna a la
 * tabla no engorde esta lectura sin que nadie lo decida.
 */
const PAYMENT_ORDER_LIST_COLUMNS = [
  'id',
  'athlete_id',
  'concept',
  'amount',
  'currency',
  'method',
  'manual_payment_channel',
  'status',
  'reference',
  'rejected_by',
  'rejection_reason',
  'rejected_at',
  'payment_proof_path',
  'payment_proof_uploaded_at',
  'financing_allowed',
  'manual_payment_declared_at',
  'financed_entitlements_at',
  'financed_entitlements_revoked_at',
  // El vencimiento del plazo (20260922100000). La bandeja ya pintaba la cuenta
  // regresiva —`financingDueInfo(row.financedPaymentDueAt)` en
  // AthletePaymentOrdersSection— pero la columna nunca viajaba, así que Finanzas
  // veía "habilitado sin cobrar" sin la única fecha que dice cuánto falta para
  // que el reloj (`expire_financed_payment_orders`) dé de baja lo habilitado.
  'financed_payment_due_at',
  'discount_code',
  'discount_amount',
  'notes',
  'created_at',
  'athlete:athletes(id, full_name, document_id, email)',
].join(', ')
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

  /**
   * Medios de pago que decide un cupón para esta compra. Lectura simple (no
   * RPC): la redención real, con todas sus validaciones (vencido, agotado, ya
   * usado por este atleta), sigue pasando únicamente por
   * `apply_discount_code_to_order` dentro de la misma transacción que crea la
   * orden — si el cupón resulta inválido ahí, la orden entera se cae, así que
   * una lectura desactualizada acá nunca deja una orden sin cupón real detrás.
   *
   * Las dos celdas no son simétricas (ver la cabecera de 20260908100000):
   * `manualChannels` ABRE canales que Administración tiene cerrados, y
   * `mercadoPagoEnabled: false` CIERRA la pasarela para este código.
   *
   * Un código que no aplica —inexistente, apagado, fuera de ventana, de otro
   * alcance— devuelve el estado neutro: no abre ningún canal manual y no cierra
   * la pasarela. Es lo mismo que comprar sin cupón.
   */
  async function discountCodeChannelPolicy(code, scope) {
    const neutral = { found: false, manualChannels: [], mercadoPagoEnabled: true }
    if (!code) return neutral
    const row = assertSupabaseResult(
      await client
        .from('discount_codes')
        .select('active, applies_to, starts_at, expires_at, manual_channels, mercado_pago_enabled')
        .eq('organization_id', organizationId)
        .eq('code', String(code).trim().toUpperCase())
        // Los códigos se archivan, no se borran, y el mismo texto se puede
        // volver a publicar. Sin este filtro `maybeSingle()` ve la versión
        // histórica y la vigente, y PostgREST responde PGRST116 antes de que el
        // checkout pueda crear la orden.
        .is('archived_at', null)
        .maybeSingle(),
      'No se pudo validar el cupón.',
    )
    if (!row || !row.active) return neutral
    const now = new Date()
    // Una promo programada todavía no abre nada: sin este chequeo el canal se
    // ofrecía desde que la promo existía, no desde que empezaba.
    if (row.starts_at && new Date(row.starts_at) > now) return neutral
    if (row.expires_at && new Date(row.expires_at) < now) return neutral
    if (row.applies_to !== scope && row.applies_to !== 'both') return neutral
    // La lista de invitados NO se chequea acá: esta lectura no conoce al
    // atleta. Quien no esté invitado ve el canal ofrecido y la orden se cae
    // con PLU26 al enviarla — el preview (`/me/discount-preview`) sí devuelve
    // `not_invited` antes, así que el caso queda explicado en pantalla.
    return {
      found: true,
      manualChannels: row.manual_channels ?? [],
      // Una columna ausente significa la pasarela abierta: es el
      // comportamiento de todos los códigos anteriores a 20260908100000.
      mercadoPagoEnabled: row.mercado_pago_enabled !== false,
    }
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
    // La caché en memoria se purga acá y no en cada ruta: la RPC corta las
    // sesiones en la base, pero una sesión ya resuelta seguiría contestando
    // desde `athleteSessionCache` hasta que venciera su TTL -- justo después de
    // un cambio de contraseña, que es cuando cortar importa.
    setPassword: async (athleteId, passwordHash, actor = null) => {
      const result = await rpc(
        'set_athlete_password',
        { p_athlete_id: athleteId, p_password_hash: passwordHash, p_actor: actor },
        'No se pudo actualizar la credencial del atleta.',
      )
      forgetAthleteSessionCache(athleteId)
      return result
    },
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
    resetPasswordWithToken: async ({ athleteId, tokenHash, passwordHash }) => {
      const result = await rpc(
        'reset_athlete_password_with_token',
        {
          p_athlete_id: athleteId,
          p_token_hash: tokenHash,
          p_password_hash: passwordHash,
        },
        'No se pudo restablecer la contraseña.',
      )
      // Mismo motivo que en `setPassword`: recuperar la cuenta desde el mail
      // tiene que dejar afuera a quien tuviera la sesión abierta, y eso incluye
      // la copia en memoria.
      forgetAthleteSessionCache(athleteId)
      return result
    },
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
    //
    // Con `athleteId` cae en el paquete de la oferta que ese atleta ya canjeó
    // cuando el evento no tiene combo vigente: una oferta autosuficiente trae
    // su propia afiliación y se cotiza contra la suma de las partes
    // (`athlete_event_offer_bundle`, 20260913100000). Sin `athleteId` el
    // comportamiento es el de siempre — null y 404 — porque el paquete depende
    // de quién tiene la llave.
    async findEventComboOffer(eventSlug, { athleteId = null } = {}) {
      const event = assertSupabaseResult(
        await client
          .from('events')
          .select(
            'id, comboOffer:event_combo_offers(price, manual_price, currency, active, starts_at, ends_at, audience, access_code, financed, archived_at)',
          )
          .eq('organization_id', organizationId)
          .eq('slug', eventSlug)
          .maybeSingle(),
        'No se pudo validar el combo del evento.',
      )
      const offer = Array.isArray(event?.comboOffer) ? event.comboOffer[0] : event?.comboOffer
      // Privado significa habilitado para administración, pero fuera de todo
      // canal comercial. Ni un request directo al checkout puede comprarlo, y
      // ninguna llave lo reabre: es una decisión explícita del panel.
      if (offer?.audience === 'private') return null
      const now = new Date()
      // Un combo archivado no es un combo vigente aunque conserve `active`:
      // 20260914100000 archivó todas las filas sin apagarlas (para que las
      // órdenes viejas sigan legibles), y la RPC del checkout ya filtra por
      // `archived_at is null`. Sin este filtro el preview cotizaba —y
      // anunciaba el precio de— un combo que el alta después rechazaba.
      const usable =
        Boolean(offer?.active) &&
        !offer.archived_at &&
        !(offer.starts_at && new Date(offer.starts_at) > now) &&
        !(offer.ends_at && new Date(offer.ends_at) < now)
      if (!usable) {
        if (!athleteId) return null
        const bundle = await rpc(
          'athlete_event_offer_bundle',
          {
            p_organization_id: organizationId,
            p_athlete_id: athleteId,
            p_event_slug: eventSlug,
          },
          'No se pudo validar el paquete de la oferta.',
        )
        if (!bundle) return null
        return {
          price: bundle.price,
          manualPrice: bundle.manualPrice ?? null,
          currency: bundle.currency,
          // El paquete existe sólo detrás de la llave, y la llave es el propio
          // código de descuento: no hay `access_code` de combo que comparar.
          audience: 'code',
          accessCode: null,
          financed: bundle.financed === true,
        }
      }
      return {
        price: offer.price,
        manualPrice: offer.manual_price,
        currency: offer.currency,
        // `accessCode` no sale de acá hacia ninguna respuesta: sólo lo compara
        // la ruta de checkout antes de crear la orden.
        audience: offer.audience === 'code' ? 'code' : 'public',
        accessCode: offer.access_code ?? null,
        financed: offer.financed === true,
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
    discountCodeChannelPolicy,
    async discountCodeManualEligibility(code, scope, channel) {
      if (!code || !channel) return false
      const policy = await discountCodeChannelPolicy(code, scope)
      // Un código que sólo destraba transferencia no habilita efectivo: el
      // canal pedido tiene que estar en su lista.
      return policy.manualChannels.includes(channel)
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
    async setRegistrationStatus(registrationId, status, reason, actor = null, channel = null) {
      return rpc(
        'staff_set_registration_status',
        {
          p_registration_id: registrationId,
          p_status: status,
          p_actor: actor,
          p_reason: reason,
          // Opcional acá y obligatorio en la afiliación a propósito: una
          // inscripción se pone en 'observada' por razones que no tienen ningún
          // canal de cobro detrás. El canal se pide cuando hay plata que
          // atribuir, no por simetría.
          p_channel: channel,
        },
        'No se pudo cambiar el estado de la inscripción.',
      )
    },
    /**
     * Observaciones sobre una inscripción o una afiliación.
     *
     * Existen aparte del cambio de estado porque son otra cosa: anotar "el pago
     * llegó a nombre del padre" no debería costar una corrección de estado, que
     * es lo que pasaba cuando el único lugar donde escribir era el motivo del
     * diálogo. El motivo de un cambio de estado sigue entrando al mismo hilo
     * (lo asienta la RPC), así que las dos formas de dejar algo escrito se leen
     * juntas y en orden.
     */
    async addObservation(entityType, entityId, body, actor = null) {
      return rpc(
        'staff_add_observation',
        {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_body: body,
          p_actor: actor,
        },
        'No se pudo guardar la observación.',
      )
    },
    async deleteObservation(observationId, actor = null) {
      return rpc(
        'staff_delete_observation',
        { p_observation_id: observationId, p_actor: actor },
        'No se pudo borrar la observación.',
      )
    },
    /**
     * El hilo de un lote de entidades en una sola consulta: la lista del panel
     * muestra hasta 200 filas y pedir el historial de cada una sería 200
     * roundtrips contra una instancia que tiene 15 slots de pooler.
     */
    async listObservations(entityType, entityIds, { limitPerEntity = 50 } = {}) {
      const ids = [...new Set((entityIds ?? []).filter(Boolean))]
      if (!ids.length) return []
      return (
        (await rpc(
          'list_domain_observations',
          {
            p_entity_type: entityType,
            p_entity_ids: ids,
            p_limit_per_entity: limitPerEntity,
          },
          'No se pudieron leer las observaciones.',
        )) ?? []
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
    async listPaymentOrders({ status, statuses, method, concept, financed, limit = 100 } = {}) {
      let query = client
        .from('athlete_payment_orders')
        // Lista explícita en lugar de `*`: la bandeja pide hasta 200 filas y
        // `*` arrastraba el idempotency key, la organización y las marcas de
        // preferencia de Mercado Pago, que esta pantalla no usa.
        .select(PAYMENT_ORDER_LIST_COLUMNS)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status) query = query.eq('status', status)
      // `statuses` filtra en la base lo que el panel filtraba en el navegador:
      // la vista "pendientes" son dos estados, y traerse las 200 para descartar
      // las aprobadas era transferencia pura.
      else if (Array.isArray(statuses) && statuses.length > 0) query = query.in('status', statuses)
      if (method) query = query.eq('method', method)
      if (concept) query = query.eq('concept', concept)
      // Combo financiado: derechos ya otorgados con la deuda todavía abierta.
      // Es la única vista donde el club tiene plata comprometida sin cobrar.
      if (financed === true) {
        query = query.eq('financing_allowed', true).not('financed_entitlements_at', 'is', null)
      }

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
    confirmManualPayment: (athleteId, orderId) =>
      rpc(
        'athlete_confirm_manual_payment',
        {
          p_order_id: orderId,
          p_athlete_id: athleteId,
        },
        'No se pudo registrar el aviso de pago.',
      ),
    /**
     * La otra mitad del financiamiento: quedar habilitado sin declarar un pago
     * que todavía no se hizo (20260926100000). No es un alias de la de arriba —
     * no marca pago declarado ni manda la orden a validación— así que Finanzas
     * no recibe nada que revisar hasta que la persona pague de verdad.
     */
    deferFinancedPayment: (athleteId, orderId) =>
      rpc(
        'athlete_defer_financed_payment',
        {
          p_order_id: orderId,
          p_athlete_id: athleteId,
        },
        'No se pudo activar el pago diferido.',
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

    /**
     * Contadores de la bandeja de validación, calculados en la base.
     *
     * Los chips los armaba el navegador sobre las 200 filas que traía la
     * lectura, así que a partir de la orden 201 los números eran mentira: decía
     * "12 pendientes" porque las otras nunca habían viajado. Acá se cuenta
     * sobre la tabla entera y sin transferir filas (`head: true`).
     *
     * El importe abierto sí necesita los montos, pero sólo de las órdenes que
     * esperan decisión — que es un conjunto acotado por definición: si crece,
     * es justamente el problema que la pantalla tiene que mostrar.
     */
    async paymentOrderCounts() {
      const scoped = () =>
        client
          .from('athlete_payment_orders')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)

      const [
        openResponse,
        manualResponse,
        financedResponse,
        rejectedResponse,
        approvedResponse,
        totalResponse,
        openAmounts,
      ] = await Promise.all([
        scoped().in('status', OPEN_PAYMENT_ORDER_STATUSES),
        scoped().eq('status', 'validacion_manual'),
        scoped()
          .in('status', OPEN_PAYMENT_ORDER_STATUSES)
          .eq('financing_allowed', true)
          .not('financed_entitlements_at', 'is', null),
        scoped().eq('status', 'rechazado'),
        scoped().eq('status', 'aprobado'),
        scoped(),
        client
          .from('athlete_payment_orders')
          .select('amount')
          .eq('organization_id', organizationId)
          .in('status', OPEN_PAYMENT_ORDER_STATUSES)
          .limit(OPEN_AMOUNT_SAMPLE_LIMIT),
      ])

      for (const response of [
        openResponse,
        manualResponse,
        financedResponse,
        rejectedResponse,
        approvedResponse,
        totalResponse,
      ]) {
        assertSupabaseResult(response, 'No se pudieron contar las órdenes de pago.')
      }
      const amounts = assertSupabaseResult(openAmounts, 'No se pudo sumar lo pendiente de cobro.')

      return {
        pending: openResponse.count ?? 0,
        validacion_manual: manualResponse.count ?? 0,
        financed: financedResponse.count ?? 0,
        rechazado: rejectedResponse.count ?? 0,
        aprobado: approvedResponse.count ?? 0,
        all: totalResponse.count ?? 0,
        openAmount: (amounts ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
        // El importe queda truncado si hay más órdenes abiertas que la muestra:
        // la pantalla lo dice en vez de mostrar un total que no es el total.
        openAmountTruncated: (openResponse.count ?? 0) > (amounts?.length ?? 0),
      }
    },

    /**
     * Comprobantes de varias órdenes en una sola vuelta.
     *
     * Cada apertura del diálogo de validación gastaba dos llamadas —leer la
     * ruta y firmar la URL— y el operador miraba un spinner antes de poder
     * decidir. Validar diez transferencias eran veinte esperas. Con las URLs ya
     * resueltas para las filas abiertas, el comprobante aparece al instante.
     *
     * Mismo TTL y mismo bucket que `paymentProofUrl`: no relaja el acceso, sólo
     * agrupa el trabajo. Una orden sin comprobante simplemente no figura.
     */
    async paymentProofUrls(orderIds = []) {
      const ids = [...new Set(orderIds.filter(Boolean))].slice(0, PAYMENT_PROOF_BATCH_LIMIT)
      if (ids.length === 0) return {}

      const rows = assertSupabaseResult(
        await client
          .from('athlete_payment_orders')
          .select('id, payment_proof_path')
          .eq('organization_id', organizationId)
          .in('id', ids),
        'No se pudieron leer las órdenes.',
      )
      const withProof = (rows ?? []).filter((row) => row.payment_proof_path)
      if (withProof.length === 0) return {}

      const signed = assertSupabaseResult(
        await client.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrls(
          withProof.map((row) => row.payment_proof_path),
          PAYMENT_PROOF_URL_TTL_SECONDS,
        ),
        'No se pudieron abrir los comprobantes.',
      )
      const urlByPath = new Map(
        (signed ?? [])
          .filter((entry) => entry?.signedUrl)
          .map((entry) => [entry.path, entry.signedUrl]),
      )

      return Object.fromEntries(
        withProof
          .map((row) => [row.id, urlByPath.get(row.payment_proof_path) ?? null])
          .filter(([, url]) => Boolean(url)),
      )
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
    //
    // `reason` y `channel` no son opcionales aunque la firma los deje al final:
    // la RPC de 3 argumentos ahora falla a propósito (ver 20260910100000). Era
    // la única puerta manual del dominio que no pedía motivo, y por eso las
    // afiliaciones activadas a mano eran las únicas que no se podían explicar.
    setMembershipStatus: (membershipId, status, actor, reason, channel = null) =>
      rpc(
        'staff_set_membership_status',
        {
          p_membership_id: membershipId,
          p_status: status,
          p_actor: actor,
          p_reason: reason,
          p_channel: channel,
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
                    'id, athlete_id, year, status, start_date, expiration_date, member_code, qr_token, payment_order_id, created_at, updated_at, manual_override_status, manual_override_channel, manual_override_reason, manual_override_by, manual_override_at',
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
                      manual_override_status, manual_override_channel, manual_override_reason, manual_override_by, manual_override_at,
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
                // `expires_at`, `updated_at` y `rejection_reason` no son
                // decorativos: son las tres columnas con las que
                // `derivePaymentProgress` distingue "venció sin que nadie
                // pagara" de "lo cerró la organización con un motivo escrito".
                // Sin ellas el panel mostraba un `Cancelado` pelado mientras
                // /mi-cuenta -- que lee el snapshot completo -- sí explicaba el
                // motivo al atleta. El operador que atiende el reclamo veía
                // menos que la persona que lo hacía.
                // `financed_payment_due_at` por el mismo motivo que en
                // PAYMENT_ORDER_LIST_COLUMNS: el dashboard ordena las órdenes
                // financiadas por vencimiento y sin la fecha todas le empataban
                // en "sin plazo".
                'id, athlete_id, concept, amount, currency, method, manual_payment_channel, status, reference, payment_proof_path, payment_proof_uploaded_at, discount_code, discount_amount, notes, created_at, updated_at, expires_at, approved_at, rejected_at, rejection_reason, cancelled_at, cancellation_code, cancellation_reason, cancelled_by, financing_allowed, manual_payment_declared_at, financed_entitlements_at, financed_entitlements_revoked_at, financed_payment_due_at',
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
        // El código promocional viaja enmascarado ('ONL…'): este snapshot se
        // sirve con cualquiera de cinco permisos de lectura (incluido
        // admin.dashboard.read), mientras que la lista de códigos está detrás
        // de admin.pricing.read. Nada del panel muestra el string completo, y
        // un código con cupo remanente sigue siendo canjeable por otros: no
        // hay motivo para regalarlo por una frontera más ancha.
        paymentOrders: assertSupabaseResult(
          paymentOrders,
          'No se pudieron leer los pagos.',
        ).map((order) =>
          order.discount_code
            ? { ...order, discount_code: `${String(order.discount_code).slice(0, 3)}…` }
            : order,
        ),
      }

      // Libro de intentos por orden. Va en una consulta aparte y acotada a las
      // órdenes que efectivamente se devuelven -- no a toda la organización --
      // porque es lo que distingue "abandonó el checkout" de "intentó pagar y
      // la tarjeta lo rechazó", y esa diferencia es la respuesta a un reclamo.
      //
      // Sin `raw_payload`: es la respuesta cruda de Mercado Pago (id del
      // pagador, últimos cuatro dígitos, headers internos) y era el 62% del
      // snapshot del atleta antes de 20260907100000. No vuelve por la puerta
      // del panel.
      if (payload.paymentOrders.length) {
        const orderIds = payload.paymentOrders.map((order) => order.id)
        const attempts =
          assertSupabaseResult(
            await client
              .from('athlete_payments')
              .select(
                'order_id, external_payment_id, status, status_detail, amount, confirmed_at, created_at, updated_at',
              )
              .in('order_id', orderIds)
              .order('created_at', { ascending: true }),
            'No se pudieron leer los intentos de cobro.',
          ) ?? []

        const byOrderId = new Map()
        for (const attempt of attempts) {
          const bucket = byOrderId.get(attempt.order_id)
          if (bucket) bucket.push(attempt)
          else byOrderId.set(attempt.order_id, [attempt])
        }
        for (const order of payload.paymentOrders) {
          order.attempts = byOrderId.get(order.id) ?? []
        }
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
