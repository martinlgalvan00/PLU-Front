import { PRICING } from './constants.js'

export const HOME_STATS = [
  { value: '2026', label: 'Año de lanzamiento' },
  { value: 'PLU USA', label: 'Reconocimiento internacional' },
  { value: '100%', label: 'Gestión digital' },
]

export const ABOUT_INTRO = {
  eyebrow: 'Qué es PLU ARG',
  title: 'La federación que ordena el powerlifting argentino.',
  description:
    'Conecta atletas, gimnasios y jueces bajo un mismo sistema de afiliación, competencia y resultados — con la seriedad administrativa que exige responder ante PLU USA.',
}

export const ABOUT_PILLARS = [
  {
    title: 'Estándar internacional',
    text: 'Reglas, divisiones y categorías alineadas al circuito reconocido por PLU USA.',
  },
  {
    title: 'Gestión sin planillas',
    text: 'Afiliación, inscripción y pago en un solo lugar, para el atleta y para quien organiza.',
  },
  {
    title: 'Comunidad en crecimiento',
    text: 'Gimnasios y atletas de todo el país compitiendo bajo un mismo sistema.',
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
    compareWith: [
      { label: 'Afiliación anual', price: PRICING.membership },
      { label: 'Inscripción Pitbull Classic', price: PRICING.event },
    ],
  },
]

export const MEMBERSHIP_BENEFITS = [
  'Acceso a todos los eventos oficiales del año calendario',
  'Código de afiliado único y credencial digital',
  'Resultados registrados y reconocidos por PLU USA',
]

export const MEMBERSHIP_REQUIREMENTS = [
  'DNI o pasaporte vigente',
  'Edad mínima 14 años, con autorización de tutor si es menor',
  'Apto médico o declaración jurada de salud',
  'Foto reciente para la credencial digital',
]

export const MEMBERSHIP_ANNUAL_STEPS = [
  {
    step: '01',
    title: 'Completá tus datos',
    text: 'Formulario simple con tus datos personales y de contacto.',
  },
  {
    step: '02',
    title: 'Pagá con Mercado Pago',
    text: 'Checkout seguro, con confirmación inmediata o validación manual.',
  },
  {
    step: '03',
    title: 'Recibí tu código',
    text: 'Confirmación en pantalla con tu código de afiliado.',
  },
  {
    step: '04',
    title: 'Quedás habilitado',
    text: 'Ya podés inscribirte a cualquier evento oficial del año.',
  },
]

export const MEMBERSHIP_FAQ = [
  {
    id: 'pitbull',
    q: '¿La afiliación incluye la inscripción a Pitbull Classic?',
    a: 'No. La afiliación anual habilita a competir; la inscripción a cada meet se gestiona por separado, salvo en el plan combo.',
  },
  {
    id: 'vigencia',
    q: '¿Cuándo empieza a correr la vigencia?',
    a: 'Desde que el pago queda acreditado hasta el 31 de diciembre del mismo año calendario.',
  },
  {
    id: 'menores',
    q: '¿Pueden afiliarse atletas menores?',
    a: 'Sí, desde los 14 años con autorización del tutor legal y categorías juveniles habilitadas.',
  },
]

export const MEMBERSHIP_COMPARE_ROWS = [
  { label: 'Código de atleta PLU ARG', athlete: true, junior: true, combo: true },
  { label: 'Tarjeta digital de miembro', athlete: true, junior: true, combo: true },
  { label: 'Acceso a eventos oficiales', athlete: true, junior: true, combo: true },
  { label: 'Inscripción Pitbull Classic', athlete: false, junior: false, combo: true },
  { label: 'Vigencia temporada 2026', athlete: true, junior: true, combo: true },
]

