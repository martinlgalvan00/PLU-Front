import EventPublishChecklist from './EventPublishChecklist.jsx'
import { resolveEventPublishReadiness } from '../../../lib/eventPublishReadiness.js'

export default {
  title: 'Admin/EventPublishChecklist',
  component: EventPublishChecklist,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
}

const COMPLETE = {
  title: 'Copa Norte 2027',
  startsAt: '2027-03-20T09:00',
  endsAt: '2027-03-20T20:00',
  venue: 'Estadio Cubierto',
  location: 'Salta',
  slots: 120,
  status: 'proximamente',
  salesIntent: 'announce',
  description: 'Un meet nacional con tres plataformas y transmisión en vivo.',
  logoUrl: 'https://example.com/logo.png',
  landing: { slots: { ctaLabel: 'Inscribirme' } },
}

const NOW = new Date('2026-10-23T12:00:00-03:00')

export const Completo = {
  args: { readiness: resolveEventPublishReadiness(COMPLETE, { now: NOW }), onGoTo: () => {} },
}

export const FaltanDatos = {
  args: {
    readiness: resolveEventPublishReadiness(
      { ...COMPLETE, venue: '', location: '', description: '', logoUrl: '', slots: 0 },
      { now: NOW },
    ),
    onGoTo: () => {},
  },
}

export const SinAtajos = {
  args: { readiness: resolveEventPublishReadiness({ title: 'Borrador' }, { now: NOW }) },
}
