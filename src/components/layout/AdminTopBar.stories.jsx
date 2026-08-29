import AdminTopBar from './AdminTopBar.jsx'

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
