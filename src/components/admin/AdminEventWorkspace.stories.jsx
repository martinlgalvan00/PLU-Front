// Mismo orden que `AdminPage`: las hojas del panel son de ruta, no globales.
// Sin las cuatro, el workspace renderiza sin gutter, sin hairline y con las
// pestañas a 23px de alto (ver AdminEventStateControl.stories.jsx).
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-institutional.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'
import { Save } from 'lucide-react'
import Button from '../ui/Button.jsx'
import AdminEventStructureEditor from './AdminEventStructureEditor.jsx'
import AdminEventWorkspace from './AdminEventWorkspace.jsx'

/**
 * La página del evento: seis pestañas planas con URL propia, en reemplazo de
 * la consola-modal con acordeones.
 *
 * El `editor` real (`AdminEventEditor` en modo acordeón) se sustituye acá por
 * un bloque de relleno: estas historias existen para revisar el chrome de la
 * página —- encabezado persistente, rail de pestañas, split con rail, los
 * capítulos de Ventas y los interruptores del sitio público -—, no el
 * formulario, que tiene sus propias historias.
 */

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  date: '14 nov',
  dateISO: '2026-11-14',
  venue: 'Club Atlético Fénix',
  location: 'Pilar, Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  requiresMembership: true,
  slots: 180,
  registered: 46,
  pricing: { registration: 85000, membership: 92500, ticketAddons: [] },
  eventDays: [
    { dayIndex: 0, label: 'Jornada 1', date: '2026-11-14' },
    { dayIndex: 1, label: 'Jornada 2', date: '2026-11-15' },
  ],
  ticketTypes: [{ id: 'tt-1', name: 'General', price: 12000, active: true }],
}

function EditorStub({ label }) {
  return (
    <div
      style={{
        alignItems: 'center',
        border: '1px dashed var(--color-border-subtle)',
        borderRadius: '10px',
        color: 'var(--color-text-muted)',
        display: 'flex',
        fontSize: '12.5px',
        justifyContent: 'center',
        minHeight: '320px',
        padding: '24px',
      }}
    >
      {label}
    </div>
  )
}

/**
 * El stub de arriba es un `div` suelto, así que nunca activó las reglas
 * scopeadas al editor acordeón -- y por eso el doble scroll de Datos no se veía
 * en ninguna historia. Este reproduce la cadena de clases real y un alto que
 * supera el viewport, que es exactamente lo que dispara la contención.
 */
