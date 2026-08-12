import { PRICING } from '../constants.js'
import { PITBULL_VENUE_DATA } from '../events.js'

export const HOME_STATS = [
  { value: '2026', label: 'Temporada en curso' },
  { value: 'PLU USA', label: 'Estándar internacional' },
]

/** Banda de accesos rápidos bajo el hero — IA federativa */
export const HOME_QUICK_LINKS = [
  { key: 'members', labelKey: 'nav.members' },
  { key: 'events', labelKey: 'nav.calendarOfficial' },
  { key: 'results', labelKey: 'nav.results' },
  { key: 'records', labelKey: 'nav.records' },
  { key: 'rulebook', labelKey: 'nav.rulebook' },
]

export const ABOUT_INTRO = {
  eyebrow: 'Quiénes somos',
  title: 'Un estándar para afiliar, competir y publicar.',
  titleLead: 'Un estándar para afiliar, competir',
  titleAccent: 'y publicar.',
  description:
    'PLU Argentina conecta atletas, gimnasios y jueces con afiliación anual, calendario oficial y resultados alineados a PLU USA.',
  descriptionLead: 'PLU Argentina conecta atletas, gimnasios y jueces.',
  descriptionMeta: 'Afiliación anual, calendario oficial y resultados alineados a PLU USA.',
  cta: 'Conocer nuestra comunidad',
}

export const HOME_MEMBERSHIP = {
  eyebrow: 'Afiliación anual',
  title: 'Habilitación para competir',
  titleLead: 'Habilitación',
  titleAccent: 'para competir',
  description:
    'Pago online, credencial QR en tu perfil y calendario oficial bajo el estándar PLU USA.',
  cta: 'Ver planes',
  planLabel: 'Atleta adulto',
  seasonNote: 'Temporada 26/27',
  cardCta: 'Afiliarme',
}

export const HOME_RESULTS = {
  eyebrow: 'Resultados',
  status: 'Pendiente',
  title: 'Ranking oficial, al cierre de cada meet.',
  description:
    'Categorías, totales y archivo histórico del calendario — con exportación lista para PLU USA.',
  metaEvent: 'Pitbull Classic',
  metaExport: 'Export PLU USA',
  classes: {
    open83: 'Open · −83 kg',
    open74: 'Open · −74 kg',
    women63: 'Women · −63 kg',
  },
}

export const HOME_RULEBOOK = {
  eyebrow: 'Reglamento · Rulebook',
  title: 'Reglas oficiales de competencia PLU.',
  description: 'Normativa, categorías y equipamiento para competir bajo un mismo criterio.',
  topics: ['Categorías', 'Divisiones', 'Equipamiento'],
  cta: 'Ver categorías y divisiones',
}

export const HOME_COMMUNITY = {
  eyebrow: 'Comunidad',
  title: 'Gimnasios y atletas bajo el mismo estándar.',
  description:
    'Sedes adheridas y afiliados que compiten en el calendario oficial de PLU Argentina.',
  cta: 'Ver comunidad',
  recentLabel: 'Afiliados recientes',
  liveLabel: 'En vivo',
  visualCaption: 'Galería de la comunidad · próximamente',
  stats: [],
}

export const HOME_FAQ = {
  eyebrow: 'Ayuda',
  title: '¿Tenés dudas?',
  description: 'Afiliación, inscripciones y reglamento: respuestas claras en un solo lugar.',
  ctaFaq: 'Ver FAQ',
  ctaContact: 'Contacto',
}

/** Reserva de copy FAQ (página /faq). Ya no se renderiza en Home. */
export const HOME_FAQ_ITEMS = [
  {
    q: '¿Cómo me afilio a PLU ARG?',
    a: 'Entrás a la página de Afiliación, completás tus datos, pagás con Mercado Pago y quedás registrado al instante.',
  },
  {
    q: '¿Necesito estar afiliado para inscribirme a Pitbull Classic?',
    a: 'Podés crear y pagar la inscripción aunque la afiliación esté pendiente. Si el evento exige afiliación, en el check-in de puerta necesitás afiliación activa y vigente. El combo afiliación + evento resuelve ambos en un solo pago.',
  },
  {
    q: '¿Dónde veo los resultados de un evento?',
    a: 'En la sección Resultados, disponibles públicamente apenas se normalizan después de cada evento.',
  },
]

