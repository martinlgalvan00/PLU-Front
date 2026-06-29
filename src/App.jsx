import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Diamond,
  Download,
  FileSpreadsheet,
  Filter,
  LockKeyhole,
  Mail,
  MapPin,
  Medal,
  Search,
  ShieldCheck,
  Star,
  Trophy,
  Users,
} from 'lucide-react'
import heroImage from './assets/powerlifting-hero.png'
import './App.css'

const initialAthletes = [
  {
    id: 'ath-001',
    fullName: 'Martina Rivas',
    documentId: '40111222',
    birthDate: '1997-04-18',
    email: 'martina.rivas@example.com',
    phone: '+54 9 11 3000-1188',
    country: 'Argentina',
    province: 'Buenos Aires',
    city: 'La Plata',
    gym: 'Maximal Power',
    sex: 'Femenino',
    division: 'Open',
    category: 'Raw',
    estimatedWeight: '67.5',
    procedureType: 'both',
  },
  {
    id: 'ath-002',
    fullName: 'Nicolás Aguirre',
    documentId: '36888999',
    birthDate: '1992-10-03',
    email: 'nicolas.aguirre@example.com',
    phone: '+54 9 351 420-9921',
    country: 'Argentina',
    province: 'Córdoba',
    city: 'Córdoba',
    gym: 'Pitbull Barbell',
    sex: 'Masculino',
    division: 'Junior',
    category: 'Classic Raw',
    estimatedWeight: '82.5',
    procedureType: 'event',
  },
]

const initialMemberships = [
  {
    id: 'mem-001',
    athleteId: 'ath-001',
    year: '2026',
    status: 'active',
    startDate: '2026-02-01',
    expirationDate: '2027-01-31',
    memberCode: 'PLU-ARG-2026-001',
    paymentStatus: 'approved',
    mercadoPagoRef: 'MP-90122',
  },
]

const initialRegistrations = [
  {
    id: 'reg-001',
    athleteId: 'ath-001',
    event: 'Pitbull Classic',
    category: 'Raw',
    division: 'Open',
    bodyweight: '67.5',
    status: 'confirmed',
    paymentStatus: 'approved',
    notes: 'Afiliación e inscripción pagadas por Mercado Pago.',
  },
  {
    id: 'reg-002',
    athleteId: 'ath-002',
    event: 'Pitbull Classic',
    category: 'Classic Raw',
    division: 'Junior',
    bodyweight: '82.5',
    status: 'pending_payment',
    paymentStatus: 'manual_pending',
    notes: 'Pendiente de validación manual.',
  },
]

const initialPayments = [
  {
    id: 'pay-001',
    athleteId: 'ath-001',
    concept: 'Afiliación anual + Pitbull Classic',
    amount: 78000,
    method: 'mercado_pago',
    status: 'approved',
    reference: 'MP-90122',
    createdAt: '2026-02-01',
  },
  {
    id: 'pay-002',
    athleteId: 'ath-002',
    concept: 'Inscripción Pitbull Classic',
    amount: 45000,
    method: 'manual_link',
    status: 'manual_pending',
    reference: 'LINK-MP-PB-2026',
    createdAt: '2026-03-16',
  },
]

const upcomingEvents = [
  { date: '15 Ago', title: 'Pitbull Classic', venue: 'Maximal Strength Club', location: 'Buenos Aires' },
  { date: '12 Sep', title: 'Rookie Meet PLU ARG', venue: 'Iron House', location: 'Córdoba' },
  { date: '24 Oct', title: 'Argentina Open', venue: 'Pitbull Barbell', location: 'Rosario' },
]

const statusLabels = {
  active: 'Activa',
  expired: 'Vencida',
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  manual_pending: 'Validación manual',
  manual_approved: 'Manual aprobado',
}

const defaultForm = {
  fullName: '',
  documentId: '',
  birthDate: '',
  email: '',
  phone: '',
  country: 'Argentina',
  province: '',
  city: '',
  gym: '',
  sex: 'Masculino',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: '',
  procedureType: 'both',
  paymentMethod: 'mercado_pago',
}

const storageKey = 'maximal-plu-arg-demo'