export const PLATFORM_SECTIONS = [
  { key: 'members', group: 'Competencia', title: 'Afiliación', desc: 'Planes anuales, código de atleta y respaldo federativo.' },
  { key: 'pitbull', group: 'Competencia', title: 'Pitbull Classic', desc: 'El meet insignia de la temporada PLU ARG.' },
  { key: 'events', group: 'Competencia', title: 'Eventos', desc: 'Calendario competitivo y inscripciones por meet.' },
  { key: 'results', group: 'Competencia', title: 'Resultados', desc: 'Planillas oficiales, totales y podios.' },
  { key: 'rulebook', group: 'Institucional', title: 'Reglamento', desc: 'Normativa, categorías y equipamiento.' },
  { key: 'community', group: 'Institucional', title: 'Comunidad', desc: 'Gimnasios aliados, jueces y red de atletas.' },
  { key: 'faq', group: 'Institucional', title: 'FAQ', desc: 'Respuestas sobre afiliación, pagos y competencia.' },
  { key: 'contact', group: 'Institucional', title: 'Contacto', desc: 'Soporte operativo y consultas de la federación.' },
]

export const PITBULL_CLASSIC = {
  title: 'Pitbull Classic',
  date: '12 y 13 de diciembre de 2026',
  dateDay: '12–13',
  dateMonth: 'Dic',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires, Argentina',
  slots: 120,
  registered: 48,
  categories: ['Raw', 'Classic Raw', 'Equipped'],
  divisions: ['Open', 'Junior', 'Sub-Junior', 'Master'],
}

export const PITBULL_CATEGORY_CARDS = [
  { title: 'Equipamiento', text: `${PITBULL_CLASSIC.categories.join(' · ')} (ejemplo)` },
  { title: 'Edad', text: `${PITBULL_CLASSIC.divisions.join(' · ')} (ejemplo)` },
  { title: 'Peso corporal', text: 'Categorías masculinas y femeninas por franja de peso (ejemplo).' },
  { title: 'Género', text: 'Masculino y femenino, competencia separada (ejemplo).' },
]

