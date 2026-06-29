# Export PLU — CSV / XLSX / Consolidado USA

## Objetivo

Generar **exportaciones** de datos operativos (CSV admin) y **consolidado PLU USA** (formato normalizado para federación hermana), con nombres de columnas estables, descarga en browser y registro de export en DB (futuro).

## Cuándo usarla

- Modificar columnas o formato de export.
- Agregar export XLSX además de CSV.
- Implementar permisos de export por rol (`canExport`, `canExportPluUsa`).
- Normalizar nombres de atletas para integración internacional.
- Depurar datos incorrectos en archivos descargados.

## Entradas requeridas

| Entrada | Fuente |
|---------|--------|
| registrations | Estado en `useAppData` |
| athletes | Array completo |
| memberships | Afiliaciones |
| payments | Pagos |
| Rol usuario | Para habilitar tipo de export |

## Salidas esperadas

- Archivo CSV descargado en browser (`createCsv`).
- Filas admin con datos operativos combinados.
- Filas PLU USA con `first_name`, `last_name`, códigos y fechas ISO.
- (Futuro) XLSX con hoja única o múltiple.
- (Futuro) Registro en modelo `Export` de Prisma.

## Procedimiento paso a paso

### 1. Servicio de export (`src/services/exportService.js`)

**Funciones principales:**

| Función | Propósito |
|---------|-----------|
| `createCsv(filename, rows)` | Genera Blob y dispara download |
| `buildAdminExportRows(...)` | Join registration + athlete + membership + payment |
| `buildPluUsaExportRows(...)` | Formato consolidado internacional |

### 2. Export admin (CSV operativo)

Columnas actuales (`buildAdminExportRows`):

```
atleta, documento, email, telefono, pais, provincia, ciudad, gimnasio,
sexo, division, categoria, peso, codigo_afiliado, estado_afiliacion,
evento, estado_inscripcion, estado_pago, referencia_pago
```

Invocación desde `useAppData.exportAdminCsv`:

```javascript
const rows = buildAdminExportRows(registrations, athletes, memberships, payments)
createCsv('plu-arg-inscripciones.csv', rows)
```

**Permiso:** `canEdit(role)` — botón disabled si viewer.

### 3. Export PLU USA (consolidado)

Columnas (`buildPluUsaExportRows`):

```
member_code, first_name, last_name, document_id, birth_date, gender,
country, state, city, gym, division, category, bodyweight,
membership_year, membership_status, membership_start, membership_expiration,
event_name, registration_status, payment_status
```

**Normalización de nombres:**

```javascript
const nameParts = athlete.fullName.trim().split(/\s+/)
first_name: nameParts.slice(0, -1).join(' ')
last_name: nameParts.slice(-1).join(' ')
```

**Limitación conocida:** nombres compuestos o un solo token pueden mal-partirse — mejorar con campo explícito `firstName`/`lastName` en schema (futuro).

### 4. Mapeo de valores para USA

| Campo local | Campo export | Notas |
|-------------|--------------|-------|
| `athlete.sex` | `gender` | Masculino/Femenino → M/F (mejora futura) |
| `athlete.province` | `state` | |
| `membership.year` | `membership_year` | |
| `membership.status` | `membership_status` | Normalizar enum español |
| `registration.event` | `event_name` | |

### 5. Agregar XLSX (futuro)

Dependencia sugerida: `sheetjs` (xlsx) o `exceljs`.

```javascript
import * as XLSX from 'xlsx'

export function createXlsx(filename, rows, sheetName = 'Export') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}
```

Evaluar costo/beneficio antes de agregar dependencia — CSV cubre MVP.

### 6. UI en Admin

```jsx
<button onClick={onExportAdmin} disabled={!canEdit}>
  CSV admin
</button>
<button onClick={onExportPluUsa}>
  PLU USA
</button>
```

Iconos: `Download`, `FileSpreadsheet` (lucide-react).

### 7. Registro de export (Prisma)

```prisma
model Export {
  type      String   // admin | plu_usa
  format    String   // csv | xlsx
  filters   Json?
  filePath  String?  // si se guarda en storage
  createdBy String?
}
```

Loguear al exportar para auditoría.

### 8. Escape CSV

`createCsv` escapa comillas dobles RFC-style:

```javascript
const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
```

Verificar caracteres especiales en nombres con acentos (UTF-8 BOM opcional para Excel Windows).

## Validaciones

- No exportar si `rows.length === 0` (`createCsv` retorna `false`).
- PLU USA export permitido para `viewer_plu_usa` (`canExportPluUsa`).
- Admin export bloqueado para viewers.
- Fechas en formato ISO consistente.
- Sin datos sensibles extra (passwords, tokens).
- Encoding UTF-8; considerar `\uFEFF` BOM para Excel.

## Errores comunes

| Error | Síntoma | Fix |
|-------|---------|-----|
| Join por athleteId falla | Filas con campos undefined | Verificar IDs en seed |
| Nombres mal partidos | last_name vacío o incorrecto | Campos first/last en DB |
| Excel no abre UTF-8 | Caracteres rotos | Agregar BOM |
| Export sin permiso | Viewer descarga admin | Chequear `canEdit` |
| Estados en español e inglés | Columnas inconsistentes | Mapper de normalización |
| Archivo vacío | Sin registrations | Mensaje UI "sin datos" |

## Checklist de aceptación

- [ ] CSV admin descarga con todas las columnas documentadas
- [ ] CSV PLU USA con formato estable
- [ ] Permisos RBAC respetados
- [ ] Nombres normalizados (documentar limitaciones)
- [ ] Escape CSV correcto con comillas en datos
- [ ] Botones en AdminPage funcionan
- [ ] (Futuro) XLSX si se acordó con PLU USA
- [ ] (Futuro) Log en tabla Export

## Referencias oficiales

- [RFC 4180 — CSV](https://www.rfc-editor.org/rfc/rfc4180)
- [SheetJS docs](https://docs.sheetjs.com/) (si se agrega XLSX)
- `docs/EXPORTS.md` (crear/mantener)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/services/exportService.js` | Lógica export |
| `src/hooks/useAppData.js` | exportAdminCsv, exportPluUsaCsv |
| `src/pages/AdminPage.jsx` | Botones export |
| `src/lib/roles.js` | canExport, canExportPluUsa |
| `prisma/schema.prisma` | Model Export |
| `tests/` | Agregar tests buildPluUsaExportRows (futuro) |
