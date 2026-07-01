import { useState, useEffect } from 'react'
import NavbarPublic from './components/layout/NavbarPublic.jsx'
import Footer from './components/layout/Footer.jsx'
import PageTransition from './components/layout/PageTransition.jsx'
import { useAppData } from './hooks/useAppData.js'
import { PRICING } from './lib/constants.js'
import { UPCOMING_EVENTS } from './lib/events.js'
import { canViewAdmin, getRoleLabel } from './lib/roles.js'
import AdminPage from './pages/AdminPage.jsx'
import AthleteProfilePage from './pages/AthleteProfilePage.jsx'
import CommunityPage from './pages/CommunityPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import FAQPage from './pages/FAQPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MembersPage from './pages/MembersPage.jsx'
import PitbullPage from './pages/PitbullPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import RulebookPage from './pages/RulebookPage.jsx'

const PUBLIC_VIEWS = {
  home: HomePage,
  members: MembersPage,
  pitbull: PitbullPage,
  events: EventsPage,
  results: ResultsPage,
  rulebook: RulebookPage,
  community: CommunityPage,
  faq: FAQPage,
  contact: ContactPage,
  register: RegisterPage,
  login: LoginPage,
}

export default function App() {
  const [view, setView] = useState('home')
  const [selectedEvent, setSelectedEvent] = useState(UPCOMING_EVENTS[0])
  const app = useAppData()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  function navigate(nextView) {
    const adminRequired = nextView === 'admin'
    const athleteRequired = ['profile', 'membership', 'competition'].includes(nextView)
    const blocked =
      (adminRequired && !canViewAdmin(app.session?.role)) ||
      (athleteRequired && app.session?.role !== 'athlete_plu')
    setView(blocked ? 'login' : nextView)
  }

  function selectEvent(event) {
    setSelectedEvent(event)
    navigate('competition')
  }

  if (view === 'admin' && canViewAdmin(app.session?.role)) {
    return (
      <AdminPage
        canEdit={app.userCanEdit}
        dashboard={app.dashboard}
        filters={app.filters}
        filteredRegistrations={app.filteredRegistrations}
        enrichedMemberships={app.enrichedMemberships}
        pendingActions={app.pendingActions}
        adminNavBadges={app.adminNavBadges}
        getAthleteDetail={app.getAthleteDetail}
        onApprovePayment={app.handleApprovePayment}
        onExportAdmin={app.exportAdminCsv}
        onExportPluUsa={app.exportPluUsaCsv}
        onSetFilters={app.setFilters}
        payments={app.payments}
        athletes={app.athletes}
        roleLabel={getRoleLabel(app.session?.role)}
        onExit={() => navigate('home')}
      />
    )
  }

  const Page = PUBLIC_VIEWS[view] || HomePage

  const pageProps =
    view === 'register'
      ? {
          createdOrder: app.createdOrder,
          form: app.form,
          onApprovePayment: app.handleApprovePayment,
          flow: 'profile',
          onSubmit: app.registerAthlete,
          onUpdateForm: app.updateForm,
          total: 0,
        }
      : view === 'login'
        ? { onNavigate: navigate, onLogin: app.login }
        : ['events', 'home'].includes(view)
          ? { onNavigate: navigate, onSelectEvent: selectEvent }
        : { onNavigate: navigate }

  if (view === 'profile' && app.session?.role === 'athlete_plu') {
    return <PrivateLayout app={app} view={view} navigate={navigate}><AthleteProfilePage athlete={app.athletes.find((item) => item.id === app.session.athleteId)} memberships={app.memberships} onNavigate={navigate} onSelectEvent={selectEvent} payments={app.payments} registrations={app.registrations} /></PrivateLayout>
  }

  if (['membership', 'competition'].includes(view) && app.session?.role === 'athlete_plu') {
    const athlete = app.athletes.find((item) => item.id === app.session.athleteId)
    const flow = view
    return <PrivateLayout app={app} view={view} navigate={navigate}><RegisterPage athlete={athlete} createdOrder={app.createdOrder} event={selectedEvent} flow={flow} form={app.form} onApprovePayment={app.handleApprovePayment} onSubmit={flow === 'membership' ? app.submitMembership : app.submitCompetition} onUpdateForm={app.updateForm} total={flow === 'membership' ? PRICING.membership : PRICING.event} /></PrivateLayout>
  }

  return (
    <div className="app-shell">
      <NavbarPublic activeView={view} onLogout={app.logout} onNavigate={navigate} session={app.session} />
      <PageTransition viewKey={view}>
        <Page {...pageProps} />
      </PageTransition>
      <Footer onNavigate={navigate} />
    </div>
  )
}

function PrivateLayout({ app, children, navigate, view }) {
  return <div className="app-shell"><NavbarPublic activeView={view} onLogout={() => { app.logout(); navigate('home') }} onNavigate={navigate} session={app.session} /><PageTransition viewKey={view}>{children}</PageTransition><Footer onNavigate={navigate} /></div>
}
