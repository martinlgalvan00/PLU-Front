import { PRICING } from '../constants.js'
import { PITBULL_VENUE_DATA } from '../events.js'

export const HOME_STATS = [
  { value: '2026', label: 'Current season' },
  { value: 'PLU USA', label: 'International standard' },
]

/** Quick-access band under the hero — federation IA */
export const HOME_QUICK_LINKS = [
  { key: 'members', labelKey: 'nav.members' },
  { key: 'events', labelKey: 'nav.calendarOfficial' },
  { key: 'results', labelKey: 'nav.results' },
  { key: 'records', labelKey: 'nav.records' },
  { key: 'rulebook', labelKey: 'nav.rulebook' },
]

export const ABOUT_INTRO = {
  eyebrow: 'About us',
  title: 'One standard to affiliate, compete and publish.',
  titleLead: 'One standard to affiliate, compete',
  titleAccent: 'and publish.',
  description:
    'PLU Argentina connects athletes, gyms and referees with annual membership, an official calendar and PLU USA-aligned results.',
  descriptionLead: 'PLU Argentina connects athletes, gyms and referees.',
  descriptionMeta: 'Annual membership, an official calendar and PLU USA-aligned results.',
  cta: 'Explore our community',
}

export const HOME_MEMBERSHIP = {
  eyebrow: 'Annual membership',
  title: 'Enabled to compete',
  titleLead: 'Enabled',
  titleAccent: 'to compete',
  description:
    'Pay online, get a QR credential on your profile, and access the official calendar under the PLU USA standard.',
  cta: 'View plans',
  planLabel: 'Annual membership',
  seasonNote: '26/27 season',
  cardCta: 'Join',
}

export const HOME_RESULTS = {
  eyebrow: 'Results',
  status: 'Pending',
  title: 'Official ranking, after each meet closes.',
  description: 'Categories, totals and season archive — with export ready for PLU USA.',
  metaEvent: 'Pitbull Classic',
  metaExport: 'PLU USA export',
  classes: {
    open83: 'Open · −83 kg',
    open74: 'Open · −74 kg',
    women63: 'Women · −63 kg',
  },
}

export const HOME_RULEBOOK = {
  eyebrow: 'Rulebook',
  title: 'Official PLU competition rules.',
  description: 'Rules, categories and equipment for competition under one shared standard.',
  topics: ['Categories', 'Divisions', 'Equipment'],
  cta: 'View categories and divisions',
}

export const HOME_COMMUNITY = {
  eyebrow: 'Community',
  title: 'Gyms and athletes under the same standard.',
  description: 'Affiliate venues and members competing on the official PLU Argentina calendar.',
  cta: 'View community',
  recentLabel: 'Recent members',
  emptyRecentLabel: 'No active public members yet.',
  liveLabel: 'Live',
  visualCaption: 'Community gallery · coming soon',
  stats: [],
}

export const HOME_FAQ = {
  eyebrow: 'Help',
  title: 'Got questions?',
  description: 'Membership, entries and the rulebook: clear answers in one place.',
  ctaFaq: 'View FAQ',
  ctaContact: 'Contact',
}

/** FAQ copy reserve (full /faq page). No longer rendered on Home. */
export const HOME_FAQ_ITEMS = [
  {
    q: 'How do I join PLU ARG?',
    a: 'Go to the Membership page, complete your details, pay with Mercado Pago and you are registered instantly.',
  },
  {
    q: 'Do I need to be a member to register for Pitbull Classic?',
    a: 'You can create and pay for registration even if membership is still pending. If the event requires membership, door check-in needs an active, valid membership. The membership + event combo covers both in one payment.',
  },
  {
    q: 'Where can I see event results?',
    a: 'In the Results section, publicly available as soon as they are normalized after each event.',
  },
]

export const HOME_MEMBERSHIP_FEATURES = [
  'Athlete account',
  'Online payment, no WhatsApp',
  'Digital QR credential',
]

