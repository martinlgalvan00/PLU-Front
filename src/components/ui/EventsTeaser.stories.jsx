import EventsTeaser from './EventsTeaser.jsx'

export default {
  title: 'UI/EventsTeaser',
  component: EventsTeaser,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
}

export const Default = {}
