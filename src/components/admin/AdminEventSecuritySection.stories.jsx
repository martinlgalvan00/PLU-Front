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

async function mockCreateBulk({ users }) {
  return {
    created: users.map((entry, index) => ({
      user: { id: `usr-bulk-${index}`, name: entry.name, email: entry.email, role: 'seguridad_plu_arg', status: 'active' },
      tempPassword: `Tmp-${index}abcd`,
      emailed: false,
    })),
    skipped: [],
  }
}

async function mockDeactivateAll() {
  return MOCK_USERS.filter((user) => user.status === 'active').length
}

async function mockCreateAccessLink(userId, sendEmail) {
  return {
    url: `https://plu-arg.com/evento/pitbull-classic-2026/seguridad?acceso=demo-token-${userId}`,
    token: `demo-token-${userId}`,
    expiresAt: '2026-12-20T00:00:00.000Z',
    emailed: Boolean(sendEmail),
  }
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
    onCreateSecurityUsersBulk: mockCreateBulk,
    onCreateSecurityAccessLink: mockCreateAccessLink,
    onDeactivateAllSecurityUsers: mockDeactivateAll,
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

export const ApiUnavailable = {
  args: {
    onListSecurityUsers: async () => {
      const error = new Error('El servicio no está disponible en este momento.')
      error.status = 0
      throw error
    },
  },
}
