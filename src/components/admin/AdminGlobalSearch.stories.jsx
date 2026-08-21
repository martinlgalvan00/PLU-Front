import AdminGlobalSearch from './AdminGlobalSearch.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/layout/admin-shell.css'

const ATHLETES = [
  { id: '1', fullName: 'Mariana Giménez', documentId: '32109442', email: 'mariana@example.com', gym: 'Titanium Gym' },
  { id: '2', fullName: 'Franco Robledo', documentId: '40887213', email: 'franco@example.com', gym: 'Fuerza Bruta CABA' },
  { id: '3', fullName: 'Lucía Cabrera', documentId: '38220019', email: 'lucia@example.com', gym: 'PowerHouse Rosario' },
  { id: '4', fullName: 'Diego Paz', documentId: '29554876', email: 'diego@example.com', gym: 'Titanium Gym' },
  { id: '5', fullName: 'Sofía Noceti', documentId: '44102887', email: 'sofia@example.com', gym: 'Fuerza Bruta CABA' },
]

function AdminGlobalSearchDemo() {
  return (
    <AppConfigProvider>
      <div
        className="admin-shell"
        style={{ minHeight: 0, background: 'var(--admin-canvas)', padding: '24px' }}
      >
        <div style={{ maxWidth: 420 }}>
          <AdminGlobalSearch
            athletes={ATHLETES}
            onSelectAthlete={(id) => {
              // eslint-disable-next-line no-console -- demo de Storybook, no hay navegación real
              console.log('seleccionar atleta', id)
            }}
          />
        </div>
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/AdminGlobalSearch',
  component: AdminGlobalSearch,
  tags: ['autodocs'],
}

/** Escribí un nombre, DNI, email o gimnasio -- Enter o click en un resultado simula el salto a la ficha. */
export const Default = {
  render: () => <AdminGlobalSearchDemo />,
}