function EditorStubAcordeon({ bloques = 8 }) {
  return (
    <div className="admin-event-editor admin-event-editor--embedded admin-event-editor--accordion">
      <div className="admin-event-form admin-event-form--editor">
        <div className="admin-event-form__body">
          {Array.from({ length: bloques }, (_, i) => (
            <div
              key={i}
              style={{
                border: '1px dashed var(--color-border-subtle)',
                borderRadius: '10px',
                color: 'var(--color-text-muted)',
                fontSize: '12.5px',
                minHeight: '140px',
                padding: '16px',
              }}
            >
              {`Bloque ${i + 1} de la ficha del evento`}
            </div>
          ))}
        </div>
        {/* Misma estructura que el dock real (`AdminEventEditor`): el estado de
            guardado a la izquierda y los dos botones a la derecha. */}
        <div className="admin-event-form__actions">
          <div className="admin-event-form__save-state admin-event-form__save-state--actions">
            <span aria-hidden />
            <strong>Cambios sin guardar</strong>
          </div>
          <div className="admin-event-form__action-buttons">
            <Button type="button" variant="outline">
              Cerrar sección
            </Button>
            <Button type="button" variant="gold">
              <Save size={15} aria-hidden />
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function withShell(Story) {
  return (
    // `admin-shell` va como scope de estilos, no como layout: con un solo hijo
    // su grilla colapsa la columna de contenido a 0px y la historia sale en
    // blanco.
    //
    // Y NO se envuelve en `admin-list-shell--events`: esa es la grilla de la
    // LISTA (lista + panel de 340px). El workspace reemplaza al listado, no
    // vive dentro de él -- meterlo ahí angostaba la columna principal a ~390px
    // y no era lo que se ve en la app.
    // El alto va acotado a mano: el decorador global de `.storybook/preview.jsx`
    // mete `padding: 2rem`, así que un `.admin-shell` de 100dvh desborda el
    // documento en 4rem y el dock sticky aparece cortado por abajo -- artefacto
    // del arnés, no de la app, donde el shell ocupa el viewport exacto.
    <div className="admin-shell" style={{ display: 'block', height: 'calc(100dvh - 4rem)' }}>
      {/* El scroll del admin lo hace `.admin-shell__content` (`overflow: auto`),
          no el documento. Sin este envoltorio la historia scrolleaba en un lugar
          que no existe en la app y el sticky del encabezado y del dock de
          acciones se anclaba mal. */}
      <div
        className="admin-shell__content ant-layout-content"
        style={{ height: '100%', maxWidth: 'min(1280px, 100%)' }}
      >
        <Story />
      </div>
    </div>
  )
}

const baseArgs = {
  canDelete: true,
  canEdit: true,
  canManageUsers: true,
  event: EVENT,
  onBack: () => {},
  onDelete: () => {},
  onManageCheckin: () => {},
  onManageRegistrations: () => {},
  onSelectChapter: () => {},
  onSelectSection: () => {},
  onSetEventState: async () => ({ event: EVENT, events: [EVENT] }),
  onToggleOccupancy: () => {},
  onTogglePublicModule: () => {},
  paymentSummary: '3 pendientes',
  paymentsAttention: 3,
  paymentsSection: <EditorStub label="Triage de pagos del meet" />,
  securitySection: <EditorStub label="Zonas y cuentas de seguridad" />,
  structureEditor: <EditorStub label="Jornadas, pesajes y tandas" />,
  tickets: [],
}

export default {
  title: 'Admin/AdminEventWorkspace',
  component: AdminEventWorkspace,
  parameters: { layout: 'fullscreen' },
  decorators: [withShell],
}

/** Resumen: KPIs de inscripción/recaudación/check-in y accesos rápidos. */
export const Resumen = {
  args: {
    ...baseArgs,
    activeSection: 'dashboard',
    tickets: [
      { id: 'tk-1', amountPaid: 12000, checkedInAt: '2026-11-14T09:03:00Z' },
      { id: 'tk-2', amountPaid: 12000, checkedInAt: null },
      { id: 'tk-3', amountPaid: 12000, checkedInAt: '2026-11-14T09:11:00Z' },
    ],
  },
}

/** Resumen sin cupo tope ni entradas emitidas: los dos estados vacíos a la vez. */
export const ResumenSinDatos = {
  args: {
    ...baseArgs,
    activeSection: 'dashboard',
    event: { ...EVENT, slots: 0, registered: 0 },
    tickets: [],
  },
}

/** Datos: estado del evento arriba, ocupación y accesos en el rail. */
export const Datos = {
  args: {
    ...baseArgs,
    activeSection: 'basics',
    editor: <EditorStub label="Ficha del evento (AdminEventEditor)" />,
  },
}

/**
 * Datos con el formulario largo: el caso donde el editor no entra en pantalla.
 * La pestaña tiene que scrollear con la página -- un solo scroll -- y el dock de
 * acciones quedar a la vista mientras el editor está en pantalla.
 */
export const DatosFormularioLargo = {
  args: {
    ...baseArgs,
    activeSection: 'basics',
    editor: <EditorStubAcordeon />,
  },
}

/** Entradas: los cuatro capítulos como sub-pestañas, un tema a la vez. */
export const Entradas = {
  args: {
    ...baseArgs,
    activeSection: 'sales',
    openChapter: 'cupo',
    editor: <EditorStub label="Cupo e inscripción" />,
  },
}

/** Vista pública: interruptores de un toque por bloque de la página. */
export const VistaPublica = {
  args: {
    ...baseArgs,
    activeSection: 'visibility',
    editor: <EditorStub label="Publicación y destacado" />,
  },
}

/**
 * Zonas: el aviso dice lo que el sistema todavía no hace. Un operador que
 * cree que el puesto filtra el ingreso deja la entrada en calor sin control.
 */
export const ZonasYSeguridad = {
  args: { ...baseArgs, activeSection: 'security', editor: null },
}

/**
 * Estructura y Pagos van a ancho completo, sin rail. Esta historia monta el
 * editor REAL para poder revisar los tres pasos y sus tres editores hijos.
 */
export const Estructura = {
  args: {
    ...baseArgs,
    activeSection: 'structure',
    editor: null,
    structureEditor: (
      <AdminEventStructureEditor
        canEdit
        chapter={null}
        event={EVENT}
        eventSlug={EVENT.slug}
        onSaveEvent={async () => ({ event: EVENT })}
      />
    ),
  },
}

/** Sin permiso de escritura: quedan las superficies de solo lectura. */
export const SoloLectura = {
  args: {
    ...baseArgs,
    activeSection: 'structure',
    canDelete: false,
    canEdit: false,
    editor: null,
  },
}

/** Viewport angosto: el rail baja y el rail de pestañas se desplaza. */
export const Angosto = {
  args: {
    ...baseArgs,
    activeSection: 'basics',
    editor: <EditorStub label="Ficha del evento" />,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 430 }}>
        <Story />
      </div>
    ),
  ],
}
