import AdminShell from './AdminShell.jsx'
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin-institutional.css'

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

export const CollapsedRail = {
  parameters: {
    docs: {
      description: {
        story: 'Rail de iconos centrado, sin scroll horizontal. El nombre de cada ítem va en el title nativo.',
      },
    },
  },
  decorators: [
    (Story) => {
      try {
        window.localStorage.setItem('plu-admin-sidebar-mode', 'collapsed')
        window.localStorage.setItem('plu-admin-sidebar-collapsed', '1')
      } catch {
        // ignore
      }
      return <Story />
    },
  ],
}

export const HiddenSidebar = {
  parameters: {
    docs: {
      description: {
        story:
          'Sidebar oculto al 100%. El control para restaurarlo vive en la barra superior del main (icono de panel).',
      },
    },
  },
  decorators: [
    (Story) => {
      try {
        window.localStorage.setItem('plu-admin-sidebar-mode', 'hidden')
        window.localStorage.setItem('plu-admin-sidebar-collapsed', '1')
      } catch {
        // ignore
      }
      return <Story />
    },
  ],
}

export const RestrictedPartner = {
  args: { restrictedNav: 'pluUsa', roleLabel: 'Partner PLU USA' },
}

export const RestrictedSecurity = {
  args: { restrictedNav: 'checkin', roleLabel: 'Seguridad', activeSection: 'checkin' },
}
