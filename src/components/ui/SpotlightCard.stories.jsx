import SpotlightCard from './SpotlightCard.jsx'

export default {
  title: 'UI/SpotlightCard',
  component: SpotlightCard,
  tags: ['autodocs'],
  render: (args) => (
    <SpotlightCard {...args} style={{ padding: '1.5rem', maxWidth: 320 }}>
      Contenido destacado dentro de la card.
    </SpotlightCard>
  ),
}

export const Default = {}
