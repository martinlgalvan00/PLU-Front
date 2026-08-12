// El diálogo se porta a `document.body` con createPortal: sus estilos viven en
// la hoja del panel, no en la del componente, así que la historia tiene que
// importarla igual que lo hace `AdminPage`.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import AdminDeleteConfirmDialog from './AdminDeleteConfirmDialog.jsx'

/**
 * Confirmación de borrado definitivo del panel (staff, atletas, eventos).
 *
 * Las dos variantes no son cosméticas: `confirmPhrase` aparece solo cuando lo
 * borrado no se puede reconstruir -- un evento con inscripciones pagadas o
 * acreditaciones -- y hasta que el identificador no coincide exacto el botón
 * de confirmar queda deshabilitado.
 */
export default {
  title: 'Admin/AdminDeleteConfirmDialog',
  component: AdminDeleteConfirmDialog,
  parameters: { layout: 'fullscreen' },
}

const BASE_ARGS = {
  busy: false,
  error: '',
  onCancel: () => {},
  onConfirm: () => {},
  cancelLabel: 'Cancelar',
  confirmLabel: 'Eliminar definitivamente',
  busyLabel: 'Eliminando...',
}

/** Borrado sin actividad detrás: alcanza con confirmar. */
export const Directo = {
  args: {
    ...BASE_ARGS,
    title: 'Eliminar evento definitivamente',
    description:
      'Vas a eliminar Pitbull Classic (pitbull-classic-2026) junto con 0 inscripciones, 0 entradas, 0 órdenes y 0 acreditaciones.',
    warning:
      'Se borran también las jornadas, tandas, tipos de entrada y las cuentas de puerta del evento. La auditoría del borrado queda registrada. No se puede deshacer.',
  },
}

/**
 * El evento ya movió plata y gente: la base rechazó el primer intento y el
 * diálogo escala a escribir el identificador.
 */
export const ConConfirmacionEscrita = {
  args: {
    ...BASE_ARGS,
    title: 'Eliminar evento definitivamente',
    description:
      'Vas a eliminar Pitbull Classic (pitbull-classic-2026) junto con 48 inscripciones, 120 entradas, 96 órdenes y 44 acreditaciones.',
    warning:
      'Este evento ya movió plata o gente: 41 inscripciones pagadas, 88 entradas pagadas y 44 acreditaciones. Escribí el identificador del evento para confirmar.',
    confirmPhrase: 'pitbull-classic-2026',
    confirmPhraseLabel: 'Escribí el identificador del evento',
    confirmPhraseHint: 'Tiene que coincidir exactamente con pitbull-classic-2026.',
  },
}

/** El backend rechazó el borrado: el error se muestra dentro del diálogo. */
export const ConError = {
  args: {
    ...ConConfirmacionEscrita.args,
    error: 'No se pudo eliminar el evento.',
  },
}

/** Borrado en curso: todo bloqueado hasta que la RPC responda. */
export const Borrando = {
  args: { ...Directo.args, busy: true },
}
