import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

const PHOTO_BUCKET = 'athlete-photos'

export function createSupabaseAthleteRepository(client) {
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
    async findLogin(email) {
      const athlete = assertSupabaseResult(
        await client.from('athletes').select('id,full_name,email,status').eq('email', email.toLowerCase()).maybeSingle(),
        'No se pudo validar la cuenta.',
      )
      if (!athlete) return null
      const credentials = assertSupabaseResult(
        await client.from('athlete_credentials').select('password_hash').eq('athlete_id', athlete.id).maybeSingle(),
        'No se pudo validar la cuenta.',
      )
      return { ...athlete, password_hash: credentials?.password_hash ?? null }
    },
    setPassword: (athleteId, passwordHash) => assertSupabaseResult(
      client.from('athlete_credentials').upsert({
        athlete_id: athleteId,
        password_hash: passwordHash,
        password_updated_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id' }),
      'No se pudo actualizar la credencial del atleta.',
    ),
    credential: (athleteId) => assertSupabaseResult(
      client.from('athlete_credentials').select('password_hash').eq('athlete_id', athleteId).maybeSingle(),
      'No se pudo validar la credencial.',
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
    createMembershipOrder: (athleteId, data) => rpc('create_membership_order_v2', {
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
    async approvePayment(orderId) {
      const order = assertSupabaseResult(
        await client.from('athlete_payment_orders').select('method,status').eq('id', orderId).maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order) throw new HttpError(404, 'Orden no encontrada.')
      if (order.method === 'mercado_pago') {
        throw new HttpError(400, 'Mercado Pago solo se acredita por webhook.')
      }
      return rpc('approve_athlete_payment_order', { p_order_id: orderId }, 'No se pudo aprobar el pago.')
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
        client.from('athletes').select('*').order('created_at', { ascending: false }),
        client.from('memberships').select('*').order('created_at', { ascending: false }),
        client.from('event_registrations').select('*, event:events(*), checkIn:check_ins(*)').order('created_at', { ascending: false }),
        client.from('athlete_payment_orders').select('*').order('created_at', { ascending: false }),
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
  }
}

export function assertAthleteOwnsPath(athleteId, path) {
  if (!path || !String(path).startsWith(`${athleteId}/`)) {
    throw new HttpError(400, 'Ruta de foto invalida.')
  }
}
