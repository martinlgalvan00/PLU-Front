import { z } from 'zod'

const spanishDate = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Usá el formato DD/MM/AAAA.')

export const athleteProfileSchema = z.object({
  fullName: z.string().trim().min(3, 'Ingresá tu nombre y apellido.'),
  documentId: z.string().trim().min(6, 'Ingresá un documento válido.'),
  birthDate: spanishDate,
  email: z.string().trim().email('Ingresá un correo electrónico válido.'),
  phone: z.string().refine((value) => value.replace(/\D/g, '').length >= 8, 'Ingresá un teléfono válido con código de área.'),
  country: z.string().trim().min(2, 'Ingresá tu país.'),
  province: z.string().trim().min(2, 'Ingresá tu provincia.'),
  city: z.string().trim().min(2, 'Ingresá tu ciudad.'),
  gym: z.string().trim().min(2, 'Ingresá tu gimnasio o equipo.'),
  sex: z.enum(['Masculino', 'Femenino']),
})

export const competitionSchema = z.object({
  division: z.string().min(1, 'Seleccioná una división.'),
  category: z.string().min(1, 'Seleccioná una categoría.'),
  estimatedWeight: z.string().refine((value) => {
    const weight = Number(value.replace(',', '.').replace(/\s*kg$/i, ''))
    return Number.isFinite(weight) && weight >= 20 && weight <= 400
  }, 'Ingresá un peso entre 20 y 400 kg.'),
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
})

export const membershipSchema = z.object({
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
})

function formatResult(result) {
  if (result.success) return { success: true, data: result.data, errors: {} }
  const errors = Object.fromEntries(
    Object.entries(result.error.flatten().fieldErrors).map(([field, messages]) => [field, messages[0]]),
  )
  return { success: false, error: Object.values(errors)[0] || 'Datos inválidos', errors }
}

export function validateAthleteForm(form) {
  return formatResult(athleteProfileSchema.safeParse(form))
}

export function validateCompetitionForm(form) {
  return formatResult(competitionSchema.safeParse(form))
}

export function validateMembershipForm(form) {
  return formatResult(membershipSchema.safeParse(form))
}
