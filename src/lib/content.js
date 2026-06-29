import { PRICING } from './constants.js'

export const HOME_STATS = [
  { value: '180+', label: 'Atletas afiliados' },
  { value: '12', label: 'Eventos por año' },
  { value: '8', label: 'Provincias activas' },
  { value: '100%', label: 'Estándar internacional' },
]

export const ABOUT_INTRO = {
  eyebrow: 'Qué es PLU ARG',
  title: 'La federación que ordena el powerlifting argentino',
  description:
    'Unimos reglamento claro, operación profesional y comunidad competitiva. Desde Maximal coordinamos afiliaciones, eventos oficiales y resultados con estándar internacional.',
}

export const ABOUT_PILLARS = [
  {
    icon: 'BookOpen',
    title: 'Reglamento unificado',
    text: 'Normativa clara y cuerpo arbitral capacitado en cada meet oficial.',
  },
  {
    icon: 'ClipboardList',
    title: 'Inscripciones centralizadas',
    text: 'Afiliación, inscripción a eventos y pagos desde un solo trámite web.',
  },
  {
    icon: 'Trophy',
    title: 'Resultados oficiales',
    text: 'Planillas publicadas y exportación alineada a estándares internacionales.',
  },
  {
    icon: 'MapPin',
    title: 'Red nacional',
    text: 'Gimnasios aliados y atletas activos en distintas provincias del país.',
  },
]

export const MEMBERSHIP_PLANS = [
  {
    id: 'athlete',
    title: 'Atleta',
    price: PRICING.membership,
    period: 'anual',
    features: ['Mayores de 18 años', 'Código PLU ARG', 'Tarjeta digital de miembro', 'Acceso a eventos oficiales'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'junior',
    title: 'Atleta juvenil',
    price: PRICING.membershipJunior,
    period: 'anual',
    features: ['10 a 17 años', 'Afiliación anual', 'Eventos juveniles PLU ARG'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'combo',
    title: 'Combo Pitbull Classic',
    price: PRICING.combo,
    period: 'temporada 2026',
    features: ['Afiliación anual', 'Inscripción Pitbull Classic', 'Validación administrativa'],
    highlighted: true,
    procedureType: 'both',
  },
]

export const PITBULL_CLASSIC = {
  title: 'Pitbull Classic',
  date: '15 de agosto, 2026',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires, Argentina',
  slots: 120,
  registered: 48,
  categories: ['Raw', 'Classic Raw', 'Equipped'],
  divisions: ['Open', 'Junior', 'Sub-Junior', 'Master'],
}

export const RECENT_RESULTS = [
  { athlete: 'Martina Rivas', event: 'Pitbull Classic 2025', total: '412.5 kg', place: '1° Open Raw F', date: '2025-08-10' },
  { athlete: 'Nicolás Aguirre', event: 'Argentina Open 2025', total: '580 kg', place: '2° Junior Classic', date: '2025-10-18' },
  { athlete: 'Lucía Fernández', event: 'Rookie Meet Córdoba', total: '325 kg', place: '1° Sub-Junior', date: '2025-09-05' },
]

export const FAQ_ITEMS = [
  {
    q: '¿Quién puede afiliarse a PLU ARG?',
    a: 'Cualquier atleta de powerlifting residente en Argentina o que compita bajo bandera argentina en eventos PLU ARG. También gimnasios y entrenadores pueden registrarse como aliados operativos.',
  },
  {
    q: '¿La afiliación es obligatoria para competir?',
    a: 'Sí. Para inscribirte en eventos oficiales PLU ARG necesitás afiliación activa del año en curso o el combo afiliación + evento al momento de la inscripción.',
  },
  {
    q: '¿Cómo pago afiliación o inscripción?',
    a: 'Mediante Mercado Pago desde el formulario web. Si tenés un inconveniente con el pago online, el equipo PLU ARG puede validar manualmente tu comprobante.',
  },
  {
    q: '¿Qué es Pitbull Classic?',
    a: 'Es el evento insignia de PLU ARG en Argentina, organizado junto a Maximal. Reúne atletas de todo el país bajo estándares internacionales de competencia.',
  },
  {
    q: '¿Dónde veo mis resultados oficiales?',
    a: 'Los resultados se publican en esta plataforma después de cada meet. Las planillas de LiftingCast se normalizan y quedan disponibles para consulta y exportación.',
  },
  {
    q: '¿PLU ARG está vinculada a Powerlifting United?',
    a: 'PLU ARG opera como federación argentina alineada a estándares internacionales de powerlifting. Somos la representación local con identidad y operación propias.',
  },
]

export const COMMUNITY_HIGHLIGHTS = [
  { title: 'Gimnasios aliados', text: 'Red de sedes en Buenos Aires, Córdoba, Rosario y el interior.' },
  { title: 'Jueces certificados', text: 'Cuerpo arbitral formado bajo reglamento PLU ARG.' },
  { title: 'Atletas elite y base', text: 'Desde la primera competencia hasta el podio internacional.' },
]

export const RULEBOOK_SECTIONS = [
  { title: 'Equipamiento', text: 'Categorías Raw, Classic Raw y Equipped según normativa PLU ARG vigente.' },
  { title: 'Categorías de peso', text: 'Tablas masculinas y femeninas alineadas a estándares internacionales.' },
  { title: 'Divisiones', text: 'Open, Junior, Sub-Junior, Master y categorías especiales según edad.' },
  { title: 'Conducta y antidoping', text: 'Política de fair play, control de sustancias y procedimiento de reclamos.' },
]

export const ADMIN_SECTIONS = [
  ['dashboard', 'Dashboard', 'LayoutDashboard'],
  ['athletes', 'Atletas', 'Users'],
  ['memberships', 'Afiliaciones', 'BadgeCheck'],
  ['events', 'Eventos', 'Calendar'],
  ['registrations', 'Inscripciones', 'ClipboardList'],
  ['payments', 'Pagos', 'CreditCard'],
  ['results', 'Resultados', 'Trophy'],
  ['exports', 'Exportaciones', 'Download'],
  ['users', 'Usuarios', 'Shield'],
  ['audit', 'Auditoría', 'ScrollText'],
]
