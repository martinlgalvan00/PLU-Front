import AdminEventQuickCreate from './AdminEventQuickCreate.jsx'
import { AdminPreviewShell } from '../../pages/admin/adminPreviewShell.jsx'

export default {
  title: 'Admin/AdminEventQuickCreate',
  component: AdminEventQuickCreate,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // El alta es una página: va dentro del shell real, que es lo que se ve en la app.
      <AdminPreviewShell section="events">
        <Story />
      </AdminPreviewShell>
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
