import { z } from 'zod'

/** Códigos de error → `admin.eventEditor.validation.*` en i18n. */
const moneyField = z.coerce
  .number({ invalid_type_error: 'priceInvalid' })
  .finite('priceInvalid')
  .min(0, 'priceMin')
  .max(10_000_000, 'priceMax')

const paidMoneyField = z.coerce
  .number({ invalid_type_error: 'priceInvalid' })
  .finite('priceInvalid')
  .min(1, 'priceMin')
  .max(10_000_000, 'priceMax')

// Precio manual (transferencia/efectivo): vacío es válido — significa "cobra
// igual que el precio de Mercado Pago" — pero si hay algo cargado tiene que
// ser una plata válida.
const optionalPaidMoneyField = z
  .union([z.literal(''), paidMoneyField])
  .optional()
  .nullable()
  .transform((value) => (value === '' || value == null ? undefined : value))

const optionalText = (max, message) =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || '')
    .refine((value) => value.length <= max, message)

const optionalDayDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || '')
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'dayDateInvalid')

const eventDaySchema = z.object({
  dayIndex: z.coerce
    .number()
    .int('dayIndexInvalid')
    .min(0, 'dayIndexInvalid')
    .max(30, 'dayIndexInvalid'),
  label: z.string().trim().min(1, 'dayLabelRequired').max(80, 'dayLabelMax'),
  date: optionalDayDate,
})

const ticketAddonSchema = z.object({
  id: z.string().trim().min(1, 'addonIdRequired').max(80, 'addonIdMax'),
  label: z.string().trim().min(1, 'addonLabelRequired').max(100, 'addonLabelMax'),
  description: optionalText(240, 'addonDescriptionMax'),
  price: moneyField,
  redeemLabel: optionalText(160, 'addonRedeemMax'),
  enabled: z.boolean().optional(),
  sortOrder: z.coerce
    .number()
    .int('sortOrderInvalid')
    .min(0, 'sortOrderInvalid')
    .max(1000, 'sortOrderInvalid')
    .optional(),
})

const nullableQuota = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce
    .number()
    .int('quotaInvalid')
    .min(0, 'quotaInvalid')
    .max(100_000, 'quotaInvalid')
    .nullable(),
)

const ticketTypeSchema = z.object({
  id: z.string().uuid('ticketTypeIdInvalid').optional(),
  name: z.string().trim().min(1, 'ticketTypeNameRequired').max(100, 'ticketTypeNameMax'),
  price: moneyField,
  quota: nullableQuota.optional(),
  sortOrder: z.coerce
    .number()
    .int('sortOrderInvalid')
    .min(0, 'sortOrderInvalid')
    .max(1000, 'sortOrderInvalid')
    .optional(),
  active: z.boolean().optional(),
  dayIndexes: z
    .array(z.coerce.number().int().min(0).max(30))
    .max(31, 'ticketTypeDaysMax')
    .optional(),
  includedAddonIds: z
    .array(z.string().trim().min(1).max(80))
    .max(30, 'ticketTypeAddonsMax')
    .optional(),
})

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
    description: optionalText(1000, 'descriptionMax'),
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
      registration: paidMoneyField,
      registrationManual: optionalPaidMoneyField,
      combo: moneyField,
      ticketsEnabled: z.boolean().optional(),
      ticketAddons: z.array(ticketAddonSchema).max(30, 'ticketAddonsMax').optional(),
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
      .refine((value) => value === '' || /^https?:\/\//i.test(value), 'liveUrlInvalid'),
    liveStreamProvider: z.enum(['youtube', 'instagram', 'twitch']).optional(),
    liveStatus: z.enum(['offline', 'live', 'ended']).optional(),
    eventDays: z.array(eventDaySchema).max(31, 'eventDaysMax').optional(),
    ticketTypes: z.array(ticketTypeSchema).max(50, 'ticketTypesMax').optional(),
    paymentChannelOverrides: z
      .object({
        mercado_pago: z.boolean().optional(),
        bank_transfer: z.boolean().optional(),
        cash_pitbull: z.boolean().optional(),
        wise_transfer: z.boolean().optional(),
      })
      .nullable()
      .optional(),
    bankTransfer: z
      .object({
        alias: optionalText(120, 'bankAliasMax'),
        cbu: optionalText(30, 'bankCbuMax'),
        holder: optionalText(160, 'bankHolderMax'),
      })
      .optional(),
    bankTransferProfileId: z.string().uuid('bankProfileIdInvalid').nullable().optional(),
    mercadoPagoProfileId: z.string().uuid('mpProfileIdInvalid').nullable().optional(),
  })
  .superRefine((data, ctx) => {
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

    const dayIndexes = new Set()
    for (const [index, day] of (data.eventDays ?? []).entries()) {
      if (dayIndexes.has(day.dayIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventDays', index, 'dayIndex'],
          message: 'dayIndexDuplicate',
        })
      }
      dayIndexes.add(day.dayIndex)
    }

    const addonIds = new Set()
    for (const [index, addon] of (data.pricing.ticketAddons ?? []).entries()) {
      if (addonIds.has(addon.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricing', 'ticketAddons', index, 'id'],
          message: 'addonIdDuplicate',
        })
      }
      addonIds.add(addon.id)
    }

    for (const [index, ticketType] of (data.ticketTypes ?? []).entries()) {
      if ((ticketType.dayIndexes ?? []).some((dayIndex) => !dayIndexes.has(dayIndex))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'dayIndexes'],
          message: 'ticketTypeDayMissing',
        })
      }
      if ((ticketType.includedAddonIds ?? []).some((addonId) => !addonIds.has(addonId))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'includedAddonIds'],
          message: 'ticketTypeAddonMissing',
        })
      }
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
    description: draft?.description ?? '',
    slots: draft?.slots,
    venue: draft?.venue ?? '',
    location: draft?.location ?? '',
    status: draft?.status ?? '',
    pricing: {
      membership: draft?.pricing?.membership,
      registration: draft?.pricing?.registration,
      registrationManual: draft?.pricing?.registrationManual,
      combo: draft?.pricing?.combo,
      ticketsEnabled: draft?.pricing?.ticketsEnabled,
      ticketAddons: draft?.pricing?.ticketAddons ?? [],
    },
    startsAt: draft?.startsAt ?? '',
    endsAt: draft?.endsAt ?? '',
    registrationOpensAt: draft?.registrationOpensAt ?? '',
    registrationClosesAt: draft?.registrationClosesAt ?? '',
    ticketSalesOpensAt: draft?.ticketSalesOpensAt ?? '',
    ticketSalesClosesAt: draft?.ticketSalesClosesAt ?? '',
    liveStreamUrl: draft?.liveStreamUrl ?? '',
    liveStreamProvider: draft?.liveStreamProvider ?? 'youtube',
    liveStatus: draft?.liveStatus ?? 'offline',
    eventDays: draft?.eventDays ?? [],
    ticketTypes: draft?.ticketTypes ?? [],
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
