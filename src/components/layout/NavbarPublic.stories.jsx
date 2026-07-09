import NavbarPublic from './NavbarPublic.jsx'

export default {
  title: 'Layout/NavbarPublic',
  component: NavbarPublic,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    activeView: 'home',
    onNavigate: () => {},
    onLogout: () => {},
    session: null,
  },
}

export const LoggedOut = {}

export const LoggedIn = {
  args: {
    session: { fullName: 'Juan Pérez', role: 'athlete' },
  },
}

export const AdminSession = {
  args: {
    session: { fullName: 'Admin PLU', role: 'admin' },
  },
}
