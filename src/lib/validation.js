import { z } from 'zod'
import { TICKET_DAY_PASSES } from './constants.js'

function buildAthleteProfileSchema(t) {
  const msg = (key) => (t ? t(`validation.${key}`) : undefined)
  const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msg('dateFormat') ?? 'Seleccioná una fecha válida.')
    .refine((value) => {
      const date = new Date(`${value}T12:00:00`)
      if (Number.isNaN(date.getTime())) return false
      const [year, month, day] = value.split('-').map(Number)
      return (
        date.getFullYear() === year &&
        date.getMonth() + 1 === month &&
        date.getDate() === day
      )
    }, msg('dateFormat') ?? 'Seleccioná una fecha válida.')

  return z.object({
    fullName: z.string().trim().min(3, msg('fullName') ?? 'Ingresá tu nombre y apellido.'),
    documentId: z
      .string()
      .trim()
      .min(6, msg('documentId') ?? 'Ingresá un documento válido.')
      .refine((value) => {
        const compact = value.replace(/[.\-\s]/g, '')
        if (/^\d+$/.test(compact)) return compact.length >= 7 && compact.length <= 8
        return compact.length >= 6 && compact.length <= 20
      }, msg('documentIdFormat') ?? 'Documento inválido. DNI: 7 u 8 dígitos.'),
    birthDate: isoDate,
    email: z.string().trim().email(msg('email') ?? 'Ingresá un correo electrónico válido.'),
    password: z.string().min(12, msg('password') ?? 'Usá al menos 12 caracteres.'),
    phone: z
      .string()
      .refine(
        (value) => value.replace(/\D/g, '').length >= 8,
        msg('phone') ?? 'Ingresá un teléfono válido con código de área.',
      ),
    country: z.string().trim().min(2, msg('country') ?? 'Ingresá tu país.'),
    province: z.string().trim().min(2, msg('province') ?? 'Ingresá tu provincia.'),
    city: z.string().trim().min(2, msg('city') ?? 'Ingresá tu ciudad.'),
    gym: z.string().trim().min(2, msg('gym') ?? 'Ingresá tu gimnasio o equipo.'),
    sex: z
      .string()
      .refine((value) => ['Masculino', 'Femenino'].includes(value), msg('sex') ?? 'Seleccioná tu sexo competitivo.'),
  })
}

function buildCompetitionSchema(t) {
  const msg = (key) => (t ? t(`validation.${key}`) : undefined)

  return z.object({
    division: z.string().min(1, msg('division') ?? 'Seleccioná una división.'),
    category: z.string().min(1, msg('category') ?? 'Seleccioná una categoría.'),
    estimatedWeight: z.string().refine((value) => {
      const weight = Number(value.replace(',', '.').replace(/\s*kg$/i, ''))
      return Number.isFinite(weight) && weight >= 10 && weight <= 250
    }, msg('weight') ?? 'Ingresá un peso entre 10 y 250 kg.'),
    paymentMethod: z.enum(['mercado_pago', 'manual_link']),
  })
}

function buildMembershipSchema() {
  return z.object({
    paymentMethod: z.enum(['mercado_pago', 'manual_link']),
  })
}

/** @deprecated use buildAthleteProfileSchema(t) */
export const athleteProfileSchema = buildAthleteProfileSchema()

/** @deprecated use buildCompetitionSchema(t) */
export const competitionSchema = buildCompetitionSchema()

/** @deprecated use buildMembershipSchema() */
export const membershipSchema = buildMembershipSchema()

function formatResult(result, t) {
  if (result.success) return { success: true, data: result.data, errors: {} }
  const errors = Object.fromEntries(
    Object.entries(result.error.flatten().fieldErrors).map(([field, messages]) => [field, messages[0]]),
  )
  const fallback = t ? t('validation.invalid') : 'Datos inválidos'
  return { success: false, error: Object.values(errors)[0] || fallback, errors }
}

export function validateAthleteForm(form, t) {
  return formatResult(buildAthleteProfileSchema(t).safeParse(form), t)
}

export function validateAthleteFields(form, fields, t) {
  const schema = buildAthleteProfileSchema(t)
  const shape = Object.fromEntries(
    fields.filter((field) => schema.shape[field]).map((field) => [field, schema.shape[field]]),
  )
  return formatResult(z.object(shape).safeParse(form), t)
}

export function validateCompetitionFields(form, fields, t) {
  const schema = buildCompetitionSchema(t)
  const shape = Object.fromEntries(
    fields.filter((field) => schema.shape[field]).map((field) => [field, schema.shape[field]]),
  )
  return formatResult(z.object(shape).safeParse(form), t)
}

export function validateCompetitionForm(form, t) {
  return formatResult(buildCompetitionSchema(t).safeParse(form), t)
}

export function validateMembershipForm(form, t) {
  return formatResult(buildMembershipSchema().safeParse(form), t)
}

/**
 * Valida la lista de asistentes de una compra de entradas.
 * @param {{fullName: string, dni: string, dayPass: string}[]} attendees
 */
export function validateTicketAttendees(attendees, t) {
  const errors = {}
  const msg = (key, fallback) => (t ? t(`validation.${key}`) : fallback)

  attendees.forEach((attendee, index) => {
    if (!attendee.fullName || attendee.fullName.trim().length < 3) {
      errors[`attendee-${index}-fullName`] = msg('attendeeName', 'Ingresá nombre y apellido.')
    }
    if (!/^\d{7,8}$/.test(String(attendee.dni ?? '').trim())) {
      errors[`attendee-${index}-dni`] = msg('attendeeDni', 'DNI inválido (7 u 8 dígitos, sin puntos).')
    }
    if (!TICKET_DAY_PASSES.includes(attendee.dayPass)) {
      errors[`attendee-${index}-dayPass`] = msg('attendeeDay', 'Seleccioná un día válido.')
    }
  })

  return { success: Object.keys(errors).length === 0, errors }
}
