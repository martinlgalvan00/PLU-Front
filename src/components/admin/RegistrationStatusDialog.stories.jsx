import '../../styles/pages/admin.css'
import RegistrationStatusDialog from './RegistrationStatusDialog.jsx'

const REGISTRATION = {
  id: 'reg-1',
  athlete: 'Agostina Suarez',
  event: 'Pitbull Classic 2026',
  status: 'cancelada',
}

export default {
  title: 'Admin/RegistrationStatusDialog',
  component: RegistrationStatusDialog,
  parameters: { layout: 'fullscreen' },
}

/**
 * Inscripción cancelada por error: el operador la vuelve a confirmar sin
 * borrarla, así conserva división, categoría y horario ya asignados. El estado
 * actual queda deshabilitado en la lista para que no se "guarde" un no-cambio.
 */
export const RevertirCancelacion = {
  args: {
    registration: REGISTRATION,
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const GuardandoCambio = {
  args: {
    registration: REGISTRATION,
    busy: true,
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const ConError = {
  args: {
    registration: { ...REGISTRATION, status: 'confirmada' },
    error: 'No se pudo cambiar el estado de la inscripción.',
    onCancel: () => {},
    onConfirm: () => {},
  },
}
