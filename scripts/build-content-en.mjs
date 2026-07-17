import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const enPath = path.join(__dirname, '../src/lib/content/en.js')

const en = `import { PRICING } from '../constants.js'

export const HOME_STATS = [
  { value: '2026', label: 'Launch year' },
  { value: 'PLU USA', label: 'International recognition' },
  { value: '100%', label: 'Digital management' },
]

export const HOME_QUICK_LINKS = [
  { key: 'members', labelKey: 'nav.members' },
  { key: 'pitbull', labelKey: 'nav.pitbull' },
  { key: 'events', labelKey: 'nav.events' },
  { key: 'results', labelKey: 'nav.results' },
  { key: 'rulebook', labelKey: 'nav.rulebook' },
]

export const ABOUT_INTRO = {
  eyebrow: 'What is PLU ARG',
  title: 'The federation that organizes Argentine powerlifting.',
  description:
    'Connects athletes, gyms and referees under one membership, competition and results system — with the administrative rigor required to report to PLU USA.',
}

export const HOME_MEMBERSHIP = {
  eyebrow: 'Annual membership',
  title: 'One step, a full year of competition.',
  description:
    'Membership is the only requirement to compete in official PLU ARG events during the calendar year.',
  cta: 'Join now',
  sampleNote: 'Reference price',
}

export const HOME_RESULTS = {
  eyebrow: 'Results',
  title: 'No results published yet.',
  description:
    'Pitbull Classic results will be available here as soon as the event ends, with export ready for PLU USA.',
}

export const HOME_RULEBOOK = {
  eyebrow: 'Rulebook',
  title: 'The same rules for everyone, without ambiguity.',
  cta: 'View categories and divisions',
}

export const HOME_COMMUNITY = {
  eyebrow: 'Community',
  title: 'Every gym that joins makes the federation stronger.',
  description:
    'From Buenos Aires to Bariloche, PLU ARG connects athletes and gyms under one international standard.',
  cta: 'Explore the community',
  visualCaption: 'photo — community, gym, chalk on platform',
  stats: [
    { value: '40+', label: 'Affiliated gyms' },
    { value: '850+', label: 'Registered athletes' },
    { value: '12', label: 'Provinces' },
  ],
}

export const HOME_FAQ = {
  eyebrow: 'FAQ',
  title: 'What every athlete asks before getting started.',
  description:
    'Clear answers about membership, events and results — no runaround or fine print.',
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
  'Access to all official events of the year',
  'Affiliate code and digital credential',
  'Results recognized by PLU USA',
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
    features: ['18 years and older', 'PLU ARG code', 'Digital member card', 'Access to official events'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'junior',
    title: 'Junior athlete',
    price: PRICING.membershipJunior,
    period: 'annual',
    features: ['Ages 10–17', 'Annual membership', 'PLU ARG junior events'],
    highlighted: false,
    procedureType: 'membership',
  },
  {
    id: 'combo',
    title: 'Pitbull Classic combo',
    price: PRICING.combo,
    period: '2026 season',
    features: ['Annual membership', 'Pitbull Classic registration', 'Administrative validation'],
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
    title: 'Official events',
    text: 'Access to all PLU ARG meets of the calendar year, including Pitbull Classic.',
  },
  {
    id: 'credential',
    title: 'Digital credential',
    text: 'Unique affiliate code and digital card ready to compete.',
  },
  {
    id: 'results',
    title: 'Recognized results',
    text: 'Your marks are recorded under the international PLU USA standard.',
  },
]

export const MEMBERSHIP_REQUIREMENTS = [
  {
    id: 'id',
    title: 'Valid ID',
    text: 'National ID or passport to verify identity.',
  },
  {
    id: 'age',
    title: 'Minimum age 14',
    text: 'Under 18 requires legal guardian authorization.',
  },
  {
    id: 'health',
    title: 'Medical clearance or affidavit',
    text: 'Valid medical certificate or health affidavit.',
  },
  {
    id: 'photo',
    title: 'Credential photo',
    text: 'Recent digital photo for the member card.',
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
    step: '01',
    title: 'Complete your details',
    text: 'Simple form with personal and contact information.',
  },
  {
    step: '02',
    title: 'Pay with Mercado Pago',
    text: 'Secure checkout with instant confirmation or manual validation.',
  },
  {
    step: '03',
    title: 'Receive your code',
    text: 'On-screen confirmation with your affiliate code.',
  },
  {
    step: '04',
    title: 'You are enabled',
    text: 'You can now register for any official event of the year.',
  },
]

export const MEMBERSHIP_FAQ = [
  {
    id: 'pitbull',
    q: 'Does membership include Pitbull Classic registration?',
    a: 'No. Annual membership enables you to compete; each meet registration is separate, except on the combo plan.',
  },
  {
    id: 'vigencia',
    q: 'When does membership validity start?',
    a: 'From payment confirmation until December 31 of the same calendar year.',
  },
  {
    id: 'menores',
    q: 'Can minors join?',
    a: 'Yes, from age 14 with guardian authorization and enabled junior categories.',
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
    'The first major official PLU ARG meet. Raw and equipped categories, certified referees and results recognized by PLU USA.',
  date: 'December 12–13, 2026',
  dateDay: '12–13',
  dateMonth: 'Dec',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires, Argentina',
  slots: 120,
  registered: 48,
  categories: ['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited'],
  divisions: ['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters'],
}

export const PITBULL_CATEGORY_CARDS = [
  { id: 'equipment', title: 'Equipment', text: \`\${PITBULL_CLASSIC.categories.join(' · ')} (example)\` },
  { id: 'age', title: 'Age', text: \`\${PITBULL_CLASSIC.divisions.join(' · ')} (example)\` },
  { id: 'weight', title: 'Bodyweight', text: 'Men's and women's weight classes (example).' },
  { id: 'gender', title: 'Gender', text: 'Men and women, separate competition (example).' },
]

export const PITBULL_CREDENTIAL_SAMPLE = {
  athlete: 'Agustin Di Santo',
  affiliateCode: 'PA-2609',
}

export const RECENT_RESULTS = [
  { athlete: 'Martina Rivas', event: 'Pitbull Classic 2025', total: '412.5 kg', place: '1st Open Raw F', date: '2025-08-10' },
  { athlete: 'Nicolás Aguirre', event: 'Argentina Open 2025', total: '580 kg', place: '2nd Junior Classic', date: '2025-10-18' },
  { athlete: 'Lucía Fernández', event: 'Rookie Meet Córdoba', total: '325 kg', place: '1st Youth', date: '2025-09-05' },
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
    a: 'It is PLU ARG's flagship event in Argentina, organized with Maximal. It brings athletes from across the country under international competition standards.',
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
        a: 'Yes, following the appeal procedure described in each event's official rulebook.',
      },
      {
        q: 'Can PLU USA resolve my inquiry directly?',
        a: 'No — PLU USA only audits reports and exports. Operational inquiries are handled by Maximal / PLU ARG.',
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
  'We do not compete gym against gym. We compete under the same rules — so a record in Rosario counts the same as one in Buenos Aires.'

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
  { id: 'mem-feed-002', name: 'Nicolás A.', gym: 'Pitbull Barbell', province: 'Córdoba', division: 'Junior · Raw With Wraps', memberCode: 'PLU-ARG-2026-002', affiliatedAt: '2026-03-10' },
  { id: 'mem-feed-003', name: 'Lucía M.', gym: 'Iron House', province: 'Córdoba', division: 'Open · Raw', memberCode: 'PLU-ARG-2026-003', affiliatedAt: '2026-03-18' },
  { id: 'mem-feed-004', name: 'Tomás V.', gym: 'Maximal Power', province: 'Buenos Aires', division: 'Masters · Single-Ply', memberCode: 'PLU-ARG-2026-004', affiliatedAt: '2026-03-22' },
  { id: 'mem-feed-005', name: 'Camila S.', gym: 'Pitbull Barbell', province: 'Santa Fe', division: 'Open · Raw', memberCode: 'PLU-ARG-2026-005', affiliatedAt: '2026-03-28' },
]

export const COMMUNITY_TESTIMONIAL_PLACEHOLDERS = [
  { id: 'testimonio-1', role: 'Athlete · Open', text: 'Coming soon — voices of athletes competing under the PLU ARG standard.' },
  { id: 'testimonio-2', role: 'Coach · Affiliate gym', text: 'Coming soon — stories from the affiliate gym network.' },
  { id: 'testimonio-3', role: 'Certified referee', text: 'Coming soon — perspective from the national judging body.' },
]

export const RULEBOOK_DOWNLOAD = {
  title: 'Full rulebook',
  subtitle: '2026 version · upcoming release',
  action: 'Download PDF',
  format: 'PDF',
}

export const RULEBOOK_WEIGHT_CATEGORIES = [
  { title: 'Men', weights: ['59', '66', '74', '83', '93', '105', '120', '120+'], unit: 'kg' },
  { title: 'Women', weights: ['47', '52', '57', '63', '69', '76', '84', '84+'], unit: 'kg' },
]

export const RULEBOOK_DIVISIONS = [
  { title: 'Sub-junior', range: '14–18 years' },
  { title: 'Junior', range: '19–23 years' },
  { title: 'Open', range: 'No limit' },
  { title: 'Master', range: '40+ years' },
]

export const RULEBOOK_EQUIPMENT = [
  { title: 'Raw', text: 'Belt, knee sleeves, wrist wraps and approved footwear. No supportive suits.' },
  { title: 'Equipped', text: 'Approved supportive suit for squat and bench, plus raw equipment.' },
]

export const RULEBOOK_JUDGING = [
  { numeral: 'I', text: 'Three attempts per lift: squat, bench press and deadlift.' },
  { numeral: 'II', text: 'Panel of three referees; two white lights required for a good lift.' },
  { numeral: 'III', text: 'Athletes compete in the bodyweight class declared at the official weigh-in.' },
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
`

fs.writeFileSync(enPath, en)
console.log('wrote', enPath)
