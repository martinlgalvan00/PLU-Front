import AdminEventQuickCreate from './AdminEventQuickCreate.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'

export default {
  title: 'Admin/AdminEventQuickCreate',
  component: AdminEventQuickCreate,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="admin-shell" style={{ minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    canEdit: true,
    onCancel: () => {},
    onOpenFullEditor: () => {},
    onSubmit: async () => ({ event: { id: 'evt-nuevo' } }),
  },
}

export const Default = {}

/** Sin salida al editor largo: el alta es la única superficie. */
export const SinEditorCompleto = {
  args: { onOpenFullEditor: undefined },
}

/** Sin permiso de escritura: los campos quedan deshabilitados. */
export const SoloLectura = {
  args: { canEdit: false },
}

/** El backend rechaza el alta: el error se dice en el panel, no en un toast. */
export const ErrorDelBackend = {
  args: {
    onSubmit: async () => {
      throw new Error('Ya existe un evento con ese enlace público.')
    },
  },
}
