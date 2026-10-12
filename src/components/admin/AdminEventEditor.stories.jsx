import { useState } from 'react'
import AdminEventEditor from './AdminEventEditor.jsx'
import { AdminPreviewShell } from '../../pages/admin/adminPreviewShell.jsx'
import { createAdminEventDraft } from '../../services/eventAdminService.js'

/**
 * Alta completa de un evento (sin id) dentro del shell real: el modal se
 * portalea a <body>, así que detrás va el panel que se ve en la app.
 */

export default {
  title: 'Admin/Editor de evento',
  parameters: { layout: 'fullscreen' },
}

function Screen() {
  const [draft, setDraft] = useState(createAdminEventDraft)
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={draft}
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={async () => ({ event: { id: 'evt-nuevo' } })}
      />
    </AdminPreviewShell>
  )
}

export const AltaCompleta = { render: () => <Screen /> }
