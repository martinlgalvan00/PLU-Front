# Export PLU — CSV / XLS / Consolidado USA

## Objetivo

Generar **exportaciones** de datos operativos (CSV/XLS admin), **consolidado PLU USA** y
**planilla Lifters** (estilo LiftingCast, estilada), con join real de atletas, completitud
y avisos de perfil para pedir datos faltantes en Mi cuenta.

## Cuándo usarla

- Modificar columnas o formato de export.
- Depurar fechas de nacimiento u otros campos vacíos en el archivo.
- Cambiar permisos (`admin.exports.admin`, `admin.exports.plu_usa`).
- Ajustar tope de filas o filtro por evento.

## Entradas requeridas

| Entrada | Fuente |
|---------|--------|
| type | `admin` \| `plu_usa` |
| format | `csv` \| `xls` |
| eventSlug | Opcional; filtro del panel de Inscripciones |
| Rol | `admin.exports.admin` / `admin.exports.plu_usa` |

## Salidas esperadas

- Archivo CSV (BOM UTF-8) o SpreadsheetML `.xls` vía `GET /api/athletes/admin/export`.
- Fechas en `YYYY-MM-DD` (`normalizeExportDate`).
- Header `X-PLU-Export-Truncated: 1` si se alcanzó el tope (5000).
- Demo mode: builders locales desde el estado en memoria.

## Procedimiento

### 1. Lógica compartida (`shared/exportRows.js` + `shared/ageDivision.js`)

| Función | Propósito |
|---------|-----------|
| `normalizeExportDate` / `toCalendarDate` | ISO / DD-MM-YYYY → `YYYY-MM-DD` (día real, sin TZ) |
| `normalizeCompetitionDivision` | Aliases legacy → lexikon (`Sub-Junior`→`Youth`, etc.) |
| `ageOnDate` / `resolveCompetitionDivision` | Edad al evento → franja natural |
| `resolveDivisionExportFields` | `division` + inscrita + mismatch duro + Open upgrade |
| `buildAdminExportRows` | Join registration + athlete + membership + payment |
| `buildPluUsaExportRows` | Formato consolidado internacional |
| `serializeCsv` / `serializeSpreadsheet` | Texto puro (browser y server) |

**División en Excel:** se rellena al exportar (no pisa DB). Edad de referencia =
`registration.eventStartsAt` (desde `events.starts_at`) o día del export. Género
va en columna aparte.

Browser: `src/services/exportService.js` (`createCsv`, `createSpreadsheet`, `downloadBlob`).

### 2. Endpoint server-side

```
GET /api/athletes/admin/export?type=admin|plu_usa&format=csv|xls&eventSlug=
```

- Repo: `adminExportDataset` en `supabaseAthleteRepository.js` (join `athlete:athletes(...)`,
  páginas de 1000 hasta 5000).
- Guard: `admin.exports.admin` \| `admin.exports.plu_usa`.
- No usa el snapshot del panel (`ADMIN_SNAPSHOT_DEFAULT_LIMIT = 400`).

### 3. Columnas admin

```
atleta, documento, email, telefono, pais, provincia, ciudad, gimnasio, sexo,
fecha_nacimiento, division, categoria, peso, codigo_afiliado, estado_afiliacion,
evento, estado_inscripcion, estado_pago, referencia_pago
```

### 4. Columnas PLU USA

```
member_code, first_name, last_name, document_id, birth_date, gender,
country, state, city, gym, division, category, bodyweight,
membership_year, membership_status, membership_start, membership_expiration,
event_name, registration_status, payment_status
```

**Limitación:** `first_name`/`last_name` se parten de `fullName`.

### 5. UI

Botones en `RegistrationsSection`: pasan `eventSlug` del filtro activo.
Studio Lifters: presets + filtro de filas + highlight/freeze (`shared/liftersExport.js`
+ `src/lib/liftersExportStudio.js`, persistido en localStorage).
Toasts en `useAppData` para vacío / error / truncado.

### 6. Excel sin dependencia

`serializeSpreadsheet` / `createSpreadsheet` (SpreadsheetML 2003). No agregar `xlsx`
salvo pedido explícito.

## Validaciones

- 404 si no hay filas.
- 403 sin permiso de export.
- Fechas ISO de calendario (no timestamps crudos).
- Encoding UTF-8 + BOM en CSV.
- Tests: `tests/exportService.test.js`.

## Errores comunes

| Error | Síntoma | Fix |
|-------|---------|-----|
| Export desde snapshot viejo | DOB vacío / filas a medias | Usar endpoint `/admin/export`, no el array del panel |
| Admin sin `fecha_nacimiento` | Columna ausente | Verificar `buildAdminExportRows` en `shared/exportRows.js` |
| Join sin atleta | Campos vacíos | Dataset server trae `athlete` embebido |
| Truncado a 5000 | Header `X-PLU-Export-Truncated` | Filtrar por `eventSlug` |
| Excel rompe acentos | Caracteres raros | BOM en `serializeCsv` |

## Checklist de aceptación

- [ ] CSV admin incluye `fecha_nacimiento`
- [ ] PLU USA `birth_date` en `YYYY-MM-DD`
- [ ] `division` calculada por DOB (+ `eventStartsAt`) en admin / PLU USA / Lifters
- [ ] Columnas inscrita + desajuste; Lifters resalta mismatch en azul
- [ ] Export server-side no depende de la ventana de 400
- [ ] Filtro de evento del panel se aplica al download
- [ ] Toast si no hay datos
- [ ] Permisos RBAC respetados
- [ ] `npm test -- tests/ageDivision.test.js tests/exportService.test.js tests/liftersExport.test.js` ok

## Referencias

- [RFC 4180 — CSV](https://www.rfc-editor.org/rfc/rfc4180)
- [`docs/EXPORTS.md`](../../docs/EXPORTS.md)

## Archivos relacionados

| Archivo | Rol |
|---------|-----|
| `shared/ageDivision.js` | Edad → división PLU |
| `shared/exportRows.js` | Builders + serialize |
| `src/services/exportService.js` | Download browser |
| `src/services/athleteApi.js` | `downloadAdminExport` |
| `src/hooks/useAppData.js` | `exportAdminCsv` / `exportPluUsaCsv` |
| `src/pages/admin/RegistrationsSection.jsx` | Botones + eventSlug |
| `server/routes/athletes.js` | `GET /admin/export` |
| `server/modules/athletes/supabaseAthleteRepository.js` | `adminExportDataset` |
| `tests/exportService.test.js` | Unit tests |
