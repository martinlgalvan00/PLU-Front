import AdminEventSaleControl from './AdminEventSaleControl.jsx'

/**
 * Control de venta de inscripciones: un estado por story. Las acciones
 * resuelven al instante (sin servidor) para poder recorrer los botones.
 */
export default {
  title: 'Admin/Venta de inscripciones',
  component: AdminEventSaleControl,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
}

const DAY = 86_400_000
const at = (days) => new Date(Date.now() + days * DAY).toISOString()

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  status: 'inscripcion_abierta',
  published: true,
  salesIntent: 'charge',
  slots: 180,
  registered: 46,
  endsAt: at(40),
  registrationClosesAt: at(30),
}

const args = {
  canEdit: true,
  onFix: () => {},
  onSetEventState: async () => ({}),
}

export const ALaVenta = { args: { ...args, event: EVENT } }

export const Programada = {
  args: { ...args, event: { ...EVENT, registrationOpensAt: at(5) } },
}

export const BloqueadaOcultaYSoloAnuncio = {
  args: { ...args, event: { ...EVENT, published: false, salesIntent: 'announce' } },
}

export const Cerrada = {
  args: { ...args, event: { ...EVENT, status: 'proximamente', registrationClosesAt: null } },
}

export const Agotada = { args: { ...args, event: { ...EVENT, registered: 180 } } }

export const SoloLectura = { args: { event: EVENT } }