function readDemoStorage() {
  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

function createCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const storedData = readDemoStorage()
  const [view, setView] = useState('home')
  const [role, setRole] = useState('admin_maximal')
  const [athletes, setAthletes] = useState(storedData?.athletes || initialAthletes)
  const [memberships, setMemberships] = useState(storedData?.memberships || initialMemberships)
  const [registrations, setRegistrations] = useState(storedData?.registrations || initialRegistrations)
  const [payments, setPayments] = useState(storedData?.payments || initialPayments)
  const [form, setForm] = useState(defaultForm)
  const [createdOrder, setCreatedOrder] = useState(storedData?.createdOrder || null)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })

  const canEdit = role !== 'viewer_plu_usa'

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ athletes, memberships, registrations, payments, createdOrder }),
    )
  }, [athletes, createdOrder, memberships, payments, registrations])

  const dashboard = useMemo(() => {
    const pendingPayments = payments.filter((payment) =>
      ['pending_payment', 'manual_pending'].includes(payment.status),
    ).length

    return [
      { label: 'Atletas', value: athletes.length, icon: Users },
      { label: 'Afiliaciones activas', value: memberships.filter((item) => item.status === 'active').length, icon: BadgeCheck },
      { label: 'Pitbull Classic', value: registrations.length, icon: ClipboardList },
      { label: 'Pagos pendientes', value: pendingPayments, icon: ShieldCheck },
    ]
  }, [athletes, memberships, payments, registrations])

  const enrichedRegistrations = registrations.map((registration) => ({
    ...registration,
    athlete: athletes.find((athlete) => athlete.id === registration.athleteId),
  }))

  const filteredRegistrations = enrichedRegistrations.filter((registration) => {
    const statusMatch = filters.status === 'all' || registration.status === filters.status || registration.paymentStatus === filters.status
    const eventMatch = filters.event === 'all' || registration.event === filters.event
    const query = filters.query.trim().toLowerCase()
    const queryMatch =
      !query ||
      registration.athlete?.fullName.toLowerCase().includes(query) ||
      registration.athlete?.documentId.includes(query) ||
      registration.category.toLowerCase().includes(query)

    return statusMatch && eventMatch && queryMatch
  })

  function updateForm(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function calculateAmount(procedureType) {
    if (procedureType === 'both') return 78000
    if (procedureType === 'membership') return 38000
    return 45000
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextNumber = athletes.length + 1
    const athleteId = `ath-${String(nextNumber).padStart(3, '0')}`
    const paymentId = `pay-${String(payments.length + 1).padStart(3, '0')}`
    const today = new Date().toISOString().slice(0, 10)
    const paymentStatus = form.paymentMethod === 'mercado_pago' ? 'pending_payment' : 'manual_pending'
    const amount = calculateAmount(form.procedureType)
    const conceptMap = {
      both: 'Afiliación anual + Pitbull Classic',
      membership: 'Afiliación anual',
      event: 'Inscripción Pitbull Classic',
    }

    setAthletes((current) => [{ id: athleteId, ...form }, ...current])

    if (['both', 'membership'].includes(form.procedureType)) {
      setMemberships((current) => [
        {
          id: `mem-${String(current.length + 1).padStart(3, '0')}`,
          athleteId,
          year: '2026',
          status: 'pending_payment',
          startDate: today,
          expirationDate: '2027-01-31',
          memberCode: `PLU-ARG-2026-${String(nextNumber).padStart(3, '0')}`,
          paymentStatus,
          mercadoPagoRef: '',
        },
        ...current,
      ])
    }

    if (['both', 'event'].includes(form.procedureType)) {
      setRegistrations((current) => [
        {
          id: `reg-${String(current.length + 1).padStart(3, '0')}`,
          athleteId,
          event: 'Pitbull Classic',
          category: form.category,
          division: form.division,
          bodyweight: form.estimatedWeight,
          status: 'pending_payment',
          paymentStatus,
          notes: '',
        },
        ...current,
      ])
    }

    const nextPayment = {
      id: paymentId,
      athleteId,
      concept: conceptMap[form.procedureType],
      amount,
      method: form.paymentMethod,
      status: paymentStatus,
      reference: form.paymentMethod === 'mercado_pago' ? `MP-CHECKOUT-${Date.now()}` : 'LINK-MP-PB-2026',
      createdAt: today,
    }

    setPayments((current) => [nextPayment, ...current])
    setCreatedOrder({
      athleteName: form.fullName,
      athleteDocument: form.documentId,
      athleteId,
      paymentId,
      paymentMethod: form.paymentMethod,
      ...nextPayment,
    })
    setForm(defaultForm)
  }

  function approvePayment(paymentId) {
    if (!canEdit) return
    const payment = payments.find((item) => item.id === paymentId)
    if (!payment) return

    setPayments((current) =>
      current.map((item) => (item.id === paymentId ? { ...item, status: 'approved', reference: item.reference || 'MANUAL-APPROVED' } : item)),
    )
    setMemberships((current) =>
      current.map((item) =>
        item.athleteId === payment.athleteId
          ? { ...item, status: 'active', paymentStatus: 'approved', mercadoPagoRef: payment.reference }
          : item,
      ),
    )
    setRegistrations((current) =>
      current.map((item) =>
        item.athleteId === payment.athleteId ? { ...item, status: 'confirmed', paymentStatus: 'approved' } : item,
      ),
    )
    setCreatedOrder((current) => (current?.paymentId === paymentId ? { ...current, status: 'approved' } : current))
  }

  function exportAdminCsv() {
    const rows = registrations.map((registration) => {
      const athlete = athletes.find((item) => item.id === registration.athleteId)
      const membership = memberships.find((item) => item.athleteId === registration.athleteId)
      const payment = payments.find((item) => item.athleteId === registration.athleteId)

      return {
        atleta: athlete?.fullName,
        documento: athlete?.documentId,
        email: athlete?.email,
        telefono: athlete?.phone,
        pais: athlete?.country,
        provincia: athlete?.province,
        ciudad: athlete?.city,
        gimnasio: athlete?.gym,
        sexo: athlete?.sex,
        division: registration.division,
        categoria: registration.category,
        peso: registration.bodyweight,
        codigo_afiliado: membership?.memberCode,
        estado_afiliacion: membership?.status,
        evento: registration.event,
        estado_inscripcion: registration.status,
        estado_pago: payment?.status,
        referencia_pago: payment?.reference,
      }
    })
    createCsv('plu-arg-admin-export.csv', rows)
  }

  function exportPluUsaCsv() {
    const rows = athletes.map((athlete) => {
      const membership = memberships.find((item) => item.athleteId === athlete.id)
      const registration = registrations.find((item) => item.athleteId === athlete.id)
      return {
        member_code: membership?.memberCode || '',
        first_name: athlete.fullName.split(' ').slice(0, -1).join(' '),
        last_name: athlete.fullName.split(' ').slice(-1).join(''),
        document_id: athlete.documentId,
        birth_date: athlete.birthDate,
        gender: athlete.sex,
        country: athlete.country,
        state: athlete.province,
        city: athlete.city,
        gym: athlete.gym,
        division: registration?.division || athlete.division,
        category: registration?.category || athlete.category,
        bodyweight: registration?.bodyweight || athlete.estimatedWeight,
        membership_year: membership?.year || '2026',
        membership_status: membership?.status || '',
        membership_start: membership?.startDate || '',
        membership_expiration: membership?.expirationDate || '',
        event_name: registration?.event || '',
        registration_status: registration?.status || '',
        payment_status: registration?.paymentStatus || '',
      }
    })
    createCsv('plu-usa-example-export.csv', rows)
  }

  return (
    <div className="app-shell">
      <Header activeView={view} onNavigate={setView} />

      {view === 'home' && <HomePage onNavigate={setView} />}
      {view === 'members' && <MembersPage onNavigate={setView} />}
      {view === 'team' && <TeamPage />}
      {view === 'shop' && <ShopPage onNavigate={setView} />}
      {view === 'events' && <EventsPage onNavigate={setView} />}
      {view === 'contact' && <ContactPage />}
      {view === 'register' && (
        <RegisterPage
          createdOrder={createdOrder}
          form={form}
          onApprovePayment={approvePayment}
          onNavigate={setView}
          onSubmit={handleSubmit}
          onUpdateForm={updateForm}
          total={calculateAmount(form.procedureType)}
        />
      )}
      {view === 'admin' && (
        <AdminPage
          canEdit={canEdit}
          dashboard={dashboard}
          filters={filters}
          filteredRegistrations={filteredRegistrations}
          onApprovePayment={approvePayment}
          onExportAdmin={exportAdminCsv}
          onExportPluUsa={exportPluUsaCsv}
          onSetFilters={setFilters}
          payments={payments}
          role={role}
          setRole={setRole}
        />
      )}
    </div>
  )
}

