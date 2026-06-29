# Admin Panel — Operación PLU ARG

## Objetivo

Mantener y extender el **panel administrativo** para operación diaria: dashboard con métricas, tabla de inscripciones combinada, filtros, aprobación de pagos, exports y acciones condicionadas por **rol RBAC**.

## Cuándo usarla

- Agregar columnas, filtros o acciones al admin.
- Implementar nuevas métricas en dashboard.
- Conectar admin a API/Prisma en lugar de localStorage.
- Ajustar permisos por rol en botones y mutaciones.
- Depurar datos que no aparecen en filtros.

## Entradas requeridas

| Entrada | Fuente |
|---------|--------|
| Estado app | `useAppData` hook |
| Rol actual | `role` + funciones `can*` |
| Datos | athletes, memberships, registrations, payments |
| Filtros | `{ status, event, query }` |

## Salidas esperadas

- Dashboard con 4 métricas actualizadas en tiempo real.
- Tabla filtrada de inscripciones enriquecidas con atleta.
- Acciones de export y aprobación según permisos.
- UX clara para operadores sin conocimiento técnico.

## Procedimiento paso a paso

### 1. Arquitectura del panel

```
App.jsx (view === 'admin')
  → AdminPage.jsx (presentacional)
  → props desde useAppData.js (container logic)
```

**Separación:** `AdminPage` no importa servicios directamente; recibe callbacks y datos por props.

### 2. Layout de `AdminPage.jsx`

| Sección | Clase CSS | Contenido |
|---------|-----------|-----------|
| Toolbar | `admin-toolbar` | Título + selector rol (demo) |
| Métricas | `metric-grid` | 4 cards con iconos |
| Panel principal | `admin-panel` | Tabla + filtros + exports |

Iconos (`lucide-react`): `Users`, `BadgeCheck`, `ClipboardList`, `ShieldCheck`.

### 3. Dashboard — métricas

Definidas en `useAppData.dashboard`:

| Métrica | Cálculo |
|---------|---------|
| Atletas | `athletes.length` |
| Afiliaciones activas | memberships con status `activa` o `active` |
| Pitbull Classic | `registrations.length` |
| Pagos pendientes | payments con status pending variants |

Extender al agregar eventos: métrica por evento o pagos del día.

### 4. Filtros

Estado: `filters = { status: 'all', event: 'all', query: '' }`

Lógica en `filteredRegistrations`:

- **status:** match `registration.status` o `paymentStatus`
- **event:** match `registration.event`
- **query:** búsqueda en nombre, documento, categoría (case-insensitive)

UI: inputs en panel header con iconos `Filter`, `Search`.

### 5. Tabla de inscripciones

Columnas típicas (ver JSX completo en `AdminPage.jsx`):

- Atleta (nombre, documento)
- Evento, categoría, división
- Estados (inscripción, pago) via `StatusPill`
- Acciones: aprobar pago manual

Datos enriquecidos:

```javascript
enrichedRegistrations = registrations.map(r => ({
  ...r,
  athlete: athletes.find(a => a.id === r.athleteId),
}))
```

### 6. Acciones por rol

| Acción | Función | Permiso |
|--------|---------|---------|
| Export CSV admin | `exportAdminCsv` | `canEdit` |
| Export PLU USA | `exportPluUsaCsv` | `canExportPluUsa` |
| Aprobar pago | `handleApprovePayment` | `canEdit` |
| Cambiar rol (demo) | `setRole` | solo dev |

```jsx
<button disabled={!canEdit} onClick={onExportAdmin}>...</button>
```

### 7. Flujo aprobar pago

```
handleApprovePayment(paymentId)
  → approvePaymentAction(paymentId, payments)  // athleteService
  → actualizar payment, membership, registration, athlete status
  → append auditLog
  → await emails(athlete)  // Brevo
```

Estados resultantes:

- payment → `approved`
- membership → `activa` (si aplica)
- registration → `confirmada` (si aplica)
- athlete → `afiliado_activo` o `registrado`

### 8. Estilos

Archivo: `src/styles/pages/admin.css`

- Grid responsivo para métricas
- Tabla con scroll horizontal en móvil
- `export-actions` alineados a la derecha
- `StatusPill` consistente con resto de app

### 9. Migración a backend

Reemplazar estado local por:

```javascript
useEffect(() => {
  fetch(`${API_URL}/api/admin/registrations?${query}`)
    .then(r => r.json())
    .then(setRegistrations)
}, [filters])
```

Mantener misma interfaz de props en `AdminPage` para minimizar cambio visual.

## Validaciones

- Viewer no puede aprobar pagos ni export admin (UI + API futura).
- Filtros combinados con AND lógico.
- Métricas coherentes con datos filtrados vs totales (documentar cuál muestra).
- `StatusPill` renderiza todos los estados de constants.
- Tabla vacía muestra mensaje, no error.

## Errores comunes

| Error | Síntoma | Fix |
|-------|---------|-----|
| Filtro status no matchea | Datos en inglés/español | Incluir ambos en filter |
| canEdit ignorado en handler | Viewer aprueba vía consola | Guard en handleApprovePayment |
| Métricas desactualizadas | Stale closure | Dependencias useMemo correctas |
| Export de datos filtrados vs todos | Confusión operador | Exportar filtered o documentar |
| Selector rol en prod | Falsa seguridad | Remover en build producción |

## Checklist de aceptación

- [ ] Dashboard muestra 4 métricas correctas
- [ ] Filtros por status, evento y búsqueda funcionan
- [ ] Tabla lista inscripciones con datos de atleta
- [ ] Aprobar pago actualiza estados y dispara emails
- [ ] Exports respetan RBAC
- [ ] StatusPill legible en todos los estados
- [ ] Responsive básico en admin
- [ ] Estilos en `admin.css` sin inline

## Referencias oficiales

- `src/lib/roles.js` — permisos
- `docs/BUSINESS_RULES.md` — estados
- Skill `auth-rbac` — matriz de permisos

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/pages/AdminPage.jsx` | UI panel |
| `src/hooks/useAppData.js` | Lógica, filtros, handlers |
| `src/services/athleteService.js` | approvePayment |
| `src/services/exportService.js` | Exports |
| `src/components/ui/StatusPill.jsx` | Pills de estado |
| `src/lib/roles.js` | RBAC |
| `src/lib/constants.js` | ROLES, labels estado |
| `src/styles/pages/admin.css` | Estilos |
| `src/styles/components/tables.css` | Tabla |
