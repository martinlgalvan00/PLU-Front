import { useMemo, useState } from 'react'
import AthletesSection from './AthletesSection.jsx'
import MembershipsSection from './MembershipsSection.jsx'
import RegistrationsSection from './RegistrationsSection.jsx'
import PeopleSection from './PeopleSection.jsx'
import { AdminPreviewShell } from './adminPreviewShell.jsx'
import { PEOPLE_PREVIEW } from './peoplePreviewFixtures.js'

/**
 * Personas dentro del shell real (sidebar, header, hojas del panel) con un
 * padrón de tamaño realista. La story `Admin/PeopleSection` es un cascarón con
 * un placeholder: no sirve para juzgar tablas ni filtros.
 */

export default {
  title: 'Admin/Personas',
  parameters: { layout: 'fullscreen' },
}

const TABS = [
  { id: 'athletes', label: 'Atletas' },
  { id: 'memberships', label: 'Afiliaciones' },
  { id: 'registrations', label: 'Inscripciones' },
]

function RegistrationsPanel() {
  const [filters, setFilters] = useState({
    event: 'all',
    status: 'all',
    affiliationStatus: 'all',
    gym: 'all',
    division: 'all',
    query: '',
    createdAtRange: { from: '', to: '' },
  })
  const { registrations, athletes, payments } = PEOPLE_PREVIEW
  const athletesById = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes])
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return registrations
      .map((reg) => ({ ...reg, athlete: athletesById.get(reg.athleteId) }))
      .filter((reg) => {
        if (filters.event !== 'all' && reg.event !== filters.event) return false
        if (filters.status !== 'all' && reg.status !== filters.status) return false
        if (!q) return true
        return (
          reg.athlete?.fullName.toLowerCase().includes(q) ||
          reg.athlete?.documentId.includes(q) ||
          reg.athlete?.gym?.toLowerCase().includes(q)
        )
      })
  }, [filters, registrations, athletesById])

  return (
    <RegistrationsSection
      canAssignSchedule
      canEdit
      canSetStatus
      filters={filters}
      filteredRegistrations={filtered}
      athletes={athletes}
      payments={payments}
      registrations={registrations}
      registrationsCount={registrations.length}
      onApprovePayment={() => {}}
      onExportAdmin={() => {}}
      onExportPluUsa={() => {}}
      onSetFilters={(next) => setFilters((current) => (typeof next === 'function' ? next(current) : next))}
      onSelectAthlete={() => {}}
    />
  )
}

function Screen({ initialTab }) {
  const [tab, setTab] = useState(initialTab)
  const { athletes, memberships, registrations, payments } = PEOPLE_PREVIEW
  return (
    <AdminPreviewShell section="people">
      <PeopleSection activeTab={tab} onTabChange={setTab} tabs={TABS}>
        {tab === 'athletes' && (
          <AthletesSection
            athletes={athletes}
            registrations={registrations}
            payments={payments}
            canEdit
            onSelectAthlete={() => {}}
          />
        )}
        {tab === 'memberships' && (
          <MembershipsSection
            memberships={memberships}
            payments={payments}
            registrations={registrations}
            canManage
            onSelectAthlete={() => {}}
          />
        )}
        {tab === 'registrations' && <RegistrationsPanel />}
      </PeopleSection>
    </AdminPreviewShell>
  )
}

export const Atletas = { render: () => <Screen initialTab="athletes" /> }
export const Afiliaciones = { render: () => <Screen initialTab="memberships" /> }
export const Inscripciones = { render: () => <Screen initialTab="registrations" /> }
