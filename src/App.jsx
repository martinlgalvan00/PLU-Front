import { useState, useEffect } from 'react'
import NavbarPublic from './components/layout/NavbarPublic.jsx'
import Footer from './components/layout/Footer.jsx'
import PageTransition from './components/layout/PageTransition.jsx'
import { useAppData } from './hooks/useAppData.js'
import { PROCEDURE_TYPES } from './lib/constants.js'
import AdminPage from './pages/AdminPage.jsx'
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
  const app = useAppData()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  function navigate(nextView) {
    setView(nextView)
  }

  if (view === 'admin') {
    return (
      <AdminPage
        canEdit={app.userCanEdit}
        dashboard={app.dashboard}
        filters={app.filters}
        filteredRegistrations={app.filteredRegistrations}
        onApprovePayment={app.handleApprovePayment}
        onExportAdmin={app.exportAdminCsv}
        onExportPluUsa={app.exportPluUsaCsv}
        onSetFilters={app.setFilters}
        payments={app.payments}
        athletes={app.athletes}
        role={app.role}
        setRole={app.setRole}
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
          onNavigate: navigate,
          onSubmit: app.handleSubmit,
          onUpdateForm: app.updateForm,
          total: PROCEDURE_TYPES[app.form.procedureType]?.amount ?? 0,
        }
      : view === 'login'
        ? { onNavigate: navigate, role: app.role, setRole: app.setRole }
        : { onNavigate: navigate }

  return (
    <div className="app-shell">
      <NavbarPublic activeView={view} onNavigate={navigate} />
      <PageTransition viewKey={view}>
        <Page {...pageProps} />
      </PageTransition>
      <Footer onNavigate={navigate} />
    </div>
  )
}
