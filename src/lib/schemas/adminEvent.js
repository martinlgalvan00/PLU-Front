import { z } from 'zod'

/** Códigos de error → `admin.eventEditor.validation.*` en i18n. */
const moneyField = z.coerce
  .number({ invalid_type_error: 'priceInvalid' })
  .finite('priceInvalid')
  .min(0, 'priceMin')
  .max(10_000_000, 'priceMax')

function optionalDateTime(message = 'dateTimeInvalid') {
  return z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || '')
    .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), message)
}

/** Inicio y fin dejaron de ser opcionales: son la única fuente de fecha del
 * evento (antes convivían con un `dateISO` aparte que podía contradecirlas). */
function requiredDateTime(missingMessage) {
  return z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || '')
    .refine((value) => value !== '', missingMessage)
    .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'dateTimeInvalid')
}

/**
 * Validación del draft de creación/edición de eventos.
 * Campos críticos obligatorios; ventanas y live opcionales con consistencia.
 */
export const adminEventDraftSchema = z
  .object({
    title: z.string().trim().min(3, 'titleMin').max(120, 'titleMax'),
    slots: z.coerce
      .number({ invalid_type_error: 'slotsInvalid' })
      .int('slotsInt')
      .min(1, 'slotsMin')
      .max(5000, 'slotsMax'),
    venue: z.string().trim().min(2, 'venueMin').max(120, 'venueMax'),
    location: z.string().trim().min(2, 'locationMin').max(120, 'locationMax'),
    status: z.string().trim().min(1, 'statusRequired'),
    pricing: z.object({
      membership: moneyField,
      registration: moneyField,
      combo: moneyField,
    }),
    startsAt: requiredDateTime('startsAtRequired'),
    endsAt: requiredDateTime('endsAtRequired'),
    registrationOpensAt: optionalDateTime(),
    registrationClosesAt: optionalDateTime(),
    ticketSalesOpensAt: optionalDateTime(),
    ticketSalesClosesAt: optionalDateTime(),
    liveStreamUrl: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((value) => value || '')
      .refine(
        (value) => value === '' || /^https?:\/\//i.test(value),
        'liveUrlInvalid',
      ),
  })
  .superRefine((data, ctx) => {
    const membership = data.pricing.membership
    const registration = data.pricing.registration
    const combo = data.pricing.combo

    if (combo > 0 && membership + registration > 0 && combo > membership + registration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricing', 'combo'],
        message: 'comboTooHigh',
      })
    }

    if (data.startsAt && data.endsAt && data.startsAt > data.endsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsBeforeStarts',
      })
    }

    if (
      data.registrationOpensAt &&
      data.registrationClosesAt &&
      data.registrationOpensAt > data.registrationClosesAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationClosesAt'],
        message: 'registrationWindowInvalid',
      })
    }

    if (
      data.ticketSalesOpensAt &&
      data.ticketSalesClosesAt &&
      data.ticketSalesOpensAt > data.ticketSalesClosesAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ticketSalesClosesAt'],
        message: 'ticketSalesWindowInvalid',
      })
    }
  })

function pathKey(path) {
  if (!path?.length) return '_form'
  return path.join('.')
}

/**
 * @param {object} draft
 * @param {(key: string, params?: object) => string} t
 */
export function validateAdminEventDraft(draft, t) {
  const result = adminEventDraftSchema.safeParse({
    title: draft?.title ?? '',
    slots: draft?.slots,
    venue: draft?.venue ?? '',
    location: draft?.location ?? '',
    status: draft?.status ?? '',
    pricing: {
      membership: draft?.pricing?.membership,
      registration: draft?.pricing?.registration,
      combo: draft?.pricing?.combo,
    },
    startsAt: draft?.startsAt ?? '',
    endsAt: draft?.endsAt ?? '',
    registrationOpensAt: draft?.registrationOpensAt ?? '',
    registrationClosesAt: draft?.registrationClosesAt ?? '',
    ticketSalesOpensAt: draft?.ticketSalesOpensAt ?? '',
    ticketSalesClosesAt: draft?.ticketSalesClosesAt ?? '',
    liveStreamUrl: draft?.liveStreamUrl ?? '',
  })

  if (result.success) {
    return { ok: true, fieldErrors: {}, firstKey: null }
  }

  const fieldErrors = {}
  for (const issue of result.error.issues) {
    const key = pathKey(issue.path)
    if (fieldErrors[key]) continue
    const code = issue.message
    fieldErrors[key] = t(`admin.eventEditor.validation.${code}`)
  }

  const firstKey = Object.keys(fieldErrors)[0] ?? null
  return { ok: false, fieldErrors, firstKey }
}