export const HOME_MEMBERSHIP_FEATURES = [
  'Cuenta de atleta',
  'Pago online sin WhatsApp',
  'Credencial digital QR',
]

export const HOME_MEMBERSHIP_BENEFITS = [
  {
    id: 'events',
    title: 'Calendario oficial',
    text: 'Inscripción a meets PLU Argentina desde tu cuenta.',
  },
  {
    id: 'credential',
    title: 'Credencial digital QR',
    text: 'Estado de afiliación y pase de check-in en un solo código.',
  },
  {
    id: 'checkout',
    title: 'Pago online',
    text: 'Mercado Pago o transferencia con comprobante en la plataforma. Sin WhatsApp.',
  },
  {
    id: 'results',
    title: 'Resultados bajo estándar PLU',
    text: 'Marcas publicadas con el mismo criterio que PLU USA.',
  },
  {
    id: 'access',
    title: 'Perfil de atleta',
    text: 'Afiliación, eventos e historial siempre a mano.',
  },
  {
    id: 'combo',
    title: 'Combo afiliación + meet',
    text: 'Cuando hay oferta vigente, un solo pago para ambos derechos.',
  },
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
    'Pago online, activación y credencial QR en tu perfil. Una afiliación anual para el calendario oficial.',
  cta: 'Comenzar mi afiliación',
  perks: ['Pago único anual', 'Mercado Pago', 'Credencial QR'],
}

