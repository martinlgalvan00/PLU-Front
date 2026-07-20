/**
 * demoAthleteSeed.js — PLU ARG
 *
 * Datos locales para las cuentas de demo/QA (login('athlete'), demo2,
 * demo3, demo-admin) — a propósito quedan afuera de la migración a
 * Supabase (athleteApi.js): sus ids ('ath-001', 'ath-002', 'demo-admin')
 * no existen en el backend real, así que useAppData.js nunca les pide
 * datos remotos y en cambio arranca su estado con este seed, exactamente
 * como funcionaba antes con localStorage.
 */
export const demoAthletes = [
  {
    id: 'ath-001',
    fullName: 'Martina Rivas',
    documentId: '40111222',
    birthDate: '1997-04-18',
    email: 'martina.rivas@example.com',
    phone: '+54 9 11 3000-1188',
    country: 'Argentina',
    province: 'Buenos Aires',
    city: 'La Plata',
    gym: 'Maximal Power',
    sex: 'Femenino',
    division: 'Open',
    category: 'Raw',
    estimatedWeight: '67.5',
    status: 'afiliado_activo',
  },
  {
    id: 'ath-002',
    fullName: 'Nicolás Aguirre',
    documentId: '36888999',
    birthDate: '1992-10-03',
    email: 'nicolas.aguirre@example.com',
    phone: '+54 9 351 420-9921',
    country: 'Córdoba',
    province: 'Córdoba',
    city: 'Córdoba',
    gym: 'Pitbull Barbell',
    sex: 'Masculino',
    division: 'Junior',
    category: 'Raw With Wraps',
    estimatedWeight: '82.5',
    status: 'registrado',
  },
]

export const demoMemberships = [
  {
    id: 'mem-001',
    athleteId: 'ath-001',
    year: '2026',
    status: 'activa',
    startDate: '2026-02-01',
    expirationDate: '2027-01-31',
    memberCode: 'PLU-ARG-2026-001',
    qrToken: 'demo-mem-001',
    paymentStatus: 'aprobado',
  },
]

export const demoRegistrations = [
  {
    id: 'reg-001',
    athleteId: 'ath-001',
    event: 'Pitbull Classic',
    eventSlug: 'pitbull-classic-2026',
    category: 'Raw',
    division: 'Open',
    bodyweight: '67.5',
    status: 'confirmada',
    paymentStatus: 'aprobado',
    notes: 'Afiliación e inscripción pagadas por Mercado Pago.',
    checkedInAt: null,
  },
  {
    id: 'reg-002',
    athleteId: 'ath-002',
    event: 'Pitbull Classic',
    eventSlug: 'pitbull-classic-2026',
    category: 'Raw With Wraps',
    division: 'Junior',
    bodyweight: '82.5',
    status: 'pendiente_pago',
    paymentStatus: 'validacion_manual',
    notes: 'Pendiente de validación manual.',
    checkedInAt: null,
  },
]

export const demoPayments = [
  {
    id: 'pay-001',
    athleteId: 'ath-001',
    concept: 'Afiliación anual + Pitbull Classic',
    amount: 78000,
    method: 'mercado_pago',
    status: 'aprobado',
    reference: 'MP-90122',
    createdAt: '2026-02-01',
  },
  {
    id: 'pay-002',
    athleteId: 'ath-002',
    concept: 'Inscripción Pitbull Classic',
    amount: 45000,
    method: 'manual_link',
    status: 'validacion_manual',
    reference: 'LINK-MP-PB-2026',
    createdAt: '2026-03-16',
  },
]

const DEMO_SESSION_IDS = new Set(['demo-admin', 'demo-athlete', 'demo-plu-usa', 'demo-security'])
const DEMO_ATHLETE_IDS = new Set(['ath-001', 'ath-002'])

/**
 * true para las cuentas de acceso rápido de la pantalla de login (admin,
 * athlete, demo2, demo3, seguridad desde la puerta) -- ninguna pasa por el
 * backend real.
 */
export function isDemoSession(session) {
  if (!session) return false
  return DEMO_SESSION_IDS.has(session.id) || DEMO_ATHLETE_IDS.has(session.athleteId)
}
