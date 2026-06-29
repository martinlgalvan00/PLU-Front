# LiftingCast Import — CSV y OpenPowerlifting

## Objetivo

Importar **resultados de competencia** desde exportaciones **LiftingCast** y formatos compatibles **OpenPowerlifting**, con preview de datos, mapeo de columnas configurable y persistencia en `LiftingResult` — sin corromper datos de atletas/inscripciones existentes.

## Cuándo usarla

- Implementar feature de import en admin post-evento.
- Mapear columnas de CSV LiftingCast a modelo Prisma.
- Normalizar nombres de levantadores para match con atletas registrados.
- Depurar totales, places o bodyweight incorrectos.
- Exportar resultados normalizados junto con inscripciones.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Archivo CSV | Export LiftingCast u OpenPowerlifting |
| eventId | Evento destino (ej. Pitbull Classic) |
| Encoding | UTF-8 (verificar BOM) |
| Delimitador | Coma o punto y coma según export |

## Salidas esperadas

- Preview tabular antes de confirmar import.
- Registros `LiftingResult` en DB con `source: liftingcast | openpowerlifting`.
- `rawData` JSON con fila original para auditoría.
- Reporte de filas omitidas/errores con motivo.
- (Opcional) Match atleta por nombre/documento.

## Procedimiento paso a paso

### 1. Modelo destino (Prisma)

```prisma
model LiftingResult {
  id           String   @id @default(cuid())
  eventId      String
  event        Event    @relation(...)
  athleteName  String
  division     String?
  category     String?
  bodyweightKg Float?
  squat1Kg     Float?
  bench1Kg     Float?
  deadlift1Kg  Float?
  totalKg      Float?
  place        Int?
  rawData      Json?
  source       String   @default("liftingcast")
}
```

### 2. Columnas típicas LiftingCast

Mapeo sugerido (ajustar según export real del meet):

| Columna CSV | Campo modelo | Transformación |
|-------------|--------------|----------------|
| Name / Lifter | `athleteName` | trim, normalizar case |
| Division | `division` | mapear a enum local |
| Weight Class / Class | `category` | |
| Bodyweight | `bodyweightKg` | parseFloat |
| Squat1 / Best Squat | `squat1Kg` | |
| Bench1 / Best Bench | `bench1Kg` | |
| Deadlift1 / Best Deadlift | `deadlift1Kg` | |
| Total | `totalKg` | calcular si falta |
| Place | `place` | parseInt |

Guardar fila completa en `rawData` para trazabilidad.

### 3. Columnas OpenPowerlifting (referencia)

OpenPowerlifting usa esquema normalizado. Campos comunes:

- `Name`, `Sex`, `Event`, `Equipment`, `Age`, `Division`, `BodyweightKg`
- `Squat1Kg`, `Bench1Kg`, `Deadlift1Kg`, `TotalKg`, `Place`

`source` = `"openpowerlifting"` cuando el parser detecte ese formato (header signature).

### 4. Pipeline de import

```
1. Admin sube CSV (input file)
2. parseCsv(file) → rows[]
3. detectFormat(headers) → liftingcast | openpowerlifting | unknown
4. mapRows(rows, COLUMN_MAP) → preview[]
5. Mostrar preview en tabla Admin (primeras 20 filas + resumen)
6. Usuario confirma import
7. Validar eventId, duplicados (mismo atleta + evento + total)
8. prisma.liftingResult.createMany({ data, skipDuplicates: true })
9. Mostrar resumen: importados / omitidos / errores
```

### 5. Servicio sugerido (`src/services/liftingcastImportService.js`)

```javascript
export const LIFTINGCAST_MAP = {
  'Name': 'athleteName',
  'Division': 'division',
  'Weight Class': 'category',
  'Bodyweight': 'bodyweightKg',
  'Squat': 'squat1Kg',
  'Bench': 'bench1Kg',
  'Deadlift': 'deadlift1Kg',
  'Total': 'totalKg',
  'Place': 'place',
}

export function parseCsvText(text) { /* PapaParse o split manual */ }
export function mapRow(row, columnMap) { /* ... */ }
export function buildPreview(rows, limit = 20) { /* ... */ }
export function validateImportRow(row) { /* números >= 0, nombre no vacío */ }
```

Evaluar dependencia `papaparse` solo si el parsing manual es insuficiente.

### 6. UI Admin — sección import (futuro)

En `AdminPage.jsx` o sub-vista:

1. `<input type="file" accept=".csv" />`
2. Tabla preview con columnas mapeadas
3. Selector de evento destino
4. Botones: Cancelar | Importar N filas
5. Solo roles con `canEdit`

### 7. Normalización de nombres

Para cruzar con `Athlete.fullName`:

```javascript
function normalizeName(name) {
  return name
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
```

Match fuzzy opcional — no bloquear import si no hay match; `athleteName` es string libre en `LiftingResult`.

### 8. Validaciones de datos

- Pesos numéricos ≥ 0.
- `totalKg` ≈ squat + bench + deadlift (tolerancia configurables).
- `place` entero positivo o null.
- No importar si evento está en `draft` (política).

## Validaciones

- Preview obligatorio antes de persistir.
- Formato desconocido → error claro, no import parcial silencioso.
- Transacción batch con reporte de errores por fila.
- `rawData` preserva fila original.
- Permiso `canEdit` requerido.
- Archivo max size razonable (ej. 5MB).

## Errores comunes

| Error | Causa | Fix |
|-------|-------|-----|
| Headers distintos por versión LC | Mapeo roto | Config por versión + detectFormat |
| Coma en nombres | CSV mal parseado | Parser RFC 4180 |
| Totales inconsistentes | Attempts vs best | Usar columnas "Best" |
| Duplicar import | Re-upload mismo CSV | Unique constraint o checksum |
| Encoding Latin-1 | Acentos rotos | Detectar encoding |
| Confundir kg con lbs | Totales imposibles | Flag unidad en mapper |

## Checklist de aceptación

- [ ] Parser CSV funciona con export real LiftingCast
- [ ] Preview muestra datos mapeados correctamente
- [ ] Import persiste en `LiftingResult` con `eventId`
- [ ] `rawData` guarda fila original
- [ ] Errores por fila reportados al usuario
- [ ] Solo usuarios con `canEdit` pueden importar
- [ ] (Opcional) Soporte OpenPowerlifting detectado automáticamente
- [ ] Documentado en `docs/` formato esperado de CSV

## Referencias oficiales

- [LiftingCast](https://liftingcast.com/) — herramienta de meet day
- [OpenPowerlifting dataset](https://www.openpowerlifting.org/) — formato referencia
- `prisma/schema.prisma` — LiftingResult

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `prisma/schema.prisma` | Modelo LiftingResult |
| `src/pages/AdminPage.jsx` | UI import (futuro) |
| `src/services/exportService.js` | Patrón similar CSV |
| `docs/BUSINESS_RULES.md` | Fuente resultados LiftingCast |
| `src/services/liftingcastImportService.js` | Crear al implementar |
