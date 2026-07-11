import { PRICING } from '../constants.js'

export const HOME_STATS = [
  { value: '2026', label: 'Current season' },
  { value: 'PLU USA', label: 'International standard' },
]

export const HOME_QUICK_LINKS = [
  { key: 'members', labelKey: 'nav.members' },
  { key: 'pitbull', labelKey: 'nav.pitbull' },
  { key: 'events', labelKey: 'nav.events' },
  { key: 'results', labelKey: 'nav.results' },
  { key: 'rulebook', labelKey: 'nav.rulebook' },
]

export const ABOUT_INTRO = {
  eyebrow: 'About us',
  title: 'Memberships, competitions and results under one standard.',
  description:
    'Powerlifting United Argentina connects athletes, gyms and referees with annual membership, an official calendar and results aligned with the PLU USA standard.',
}

export const HOME_MEMBERSHIP = {
  eyebrow: 'Annual membership',
  title: 'Enabled to compete',
  description: 'Annual membership gives you access to the official PLU Argentina calendar.',
  cta: 'View plans',
  planLabel: 'Adult athlete',
  cardCta: 'Join',
}

export const HOME_RESULTS = {
  eyebrow: 'Results',
  title: 'No results published yet.',
  description:
    'Pitbull Classic results will be posted here after the event, with export for PLU USA.',
}

export const HOME_RULEBOOK = {
  eyebrow: 'Rulebook',
  title: 'Official PLU competition rules.',
  cta: 'View categories and divisions',
}

export const HOME_COMMUNITY = {
  eyebrow: 'Community',
  title: 'PLU gyms and athletes',
  description:
    'Browse affiliate venues and members competing on the official PLU Argentina calendar.',
  cta: 'View community',
  visualCaption: 'Community gallery · coming soon',
  stats: [],
}

export const HOME_FAQ = {
  eyebrow: 'FAQ',
  title: 'Membership, events and results.',
  description:
    'Direct answers about procedures, registrations and the rulebook.',
  cta: 'View all questions',
  quickLinks: [
    { label: 'Membership', view: 'members' },
    { label: 'Pitbull Classic', view: 'pitbull' },
    { label: 'Contact', view: 'contact' },
  ],
}

export const HOME_FAQ_ITEMS = [
  {
    q: 'How do I join PLU ARG?',
    a: 'Go to the Membership page, complete your details, pay with Mercado Pago and you are registered instantly.',
  },
  {
    q: 'Do I need to be a member to register for Pitbull Classic?',
    a: 'Yes. Annual membership is required to register for any official PLU ARG event.',
  },
  {
    q: 'Where can I see event results?',
    a: 'In the Results section, publicly available as soon as they are normalized after each event.',
  },
]

export const HOME_MEMBERSHIP_FEATURES = [
  'PLU ARG calendar events',
  'Digital member credential',
  'Results under PLU USA standard',
]

export const ABOUT_PILLARS = [
  {
    id: 'standard',
    icon: 'Globe2',
    title: 'International standard',
    text: 'Rules, divisions and categories aligned with the circuit recognized by PLU USA.',
  },
  {
    id: 'ops',
    icon: 'ClipboardList',
    title: 'No spreadsheet management',
    text: 'Membership, registration and payment in one place, for athletes and organizers.',
  },
  {
    id: 'community',
    icon: 'Users',
    title: 'Growing community',
    text: 'Gyms and athletes nationwide competing under the same system.',
  },
]

export const MEMBERSHIP_CTA = {
  eyebrow: 'Start today',
  hint: 'Adult athlete fee',
  description:
    'Membership is paid once per year. Choose your plan and complete the process online with Mercado Pago or manual validation.',
  cta: 'Start my membership',
  perks: ['Single annual payment', 'Mercado Pago', 'Manual validation'],
}

