// Padrón sintético para las stories de Personas. Determinístico (sin Math.random)
// para que las capturas sean comparables entre rondas. Solo lo importan archivos
// *.stories.jsx: no entra al bundle de la app.

const FIRST = [
  'Abraham', 'Adrián', 'Agostina', 'Agustín', 'Alexis', 'Andrea', 'Bruno', 'Camila', 'Carlos',
  'Daniela', 'Diego', 'Evelin', 'Facundo', 'Florencia', 'Gonzalo', 'Ivana', 'Joaquín', 'Julieta',
  'Lautaro', 'Lucía', 'Marcos', 'Martina', 'Nicolás', 'Pilar', 'Rocío', 'Sebastián', 'Tomás',
]
const LAST = [
  'Useche', 'Yuchechen', 'Suárez', 'Alesso', 'Mercado', 'Giménez', 'Blois', 'Bebitez', 'Abraham',
  'Rivas', 'Aguirre', 'Peralta', 'Fernández', 'Galván', 'Torres', 'Domínguez', 'Ledesma', 'Quiroga',
]
const GYMS = [
  'RAVEN TEAM', 'Vulgar Training Club', 'Power House', 'Iron Method', 'Eco Barbell',
  'Pitbull Barbell Club', 'Black Dragon', 'Mvd power team', 'Corporal Kinesis', 'AIKOR Gym',
  'Afap Powerlifting', 'Animal La Plata',
]
const DIVISIONS = ['Open', 'Junior', 'Master 1', 'Youth', 'Sub-Junior']
const STATUSES = ['registrado', 'registrado', 'afiliado_activo', 'registrado', 'afiliado_vencido', 'pre_registrado']

function pick(list, i, step = 1) {
  return list[(i * step) % list.length]
}

export const PREVIEW_ATHLETES = Array.from({ length: 64 }, (_, i) => {
  const complete = i % 5 === 0
  return {
    id: `ath-${String(i + 1).padStart(3, '0')}`,
    fullName: `${pick(FIRST, i, 1)} ${pick(LAST, i, 7)}`,
    documentId: String(20000000 + i * 612347 + 11).slice(0, 8),
    email: `atleta${i + 1}@example.com`,
    gym: pick(GYMS, i, 5),
    division: pick(DIVISIONS, i, 3),
    status: i % 7 === 0 ? 'afiliado_activo' : pick(STATUSES, i, 1),
    createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28), 13, 30)).toISOString(),
    photoUrl: null,
    phone: complete ? '1155550000' : '',
    city: complete ? 'La Plata' : '',
    province: complete ? 'Buenos Aires' : '',
    category: complete ? 'Raw' : '',
    estimatedWeight: complete ? '83' : '',
  }
})

const EVENT = 'Pitbull Classic 2026'

export const PREVIEW_REGISTRATIONS = PREVIEW_ATHLETES.slice(0, 48).map((athlete, i) => ({
  id: `reg-${i + 1}`,
  athleteId: athlete.id,
  event: EVENT,
  eventSlug: 'pitbull-classic-2026',
  category: i % 3 === 0 ? 'Equipado' : 'Raw',
  division: athlete.division,
  bodyweight: `${55 + ((i * 7) % 60)} kg`,
  status: i % 11 === 0 ? 'pendiente_pago' : i % 17 === 0 ? 'observada' : i === 4 ? 'validacion_manual' : 'confirmada',
  schedule: null,
}))

export const PREVIEW_PAYMENTS = PREVIEW_REGISTRATIONS.map((registration, i) => ({
  id: `pay-${i + 1}`,
  athleteId: registration.athleteId,
  eventSlug: registration.eventSlug,
  method: i % 4 === 0 ? 'transferencia' : 'mercado_pago',
  status: registration.status === 'pendiente_pago' ? 'pendiente' : 'aprobado',
  amount: 45000,
}))

const day = 24 * 60 * 60 * 1000
function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10)
}

export const PREVIEW_MEMBERSHIPS = PREVIEW_ATHLETES.slice(0, 45).map((athlete, i) => {
  const cancelled = i % 3 === 2
  const pending = i % 19 === 0
  const expiresIn = cancelled ? -40 : i % 6 === 0 ? 12 : 120 + i * 3
  return {
    id: `mem-${i + 1}`,
    athleteId: athlete.id,
    athlete,
    memberCode: `PLU-ARG-2026-${String(100 + i * 7).padStart(8, '0')}`,
    year: '2026',
    status: cancelled ? 'cancelada' : pending ? 'pendiente_pago' : 'activa',
    startDate: isoDay(expiresIn - 365),
    expirationDate: isoDay(expiresIn),
  }
})

export const PEOPLE_PREVIEW = {
  athletes: PREVIEW_ATHLETES,
  registrations: PREVIEW_REGISTRATIONS,
  payments: PREVIEW_PAYMENTS,
  memberships: PREVIEW_MEMBERSHIPS,
}
