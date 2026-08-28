import { useState } from 'react'
import AdminFilterBar from './AdminFilterBar.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/** Mismas 6 facetas que arma AuditSection: fuente/estado/categoría a la vista,
 * acción/actor/entidad detrás de "Más filtros" -- el caso real con más
 * filtros avanzados del panel admin. */
function AuditLikeFilterBar({ initialAction = 'all' }) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [action, setAction] = useState(initialAction)
  const [actorType, setActorType] = useState('all')
  const [entityType, setEntityType] = useState('all')

  const filters = [
    {
      id: 'source',
      label: 'Fuente',
      value: source,
      onChange: setSource,
      showLabel: true,
      allLabel: 'Todas',
      options: [
        ['all', 'Todas'],
        ['domain', 'Negocio'],
        ['payment', 'Pagos'],
        ['email', 'Email'],
      ],
    },
    {
      id: 'status',
      label: 'Estado',
      value: status,
      onChange: setStatus,
      variant: 'select',
      showLabel: true,
      options: [
        ['all', 'Todas'],
        ['failed', 'Fallido'],
        ['partial', 'Parcial'],
      ],
    },
    {
      id: 'category',
      label: 'Categoría',
      value: category,
      onChange: setCategory,
      variant: 'select',
      showLabel: true,
      options: [
        ['all', 'Todas'],
        ['cobro', 'Cobro'],
        ['webhook', 'Webhook'],
      ],
    },
    {
      id: 'action',
      label: 'Acción',
      value: action,
      onChange: setAction,
      variant: 'select',
      showLabel: true,
      advanced: true,
      options: [
        ['all', 'Todas'],
        ['payment.webhook_failed', 'Webhook fallido'],
        ['membership.activated', 'Afiliación activada'],
      ],
    },
    {
      id: 'actorType',
      label: 'Actor',
      value: actorType,
      onChange: setActorType,
      variant: 'select',
      showLabel: true,
      advanced: true,
      options: [
        ['all', 'Todas'],
        ['webhook', 'Webhook'],
        ['staff', 'Staff'],
      ],
    },
    {
      id: 'entityType',
      label: 'Entidad',
      value: entityType,
      onChange: setEntityType,
      variant: 'select',
      showLabel: true,
      advanced: true,
      options: [
        ['all', 'Todas'],
        ['membership', 'Afiliación'],
        ['athlete_payment_order', 'Orden de pago'],
      ],
    },
  ]

  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ minHeight: 0, background: 'var(--admin-canvas)', padding: '24px' }}>
        <div style={{ maxWidth: 1120 }}>
          <AdminFilterBar
            compact
            inline
            className="admin-filters--audit"
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            placeholder="Buscar por entidad o responsable"
          />
        </div>
      </div>
    </AppConfigProvider>
  )
}

/** Mismas 5 facetas que arma AthletesSection, todas inline (sin "Más filtros"):
 * afiliación, inscripción, gimnasio (select con lista dinámica), división
 * (chips) y fecha de alta (variant `dateRange`, dos inputs nativos). */
function AthletesLikeFilterBar({
  initialRange = { from: '', to: '' },
  initialStatus = 'all',
  containerWidth = null,
  layout = undefined,
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [registrationStatus, setRegistrationStatus] = useState('all')
  const [gym, setGym] = useState('all')
  const [division, setDivision] = useState('all')
  const [registeredRange, setRegisteredRange] = useState(initialRange)

  const filters = [
    {
      id: 'status',
      label: 'Afiliación',
      value: status,
      onChange: setStatus,
      showLabel: true,
      options: [
        ['all', 'Todos', 42],
        ['afiliado_activo', 'Afiliado activo', 30, 'success'],
        ['registrado', 'Registrado', 12, 'info'],
      ],
    },
    {
      id: 'registrationStatus',
      label: 'Inscripción',
      value: registrationStatus,
      onChange: setRegistrationStatus,
      showLabel: true,
      options: [
        ['all', 'Todas', 42],
        ['confirmada', 'Confirmada', 25],
        ['pendiente_pago', 'Pago pendiente', 9],
      ],
    },
    {
      id: 'gym',
      label: 'Gimnasio',
      value: gym,
      onChange: setGym,
      variant: 'select',
      options: [
        ['all', 'Todos los gimnasios'],
        ['Fuerza Sur', 'Fuerza Sur'],
        ['Power Gym', 'Power Gym'],
      ],
    },
    {
      id: 'division',
      label: 'División',
      value: division,
      onChange: setDivision,
      showLabel: true,
      options: [
        ['all', 'Todas las divisiones', 42],
        ['Open', 'Open', 28],
        ['Junior', 'Junior', 8],
        ['Masters', 'Masters', 6],
      ],
    },
    {
      id: 'registeredAt',
      label: 'Fecha de alta',
      value: registeredRange,
      onChange: setRegisteredRange,
      variant: 'dateRange',
      defaultValue: { from: '', to: '' },
    },
  ]

  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ minHeight: 0, background: 'var(--admin-canvas)', padding: '24px' }}>
        <div
          style={
            containerWidth
              ? { width: containerWidth, containerType: 'inline-size', containerName: 'admin-panel' }
              : { maxWidth: 1440 }
          }
        >
          <AdminFilterBar
            compact
            inline
            className="admin-filters--athletes"
            layout={layout}
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            placeholder="Buscar por nombre, DNI, email o gimnasio"
          />
        </div>
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/AdminFilterBar',
  component: AdminFilterBar,
  tags: ['autodocs'],
}