export const MEMBERSHIP_PLANS = [
  {
    id: 'athlete',
    title: 'Athlete',
    price: PRICING.membership,
    period: 'annual',
    features: ['Ages 18+', 'Digital credential', 'PLU ARG calendar events'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'junior',
    title: 'Junior',
    price: PRICING.membershipJunior,
    period: 'annual',
    features: ['Ages 10–17', 'Digital credential', 'PLU ARG junior events'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'combo',
    title: 'Pitbull combo',
    price: PRICING.combo,
    period: '2026 season',
    features: ['Annual membership', 'Pitbull Classic registration', 'Single checkout'],
    highlighted: true,
    procedureType: 'both',
    compareWith: [
      { label: 'Annual membership', price: PRICING.membership },
      { label: 'Pitbull Classic registration', price: PRICING.event },
    ],
  },
]

export const MEMBERSHIP_BENEFITS = [
  {
    id: 'events',
    title: 'PLU ARG calendar events',
    text: 'Lets you register for official meets during the year.',
  },
  {
    id: 'registry',
    title: 'Athlete code and credential',
    text: 'You receive your federation ID in digital format.',
  },
  {
    id: 'results',
    title: 'Results on your profile',
    text: 'Your marks are recorded under the PLU standard.',
  },
  {
    id: 'standard',
    title: 'Aligned with PLU USA',
    text: 'Same rules and reporting as the international circuit.',
  },
]

export const MEMBERSHIP_INSTITUTIONAL = {
  eyebrow: 'Powerlifting United',
  title: 'Federation standard',
  text:
    'PLU Argentina runs memberships, competitions and results with the same criteria as Powerlifting United. Local operations: Maximal.',
}

export const MEMBERSHIP_REQUIREMENTS = [
  {
    id: 'id',
    title: 'Photo ID',
    text: 'Valid national ID or passport.',
  },
  {
    id: 'age',
    title: 'Minimum age 14',
    text: 'Under 18: guardian authorization required.',
  },
  {
    id: 'health',
    title: 'Medical clearance or affidavit',
    text: 'Current certificate or health affidavit.',
  },
  {
    id: 'photo',
    title: 'Credential photo',
    text: 'Recent digital image.',
  },
]

export const MEMBERSHIP_CREDENTIAL_SAMPLE = {
  athlete: 'Martín Delgado',
  affiliateCode: 'PA-2847',
  season: '2026 season',
  status: 'Active membership',
}

export const MEMBERSHIP_ANNUAL_STEPS = [
  {
    step: '1',
    title: 'Complete your details',
    text: 'Profile, contact and competition data.',
  },
  {
    step: '2',
    title: 'Submit your request',
    text: 'Confirm the order and payment method.',
  },
  {
    step: '3',
    title: 'Team validation',
    text: 'PLU ARG reviews your information and confirms payment.',
  },
  {
    step: '4',
    title: 'You are active',
    text: 'You can register for official calendar events.',
  },
]

export const MEMBERSHIP_FAQ = [
  {
    id: 'duration',
    q: 'How long does membership last?',
    a: 'Annual membership runs from payment confirmation until December 31 of the same calendar year.',
  },
  {
    id: 'required',
    q: 'Do I need to be a member to compete?',
    a: 'Yes. Valid membership is required to register for any official PLU Argentina event.',
  },
  {
    id: 'data',
    q: 'What information do I need to provide?',
    a: 'Personal details, ID, contact, location, gym and competitive sex. Under 18 requires guardian authorization.',
  },
  {
    id: 'status',
    q: 'How is my status confirmed?',
    a: 'You receive on-screen confirmation with a payment reference. Active status appears on your profile and digital credential.',
  },
  {
    id: 'pitbull',
    q: 'Does membership include Pitbull Classic registration?',
    a: 'No. Membership enables you to compete; each meet is managed separately, except on the combo plan.',
  },
  {
    id: 'menores',
    q: 'Can minors join?',
    a: 'Yes, from age 14 with guardian authorization and enabled junior categories.',
  },
  {
    id: 'rulebook',
    q: 'Where can I find the rulebook?',
    a: 'The official PLU Argentina rulebook is published in the Rulebook section of the site, with current categories, divisions and competition rules.',
  },
]

export const MEMBERSHIP_COMPARE_ROWS = [
  { label: 'PLU ARG athlete code', athlete: true, junior: true, combo: true },
  { label: 'Digital member card', athlete: true, junior: true, combo: true },
  { label: 'Access to official events', athlete: true, junior: true, combo: true },
  { label: 'Pitbull Classic registration', athlete: false, junior: false, combo: true },
  { label: '2026 season validity', athlete: true, junior: true, combo: true },
]

export const PLATFORM_SECTIONS = [
  { key: 'members', group: 'Competition', title: 'Membership', desc: 'Annual plans, athlete code and federation backing.' },
  { key: 'pitbull', group: 'Competition', title: 'Pitbull Classic', desc: 'The flagship meet of the PLU ARG season.' },
  { key: 'events', group: 'Competition', title: 'Events', desc: 'Competition calendar and meet registrations.' },
  { key: 'results', group: 'Competition', title: 'Results', desc: 'Official score sheets, totals and podiums.' },
  { key: 'rulebook', group: 'Institutional', title: 'Rulebook', desc: 'Rules, categories and equipment.' },
  { key: 'community', group: 'Institutional', title: 'Community', desc: 'Affiliate gyms, referees and athlete network.' },
  { key: 'faq', group: 'Institutional', title: 'FAQ', desc: 'Answers about membership, payments and competition.' },
  { key: 'contact', group: 'Institutional', title: 'Contact', desc: 'Operational support and federation inquiries.' },
]

export const PITBULL_CLASSIC = {
  title: 'Pitbull Classic',
  tagline:
    'Pitbull Classic brings PLU Argentina athletes together in an official meet built to track registrations, categories, results and reports under Powerlifting United standards.',
  date: 'December 12–13, 2026',
  dateDay: '12–13',
  dateMonth: 'Dec',
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
  { id: 'standard', icon: 'Globe', title: 'PLU USA results', desc: 'Publishing and export aligned with the international ecosystem.' },
  { id: 'credential', icon: 'QrCode', title: 'Digital credential', desc: 'Card and entry QR once registration is confirmed.' },
  { id: 'judging', icon: 'ShieldCheck', title: 'Certified referees', desc: 'Technical panel under PLU USA standards.' },
  { id: 'ops', icon: 'ClipboardList', title: 'Traceable operations', desc: 'Weigh-in, draw and attempts recorded on the platform.' },
]

export const PITBULL_BENEFITS_SPECTATORS = [
  { id: 'show', icon: 'Ticket', title: 'General admission', desc: 'Two competition days at Maximal Strength Club.' },
  { id: 'access', icon: 'Ticket', title: 'No membership', desc: 'ID only. Buy online or at the door on event day.' },
  { id: 'community', icon: 'Users', title: 'PLU ARG calendar', desc: 'Official meet on the local competitive circuit.' },
]

export const PITBULL_ATHLETE_GROUPS = [
  {
    id: 'registration',
    label: 'Registration',
    items: [
      {
        id: 'membership',
        title: 'Membership',
        text: 'Active PLU ARG membership for the calendar year, or the membership plus registration combo when you sign up.',
      },
      {
        id: 'category',
        title: 'Category',
        text: 'Equipment, age division and bodyweight per the PLU ARG rulebook.',
      },
      {
        id: 'confirmation',
        title: 'Validation',
        text: 'The team confirms payment and registration before enabling your credential and slot.',
      },
    ],
  },
  {
    id: 'meet',
    label: 'Meet and results',
    items: [
      {
        id: 'weighin',
        title: 'Weigh-in',
        text: 'Official window on your competition day. Schedule published by the organizing team.',
      },
      {
        id: 'results',
        title: 'Results',
        text: 'Totals published on this platform after the meet, from the LiftingCast sheet.',
      },
    ],
  },
]

/** @deprecated Use PITBULL_ATHLETE_GROUPS */
export const PITBULL_ATHLETE_NOTES = PITBULL_ATHLETE_GROUPS.flatMap((group) => group.items)

export const PITBULL_INSTITUTIONAL = {
  eyebrow: 'Official calendar',
  title: 'Official event within Powerlifting United',
  text: 'Pitbull Classic is part of the PLU Argentina competitive calendar and supports registrations, categories, results and reporting under a consistent standard.',
  points: [
    'Registrations and memberships recorded on the PLU ARG platform',
    'Results normalized from LiftingCast for PLU USA reporting',
    'Operations aligned with PLU rulebook and competition standards',
  ],
}

export const PITBULL_FAQ = [
  {
    id: 'affiliation',
    q: 'Do I need to be a member to compete?',
    a: 'Yes. To register for Pitbull Classic you need an active PLU ARG annual membership for the calendar year or the membership plus registration combo when you sign up.',
  },
  {
    id: 'confirmation',
    q: 'How do I confirm my registration?',
    a: 'Complete your profile, verify active membership and pay the meet registration. The PLU ARG team validates payment and enables your credential with an entry QR.',
  },
  {
    id: 'rulebook',
    q: 'Where can I read the rulebook?',
    a: 'The official PLU ARG rulebook is published in the Rulebook section of this site. Event categories follow that regulation.',
  },
  {
    id: 'results',
    q: 'When are results published?',
    a: 'Results are published on the platform once the meet ends and the LiftingCast sheet is processed.',
  },
  {
    id: 'contact',
    q: 'Who do I contact if I have questions?',
    a: 'You can reach the PLU ARG team from the Contact section. For event operations, mention Pitbull Classic in the subject line.',
  },
]

export const PITBULL_SCHEDULE = [
  {
    day: 'Day 1',
    date: 'Dec 12',
    items: [
      { time: 'AM', label: 'Weigh-in: Day 1 categories' },
      { time: 'MID', label: 'Mandatory technical briefing' },
      { time: 'PM', label: 'Competition: Day 1 categories' },
    ],
  },
  {
    day: 'Day 2',
    date: 'Dec 13',
    items: [
      { time: 'AM', label: 'Weigh-in: Day 2 categories' },
      { time: 'MID', label: 'Mandatory technical briefing' },
      { time: 'PM', label: 'Competition + Award ceremony' },
    ],
  },
]

export const PITBULL_CATEGORY_CARDS = [
  { id: 'equipment', title: 'Equipment', text: `${PITBULL_CLASSIC.categories.join(' · ')} (example)` },
  { id: 'age', title: 'Age', text: `${PITBULL_CLASSIC.divisions.join(' · ')} (example)` },
  { id: 'weight', title: 'Bodyweight', text: "Men's and women's classes (example)." },
  { id: 'gender', title: 'Gender', text: 'Separate M / F competition (example).' },
]

export const PITBULL_CREDENTIAL_SAMPLE = {
  athlete: 'Agustin Di Santo',
  affiliateCode: 'PA-2609',
}

export const RECENT_RESULTS = [
  { athlete: 'Martina Rivas', event: 'Pitbull Classic 2025', total: '412.5 kg', place: '1st Open Raw F', date: '2025-08-10' },
  { athlete: 'Nicolás Aguirre', event: 'Argentina Open 2025', total: '580 kg', place: '2nd Junior Classic', date: '2025-10-18' },
  { athlete: 'Lucía Fernández', event: 'Rookie Meet Córdoba', total: '325 kg', place: '1st Sub-Junior', date: '2025-09-05' },
]

export const FAQ_ITEMS = [
  {
    q: 'Who can join PLU ARG?',
    a: 'Any powerlifting athlete residing in Argentina or competing under the Argentine flag at PLU ARG events. Gyms and coaches can also register as operational partners.',
  },
  {
    q: 'Is membership required to compete?',
    a: 'Yes. To register for official PLU ARG events you need active membership for the current year or a membership + event combo at registration time.',
  },
  {
    q: 'How do I pay for membership or registration?',
    a: 'Through Mercado Pago from the web form. If you have an issue with online payment, the PLU ARG team can manually validate your receipt.',
  },
  {
    q: 'What is Pitbull Classic?',
    a: "It is PLU ARG's flagship event in Argentina, organized with Maximal. It brings athletes from across the country under international competition standards.",
  },
  {
    q: 'Where can I see my official results?',
    a: 'Results are published on this platform after each meet. LiftingCast sheets are normalized and made available for review and export.',
  },
  {
    q: 'Is PLU ARG linked to Powerlifting United?',
    a: 'PLU ARG operates as the Argentine federation aligned with international powerlifting standards. We are the local representation with our own identity and operations.',
  },
]

export const FAQ_GROUPS = [
  {
    id: 'faq-afiliacion',
    title: 'Membership',
    shortLabel: 'Member.',
    items: [
      {
        q: 'How long does membership last?',
        a: 'It is valid for the calendar year, from payment confirmation until December 31 of the same year (example scheme).',
      },
      {
        q: 'Can I join without prior competition experience?',
        a: 'Yes, membership is open to any athlete who meets the basic requirements, with no prior experience needed.',
      },
    ],
  },
  {
    id: 'faq-inscripcion',
    title: 'Registration',
    shortLabel: 'Reg.',
    items: [
      {
        q: 'Do I need to be a member to register?',
        a: 'Yes, active annual membership is required to register for any official event.',
      },
      {
        q: 'What if my registration is flagged?',
        a: 'An operator reviews the case (incomplete data, declared weight, etc.) and contacts you before the event.',
      },
    ],
  },
  {
    id: 'faq-pagos',
    title: 'Payments',
    shortLabel: 'Pay',
    items: [
      {
        q: 'What payment methods do you accept?',
        a: 'Mercado Pago is the primary payment method for memberships and registrations.',
      },
      {
        q: 'What if my payment is not confirmed?',
        a: "Your record stays 'Payment pending'. If more than 48 hours pass, contact us with your receipt.",
      },
    ],
  },
  {
    id: 'faq-soporte',
    title: 'Results and support',
    shortLabel: 'Support',
    items: [
      {
        q: 'Can I appeal a result?',
        a: "Yes, following the appeal procedure described in each event's official rulebook.",
      },
      {
        q: 'Can PLU USA resolve my inquiry directly?',
        a: 'No. PLU USA only audits reports and exports. Operational inquiries are handled by Maximal or PLU ARG.',
      },
    ],
  },
]

export const COMMUNITY_HIGHLIGHTS = [
  { title: 'Affiliate gyms', text: 'Network of venues in Buenos Aires, Córdoba, Rosario and the interior.' },
  { title: 'Certified referees', text: 'Judging panel trained under PLU ARG rules.' },
  { title: 'Elite and grassroots athletes', text: 'From first competition to the international podium.' },
]

export const COMMUNITY_QUOTE =
  'We do not compete gym against gym. We compete under the same rules, so a record in Rosario counts the same as one in Buenos Aires.'

export const COMMUNITY_GYM_PLACEHOLDERS = [
  { id: 'gym-ba', label: 'Buenos Aires', sub: 'Maximal Strength Club' },
  { id: 'gym-cba', label: 'Córdoba', sub: 'Iron House' },
  { id: 'gym-ros', label: 'Rosario', sub: 'Pitbull Barbell' },
  { id: 'gym-mdz', label: 'Mendoza', sub: 'Expanding' },
  { id: 'gym-nqn', label: 'Neuquén', sub: 'Expanding' },
  { id: 'gym-tuc', label: 'Tucumán', sub: 'Expanding' },
]

export const COMMUNITY_AFFILIATED_GYMS = [
  { id: 'gym-maximal', name: 'Maximal Strength Club', city: 'La Plata', province: 'Buenos Aires', status: 'active' },
  { id: 'gym-pitbull', name: 'Pitbull Barbell', city: 'Rosario', province: 'Santa Fe', status: 'active' },
  { id: 'gym-iron', name: 'Iron House', city: 'Córdoba', province: 'Córdoba', status: 'active' },
  { id: 'gym-mdz', name: 'Andes Strength', city: 'Mendoza', province: 'Mendoza', status: 'soon' },
  { id: 'gym-nqn', name: 'Patagonia Barbell', city: 'Neuquén', province: 'Neuquén', status: 'soon' },
]

export const COMMUNITY_RECENT_MEMBERS = [
  { id: 'mem-feed-001', name: 'Martina R.', gym: 'Maximal Power', province: 'Buenos Aires', division: 'Open · Raw', memberCode: 'PLU-ARG-2026-001', affiliatedAt: '2026-02-01' },
  { id: 'mem-feed-002', name: 'Nicolás A.', gym: 'Pitbull Barbell', province: 'Córdoba', division: 'Junior · Classic Raw', memberCode: 'PLU-ARG-2026-002', affiliatedAt: '2026-03-10' },
  { id: 'mem-feed-003', name: 'Lucía M.', gym: 'Iron House', province: 'Córdoba', division: 'Open · Raw', memberCode: 'PLU-ARG-2026-003', affiliatedAt: '2026-03-18' },
  { id: 'mem-feed-004', name: 'Tomás V.', gym: 'Maximal Power', province: 'Buenos Aires', division: 'Master · Equipped', memberCode: 'PLU-ARG-2026-004', affiliatedAt: '2026-03-22' },
  { id: 'mem-feed-005', name: 'Camila S.', gym: 'Pitbull Barbell', province: 'Santa Fe', division: 'Open · Raw', memberCode: 'PLU-ARG-2026-005', affiliatedAt: '2026-03-28' },
]

export const COMMUNITY_TESTIMONIAL_PLACEHOLDERS = [
  { id: 'testimonio-1', role: 'Athlete · Open', text: 'Coming soon: voices of athletes competing under the PLU ARG standard.' },
  { id: 'testimonio-2', role: 'Coach · Affiliate gym', text: 'Coming soon: stories from the affiliate gym network.' },
  { id: 'testimonio-3', role: 'Certified referee', text: 'Coming soon: perspective from the national judging body.' },
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
  {
    labelKey: 'admin.nav.groups.pluUsa',
    items: [
      ['plu-usa', 'admin.nav.pluUsa', 'Eye'],
    ],
  },
]

export const ADMIN_SECTIONS = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
