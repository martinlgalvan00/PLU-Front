import { useState } from 'react'
import AdminSavedViews from './AdminSavedViews.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/pages/admin-minimal.css'

const INITIAL_VIEWS = [
  { id: 'v1', label: 'Morosos con afiliación activa', snapshot: { status: 'afiliado_vencido' } },
  { id: 'v2', label: 'Vencen en 14 días', snapshot: { status: 'expiring_soon' } },
]

function AdminSavedViewsDemo() {
  const [views, setViews] = useState(INITIAL_VIEWS)
  const [activeViewId, setActiveViewId] = useState(null)

  return (
    <AppConfigProvider>
      <div
        className="admin-shell"
        style={{ minHeight: 0, background: 'var(--admin-canvas)', padding: '24px' }}
      >
        <div style={{ maxWidth: 640 }}>
          <AdminSavedViews
            views={views}
            activeViewId={activeViewId}
            allLabel="Todos"
            caption="Vistas guardadas"
            addLabel="Guardar filtros actuales"
            namePlaceholder="Nombre de la vista"
            removeAriaLabel={(label) => `Eliminar vista ${label}`}
            canSave={activeViewId == null}
            onApply={(view) => setActiveViewId(view.id)}
            onClear={() => setActiveViewId(null)}
            onSave={(label) =>
              setViews((current) => [
                ...current,
                { id: `v-${Date.now()}`, label, snapshot: { status: 'demo' } },
              ])
            }
            onRemove={(id) => setViews((current) => current.filter((view) => view.id !== id))}
          />
        </div>
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/AdminSavedViews',
  component: AdminSavedViews,
  tags: ['autodocs'],
}

/** "Todos" limpia la vista activa; cada chip guardado la aplica; "Guardar filtros actuales" nombra una nueva. */
export const Default = {
  render: () => <AdminSavedViewsDemo />,
}

/** Sin vistas guardadas todavía y sin filtros activos: el bloque no se renderiza (nada que ofrecer). */
export const Vacio = {
  render: () => {
    function Empty() {
      return (
        <AdminSavedViews
          views={[]}
          activeViewId={null}
          allLabel="Todos"
          caption="Vistas guardadas"
          addLabel="Guardar filtros actuales"
          namePlaceholder="Nombre de la vista"
          removeAriaLabel={(label) => `Eliminar vista ${label}`}
          canSave={false}
          onApply={() => {}}
          onClear={() => {}}
          onSave={() => {}}
          onRemove={() => {}}
        />
      )
    }
    return (
      <AppConfigProvider>
        <div className="admin-shell" style={{ background: 'var(--admin-canvas)', padding: '24px' }}>
          <p style={{ color: 'var(--admin-muted)', fontSize: 13 }}>
            (No hay nada debajo -- el componente devuelve null.)
          </p>
          <Empty />
        </div>
      </AppConfigProvider>
    )
  },
}
