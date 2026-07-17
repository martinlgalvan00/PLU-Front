import AdminEventSecuritySection from './AdminEventSecuritySection.jsx'

const MOCK_USERS = [
  { id: 'usr-1', name: 'Lucía Fernández', email: 'lucia.fernandez@pluarg.com.ar', role: 'seguridad_plu_arg', status: 'active' },
  { id: 'usr-2', name: 'Martín Sosa', email: 'martin.sosa@pluarg.com.ar', role: 'seguridad_plu_arg', status: 'disabled' },
]

async function mockList() {
  return MOCK_USERS
}

async function mockCreate({ name, email }) {
  return {
    user: { id: `usr-${Date.now()}`, name, email, role: 'seguridad_plu_arg', status: 'active' },
    tempPassword: 'Tmp-1234abcd',
  }
}

async function mockUpdateStatus(userId, status) {
  const found = MOCK_USERS.find((user) => user.id === userId) ?? MOCK_USERS[0]
  return { ...found, status }
}

export default {
  title: 'Admin/AdminEventSecuritySection',
  component: AdminEventSecuritySection,
  tags: ['autodocs'],
  args: {
    canManageUsers: true,
    eventId: 'evt-1',
    eventSlug: 'pitbull-classic-2026',
    onCreateSecurityUser: mockCreate,
    onListSecurityUsers: mockList,
    onUpdateSecurityUserStatus: mockUpdateStatus,
  },
}

export const Default = {}

export const ReadOnly = {
  args: { canManageUsers: false },
}

export const Empty = {
  args: { onListSecurityUsers: async () => [] },
}
