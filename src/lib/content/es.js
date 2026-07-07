import { PRICING } from '../constants.js'

export const HOME_STATS = [
  { value: '2026', label: 'Año de lanzamiento' },
  { value: 'PLU USA', label: 'Reconocimiento internacional' },
  { value: '100%', label: 'Gestión digital' },
]

/** Banda de accesos rápidos bajo el hero (design-reference) */
export const HOME_QUICK_LINKS = [
  { key: 'members', labelKey: 'nav.members' },
  { key: 'pitbull', labelKey: 'nav.pitbull' },
  { key: 'events', labelKey: 'nav.events' },
  { key: 'results', labelKey: 'nav.results' },
  { key: 'rulebook', labelKey: 'nav.rulebook' },
]

export const ABOUT_INTRO = {
  eyebrow: 'Qué es PLU ARG',
  title: 'La federación que ordena el powerlifting argentino.',
  description:
    'Conecta atletas, gimnasios y jueces bajo un mismo sistema de afiliación, competencia y resultados — con la seriedad administrativa que exige responder ante PLU USA.',
}

export const HOME_MEMBERSHIP = {
  eyebrow: 'Afiliación anual',
  title: 'Un paso, un año de competencia.',
  description:
    'La afiliación es el requisito único para competir en eventos oficiales de PLU ARG durante el año calendario.',
  cta: 'Registrarme ahora',
  sampleNote: 'Precio de referencia',
}

export const HOME_RESULTS = {
  eyebrow: 'Resultados',
  title: 'Todavía no hay resultados publicados.',
  description:
    'Los resultados de Pitbull Classic van a estar disponibles acá apenas termine el evento, con exportación lista para PLU USA.',
}

export const HOME_RULEBOOK = {
  eyebrow: 'Reglamento · Rulebook',
  title: 'Las mismas reglas para todos, sin ambigüedad.',
  cta: 'Ver categorías y divisiones',
}

export const HOME_COMMUNITY = {
  eyebrow: 'Comunidad',
  title: 'Cada gimnasio que se suma, hace más fuerte a la federación.',
  description:
    'De Buenos Aires a Bariloche, PLU ARG conecta atletas y gimnasios bajo un mismo estándar internacional.',
  cta: 'Conocé la comunidad',
  visualCaption: 'foto — comunidad, gimnasio, magnesio en tarima',
  stats: [
    { value: '40+', label: 'Gimnasios afiliados' },
    { value: '850+', label: 'Atletas registrados' },
    { value: '12', label: 'Provincias' },
  ],
}

export const HOME_FAQ = {
  eyebrow: 'Preguntas frecuentes',
  title: 'Lo que todo atleta pregunta antes de empezar.',
  description:
    'Respuestas claras sobre afiliación, eventos y resultados — sin vueltas ni letra chica.',
  cta: 'Ver todas las preguntas',
  quickLinks: [
    { label: 'Afiliación', view: 'members' },
    { label: 'Pitbull Classic', view: 'pitbull' },
    { label: 'Contacto', view: 'contact' },
  ],
}

/** FAQ home — copy exacto del design-reference */
export const HOME_FAQ_ITEMS = [
  {
    q: '¿Cómo me afilio a PLU ARG?',
    a: 'Entrás a la página de Afiliación, completás tus datos, pagás con Mercado Pago y quedás registrado al instante.',
  },
  {
    q: '¿Necesito estar afiliado para inscribirme a Pitbull Classic?',
    a: 'Sí. La afiliación anual es el requisito para inscribirte a cualquier evento oficial de PLU ARG.',
  },
  {
    q: '¿Dónde veo los resultados de un evento?',
    a: 'En la sección Resultados, disponibles públicamente apenas se normalizan después de cada evento.',
  },
]

export const HOME_MEMBERSHIP_FEATURES = [
  'Acceso a todos los eventos oficiales del año',
  'Código de afiliado y credencial digital',
  'Resultados reconocidos por PLU USA',
]

export const ABOUT_PILLARS = [
  {
    id: 'standard',
    icon: 'Globe2',
    title: 'Estándar internacional',
    text: 'Reglas, divisiones y categorías alineadas al circuito reconocido por PLU USA.',
  },
  {
    id: 'ops',
    icon: 'ClipboardList',
    title: 'Gestión sin planillas',
    text: 'Afiliación, inscripción y pago en un solo lugar, para el atleta y para quien organiza.',
  },
  {
    id: 'community',
    icon: 'Users',
    title: 'Comunidad en crecimiento',
    text: 'Gimnasios y atletas de todo el país compitiendo bajo un mismo sistema.',
  },
]

