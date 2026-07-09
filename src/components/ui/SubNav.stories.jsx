import SubNav from './SubNav.jsx'

const items = [
  { href: '#about', label: 'Nosotros' },
  { href: '#events', label: 'Eventos' },
  { href: '#results', label: 'Resultados', shortLabel: 'Res.' },
]

export default {
  title: 'UI/SubNav',
  component: SubNav,
  tags: ['autodocs'],
  args: { items },
}

export const Scroll = {}

export const Tabs = {
  args: { mode: 'tabs', activeTabId: 'events', onTabChange: () => {} },
}