/** Estado por defecto: los avanzados (Acción/Actor/Entidad) colapsados detrás de "Más filtros". */
export const Default = {
  render: () => <AuditLikeFilterBar />,
}

/** Con un filtro avanzado activo, el panel arranca abierto -- Acción/Actor/Entidad
 * bajan a su propio panel recesado en vez de sumarse a la fila de Fuente/Estado/Categoría. */
export const FiltrosAvanzadosAbiertos = {
  render: () => <AuditLikeFilterBar initialAction="payment.webhook_failed" />,
}

/** Caso Atletas: 5 facetas siempre visibles, sin popover de avanzados. */
export const CincoFiltrosInline = {
  render: () => <AthletesLikeFilterBar />,
}

/** Mismo caso dentro de un contenedor angosto (`admin-panel`, &lt;719px de ancho
 * de contenedor): la rama `@container` -- no el viewport -- es la que manda acá,
 * el mismo layout que ve la app real cuando el panel admin queda angosto por el
 * sidebar aunque la ventana del navegador sea ancha. */
export const CincoFiltrosContenedorAngosto = {
  render: () => <AthletesLikeFilterBar containerWidth={650} />,
}

/** Rango de fecha de alta activo -- confirma el resaltado `is-active` del variant `dateRange`. */
export const ConRangoDeFechaActivo = {
  render: () => <AthletesLikeFilterBar initialRange={{ from: '2026-01-01', to: '2026-03-15' }} />,
}

/** Pills editoriales: menú vertical de opciones + date range con presets
 * (`layout="popover"`). */
export const CincoFiltrosPopover = {
  render: () => <AthletesLikeFilterBar layout="popover" />,
}

/** Popover con rango activo -- pill con valor, clear y presets en fecha. */
export const CincoFiltrosPopoverConRangoActivo = {
  render: () => (
    <AthletesLikeFilterBar layout="popover" initialRange={{ from: '2026-01-01', to: '2026-03-15' }} />
  ),
}

/** Contenedor angosto: riel de pills con scroll horizontal. */
export const CincoFiltrosPopoverContenedorAngosto = {
  render: () => <AthletesLikeFilterBar layout="popover" containerWidth={390} />,
}

/** Segundo rediseño: las 5 facetas agrupadas detrás de un solo botón
 * "Filtros" (`layout="panel"`) en vez de un pill por filtro. Lo aplicado
 * queda visible como chips removibles debajo del buscador. */
export const CincoFiltrosPanel = {
  render: () => <AthletesLikeFilterBar layout="panel" />,
}

/** Panel con dos filtros ya activos (afiliación con tono + rango de fecha) --
 * confirma los chips de resumen, el badge de conteo en el botón y que el
 * chip de afiliación toma el color de estado en vez de celeste genérico. */
export const CincoFiltrosPanelConFiltrosActivos = {
  render: () => (
    <AthletesLikeFilterBar
      layout="panel"
      initialStatus="afiliado_activo"
      initialRange={{ from: '2026-01-01', to: '2026-03-15' }}
    />
  ),
}

/** Mismo panel en un contenedor angosto -- confirma que el botón colapsa a
 * solo ícono y el panel se ancla al borde derecho en vez de desbordar. */
export const CincoFiltrosPanelContenedorAngosto = {
  render: () => <AthletesLikeFilterBar layout="panel" containerWidth={390} />,
}
