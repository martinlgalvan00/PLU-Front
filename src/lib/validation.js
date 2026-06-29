import { z } from 'zod'

export const athleteFormSchema = z.object({
  fullName: z.string().min(3, 'Nombre y apellido requerido'),
  documentId: z.string().min(6, 'Documento inválido'),
  birthDate: z.string().min(1, 'Fecha de nacimiento requerida'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(8, 'Teléfono requerido'),
  country: z.string().min(1),
  province: z.string().min(1, 'Provincia requerida'),
  city: z.string().min(1, 'Ciudad requerida'),
  gym: z.string().min(1, 'Gimnasio requerido'),
  sex: z.enum(['Masculino', 'Femenino']),
  division: z.string().min(1),
  category: z.string().min(1),
  estimatedWeight: z.string().min(1, 'Peso estimado requerido'),
  procedureType: z.enum(['both', 'membership', 'event']),
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
})

export function validateAthleteForm(form) {
  const result = athleteFormSchema.safeParse(form)
  if (result.success) return { success: true, data: result.data }
  const firstError = result.error.errors[0]?.message || 'Datos inválidos'
  return { success: false, error: firstError }
}
