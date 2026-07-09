import StaggerReveal from './StaggerReveal.jsx'

export default {
  title: 'UI/StaggerReveal',
  component: StaggerReveal,
  tags: ['autodocs'],
  render: (args) => (
    <StaggerReveal {...args} style={{ display: 'flex', gap: '1rem' }}>
      <div className="surface-card" style={{ padding: '1rem' }}>Uno</div>
      <div className="surface-card" style={{ padding: '1rem' }}>Dos</div>
      <div className="surface-card" style={{ padding: '1rem' }}>Tres</div>
    </StaggerReveal>
  ),
}

export const Default = {}
