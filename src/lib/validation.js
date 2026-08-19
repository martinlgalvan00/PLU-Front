import { z } from 'zod'

function todayInBuenosAires() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function buildAthleteProfileSchema(t, country) {
  const msg = (key) => (t ? t(`validation.${key}`) : undefined)
  const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msg('dateFormat') ?? 'SeleccionÃ¡ una fecha vÃ¡lida.')
    .refine((value) => {
      const date = new Date(`${value}T12:00:00`)
      if (Number.isNaN(date.getTime())) return false
      const [year, month, day] = value.split('-').map(Number)
      return (
        date.getFullYear() === year &&
        date.getMonth() + 1 === month &&
        date.getDate() === day
      )
    }, msg('dateFormat') ?? 'SeleccionÃ¡ una fecha vÃ¡lida.')
    .refine((value) => {
      return value <= todayInBuenosAires()
    }, msg('dateFuture') ?? 'La fecha de nacimiento no puede ser futura.')

  return z.object({
    fullName: z.string().trim().min(3, msg('fullName') ?? 'IngresÃ¡ tu nombre y apellido.'),
    // El alta de la API exige 7 u 8 dÃ­gitos (registerSchema en
    // server/routes/athletes.js). Antes acÃ¡ tambiÃ©n pasaban documentos
    // alfanumÃ©ricos de 6 a 20 caracteres: el wizard los daba por buenos y el
    // rechazo aparecÃ­a reciÃ©n al enviar los dos pasos completos. Los
    // separadores sÃ­ se aceptan -- todo DNI fÃ­sico se lee con puntos -- y el
    // servidor los limpia con el mismo criterio antes de validar.
        documentId: z
      .string()
      .trim()
      .min(1, msg('documentId') ?? 'Ingresá un documento válido.')
      .superRefine((value, ctx) => {
        const isArgentina = country === 'Argentina' || !country
        const clean = value.replace(/[.\-\s]/g, '')
        if (isArgentina) {
          if (!/^\d{7,8}$/.test(clean)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: msg('documentIdFormat') ?? 'Documento inválido. DNI: 7 u 8 dígitos.',
            })
          }
        } else {
          if (clean.length < 5 || clean.length > 20) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: msg('documentIdFormatPassport') ?? 'El pasaporte o ID debe tener entre 5 y 20 caracteres.',
            })
          }
        }
      }),
    birthDate: isoDate,
    email: z.string().trim().email(msg('email') ?? 'IngresÃ¡ un correo electrÃ³nico vÃ¡lido.'),
    password: z.string().min(12, msg('password') ?? 'UsÃ¡ al menos 12 caracteres.'),
    phone: z
      .string()
      .refine(
        (value) => {
          const digits = value.replace(/\D/g, '')
          return digits.length >= 8 && digits.length <= 15
        },
        msg('phone') ?? 'IngresÃ¡ un telÃ©fono vÃ¡lido con cÃ³digo de Ã¡rea.',
      ),
    country: z.string().trim().min(2, msg('country') ?? 'IngresÃ¡ tu paÃ­s.'),
    province: z.string().trim().min(2, msg('province') ?? 'IngresÃ¡ tu provincia.'),
    city: z.string().trim().min(2, msg('city') ?? 'IngresÃ¡ tu ciudad.'),
    gym: z.string().trim().min(2, msg('gym') ?? 'IngresÃ¡ tu gimnasio o equipo.'),
    sex: z
      .string()
      .refine((value) => ['Masculino', 'Femenino'].includes(value), msg('sex') ?? 'SeleccionÃ¡ tu sexo competitivo.'),
  })
}

function buildCompetitionSchema(t) {
  const msg = (key) => (t ? t(`validation.${key}`) : undefined)

  return z.object({
    division: z.enum(['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters'], {
      message: msg('division') ?? 'SeleccionÃ¡ una divisiÃ³n vÃ¡lida.',
    }),
    category: z.enum(['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited'], {
      message: msg('category') ?? 'SeleccionÃ¡ una categorÃ­a vÃ¡lida.',
    }),
    estimatedWeight: z.string().refine((value) => {
      const weight = Number(value.replace(',', '.').replace(/\s*kg$/i, ''))
      return Number.isFinite(weight) && weight >= 10 && weight <= 250
    }, msg('weight') ?? 'IngresÃ¡ un peso entre 10 y 250 kg.'),
    paymentMethod: z.enum(['mercado_pago', 'manual_link', 'cash_pitbull', 'wise_transfer']),
  })
}

function buildMembershipSchema() {
  return z.object({
    paymentMethod: z.enum(['mercado_pago', 'manual_link', 'cash_pitbull', 'wise_transfer']),
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
  const fallback = t ? t('validation.invalid') : 'Datos invÃ¡lidos'
  return { success: false, error: Object.values(errors)[0] || fallback, errors }
}

export function validateAthleteForm(form, t) {
  return formatResult(buildAthleteProfileSchema(t, form.country).safeParse(form), t)
}

export function validateAthleteFields(form, fields, t) {
  const schema = buildAthleteProfileSchema(t, form.country)
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
 * @param {{fullName: string, dni: string, ticketTypeId: string}[]} attendees
 * @param {string[]} validTicketTypeIds ids de ticket_types activos del evento
 */
export function validateTicketAttendees(attendees, t, validTicketTypeIds = []) {
  const errors = {}
  const msg = (key, fallback) => (t ? t(`validation.${key}`) : fallback)

  attendees.forEach((attendee, index) => {
    if (!attendee.fullName || attendee.fullName.trim().length < 3) {
      errors[`attendee-${index}-fullName`] = msg('attendeeName', 'IngresÃ¡ nombre y apellido.')
    }
    if (!/^\d{7,8}$/.test(String(attendee.dni ?? '').trim())) {
      errors[`attendee-${index}-dni`] = msg('attendeeDni', 'DNI invÃ¡lido (7 u 8 dÃ­gitos, sin puntos).')
    }
    if (!attendee.ticketTypeId || !validTicketTypeIds.includes(attendee.ticketTypeId)) {
      errors[`attendee-${index}-ticketTypeId`] = msg('attendeeDay', 'SeleccionÃ¡ un tipo de entrada vÃ¡lido.')
    }
  })

  return { success: Object.keys(errors).length === 0, errors }
}

