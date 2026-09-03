import AdminTopBar from './AdminTopBar.jsx'
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin-institutional.css'
import '../../styles/pages/admin-minimal.css'

export default {
  title: 'Layout/AdminTopBar',
  component: AdminTopBar,
  tags: ['autodocs'],
  args: {
    title: 'Dashboard',
    subtitle: 'Resumen general de la plataforma',
    eyebrow: 'Panel',
    athletes: [
      { id: '1', fullName: 'Iara Méndez', documentId: '40111222', gym: 'Titanium Gym' },
      { id: '2', fullName: 'Franco Robledo', documentId: '40887213', gym: 'Fuerza Bruta CABA' },
    ],
    events: [{ id: 'e1', title: 'Pitbull Classic', slug: 'pitbull-classic', venue: 'CABA' }],
    onSelectAthlete: () => {},
    onSelectEvent: () => {},
    onSearchSubmit: () => {},
    onAlertClick: () => {},
  },
}

export const Default = {}

export const WithAlerts = {
  args: { alertCount: 5 },
}

export const NoSearch = {
  args: { showSearch: false },
}

export const DashboardCompact = {
  args: {
    title: 'Operaciones',
    subtitle: 'Lectura operativa y pendientes',
    eyebrow: 'Hoy',
    showSearch: false,
    alertCount: 14,
  },
  decorators: [
    (Story) => (
      <div className="admin-shell admin-dashboard admin-dashboard--compact">
        <Story />
      </div>
    ),
  ],
}
