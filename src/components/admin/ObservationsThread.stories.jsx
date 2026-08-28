import ObservationsThread from './ObservationsThread.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/**
 * El hilo de observaciones de una inscripción.
 *
 * Mezcla a propósito las dos formas de dejar algo escrito: la observación
 * suelta (nadie movió el estado) y el motivo de un cambio de estado, que la
 * base asienta en el mismo hilo. Para quien lee el caso son lo mismo -- lo que
 * se dijo sobre esta inscripción, en orden -- y lo que las distingue es el badge
 * del estado que acompañó a cada una.
 *
 * Los textos son los de las dos observaciones reales que la organización cargó.
 */

const ENTITY_ID = '428a53ac-184d-43a0-8d6c-e7e35ffdeccf'

const THREAD = [
  {
    id: 'obs-3',
    entity_type: 'registration',
    entity_id: ENTITY_ID,
    body: 'Confirmado con el titular de la cuenta. Se acredita.',
    status_change: 'confirmada',
    author: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
    created_at: '2026-08-27T14:20:11.000Z',
  },
  {
    id: 'obs-2',
    entity_type: 'registration',
    entity_id: ENTITY_ID,
    body: 'Se le escribió por Instagram para pedirle el comprobante. Sin respuesta todavía.',
    status_change: null,
    author: 'cmss0uv370000ib04nfhrk133:finanzas@plu.org.ar',
    created_at: '2026-08-27T03:05:00.000Z',
  },
  {
    id: 'obs-1',
    entity_type: 'registration',
    entity_id: ENTITY_ID,
    body: 'EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ',
    status_change: 'observada',
    author: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
    created_at: '2026-08-27T00:59:23.511675Z',
  },
]

/**
 * El hilo lee por API. Sin backend detrás, Storybook mostraría el estado de
 * error y la QA visual no mediría el caso normal. Mismo patrón de intercepción
 * que `FinanceSection.stories.jsx`.
 */
function withThread(observations) {
  return (Story) => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
      if (url.includes('/api/athletes/admin/observations/list')) {
        return new Response(JSON.stringify({ observations }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/athletes/admin/observations')) {
        return new Response(JSON.stringify({ observation: THREAD[0] }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return original ? original(input, init) : new Response('{}', { status: 200 })
    }
    return <Story />
  }
}

function Frame({ canWrite = true }) {
  return (
    <AppConfigProvider>
      <div
        className="admin-shell"
        style={{ background: 'var(--admin-canvas)', maxWidth: '720px', padding: '24px' }}
      >
        <ObservationsThread canWrite={canWrite} entityId={ENTITY_ID} entityType="registration" />
      </div>
    </AppConfigProvider>
  )
}

function FichaFrame({ canWrite = true }) {
  return (
    <AppConfigProvider>
      <div
        className="admin-shell"
        style={{ background: 'var(--admin-canvas)', maxWidth: '1331px', padding: '24px' }}
      >
        <div className="athlete-detail__panel">
          <section className="athlete-detail__observations">
            <h4 className="athlete-detail__observations-title">
              Observaciones
              <span className="athlete-detail__observations-event">Pitbull Classic</span>
            </h4>
            <ObservationsThread canWrite={canWrite} entityId={ENTITY_ID} entityType="registration" />
          </section>
        </div>
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/ObservationsThread',
  component: ObservationsThread,
  tags: ['autodocs'],
}

/** Un caso que pasó por tres manos: cada entrada con su autor, su fecha y el estado que puso. */
export const HiloCompleto = {
  decorators: [withThread(THREAD)],
  render: () => <Frame />,
}

/** Sin permiso de escritura: se lee, no se anota ni se borra. */
export const SoloLectura = {
  decorators: [withThread(THREAD)],
  render: () => <Frame canWrite={false} />,
}

/** Nada anotado todavía: el vacío invita a escribir, no parece un error. */
export const SinObservaciones = {
  decorators: [withThread([])],
  render: () => <Frame />,
}

/** El composer en la ficha del atleta, al ancho real del panel: no debe estirarse a 1300px. */
export const EnFichaDelAtleta = {
  decorators: [withThread([])],
  render: () => <FichaFrame />,
}
