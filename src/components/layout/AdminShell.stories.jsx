import AdminShell from './AdminShell.jsx'

export default {
  title: 'Layout/AdminShell',
  component: AdminShell,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    activeSection: 'dashboard',
    roleLabel: 'Administrador',
    onSectionChange: () => {},
    onExit: () => {},
    navBadges: { payments: 3, registrations: 1 },
  },
  render: (args) => (
    <AdminShell {...args}>
      <div style={{ padding: '2rem' }}>Contenido del panel</div>
    </AdminShell>
  ),
}

export const Default = {}

export const RestrictedPartner = {
  args: { restrictedNav: true, roleLabel: 'Partner PLU USA' },
}
