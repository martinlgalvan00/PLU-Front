import PageTransition from './PageTransition.jsx'

export default {
  title: 'Layout/PageTransition',
  component: PageTransition,
  tags: ['autodocs'],
  args: {
    viewKey: 'home',
    direction: 'forward',
  },
  render: (args) => (
    <PageTransition {...args}>
      <div className="surface-card" style={{ padding: '1.5rem' }}>
        Contenido de la vista
      </div>
    </PageTransition>
  ),
}

export const Default = {}
