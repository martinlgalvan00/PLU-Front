import { expect, userEvent, waitFor, within } from 'storybook/test'
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

const FAKE_PREVIEW_HTML = `<!doctype html><html><body style="margin:0;font-family:sans-serif;background:#f0efec;padding:24px;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:4px;padding:24px;">
    <h1 style="font-size:20px;">Inscripción cancelada</h1>
    <p>Hola Agostina, tu inscripción fue cancelada.</p>
    <p><strong>Motivo:</strong> Cancelada por error al validar el comprobante.</p>
  </div>
</body></html>`

/**
 * Al elegir "cancelada" aparece el checkbox para avisar por mail en el mismo
 * paso, con vista previa del HTML antes de confirmar.
 */
export const AvisarAlCancelar = {
  args: {
    registration: { ...REGISTRATION, status: 'confirmada' },
    onCancel: () => {},
    onConfirm: () => {},
    onPreview: async () => ({
      available: true,
      to: 'agostina@example.com',
      subject: 'Tu inscripción fue cancelada · PLU ARG',
      html: FAKE_PREVIEW_HTML,
    }),
  },
  play: async () => {
    // El diálogo se porta a `document.body` con createPortal, no queda
    // dentro de `canvasElement`: hay que consultarlo ahí.
    const body = within(document.body)
    await userEvent.click(body.getByRole('radio', { name: /cancelada/i }))
    await userEvent.type(
      body.getByLabelText(/motivo del cambio/i),
      'Cancelada por error al validar el comprobante.',
    )
    await userEvent.click(body.getByRole('checkbox', { name: /avisar por mail/i }))
    await userEvent.click(body.getByRole('button', { name: /vista previa/i }))
    await waitFor(() => {
      expect(body.getByTitle(/vista previa/i)).toBeTruthy()
    })
  },
}
