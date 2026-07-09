import PlatformMap from './PlatformMap.jsx'

const sections = [
  { key: 'members', title: 'Miembros', desc: 'Afiliación y credenciales', group: 'Comunidad' },
  { key: 'events', title: 'Eventos', desc: 'Calendario oficial', group: 'Competencia' },
  { key: 'results', title: 'Resultados', desc: 'Rankings y marcas', group: 'Competencia' },
  { key: 'rulebook', title: 'Reglamento', desc: 'Reglas oficiales', group: 'Comunidad' },
]

export default {
  title: 'UI/PlatformMap',
  component: PlatformMap,
  tags: ['autodocs'],
  args: {
    sections,
    onNavigate: () => {},
  },
}

export const Default = {}

export const Compact = {
  args: { variant: 'compact' },
}