export const MEMBERSHIP_PLANS = [
  {
    id: 'athlete',
    title: 'Atleta adulto',
    kicker: 'Plan anual',
    price: PRICING.membership,
    period: 'anual',
    features: ['Mayores de 18 años', 'Credencial digital', 'Eventos del calendario PLU ARG'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'junior',
    title: 'Atleta juvenil',
    kicker: 'Plan anual',
    price: PRICING.membershipJunior,
    period: 'anual',
    features: ['14 a 17 años', 'Credencial digital', 'Eventos juveniles PLU ARG'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'combo',
    title: 'Pitbull Classic',
    kicker: 'Combo temporada',
    price: PRICING.combo,
    period: 'temporada 26/27',
    features: ['Afiliación anual', 'Inscripción Pitbull Classic', 'Un solo trámite'],
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
    id: 'credential',
    title: 'Credencial digital QR',
    text: 'Estado de afiliación y pase de ingreso en un solo código estable.',
  },
  {
    id: 'profile',
    title: 'Perfil y estado visibles',
    text: 'Después del pago ves la afiliación activa y tu QR en el panel.',
  },
  {
    id: 'events',
    title: 'Calendario oficial',
    text: 'Inscripción a meets PLU ARG desde la misma cuenta.',
  },
  {
    id: 'standard',
    title: 'Estándar PLU USA',
    text: 'Mismas reglas y criterio de publicación que el circuito internacional.',
  },
]

export const MEMBERSHIP_INSTITUTIONAL = {
  eyebrow: 'Powerlifting United',
  title: 'Estándar federativo',
  text:
    'PLU Argentina organiza afiliaciones, competencias y resultados con el mismo criterio que Powerlifting United. Operación local: Maximal.',
}

export const MEMBERSHIP_REQUIREMENTS = [
  {
    id: 'id',
    title: 'Documento',
    text: 'DNI o pasaporte vigente. Sin eso no se valida la solicitud.',
  },
  {
    id: 'age',
    title: 'Edad',
    text: 'Desde 14 años. Menores de 18: autorización del tutor.',
  },
  {
    id: 'health',
    title: 'Aptitud',
    text: 'Certificado médico o declaración jurada de salud al día.',
  },
  {
    id: 'photo',
    title: 'Foto',
    text: 'Retrato digital reciente, de frente y con buena luz.',
  },
]

export const MEMBERSHIP_CREDENTIAL_SAMPLE = {
  athlete: 'Agustin Di Santo',
  affiliateCode: 'PA-2847',
  season: 'Temporada 26/27',
  status: 'Afiliación activa',
}

export const MEMBERSHIP_ANNUAL_STEPS = [
  {
    step: '1',
    title: 'Creás tu cuenta',
    text: 'Perfil, documento y datos de competencia.',
  },
  {
    step: '2',
    title: 'Pagás online',
    text: 'Mercado Pago o transferencia con comprobante en la plataforma.',
  },
  {
    step: '3',
    title: 'Quedás activo con QR',
    text: 'Estado de afiliación y credencial digital en tu perfil.',
  },
]

export const MEMBERSHIP_FAQ = [
  {
    id: 'duration',
    q: '¿Cuánto dura la afiliación?',
    a: 'La afiliación anual rige desde la acreditación del pago hasta el 31 de diciembre del mismo año calendario.',
  },
  {
    id: 'required',
    q: '¿Necesito estar afiliado para competir?',
    a: 'Podés crear y pagar la inscripción aunque la afiliación esté pendiente. Si el evento exige afiliación, el check-in en puerta requiere afiliación activa y vigente. El combo afiliación + evento cubre ambos en un solo trámite.',
  },
  {
    id: 'data',
    q: '¿Qué datos necesito cargar?',
    a: 'Datos personales, documento, contacto, ubicación, gimnasio y sexo competitivo. Menores de 18 requieren autorización del tutor.',
  },
  {
    id: 'status',
    q: '¿Cómo se confirma mi estado?',
    a: 'Recibís confirmación en pantalla con referencia de pago. El estado activo queda visible en tu perfil y credencial digital.',
  },
  {
    id: 'pitbull',
    q: '¿La afiliación incluye la inscripción a Pitbull Classic?',
    a: 'No. La afiliación habilita a competir; cada meet se gestiona por separado, salvo en el plan combo.',
  },
  {
    id: 'menores',
    q: '¿Pueden afiliarse atletas menores?',
    a: 'Sí, desde los 14 años con autorización del tutor legal y categorías juveniles habilitadas.',
  },
  {
    id: 'rulebook',
    q: '¿Dónde veo el reglamento?',
    a: 'El reglamento oficial de PLU Argentina está publicado en la sección Reglamento del sitio, con categorías, divisiones y normas de competencia vigentes.',
  },
]

export const MEMBERSHIP_COMPARE_ROWS = [
  { label: 'Código de atleta PLU ARG', athlete: true, junior: true, combo: true },
  { label: 'Tarjeta digital de miembro', athlete: true, junior: true, combo: true },
  { label: 'Acceso a eventos oficiales', athlete: true, junior: true, combo: true },
  { label: 'Inscripción Pitbull Classic', athlete: false, junior: false, combo: true },
  { label: 'Vigencia temporada 26/27', athlete: true, junior: true, combo: true },
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
    'Pitbull Classic reúne atletas de PLU Argentina en una competencia oficial preparada para registrar inscripciones, categorías, resultados y reportes bajo el estándar de Powerlifting United.',
  date: '12 y 13 de diciembre de 2026',
  dateShort: '12–13 dic 2026',
  dateDay: '12–13',
  dateMonth: 'Dic',
  venue: 'La Troupe Multiespacio',
  location: 'Banfield, Buenos Aires',
  slots: 120,
  registered: 48,
  categories: ['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited'],
  divisions: ['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters'],
}

export const PITBULL_VENUE = PITBULL_VENUE_DATA

export const PITBULL_BENEFITS_ATHLETES = [
  { id: 'standard', icon: 'Globe', title: 'Resultados PLU USA', desc: 'Publicación y exportación alineadas al ecosistema internacional.' },
  { id: 'credential', icon: 'QrCode', title: 'Credencial digital', desc: 'Card y QR de ingreso al confirmar la inscripción.' },
  { id: 'judging', icon: 'ShieldCheck', title: 'Jueces certificados', desc: 'Panel técnico bajo estándar PLU USA.' },
  { id: 'ops', icon: 'ClipboardList', title: 'Operación trazable', desc: 'Pesaje, sorteo y cargas registrados en la plataforma.' },
]

export const PITBULL_BENEFITS_SPECTATORS = [
  { id: 'show', icon: 'Ticket', title: 'Entrada general', desc: 'Dos jornadas de competencia en La Troupe Multiespacio, Banfield.' },
  { id: 'access', icon: 'Ticket', title: 'Sin afiliación', desc: 'Solo DNI. Compra online o en puerta el día del evento.' },
  { id: 'community', icon: 'Users', title: 'Calendario PLU ARG', desc: 'Meet oficial del circuito competitivo local.' },
]

export const PITBULL_ATHLETE_GROUPS = [
  {
    id: 'registration',
    label: 'Antes del meet',
    items: [
      {
        id: 'membership',
        title: 'Afiliación',
        text: 'Año calendario o combo al inscribirte.',
      },
      {
        id: 'category',
        title: 'Categoría',
        text: 'Modalidad, edad y peso (reglamento).',
      },
      {
        id: 'confirmation',
        title: 'Validación',
        text: 'Pago e inscripción confirmados.',
      },
    ],
  },
  {
    id: 'meet',
    label: 'Día de competencia',
    items: [
      {
        id: 'weighin',
        title: 'Pesaje',
        text: 'Ventana oficial de tu jornada.',
      },
      {
        id: 'results',
        title: 'Resultados',
        text: 'Publicados acá desde LiftingCast.',
      },
    ],
  },
]

/** @deprecated Usar PITBULL_ATHLETE_GROUPS */
export const PITBULL_ATHLETE_NOTES = PITBULL_ATHLETE_GROUPS.flatMap((group) => group.items)

export const PITBULL_INSTITUTIONAL = {
  eyebrow: 'Calendario oficial',
  title: 'Evento oficial dentro de Powerlifting United',
  text: 'Pitbull Classic forma parte del calendario competitivo de PLU Argentina y permite gestionar inscripciones, categorías, resultados y reportes bajo un estándar consistente.',
  points: [
    'Inscripciones y afiliaciones registradas en la plataforma PLU ARG',
    'Resultados normalizados desde LiftingCast para reportes a PLU USA',
    'Operación alineada a reglamento y estándares de competencia PLU',
  ],
}

export const PITBULL_FAQ = [
  {
    id: 'affiliation',
    q: '¿Necesito estar afiliado para competir?',
    a: 'Podés crear y pagar la inscripción aunque la afiliación esté pendiente. Si Pitbull Classic exige afiliación, en el check-in de puerta necesitás afiliación activa del año o el combo afiliación + inscripción.',
  },
  {
    id: 'confirmation',
    q: '¿Cómo confirmo mi inscripción?',
    a: 'Completás tu perfil, abonás la inscripción (o el combo) y seguís el estado en tu panel. Con el pago acreditado, la credencial QR queda disponible para el ingreso.',
  },
  {
    id: 'rulebook',
    q: '¿Dónde veo el reglamento?',
    a: 'El reglamento oficial PLU ARG está publicado en la sección Reglamento de este sitio. Las categorías del evento se rigen por esa normativa.',
  },
  {
    id: 'results',
    q: '¿Cuándo se publican los resultados?',
    a: 'Los resultados se publican en la plataforma una vez finalizado el meet y procesada la planilla de LiftingCast.',
  },
  {
    id: 'contact',
    q: '¿A quién contacto si tengo dudas?',
    a: 'Podés escribir al equipo PLU ARG desde la sección Contacto. Para consultas operativas del evento, indicá Pitbull Classic en el asunto.',
  },
]

export const PITBULL_SCHEDULE = [
  {
    day: 'Día 1',
    date: '12 Dic',
    items: [
      { time: 'AM', label: 'Categorías del Día 1' },
      { time: 'MED', label: 'Antes de plataforma' },
      { time: 'PM', label: 'Categorías del Día 1' },
    ],
  },
  {
    day: 'Día 2',
    date: '13 Dic',
    items: [
      { time: 'AM', label: 'Categorías del Día 2' },
      { time: 'MED', label: 'Antes de plataforma' },
      { time: 'PM', label: 'Competencia + premios' },
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

// Datos de ejemplo para Podium/ResultCard: se reactivan en ResultsPage cuando haya
// resultados reales publicados (hoy la página muestra el estado pre-lanzamiento).
export const RECENT_RESULTS = [
  { athlete: 'Martina Rivas', event: 'Pitbull Classic 2025', total: '412.5 kg', place: '1° Open Raw F', date: '2025-08-10' },
  { athlete: 'Nicolás Aguirre', event: 'Argentina Open 2025', total: '580 kg', place: '2° Junior Classic', date: '2025-10-18' },
  { athlete: 'Lucía Fernández', event: 'Rookie Meet Córdoba', total: '325 kg', place: '1° Youth', date: '2025-09-05' },
]

export const FAQ_ITEMS = [
  {
    q: '¿Quién puede afiliarse a PLU ARG?',
    a: 'Cualquier atleta de powerlifting residente en Argentina o que compita bajo bandera argentina en eventos PLU ARG. También gimnasios y entrenadores pueden registrarse como aliados operativos.',
  },
  {
    q: '¿La afiliación es obligatoria para competir?',
    a: 'Podés crear y pagar la inscripción aunque la afiliación esté pendiente. Si el evento exige afiliación, el check-in en puerta requiere afiliación activa del año o el combo afiliación + evento.',
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
        a: 'Es válida por año calendario, desde el pago acreditado hasta el 31 de diciembre del mismo año.',
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
        a: 'No es condición para crear ni pagar la inscripción. Si el evento exige afiliación, sí la necesitás activa al momento del check-in en puerta.',
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
        a: 'No. PLU USA solo audita reportes y exportaciones. Las consultas operativas se resuelven con Maximal o PLU ARG.',
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
  'No competimos entre gimnasios. Competimos bajo las mismas reglas, para que un récord en Rosario valga lo mismo que uno en Buenos Aires.'

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
    division: 'Junior · Raw With Wraps',
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
    division: 'Masters · Single-Ply',
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
    text: 'Próximamente: voces de atletas que compiten bajo el estándar PLU ARG.',
  },
  {
    id: 'testimonio-2',
    role: 'Coach · Gimnasio afiliado',
    text: 'Próximamente: historias desde la red de sedes aliadas.',
  },
  {
    id: 'testimonio-3',
    role: 'Juez certificado',
    text: 'Próximamente: mirada del cuerpo arbitral nacional.',
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
      ['grid', 'admin.nav.grid', 'LayoutGrid'],
      ['checkin', 'admin.nav.checkin', 'ScanLine'],
      ['results', 'admin.nav.results', 'Trophy'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.finance',
    items: [
      ['shop', 'admin.nav.shop', 'ShoppingBag'],
      ['payments', 'admin.nav.payments', 'CreditCard'],
      ['pricing', 'admin.nav.pricing', 'BadgeDollarSign'],
      ['exports', 'admin.nav.exports', 'Download'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.system',
    items: [
      ['users', 'admin.nav.users', 'Shield'],
      ['roles', 'admin.nav.roles', 'KeyRound'],
      ['audit', 'admin.nav.audit', 'ScrollText'],
      ['analytics', 'admin.nav.analytics', 'Activity'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.pluUsa',
    items: [
      ['plu-usa', 'admin.nav.pluUsa', 'Eye'],
    ],
  },
]

export const ADMIN_SECTIONS = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
