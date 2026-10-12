import LaunchRegistrationTeaser from './LaunchRegistrationTeaser.jsx'

/**
 * "Inscripciones en breve": el estado lo decide el evento (Próximamente o una
 * fecha de apertura que todavía no llegó) y el interruptor de cobros del
 * panel, no el entorno. Tres casos: sin fecha, con cuenta regresiva y compacto.
 */

const IN_THREE_WEEKS = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()

const SOON = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic', status: 'proximamente' }
const SCHEDULED = {
  ...SOON,
  status: 'inscripcion_abierta',
  registrationOpensAt: IN_THREE_WEEKS,
}

export default {
  title: 'UI/LaunchRegistrationTeaser',
  component: LaunchRegistrationTeaser,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
        <Story />
      </div>
    ),
  ],
}

export const ProximamenteSinFecha = {
  args: { event: SOON, variant: 'hero', onNavigate: () => {} },
}

export const AbreEnUnaFecha = {
  args: { event: SCHEDULED, variant: 'hero', onNavigate: () => {} },
}

export const Compacto = {
  args: { event: SOON, variant: 'compact', onNavigate: () => {} },
}