export const HOME_MEMBERSHIP_BENEFITS = [
  {
    id: 'events',
    title: 'Official calendar',
    text: 'Register for PLU Argentina meets from your account.',
  },
  {
    id: 'credential',
    title: 'Digital QR credential',
    text: 'Membership status and check-in pass in one stable code.',
  },
  {
    id: 'checkout',
    title: 'Online payment',
    text: 'Mercado Pago or transfer with proof in the platform. No WhatsApp.',
  },
  {
    id: 'results',
    title: 'Results under PLU standard',
    text: 'Marks published with the same criteria as PLU USA.',
  },
  {
    id: 'access',
    title: 'Athlete profile',
    text: 'Membership, events and history always at hand.',
  },
  {
    id: 'combo',
    title: 'Membership + meet combo',
    text: 'When an offer is live, one payment covers both rights.',
  },
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
    'Pay online, get activated, and see your QR credential on your profile. One annual membership for the official calendar.',
  cta: 'Start my membership',
  perks: ['Single annual payment', 'Mercado Pago', 'QR credential'],
}

export const MEMBERSHIP_PLANS = [
  // Marketing feature template only — not a purchasable catalog.
  // Price and name come from membership_plans (API / Pricing admin).
  {
    id: 'athlete',
    title: 'Annual PLU membership',
    kicker: 'Annual plan',
    price: PRICING.membership,
    period: 'annual',
    features: ['Digital credential', 'PLU ARG calendar events', 'Status and QR at check-in'],
    highlighted: false,
    procedureType: 'membership',
  },
]

export const MEMBERSHIP_BENEFITS = [
  {
    id: 'credential',
    title: 'Digital QR credential',
    text: 'Membership status and entry pass in one stable code.',
  },
  {
    id: 'profile',
    title: 'Visible profile and status',
    text: 'After payment you see active membership and your QR in the panel.',
  },
  {
    id: 'events',
    title: 'Official calendar',
    text: 'Register for PLU ARG meets from the same account.',
  },
  {
    id: 'standard',
    title: 'PLU USA standard',
    text: 'Same rules and publishing criteria as the international circuit.',
  },
]

export const MEMBERSHIP_INSTITUTIONAL = {
  eyebrow: 'Powerlifting United',
  title: 'Federation standard',
  text: 'PLU Argentina runs memberships, competitions and results with the same criteria as Powerlifting United. Local operations: Maximal.',
}

export const MEMBERSHIP_REQUIREMENTS = [
  {
    id: 'id',
    title: 'ID',
    text: 'Valid national ID or passport. Required to validate the request.',
  },
  {
    id: 'age',
    title: 'Age',
    text: 'From 14 years old. Under 18: guardian authorization required.',
  },
  {
    id: 'health',
    title: 'Fitness',
    text: 'Medical certificate or current health affidavit.',
  },
  {
    id: 'photo',
    title: 'Photo',
    text: 'Recent digital portrait, front-facing and well lit.',
  },
]

export const MEMBERSHIP_CREDENTIAL_SAMPLE = {
  athlete: 'Agustin Di Santo',
  affiliateCode: 'PA-2847',
  season: '26/27 season',
  status: 'Active membership',
}