export const MEMBERSHIP_CTA = {
  eyebrow: 'Comenzá hoy',
  hint: 'Tarifa atleta adulto',
  description:
    'La afiliación se paga una sola vez al año. Elegí tu plan y completá el trámite online con Mercado Pago o validación manual.',
  cta: 'Comenzar mi afiliación',
  perks: ['Pago único anual', 'Mercado Pago', 'Validación manual'],
}

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
  {
    id: 'events',
    title: 'Eventos oficiales',
    text: 'Acceso a todos los meets PLU ARG del año calendario, incluida Pitbull Classic.',
  },
  {
    id: 'credential',
    title: 'Credencial digital',
    text: 'Código de afiliado único y tarjeta digital lista para competir.',
  },
  {
    id: 'results',
    title: 'Resultados reconocidos',
    text: 'Tus marcas quedan registradas bajo el estándar internacional PLU USA.',
  },
]

export const MEMBERSHIP_REQUIREMENTS = [
  {
    id: 'id',
    title: 'Documento vigente',
    text: 'DNI o pasaporte al día para validar identidad.',
  },
  {
    id: 'age',
    title: 'Edad mínima 14 años',
    text: 'Menores de 18 necesitan autorización de tutor legal.',
  },
  {
    id: 'health',
    title: 'Apto médico o DJ',
    text: 'Certificado médico o declaración jurada de salud vigente.',
  },
  {
    id: 'photo',
    title: 'Foto para credencial',
    text: 'Imagen reciente en formato digital para la tarjeta de miembro.',
  },
]

export const MEMBERSHIP_CREDENTIAL_SAMPLE = {
  athlete: 'Martín Delgado',
  affiliateCode: 'PA-2847',
  season: 'Temporada 2026',
  status: 'Afiliación activa',
}

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
  tagline:
    'El primer gran meet oficial de PLU ARG. Categorías raw y equipped, jueces certificados y resultados reconocidos por PLU USA.',
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

export const PITBULL_VENUE = {
  name: 'Maximal Strength Club',
  address: 'Buenos Aires, Argentina',
  mapsUrl: 'https://maps.google.com/?q=Maximal+Strength+Club+Buenos+Aires+Argentina',
  mapsEmbedUrl:
    'https://maps.google.com/maps?q=Maximal+Strength+Club+Buenos+Aires+Argentina&output=embed&z=15',
}

export const PITBULL_BENEFITS_ATHLETES = [
  { id: 'standard', icon: 'Globe', title: 'Resultados PLU USA', desc: 'Reconocidos internacionalmente.' },
  { id: 'credential', icon: 'QrCode', title: 'Credencial digital', desc: 'Card y QR de ingreso al confirmar.' },
  { id: 'judging', icon: 'ShieldCheck', title: 'Jueces certificados', desc: 'Panel técnico PLU USA en tres plataformas.' },
  { id: 'ops', icon: 'ClipboardList', title: 'Gestión sin papeles', desc: 'Pesaje, sorteo y cargas desde la app.' },
]

export const PITBULL_BENEFITS_SPECTATORS = [
  { id: 'show', icon: 'Zap', title: 'Show en vivo', desc: 'Dos días, tres plataformas simultáneas.' },
  { id: 'access', icon: 'Ticket', title: 'Sin afiliación', desc: 'Solo DNI. Online más barato que en puerta.' },
  { id: 'community', icon: 'Users', title: 'Comunidad PLU', desc: 'Atletxs de todo el país. Ambiente institucional.' },
]

export const PITBULL_SCHEDULE = [
  {
    day: 'Día 1',
    date: '12 Dic',
    items: [
      { time: 'AM', label: 'Pesaje — Categorías del Día 1' },
      { time: 'MED', label: 'Briefing técnico obligatorio' },
      { time: 'PM', label: 'Competencia — Categorías del Día 1' },
    ],
  },
  {
    day: 'Día 2',
    date: '13 Dic',
    items: [
      { time: 'AM', label: 'Pesaje — Categorías del Día 2' },
      { time: 'MED', label: 'Briefing técnico obligatorio' },
      { time: 'PM', label: 'Competencia + Entrega de premios' },
    ],
  },
]

export const PITBULL_CATEGORY_CARDS = [
  { id: 'equipment', title: 'Equipamiento', text: `${PITBULL_CLASSIC.categories.join(' · ')} (ejemplo)` },
  { id: 'age', title: 'Edad', text: `${PITBULL_CLASSIC.divisions.join(' · ')} (ejemplo)` },
  { id: 'weight', title: 'Peso corporal', text: 'Franjas masculinas y femeninas (ejemplo).' },
  { id: 'gender', title: 'Género', text: 'Competencia separada M / F (ejemplo).' },
]

export const PITBULL_CREDENTIAL_SAMPLE = {
  athlete: 'Agustin Di Santo',
  affiliateCode: 'PA-2609',
}

// Datos de ejemplo para Podium/ResultCard — se reactivan en ResultsPage cuando haya
// resultados reales publicados (hoy la página muestra el estado pre-lanzamiento).
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
    shortLabel: 'Afil.',
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
    shortLabel: 'Inscr.',
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
    shortLabel: 'Pagos',
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
    shortLabel: 'Soporte',
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

