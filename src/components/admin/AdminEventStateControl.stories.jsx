// Mismo orden que `AdminPage`: las hojas del panel son de ruta, no globales, y
// `admin-minimal` depende de pisar a las dos anteriores. Sin esto la historia
// renderiza la banda sin gutter, sin hairline y con los chips a 23px de alto.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-institutional.css'
import '../../styles/pages/admin-minimal.css'
import AdminEventStateControl from './AdminEventStateControl.jsx'

/**
 * Banda de control de estado del evento: abrir, cerrar y publicar sin abrir el
 * editor completo.
 *
 * Las historias envuelven el componente en las clases del panel real
 * (`admin-shell` > `admin-list-section--events` > `admin-list-shell--events`)
 * porque sus estilos viven bajo ese scope: renderizarlo suelto lo mostraría
 * sin gutter, sin hairline y sin los tokens de admin.
 */

const BASE_EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  status: 'inscripcion_abierta',
  published: true,
  slots: 180,
  registered: 46,
}

function withPanel(Story) {
  return (
    // `admin-shell` va como scope de estilos, no como layout: la clase real
    // arma la grilla sidebar + contenido y, con un solo hijo, la columna del
    // contenido colapsa a 0px y la historia sale en blanco.
    <div className="admin-shell" style={{ display: 'block' }}>
      <div className="admin-list-section admin-list-section--events">
        <div className="admin-list-shell admin-list-shell--events">
          <aside className="admin-event-preview admin-event-preview--panel">
            <Story />
          </aside>
        </div>
      </div>
    </div>
  )
}

/** Acepta el cambio y lo devuelve tal cual: el camino feliz. */
const acceptState = async (slug, changes) => ({
  event: { ...BASE_EVENT, ...changes },
  events: [],
  statusOverridden: false,
})

export default {
  title: 'Admin/AdminEventStateControl',
  component: AdminEventStateControl,
  parameters: { layout: 'padded' },
  decorators: [withPanel],
}

/** Inscripción abierta con lugar de sobra. */
export const Abierto = {
  args: { canEdit: true, event: BASE_EVENT, onSetState: acceptState },
}

/**
 * Meet abierto: no pide afiliación. Es la excepción en el calendario, así que
 * el control lo dice con la consecuencia entera —en la puerta alcanza la
 * inscripción confirmada— y no con un checkbox apagado.
 */
export const AccesoAbierto = {
  args: {
    canEdit: true,
    event: { ...BASE_EVENT, requiresMembership: false },
    onSetState: acceptState,
  },
}

/**
 * Solo afiliados con gente ya inscripta: la advertencia de que un inscripto sin
 * afiliación vigente queda bloqueado en la puerta. Es la consecuencia que antes
 * no se veía en ninguna parte del panel.
 */
export const AccesoSoloAfiliadosConInscriptos = {
  args: {
    canEdit: true,
    event: { ...BASE_EVENT, requiresMembership: true, registered: 46 },
    onSetState: acceptState,
  },
}

/** Despublicado: el evento existe en el panel pero no se ve en el sitio. */
export const SinPublicar = {
  args: {
    canEdit: true,
    event: { ...BASE_EVENT, published: false, status: 'proximamente' },
    onSetState: acceptState,
  },
}

/**
 * Cupo lleno. El chip `agotado` aparece solo en este caso -- no es elegible a
 * mano -- y la nota explica que lo puso el sistema.
 */
export const CupoLleno = {
  args: {
    canEdit: true,
    event: { ...BASE_EVENT, status: 'agotado', registered: 80 },
    onSetState: acceptState,
  },
}

/**
 * El operador reabre un evento que sigue lleno y la base lo devuelve a
 * `agotado`. Es el caso que más confunde si la pantalla no lo dice.
 *
 * Flujo staged: tocá un chip de estado (pre-selecciona, sin guardar) y después
 * "Guardar" -- el notice explica que la base corrigió el estado pedido.
 */
export const ReaperturaRevertida = {
  args: {
    canEdit: true,
    event: { ...BASE_EVENT, status: 'agotado', registered: 80 },
    onSetState: async () => ({
      event: { ...BASE_EVENT, status: 'agotado', registered: 80 },
      events: [],
      statusOverridden: true,
    }),
  },
}

/** Sin permiso de escritura: se ve el estado, no se puede cambiar. */
export const SoloLectura = {
  args: { canEdit: false, event: BASE_EVENT, onSetState: acceptState },
}

/** Banda en viewport angosto: rail horizontal y Publicado en fila propia. */
export const BandaAngosta = {
  args: { canEdit: true, event: BASE_EVENT, onSetState: acceptState },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
}

/** El backend rechaza el cambio: el error se muestra en la misma banda. */
export const ConError = {
  args: {
    canEdit: true,
    event: BASE_EVENT,
    onSetState: async () => ({ error: 'No se pudo cambiar el estado del evento.' }),
  },
}
