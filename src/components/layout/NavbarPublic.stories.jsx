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
    session: { name: 'Juan Pérez', role: 'athlete_plu' },
  },
}

export const AdminSession = {
  args: {
    session: { name: 'Admin PLU', role: 'admin' },
  },
}
