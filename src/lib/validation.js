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
    .regex(/^\d{4}-\d{2}-\d{2}$/, msg('dateFormat') ?? 'Seleccioná una fecha válida.')
    .refine(
      (value) => {
        const date = new Date(`${value}T12:00:00`)
        if (Number.isNaN(date.getTime())) return false
        const [year, month, day] = value.split('-').map(Number)
        return (
          date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day
        )
      },
      msg('dateFormat') ?? 'Seleccioná una fecha válida.',
    )
    .refine(
      (value) => {
        return value <= todayInBuenosAires()
      },
      msg('dateFuture') ?? 'La fecha de nacimiento no puede ser futura.',
    )

  return z.object({
    fullName: z
      .string()
      .trim()
      .min(3, msg('fullName') ?? 'Ingresá tu nombre y apellido.'),
    // El alta de la API exige 7 u 8 dígitos (registerSchema en
    // server/routes/athletes.js). Antes acá también pasaban documentos
    // alfanuméricos de 6 a 20 caracteres: el wizard los daba por buenos y el
    // rechazo aparecía recién al enviar los dos pasos completos. Los
    // separadores sí se aceptan -- todo DNI físico se lee con puntos -- y el
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
              message:
                msg('documentIdFormatPassport') ??
                'El pasaporte o ID debe tener entre 5 y 20 caracteres.',
            })
          }
        }
      }),
    birthDate: isoDate,
    email: z
      .string()
      .trim()
      .email(msg('email') ?? 'Ingresá un correo electrónico válido.'),
    password: z.string().min(12, msg('password') ?? 'Usá al menos 12 caracteres.'),
    phone: z.string().refine(
      (value) => {
        const digits = value.replace(/\D/g, '')
        return digits.length >= 8 && digits.length <= 15
      },
      msg('phone') ?? 'Ingresá un teléfono válido con código de área.',
    ),
    country: z
      .string()
      .trim()
      .min(2, msg('country') ?? 'Ingresá tu país.'),
    province: z
      .string()
      .trim()
      .min(2, msg('province') ?? 'Ingresá tu provincia.'),
    city: z
      .string()
      .trim()
      .min(2, msg('city') ?? 'Ingresá tu ciudad.'),
    gym: z
      .string()
      .trim()
      .min(2, msg('gym') ?? 'Ingresá tu gimnasio o equipo.'),
    sex: z
      .string()
      .refine(
        (value) => ['Masculino', 'Femenino'].includes(value),
        msg('sex') ?? 'Seleccioná tu sexo competitivo.',
      ),
  })
}

function buildCompetitionSchema(t) {
  const msg = (key) => (t ? t(`validation.${key}`) : undefined)

  return z.object({
    division: z.enum(['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters'], {
      message: msg('division') ?? 'Seleccioná una división válida.',
    }),
    category: z.enum(['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited'], {
      message: msg('category') ?? 'Seleccioná una categoría válida.',
    }),
    estimatedWeight: z.string().refine(
      (value) => {
        const weight = Number(value.replace(',', '.').replace(/\s*kg$/i, ''))
        return Number.isFinite(weight) && weight >= 10 && weight <= 250
      },
      msg('weight') ?? 'Ingresá un peso entre 10 y 250 kg.',
    ),
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
    Object.entries(result.error.flatten().fieldErrors).map(([field, messages]) => [
      field,
      messages[0],
    ]),
  )
  const fallback = t ? t('validation.invalid') : 'Datos inválidos'
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
  const msg = (key, fallback, params) => (t ? t(`validation.${key}`, params) : fallback)
  /**
   * Un DNI por persona. Dos entradas con el mismo documento emiten dos QR
   * distintos, pero en la puerta los dos se verifican contra la misma persona:
   * el segundo que llegue no entra. Se marca la fila repetida, no la primera,
   * porque la primera es la que el comprador quiso cargar.
   */
  const dniRow = new Map()

  attendees.forEach((attendee, index) => {
    if (!attendee.fullName || attendee.fullName.trim().length < 3) {
      errors[`attendee-${index}-fullName`] = msg('attendeeName', 'Ingresá nombre y apellido.')
    }
    const dni = String(attendee.dni ?? '').trim()
    if (!/^\d{7,8}$/.test(dni)) {
      errors[`attendee-${index}-dni`] = msg(
        'attendeeDni',
        'DNI inválido (7 u 8 dígitos, sin puntos).',
      )
    } else if (dniRow.has(dni)) {
      const first = dniRow.get(dni) + 1
      errors[`attendee-${index}-dni`] = msg(
        'attendeeDniDuplicate',
        `Repetido con la entrada ${first}`,
        { index: first },
      )
    } else {
      dniRow.set(dni, index)
    }
    if (!attendee.ticketTypeId || !validTicketTypeIds.includes(attendee.ticketTypeId)) {
      errors[`attendee-${index}-ticketTypeId`] = msg(
        'attendeeDay',
        'Seleccioná un tipo de entrada válido.',
      )
    }
  })

  return { success: Object.keys(errors).length === 0, errors }
}

/**
 * Datos de quien compra, que no son los de quien entra.
 *
 * Hasta acá no se pedían: la orden viajaba sin `buyer`, así que
 * `ticket_orders.buyer_email` quedaba en null y no había a quién mandarle la
 * entrada ni a quién avisarle cuando Finanzas la acreditaba. El comprador
 * dependía de no cerrar la pestaña -- la orden vive en `sessionStorage` -- y de
 * volver a mirarla él mismo.
 *
 * El email es el único obligatorio: es la dirección a la que va el QR. El
 * teléfono queda opcional porque sólo sirve para que Administración pueda
 * llamar si el comprobante no cierra.
 */
export function validateTicketBuyer(buyer, t) {
  const errors = {}
  const msg = (key, fallback) => (t ? t(`validation.${key}`) : fallback)

  const name = String(buyer?.name ?? '').trim()
  if (name.length < 3) {
    errors['buyer-name'] = msg('buyerName', 'Ingresá tu nombre y apellido.')
  }

  const email = String(buyer?.email ?? '').trim()
  // Mismo criterio que la RPC (`create_ticket_order_v2`): algo@algo.algo sin
  // espacios. Validar más fino acá y menos allá deja pasar direcciones que la
  // base rechaza recién al confirmar la compra.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors['buyer-email'] = msg('buyerEmail', 'Ingresá un email válido: ahí te llega la entrada.')
  }

  const phone = String(buyer?.phone ?? '').trim()
  if (phone && phone.replace(/\D/g, '').length < 8) {
    errors['buyer-phone'] = msg('buyerPhone', 'Revisá el teléfono o dejalo vacío.')
  }

  return { success: Object.keys(errors).length === 0, errors }
}
