import PageFrame from './PageFrame.jsx'

export default {
  title: 'Layout/PageFrame',
  component: PageFrame,
  tags: ['autodocs'],
  args: {
    eyebrow: 'Comunidad',
    title: 'Nuestra historia',
    description: 'Conocé más sobre Powerlifting United Argentina.',
  },
  render: (args) => (
    <PageFrame {...args}>
      <p>Contenido de la página.</p>
    </PageFrame>
  ),
}

export const Default = {}