export const COMMUNITY_GYM_PLACEHOLDERS = [
  { id: 'gym-ba', label: 'Buenos Aires', sub: 'Maximal Strength Club' },
  { id: 'gym-cba', label: 'Córdoba', sub: 'Iron House' },
  { id: 'gym-ros', label: 'Rosario', sub: 'Pitbull Barbell' },
  { id: 'gym-mdz', label: 'Mendoza', sub: 'En expansión' },
  { id: 'gym-nqn', label: 'Neuquén', sub: 'En expansión' },
  { id: 'gym-tuc', label: 'Tucumán', sub: 'En expansión' },
]

/** Gimnasios adheridos a la red PLU ARG (mock hasta integrar backend). */
export const COMMUNITY_AFFILIATED_GYMS = [
  {
    id: 'gym-maximal',
    name: 'Maximal Strength Club',
    city: 'La Plata',
    province: 'Buenos Aires',
    status: 'active',
  },
  {
    id: 'gym-pitbull',
    name: 'Pitbull Barbell',
    city: 'Rosario',
    province: 'Santa Fe',
    status: 'active',
  },
  {
    id: 'gym-iron',
    name: 'Iron House',
    city: 'Córdoba',
    province: 'Córdoba',
    status: 'active',
  },
  {
    id: 'gym-mdz',
    name: 'Andes Strength',
    city: 'Mendoza',
    province: 'Mendoza',
    status: 'soon',
  },
  {
    id: 'gym-nqn',
    name: 'Patagonia Barbell',
    city: 'Neuquén',
    province: 'Neuquén',
    status: 'soon',
  },
]

/** Afiliaciones recientes visibles en la red pública (mock). */
export const COMMUNITY_RECENT_MEMBERS = [
  {
    id: 'mem-feed-001',
    name: 'Martina R.',
    gym: 'Maximal Power',
    province: 'Buenos Aires',
    division: 'Open · Raw',
    memberCode: 'PLU-ARG-2026-001',
    affiliatedAt: '2026-02-01',
  },
  {
    id: 'mem-feed-002',
    name: 'Nicolás A.',
    gym: 'Pitbull Barbell',
    province: 'Córdoba',
    division: 'Junior · Classic Raw',
    memberCode: 'PLU-ARG-2026-002',
    affiliatedAt: '2026-03-10',
  },
  {
    id: 'mem-feed-003',
    name: 'Lucía M.',
    gym: 'Iron House',
    province: 'Córdoba',
    division: 'Open · Raw',
    memberCode: 'PLU-ARG-2026-003',
    affiliatedAt: '2026-03-18',
  },
  {
    id: 'mem-feed-004',
    name: 'Tomás V.',
    gym: 'Maximal Power',
    province: 'Buenos Aires',
    division: 'Master · Equipped',
    memberCode: 'PLU-ARG-2026-004',
    affiliatedAt: '2026-03-22',
  },
  {
    id: 'mem-feed-005',
    name: 'Camila S.',
    gym: 'Pitbull Barbell',
    province: 'Santa Fe',
    division: 'Open · Raw',
    memberCode: 'PLU-ARG-2026-005',
    affiliatedAt: '2026-03-28',
  },
]

export const COMMUNITY_TESTIMONIAL_PLACEHOLDERS = [
  {
    id: 'testimonio-1',
    role: 'Atleta · Open',
    text: 'Próximamente — voces de atletas que compiten bajo el estándar PLU ARG.',
  },
  {
    id: 'testimonio-2',
    role: 'Coach · Gimnasio afiliado',
    text: 'Próximamente — historias desde la red de sedes aliadas.',
  },
  {
    id: 'testimonio-3',
    role: 'Juez certificado',
    text: 'Próximamente — mirada del cuerpo arbitral nacional.',
  },
]

export const ADMIN_NAV_GROUPS = [
  {
    labelKey: 'admin.nav.groups.management',
    items: [
      ['dashboard', 'admin.nav.dashboard', 'LayoutDashboard'],
      ['athletes', 'admin.nav.athletes', 'Users'],
      ['memberships', 'admin.nav.memberships', 'BadgeCheck'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.events',
    items: [
      ['events', 'admin.nav.events', 'Calendar'],
      ['registrations', 'admin.nav.registrations', 'ClipboardList'],
      ['checkin', 'admin.nav.checkin', 'ScanLine'],
      ['results', 'admin.nav.results', 'Trophy'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.finance',
    items: [
      ['payments', 'admin.nav.payments', 'CreditCard'],
      ['exports', 'admin.nav.exports', 'Download'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.system',
    items: [
      ['users', 'admin.nav.users', 'Shield'],
      ['audit', 'admin.nav.audit', 'ScrollText'],
    ],
  },
]

export const ADMIN_SECTIONS = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
