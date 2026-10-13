import { useState } from 'react'
import AdminSiteTeaserControl from './AdminSiteTeaserControl.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-events-index.css'

export default {
  title: 'Admin/AdminSiteTeaserControl',
  component: AdminSiteTeaserControl,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ background: 'var(--admin-canvas)', maxWidth: 880, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: { canEdit: true, onToggle: () => {} },
}

/** Apagado: el público no ve nada. */
export const Apagado = { args: { enabled: false } }

/** Al aire: el anuncio está visible y aparece el enlace para verlo en vivo. */
export const AlAire = { args: { enabled: true } }

/** Todavía no se leyó el estado: se ve apagado y no se puede tocar. */
export const Leyendo = { args: { enabled: null } }

/** La lectura falló: se dice y se ofrece reintentar, sin adivinar un estado. */
export const ErrorDeLectura = { args: { enabled: null, loadFailed: true, onRetry: () => {} } }

/** Sin permiso de escritura: el interruptor queda deshabilitado. */
export const SoloLectura = { args: { enabled: true, canEdit: false } }

function InteractiveTeaser(args) {
  const [enabled, setEnabled] = useState(false)
  return <AdminSiteTeaserControl {...args} enabled={enabled} onToggle={setEnabled} />
}

/** Para ver la secuencia de encendido: prendelo con el interruptor. */
export const Interactivo = {
  render: (args) => <InteractiveTeaser {...args} />,
}