export const MEMBERSHIP_ANNUAL_STEPS = [
  {
    step: '1',
    title: 'Create your account',
    text: 'Profile, ID and competition details.',
  },
  {
    step: '2',
    title: 'Pay online',
    text: 'Mercado Pago or transfer with proof in the platform.',
  },
  {
    step: '3',
    title: 'Go active with QR',
    text: 'Membership status and digital credential on your profile.',
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
    a: 'You can create and pay for registration even if membership is still pending. If the event requires membership, door check-in needs an active, valid membership. The membership + event combo covers both in one checkout.',
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
  { label: '26/27 season validity', athlete: true, junior: true, combo: true },
]

export const PLATFORM_SECTIONS = [
  {
    key: 'members',
    group: 'Competition',
    title: 'Membership',
    desc: 'Annual plans, athlete code and federation backing.',
  },
  {
    key: 'pitbull',
    group: 'Competition',
    title: 'Pitbull Classic',
    desc: 'The flagship meet of the PLU ARG season.',
  },
  {
    key: 'events',
    group: 'Competition',
    title: 'Events',
    desc: 'Competition calendar and meet registrations.',
  },
  {
    key: 'results',
    group: 'Competition',
    title: 'Results',
    desc: 'Official score sheets, totals and podiums.',
  },
  {
    key: 'rulebook',
    group: 'Institutional',
    title: 'Rulebook',
    desc: 'Rules, categories and equipment.',
  },
  {
    key: 'community',
    group: 'Institutional',
    title: 'Community',
    desc: 'Affiliate gyms, referees and athlete network.',
  },
  {
    key: 'faq',
    group: 'Institutional',
    title: 'FAQ',
    desc: 'Answers about membership, payments and competition.',
  },
  {
    key: 'contact',
    group: 'Institutional',
    title: 'Contact',
    desc: 'Operational support and federation inquiries.',
  },
]

export const PITBULL_CLASSIC = {
  title: 'Pitbull Classic',
  tagline:
    'Pitbull Classic brings PLU Argentina athletes together in an official meet built to track registrations, categories, results and reports under Powerlifting United standards.',
  date: 'December 12–13, 2026',
  dateShort: 'Dec 12–13, 2026',
  dateDay: '12–13',
  dateMonth: 'Dec',
  venue: 'La Troupe Multiespacio',
  location: 'Banfield, Buenos Aires',
  slots: 180,
  registered: 48,
  modalities: [
    'Full Power',
    'Push-Pull',
    'Squat Specialist',
    'Bench Specialist',
    'Deadlift Specialist',
  ],
  categories: ['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited'],
  divisions: ['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters'],
}

export const PITBULL_VENUE = PITBULL_VENUE_DATA

export const PITBULL_BENEFITS_ATHLETES = [
  {
    id: 'standard',
    icon: 'Globe',
    title: 'PLU USA results',
    desc: 'Publishing and export aligned with the international ecosystem.',
  },
  {
    id: 'credential',
    icon: 'QrCode',
    title: 'Digital credential',
    desc: 'Card and entry QR once registration is confirmed.',
  },
  {
    id: 'judging',
    icon: 'ShieldCheck',
    title: 'Certified referees',
    desc: 'Technical panel under PLU USA standards.',
  },
  {
    id: 'ops',
    icon: 'ClipboardList',
    title: 'Traceable operations',
    desc: 'Weigh-in, draw and attempts recorded on the platform.',
  },
]

export const PITBULL_BENEFITS_SPECTATORS = [
  {
    id: 'show',
    icon: 'Ticket',
    title: 'General admission',
    desc: 'Two competition days at La Troupe Multiespacio, Banfield.',
  },
  {
    id: 'access',
    icon: 'Ticket',
    title: 'No membership',
    desc: 'ID only. Buy online or at the door on event day.',
  },
  {
    id: 'community',
    icon: 'Users',
    title: 'PLU ARG calendar',
    desc: 'Official meet on the local competitive circuit.',
  },
]

export const PITBULL_ATHLETE_GROUPS = [
  {
    id: 'registration',
    label: 'Before the meet',
    items: [
      {
        id: 'membership',
        title: 'Membership',
        text: 'Calendar year or combo at signup.',
      },
      {
        id: 'category',
        title: 'Category',
        text: 'Equipment, age and bodyweight.',
      },
      {
        id: 'confirmation',
        title: 'Validation',
        text: 'Payment and entry confirmed.',
      },
    ],
  },
  {
    id: 'meet',
    label: 'Competition day',
    items: [
      {
        id: 'weighin',
        title: 'Weigh-in',
        text: 'Official window on your day.',
      },
      {
        id: 'results',
        title: 'Results',
        text: 'Published here from LiftingCast.',
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
    a: 'You can create and pay for registration even if membership is still pending. If Pitbull Classic requires membership, door check-in needs an active membership for the year or the membership + registration combo.',
  },
  {
    id: 'confirmation',
    q: 'How do I confirm my registration?',
    a: 'Complete your profile, pay the meet registration (or combo) and track status in your panel. Once payment is confirmed, the QR credential is available for entry.',
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
      { time: 'AM', label: 'Day 1 categories' },
      { time: 'MID', label: 'Before platform' },
      { time: 'PM', label: 'Day 1 categories' },
    ],
  },
  {
    day: 'Day 2',
    date: 'Dec 13',
    items: [
      { time: 'AM', label: 'Day 2 categories' },
      { time: 'MID', label: 'Before platform' },
      { time: 'PM', label: 'Competition + awards' },
    ],
  },
]

export const PITBULL_CATEGORY_CARDS = [
  {
    id: 'equipment',
    title: 'Equipment',
    text: `${PITBULL_CLASSIC.categories.join(' · ')} (example)`,
  },
  { id: 'age', title: 'Age', text: `${PITBULL_CLASSIC.divisions.join(' · ')} (example)` },
  { id: 'weight', title: 'Bodyweight', text: "Men's and women's classes (example)." },
  { id: 'gender', title: 'Gender', text: 'Separate M / F competition (example).' },
]

export const PITBULL_CREDENTIAL_SAMPLE = {
  athlete: 'Agustin Di Santo',
  affiliateCode: 'PA-2609',
}

export const RECENT_RESULTS = [
  {
    athlete: 'Martina Rivas',
    event: 'Pitbull Classic 2025',
    total: '412.5 kg',
    place: '1st Open Raw F',
    date: '2025-08-10',
  },
  {
    athlete: 'Nicolás Aguirre',
    event: 'Argentina Open 2025',
    total: '580 kg',
    place: '2nd Junior Classic',
    date: '2025-10-18',
  },
  {
    athlete: 'Lucía Fernández',
    event: 'Rookie Meet Córdoba',
    total: '325 kg',
    place: '1st Youth',
    date: '2025-09-05',
  },
]

export const FAQ_ITEMS = [
  {
    q: 'Who can join PLU ARG?',
    a: 'Any powerlifting athlete residing in Argentina or competing under the Argentine flag at PLU ARG events. Gyms and coaches can also register as operational partners.',
  },
  {
    q: 'Is membership required to compete?',
    a: 'You can create and pay for registration even if membership is still pending. If the event requires membership, door check-in needs an active membership for the year or the membership + event combo.',
  },
  {
    q: 'How do I pay for membership or registration?',
    a: 'For now, memberships and registrations can only be paid through Mercado Pago from the web form. Bank transfer and cash at Pitbull will be enabled soon.',
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
        a: 'It is valid for the calendar year, from payment confirmation until December 31 of the same year.',
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
        a: 'It is not a condition to create or pay for registration. If the event requires membership, you need it active at door check-in.',
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
  {
    title: 'Affiliate gyms',
    text: 'Network of venues in Buenos Aires, Córdoba, Rosario and the interior.',
  },
  { title: 'Certified referees', text: 'Judging panel trained under PLU ARG rules.' },
  {
    title: 'Elite and grassroots athletes',
    text: 'From first competition to the international podium.',
  },
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
  { id: 'gym-iron', name: 'Iron House', city: 'Córdoba', province: 'Córdoba', status: 'active' },
  { id: 'gym-mdz', name: 'Andes Strength', city: 'Mendoza', province: 'Mendoza', status: 'soon' },
  {
    id: 'gym-nqn',
    name: 'Patagonia Barbell',
    city: 'Neuquén',
    province: 'Neuquén',
    status: 'soon',
  },
]

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
    role: 'Athlete · Open',
    text: 'Coming soon: voices of athletes competing under the PLU ARG standard.',
  },
  {
    id: 'testimonio-2',
    role: 'Coach · Affiliate gym',
    text: 'Coming soon: stories from the affiliate gym network.',
  },
  {
    id: 'testimonio-3',
    role: 'Certified referee',
    text: 'Coming soon: perspective from the national judging body.',
  },
]

export const ADMIN_NAV_GROUPS = [
  {
    labelKey: 'admin.nav.groups.management',
    items: [
      ['dashboard', 'admin.nav.dashboard', 'LayoutDashboard'],
      ['people', 'admin.nav.people', 'Users'],
    ],
  },
  {
    labelKey: 'admin.nav.groups.events',
    items: [
      ['events', 'admin.nav.events', 'Calendar'],
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
      ['finance', 'admin.nav.finance', 'Landmark'],
      ['pricing', 'admin.nav.pricing', 'BadgeDollarSign'],
      ['access-gates', 'admin.nav.accessGates', 'KeyRound'],
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
    items: [['plu-usa', 'admin.nav.pluUsa', 'Eye']],
  },
]

export const ADMIN_SECTIONS = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
