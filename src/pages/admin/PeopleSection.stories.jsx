import { useState } from 'react'
import PeopleSection from './PeopleSection.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/pages/admin-minimal.css'

const TABS = [
  { id: 'athletes', label: 'Atletas' },
  { id: 'memberships', label: 'Afiliaciones' },
  { id: 'registrations', label: 'Inscripciones' },
]

function PeopleSectionDemo({ tabs = TABS }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id)

  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ background: 'var(--admin-canvas)', padding: '24px' }}>
        <div style={{ maxWidth: 640 }}>
          <PeopleSection activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs}>
            <div
              style={{
                marginTop: 14,
                padding: '18px 20px',
                borderRadius: 14,
                border: '1px solid var(--admin-hairline)',
                background: 'var(--admin-surface)',
                color: 'var(--admin-ink)',
                fontSize: 13,
              }}
            >
              Panel de <strong>{tabs.find((tab) => tab.id === activeTab)?.label}</strong> -- acá
              monta la sección especializada real (columnas, filtros y acciones propias, sin
              cambios).
            </div>
          </PeopleSection>
        </div>
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/PeopleSection',
  component: PeopleSection,
  tags: ['autodocs'],
}

/** Las tres pestañas visibles -- rol con permiso de lectura sobre Atletas, Afiliaciones e Inscripciones. */
export const Default = {
  render: () => <PeopleSectionDemo />,
}

/** Un rol con permiso sobre un solo módulo no ve pestañas: el panel se monta directo, sin selector redundante. */
export const UnaSolaPestana = {
  render: () => <PeopleSectionDemo tabs={[TABS[0]]} />,
}
