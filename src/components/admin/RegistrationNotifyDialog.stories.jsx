import '../../styles/pages/admin.css'
import RegistrationNotifyDialog from './RegistrationNotifyDialog.jsx'

const REGISTRATION = {
  id: 'reg-1',
  athlete: 'Agostina Suarez',
  event: 'Pitbull Classic 2026',
  status: 'cancelada',
  reasonHint: 'Cancelada por falta de pago dentro del plazo.',
}

export default {
  title: 'Admin/RegistrationNotifyDialog',
  component: RegistrationNotifyDialog,
  parameters: { layout: 'fullscreen' },
}

export const MotivoPrecargado = {
  args: {
    registration: REGISTRATION,
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const Enviando = {
  args: {
    registration: REGISTRATION,
    busy: true,
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const Enviado = {
  args: {
    registration: REGISTRATION,
    result: { status: 'sent' },
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const Omitido = {
  args: {
    registration: { ...REGISTRATION, reasonHint: '' },
    result: { status: 'skipped', reason: 'La inscripción no está cancelada.' },
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const ConError = {
  args: {
    registration: REGISTRATION,
    error: 'No se pudo enviar el aviso.',
    onCancel: () => {},
    onConfirm: () => {},
  },
}

const FAKE_PREVIEW_HTML = `<!doctype html><html><body style="margin:0;font-family:sans-serif;background:#f0efec;padding:24px;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:4px;padding:24px;">
    <h1 style="font-size:20px;">Inscripción cancelada</h1>
    <p>Hola Agostina, tu inscripción fue cancelada.</p>
    <p><strong>Motivo:</strong> Cancelada por falta de pago dentro del plazo.</p>
  </div>
</body></html>`

export const ConVistaPrevia = {
  args: {
    registration: REGISTRATION,
    onCancel: () => {},
    onConfirm: () => {},
    onPreview: async () => ({
      available: true,
      to: 'agostina@example.com',
      subject: 'Tu inscripción fue cancelada · PLU ARG',
      html: FAKE_PREVIEW_HTML,
    }),
  },
}

export const VistaPreviaNoDisponible = {
  args: {
    registration: REGISTRATION,
    onCancel: () => {},
    onConfirm: () => {},
    onPreview: async () => ({
      available: false,
      reason: 'Este aviso usa un template cargado en Brevo: la vista previa no está disponible acá.',
    }),
  },
}
