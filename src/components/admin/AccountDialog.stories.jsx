import AccountDialog from './AccountDialog.jsx'
import '../../styles/pages/admin-account.css'

export default {
  title: 'Admin/AccountDialog',
  component: AccountDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    session: {
      name: 'Agustín Di Santo',
      email: 'agus@pluarg.com.ar',
      roleLabel: 'Administrador',
    },
    onRequestEmailChange: async () => ({ pendingEmail: 'nuevo@pluarg.com.ar' }),
    onClose: () => {},
  },
  decorators: [
    (Story) => {
      document.documentElement.dataset.surface = 'admin'
      return <Story />
    },
  ],
}

export const Default = {}