function Header({ activeView, onNavigate }) {
  const items = [
    ['home', 'Inicio'],
    ['members', 'Miembros'],
    ['team', 'Unite al equipo'],
    ['shop', 'Tienda'],
    ['events', 'Eventos'],
    ['contact', 'Contacto'],
  ]

  return (
    <header className="site-header">
      <div className="header-top">
        <a href="mailto:soporte@pluarg.com"><Mail size={14} /> soporte@pluarg.com</a>
        <span>PLU Argentina / Maximal</span>
      </div>
      <div className="header-main">
        <button className="logo-mark" type="button" onClick={() => onNavigate('home')}>
          <span>POWERLIFTING</span>
          <strong>UNITED</strong>
          <small>ARGENTINA</small>
        </button>
        <nav className="site-nav" aria-label="Navegación principal">
          {items.map(([key, label]) => (
            <button className={activeView === key ? 'active' : ''} key={key} type="button" onClick={() => onNavigate(key)}>
              {label}
            </button>
          ))}
          <button className="admin-link" type="button" onClick={() => onNavigate('admin')}>
            <LockKeyhole size={16} />
            Panel
          </button>
        </nav>
      </div>
    </header>
  )
}

function HomePage({ onNavigate }) {
  return (
    <main className="home-page">
      <section className="home-hero" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,.78)), url(${heroImage})` }}>
        <div className="hero-content">
          <span>Somos</span>
          <h1>Powerlifting<br />United</h1>
          <p>Donde la fuerza se encuentra con los estándares.</p>
          <button type="button" onClick={() => onNavigate('register')}>Inscribirse</button>
          <button type="button" onClick={() => onNavigate('events')}>Próximos eventos</button>
        </div>
      </section>

      <section className="mission-section">
        <h2>Nuestra misión</h2>
        <p>
          PLU ARG se compromete a sostener los estándares y la estructura necesaria para que todos los atletas puedan competir con claridad, desde principiantes hasta nivel elite.
          Nuestra misión es elevar el powerlifting con reglas consistentes, operación simple y una comunidad unida.
        </p>
      </section>

      <section className="involved-section">
        <h2>Involucrate</h2>
        <p>Sumate al equipo de Powerlifting United Argentina y ayudá a construir el futuro del deporte.</p>
        <div className="benefit-grid">
          <BenefitCard icon={Star} title="Marcá una diferencia" text="Tu participación impacta directamente en el crecimiento del powerlifting." />
          <BenefitCard icon={Trophy} title="Expandí tu red" text="Conectá con atletas, entrenadores y organizadores de todo el país." />
          <BenefitCard icon={Medal} title="Ganás experiencia" text="Aprendé sobre reglas, arbitraje, logística y dirección de eventos." />
          <BenefitCard icon={Diamond} title="Sé parte de algo mayor" text="Integrá una comunidad orientada a elevar el estándar competitivo." />
        </div>
      </section>
    </main>
  )
}

function MembersPage({ onNavigate }) {
  return (
    <PageFrame eyebrow="Miembros" title="Afiliaciones PLU ARG">
      <div className="pricing-grid">
        <PricingCard title="Atleta" price="$38.000" details={['Mayores de 18 años', 'Código de afiliado PLU ARG', 'Tarjeta digital de miembro']} onJoin={() => onNavigate('register')} />
        <PricingCard title="Atleta juvenil" price="$28.000" details={['Edad 10 a 17 años', 'Afiliación anual', 'Registro para eventos juveniles']} onJoin={() => onNavigate('register')} />
        <PricingCard title="Combo competencia" price="$78.000" details={['Afiliación anual', 'Inscripción Pitbull Classic', 'Validación administrativa']} onJoin={() => onNavigate('register')} />
      </div>
    </PageFrame>
  )
}

function TeamPage() {
  return (
    <PageFrame eyebrow="Unite al equipo" title="Construí la liga desde adentro">
      <div className="content-grid">
        <InfoCard title="Oficiales y jueces" text="Alta futura para jueces, planillas, disponibilidad y certificaciones internas." />
        <InfoCard title="Directores de evento" text="Herramientas para sedes, calendarios, categorías, pagos y exportaciones." />
        <InfoCard title="Gimnasios afiliados" text="Registro de equipos, gimnasios y responsables técnicos por provincia." />
      </div>
    </PageFrame>
  )
}

function ShopPage({ onNavigate }) {
  return (
    <PageFrame eyebrow="Tienda" title="Productos, entradas y servicios">
      <div className="content-grid">
        <InfoCard title="Merch oficial" text="Espacio preparado para remeras, accesorios y productos de eventos PLU ARG." />
        <InfoCard title="Entradas de evento" text="Venta futura de entradas para público y acompañantes." />
        <InfoCard title="Inscripciones" text="El primer producto funcional del MVP es la inscripción del atleta." action="Inscribirse" onAction={() => onNavigate('register')} />
      </div>
    </PageFrame>
  )
}

function EventsPage({ onNavigate }) {
  return (
    <PageFrame eyebrow="Eventos" title="Calendario competitivo">
      <div className="event-list">
        {upcomingEvents.map((event) => (
          <article className="event-row" key={event.title}>
            <time>{event.date}</time>
            <div>
              <h3>{event.title}</h3>
              <p>{event.venue}</p>
            </div>
            <span><MapPin size={15} />{event.location}</span>
            <button type="button" onClick={() => onNavigate('register')}>Inscribirse</button>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}

function ContactPage() {
  return (
    <PageFrame eyebrow="Contacto" title="Hablemos">
      <div className="contact-panel">
        <a href="mailto:soporte@pluarg.com"><Mail size={18} /> soporte@pluarg.com</a>
        <p>Para consultas de afiliación, eventos, pagos manuales o exportaciones PLU USA.</p>
      </div>
    </PageFrame>
  )
}

function RegisterPage({ createdOrder, form, onApprovePayment, onNavigate, onSubmit, onUpdateForm, total }) {
  return (
    <main className="register-page">
      <section className="page-heading">
        <span>Inscripción</span>
        <h1>Registro de atleta</h1>
        <p>Completá tus datos para afiliación anual, inscripción a Pitbull Classic o ambos trámites.</p>
      </section>

      <section className="form-section">
        <form className="athlete-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <Field label="Nombre y apellido" name="fullName" value={form.fullName} onChange={onUpdateForm} required />
            <Field label="DNI o documento" name="documentId" value={form.documentId} onChange={onUpdateForm} required />
            <Field label="Fecha de nacimiento" name="birthDate" type="date" value={form.birthDate} onChange={onUpdateForm} required />
            <Field label="Email" name="email" type="email" value={form.email} onChange={onUpdateForm} required />
            <Field label="Teléfono" name="phone" value={form.phone} onChange={onUpdateForm} required />
            <Field label="País" name="country" value={form.country} onChange={onUpdateForm} required />
            <Field label="Provincia" name="province" value={form.province} onChange={onUpdateForm} required />
            <Field label="Ciudad" name="city" value={form.city} onChange={onUpdateForm} required />
            <Field label="Gimnasio/equipo" name="gym" value={form.gym} onChange={onUpdateForm} required />
            <Select label="Sexo competitivo" name="sex" value={form.sex} onChange={onUpdateForm} options={['Masculino', 'Femenino']} />
            <Select label="División" name="division" value={form.division} onChange={onUpdateForm} options={['Open', 'Junior', 'Sub-Junior', 'Master I', 'Master II']} />
            <Select label="Categoría" name="category" value={form.category} onChange={onUpdateForm} options={['Raw', 'Classic Raw', 'Equipped']} />
            <Field label="Peso corporal estimado" name="estimatedWeight" value={form.estimatedWeight} onChange={onUpdateForm} required />
            <Select
              label="Tipo de trámite"
              name="procedureType"
              value={form.procedureType}
              onChange={onUpdateForm}
              options={[
                ['both', 'Afiliación + inscripción'],
                ['membership', 'Solo afiliación'],
                ['event', 'Solo inscripción'],
              ]}
            />
            <Select
              label="Método de pago"
              name="paymentMethod"
              value={form.paymentMethod}
              onChange={onUpdateForm}
              options={[
                ['mercado_pago', 'Mercado Pago simulado'],
                ['manual_link', 'Link MP + validación manual'],
              ]}
            />
          </div>

          <div className="form-actions">
            <div>
              <strong>Total estimado: {money(total)}</strong>
              <span>{form.paymentMethod === 'mercado_pago' ? 'Pago simulado desde la web' : 'Fallback manual'}</span>
            </div>
            <button type="submit"><ShieldCheck size={18} /> Generar orden</button>
          </div>
        </form>

        <aside className="order-panel">
          <h2>Estado del registro</h2>
          {createdOrder ? (
            <div className="order-details">
              <span>{createdOrder.athleteName}</span>
              <strong>{money(createdOrder.amount)}</strong>
              <p>{createdOrder.concept}</p>
              <StatusPill value={createdOrder.status} />
              <code>{createdOrder.reference}</code>
              {createdOrder.paymentMethod === 'mercado_pago' ? (
                <button type="button" onClick={() => onApprovePayment(createdOrder.paymentId)}>Simular pago aprobado</button>
              ) : (
                <p className="manual-note">El atleta usa el link y el admin valida el pago desde el panel.</p>
              )}
              <button type="button" className="secondary-action" onClick={() => onNavigate('admin')}>Ver en panel</button>
            </div>
          ) : (
            <p>Al enviar el formulario se crea una orden y queda visible para administración.</p>
          )}
        </aside>
      </section>
    </main>
  )
}

function AdminPage({ canEdit, dashboard, filters, filteredRegistrations, onApprovePayment, onExportAdmin, onExportPluUsa, onSetFilters, payments, role, setRole }) {
  return (
    <main className="admin-layout">
      <section className="admin-toolbar">
        <div>
          <span>Panel interno</span>
          <h1>Operación PLU ARG</h1>
        </div>
        <label>
          Rol
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="admin_maximal">Admin Maximal</option>
            <option value="admin_plu_arg">Admin PLU ARG</option>
            <option value="viewer_plu_usa">PLU USA lectura</option>
          </select>
        </label>
      </section>

      <section className="metric-grid">
        {dashboard.map((item) => {
          const Icon = item.icon
          return (
            <article className="metric-card" key={item.label}>
              <Icon size={20} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          )
        })}
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <div>
            <h2>Inscripciones</h2>
            <p>Vista combinada de atleta, evento, pago y estado administrativo.</p>
          </div>
          <div className="export-actions">
            <button type="button" onClick={onExportAdmin} disabled={!canEdit}><Download size={17} /> CSV admin</button>
            <button type="button" onClick={onExportPluUsa}><FileSpreadsheet size={17} /> PLU USA</button>
          </div>
        </div>

        <div className="filters">
          <label>
            <Search size={16} />
            <input
              placeholder="Buscar atleta, DNI o categoría"
              value={filters.query}
              onChange={(event) => onSetFilters((current) => ({ ...current, query: event.target.value }))}
            />
          </label>
          <label>
            <Filter size={16} />
            <select value={filters.status} onChange={(event) => onSetFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="all">Todos los estados</option>
              <option value="pending_payment">Pendiente de pago</option>
              <option value="manual_pending">Validación manual</option>
              <option value="confirmed">Confirmada</option>
              <option value="approved">Pago aprobado</option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Atleta</th>
                <th>Evento</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Pago</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistrations.map((registration) => {
                const payment = payments.find((item) => item.athleteId === registration.athleteId)
                return (
                  <tr key={registration.id}>
                    <td><strong>{registration.athlete?.fullName}</strong><span>{registration.athlete?.documentId}</span></td>
                    <td>{registration.event}</td>
                    <td>{registration.category}<span>{registration.division} / {registration.bodyweight} kg</span></td>
                    <td><StatusPill value={registration.status} /></td>
                    <td><StatusPill value={payment?.status} /><span>{payment ? money(payment.amount) : '-'}</span></td>
                    <td>
                      <button type="button" className="small-action" onClick={() => onApprovePayment(payment?.id)} disabled={!canEdit || payment?.status === 'approved'}>
                        Validar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function PageFrame({ children, eyebrow, title }) {
  return (
    <main className="content-page">
      <section className="page-heading">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
      </section>
      {children}
    </main>
  )
}

function BenefitCard({ icon: Icon, title, text }) {
  return (
    <article className="benefit-card">
      <Icon size={44} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function PricingCard({ details, onJoin, price, title }) {
  return (
    <article className="pricing-card">
      <h3>{title}</h3>
      <div><span>$</span>{price.replace('$', '')}</div>
      <p>por año</p>
      <ul>
        {details.map((detail) => <li key={detail}><CheckCircle2 size={16} />{detail}</li>)}
      </ul>
      <button type="button" onClick={onJoin}>Inscribirse</button>
    </article>
  )
}

function InfoCard({ action, onAction, text, title }) {
  return (
    <article className="info-card">
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <button type="button" onClick={onAction}>{action}</button>}
    </article>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      {label}
      <input {...props} />
    </label>
  )
}

function Select({ label, options, ...props }) {
  return (
    <label className="field">
      {label}
      <select {...props}>
        {options.map((option) => {
          const value = Array.isArray(option) ? option[0] : option
          const text = Array.isArray(option) ? option[1] : option
          return <option key={value} value={value}>{text}</option>
        })}
      </select>
    </label>
  )
}

function StatusPill({ value }) {
  return <span className={`status status-${value}`}>{statusLabels[value] || value || '-'}</span>
}

export default App
