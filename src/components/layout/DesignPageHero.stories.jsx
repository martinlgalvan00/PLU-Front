import DesignPageHero from './DesignPageHero.jsx'

export default {
  title: 'Layout/DesignPageHero',
  component: DesignPageHero,
  tags: ['autodocs'],
  args: {
    breadcrumbLabel: 'Resultados',
    eyebrow: 'Competencia',
    title: 'Resultados oficiales',
    description: 'Consultá los rankings y marcas de cada evento.',
    onHome: () => {},
  },
}

export const Default = {}

export const Compact = {
  args: { compact: true },
}
