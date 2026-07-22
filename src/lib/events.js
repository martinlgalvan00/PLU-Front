export const EVENT_STATUS = {
  proximamente: { label: 'Próximamente', tone: 'neutral' },
  inscripcion_abierta: { label: 'Inscripción abierta', tone: 'success' },
  cupos_limitados: { label: 'Cupos limitados', tone: 'warning' },
  cerrado: { label: 'Cerrado', tone: 'danger' },
  finalizado: { label: 'Finalizado', tone: 'neutral' },
}

export const UPCOMING_EVENTS = [
  {
    date: '12-13 Dic',
    dateISO: '2026-12-12',
    title: 'Pitbull Classic',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires, Argentina',
    slug: 'pitbull-classic-2026',
    status: 'proximamente',
    featured: true,
    requiresMembership: true,
    startsAt: '2026-12-12T09:00:00-03:00',
    endsAt: '2026-12-13T20:00:00-03:00',
    description: 'Pitbull Classic · meet oficial PLU Argentina. Maximal Strength Club, Buenos Aires.',
  },
  {
    date: '18 May',
    dateISO: '2025-05-18',
    title: 'Spring Classic 2025',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    slug: 'spring-classic-2025',
    status: 'finalizado',
    requiresMembership: false,
  },
]
