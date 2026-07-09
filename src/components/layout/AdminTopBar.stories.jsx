import AdminTopBar from './AdminTopBar.jsx'

export default {
  title: 'Layout/AdminTopBar',
  component: AdminTopBar,
  tags: ['autodocs'],
  args: {
    title: 'Dashboard',
    subtitle: 'Resumen general de la plataforma',
    eyebrow: 'Panel',
    searchValue: '',
    onSearchChange: () => {},
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