export const PITBULL_CREDENTIAL_SAMPLE = {
  athlete: 'Camila Sosa',
  categoryLine: 'Master · Raw · 76kg (dato de ejemplo)',
  registrationNumber: '#0142',
  affiliateCode: 'PA-2609',
  date: '12-13 Dic 2026 · Buenos Aires, Argentina',
  status: 'Pago acreditado',
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

export const FAQ_GROUPS = [
  {
    id: 'faq-afiliacion',
    title: 'Afiliación',
    items: [
      {
        q: '¿Cuánto dura la afiliación?',
        a: 'Es válida por año calendario, desde el pago acreditado hasta el 31 de diciembre del mismo año (esquema de ejemplo).',
      },
      {
        q: '¿Puedo afiliarme sin haber competido antes?',
        a: 'Sí, la afiliación está abierta a cualquier atleta que cumpla los requisitos básicos, sin experiencia previa.',
      },
    ],
  },
  {
    id: 'faq-inscripcion',
    title: 'Inscripción',
    items: [
      {
        q: '¿Necesito estar afiliado para inscribirme?',
        a: 'Sí, la afiliación anual activa es requisito para inscribirte a cualquier evento oficial.',
      },
      {
        q: '¿Qué pasa si mi inscripción queda observada?',
        a: 'Un operador revisa el caso (datos incompletos, peso declarado, etc.) y te contacta antes del evento.',
      },
    ],
  },
  {
    id: 'faq-pagos',
    title: 'Pagos',
    items: [
      {
        q: '¿Qué medios de pago aceptan?',
        a: 'Mercado Pago es el medio de pago principal para afiliaciones e inscripciones.',
      },
      {
        q: '¿Qué hago si mi pago no se acredita?',
        a: "Tu registro queda 'Pendiente de pago'. Si pasan más de 48hs, escribinos por Contacto con tu comprobante.",
      },
    ],
  },
  {
    id: 'faq-soporte',
    title: 'Resultados y soporte',
    items: [
      {
        q: '¿Puedo apelar un resultado?',
        a: 'Sí, siguiendo el procedimiento de apelación descrito en el reglamento oficial de cada evento.',
      },
      {
        q: '¿PLU USA puede resolver mi consulta directamente?',
        a: 'No — PLU USA solo audita reportes y exportaciones. Las consultas operativas se resuelven con Maximal / PLU ARG.',
      },
    ],
  },
]

export const COMMUNITY_HIGHLIGHTS = [
  { title: 'Gimnasios aliados', text: 'Red de sedes en Buenos Aires, Córdoba, Rosario y el interior.' },
  { title: 'Jueces certificados', text: 'Cuerpo arbitral formado bajo reglamento PLU ARG.' },
  { title: 'Atletas elite y base', text: 'Desde la primera competencia hasta el podio internacional.' },
]

export const COMMUNITY_QUOTE =
  'No competimos entre gimnasios. Competimos bajo las mismas reglas — para que un récord en Rosario valga lo mismo que uno en Buenos Aires.'

export const COMMUNITY_GYM_PLACEHOLDERS = Array.from({ length: 6 }, (_, i) => ({
  id: `gym-${i + 1}`,
  label: 'logo gimnasio',
}))

export const COMMUNITY_TESTIMONIAL_PLACEHOLDERS = Array.from({ length: 3 }, (_, i) => ({
  id: `testimonio-${i + 1}`,
  photoLabel: 'foto de atleta',
  text: 'Espacio para testimonio real de un atleta afiliado.',
}))

export const RULEBOOK_DOWNLOAD = {
  title: 'Reglamento completo — PDF',
  subtitle: 'Versión 2026 · próxima publicación',
  action: 'Descargar PDF',
}

export const RULEBOOK_WEIGHT_CATEGORIES = [
  { title: 'Masculino', text: '59 · 66 · 74 · 83 · 93 · 105 · 120 · 120+ kg (ejemplo)' },
  { title: 'Femenino', text: '47 · 52 · 57 · 63 · 69 · 76 · 84 · 84+ kg (ejemplo)' },
]

export const RULEBOOK_DIVISIONS = [
  { title: 'Sub-junior', range: '14–18 años' },
  { title: 'Junior', range: '19–23 años' },
  { title: 'Open', range: 'Sin límite' },
  { title: 'Master', range: '40+ años' },
]

export const RULEBOOK_EQUIPMENT = [
  {
    title: 'Raw',
    text: 'Cinturón, rodilleras, muñequeras y calzado reglamentario. Sin trajes de soporte.',
  },
  {
    title: 'Equipped',
    text: 'Traje de soporte homologado para sentadilla y press de banca, además del equipo raw.',
  },
]

export const RULEBOOK_JUDGING = [
  { numeral: 'I', text: 'Tres intentos por movimiento: sentadilla, press de banca y despegue.' },
  {
    numeral: 'II',
    text: 'Panel de tres jueces; se requieren dos señales a favor para un levantamiento válido.',
  },
  {
    numeral: 'III',
    text: 'El atleta compite en la categoría de peso corporal declarada al pesaje oficial.',
  },
]

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Gestión',
    items: [
      ['dashboard', 'Dashboard', 'LayoutDashboard'],
      ['athletes', 'Atletas', 'Users'],
      ['memberships', 'Afiliaciones', 'BadgeCheck'],
    ],
  },
  {
    label: 'Eventos',
    items: [
      ['events', 'Eventos', 'Calendar'],
      ['registrations', 'Inscripciones', 'ClipboardList'],
      ['results', 'Resultados', 'Trophy'],
    ],
  },
  {
    label: 'Finanzas',
    items: [
      ['payments', 'Pagos', 'CreditCard'],
      ['exports', 'Exportaciones', 'Download'],
    ],
  },
  {
    label: 'Sistema',
    items: [
      ['users', 'Usuarios', 'Shield'],
      ['audit', 'Auditoría', 'ScrollText'],
    ],
  },
]

export const ADMIN_SECTIONS = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
