import Reveal from './Reveal.jsx'

export default {
  title: 'UI/Reveal',
  component: Reveal,
  tags: ['autodocs'],
  render: (args) => (
    <Reveal {...args}>
      <div className="surface-card" style={{ padding: '1.5rem' }}>
        Contenido revelado
      </div>
    </Reveal>
  ),
}

export const Default = {}
