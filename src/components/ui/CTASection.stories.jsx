import CTASection from './CTASection.jsx'

export default {
  title: 'UI/CTASection',
  component: CTASection,
  tags: ['autodocs'],
  args: {
    title: '¿Listo para competir?',
    description: 'Inscribite a la próxima fecha del calendario oficial.',
    primaryLabel: 'Inscribirme',
    secondaryLabel: 'Ver reglamento',
  },
}

export const Default = {}

export const PrimaryOnly = {
  args: { secondaryLabel: undefined },
}
