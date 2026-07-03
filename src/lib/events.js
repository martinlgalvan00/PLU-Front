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
    location: 'Buenos Aires',
    slug: 'pitbull-classic-2026',
    status: 'proximamente',
    featured: true,
  },
  {
    date: '12 Sep',
    dateISO: '2026-09-12',
    title: 'Rookie Meet PLU ARG',
    venue: 'Iron House',
    location: 'Córdoba',
    slug: 'rookie-meet-2026',
    status: 'proximamente',
  },
  {
    date: '24 Oct',
    dateISO: '2026-10-24',
    title: 'Argentina Open',
    venue: 'Pitbull Barbell',
    location: 'Rosario',
    slug: 'argentina-open-2026',
    status: 'proximamente',
  },
  {
    date: '18 May',
    dateISO: '2025-05-18',
    title: 'Spring Classic 2025',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    slug: 'spring-classic-2025',
    status: 'finalizado',
  },
]
