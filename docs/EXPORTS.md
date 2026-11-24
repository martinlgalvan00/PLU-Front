# Exportaciones — PLU ARG / PLU USA

## Tipos

| Export | Archivo | Permiso | Origen |
|--------|---------|---------|--------|
| Admin operativo | `plu-arg-admin-export[-slug].csv\|xls` | `admin.exports.admin` | `GET /api/athletes/admin/export?type=admin` |
| Consolidado PLU USA | `plu-usa-export[-slug].csv\|xls` | `admin.exports.plu_usa` | `GET /api/athletes/admin/export?type=plu_usa` |
| Lifters (LiftingCast) | `lifters-export[-slug].xls` | `admin.exports.admin` | `GET /api/athletes/admin/export?type=lifters&format=xls\|json` |

## Endpoint

```
GET /api/athletes/admin/export?type=admin|plu_usa&format=csv|xls&eventSlug=opcional
```

- Join real `event_registrations` → `athletes` (incluye `birth_date`, dirección, emergencia).
- No usa el snapshot del panel (límite 400): pagina hasta 5000 filas.
- Si se corta, responde con header `X-PLU-Export-Truncated: 1`.
- `eventSlug` acota al meet (slug o título, igual que el filtro del panel).
- CSV lleva BOM UTF-8 para Excel Windows.
- Fechas de nacimiento y membresía en `YYYY-MM-DD` vía `normalizeExportDate`.
- **División por edad:** la columna `division` se calcula en export con
  `resolveCompetitionDivision` ([`shared/ageDivision.js`](../shared/ageDivision.js))
  según DOB y edad al `event.starts_at` (o día del export). Franjas PLU §1.3 →
  `Youth` (10–12), `Junior` (13–23), `Open` (24–34), `Sub-Masters` (35–39),
  `Masters` (40+). Sin DOB usable se mantiene la división declarada. El género
  sigue en columna aparte (`sexo` / `gender`); no se concatena en `division`.
  No escribe de vuelta a DB.
- **Auditoría de división:** `division` = franja calculada por DOB al
  `event.starts_at` (indexable). Viajan también la inscrita
  (`division_inscrita` / `division_entered` / `DivisionEntered`), desajuste duro
  (`division_desajuste` / `division_mismatch` / `DivisionMismatch=Yes`) y upgrade
  Open válido (`division_open_upgrade` / `DivisionMismatch=Open`).
  Open upgrade (p. ej. Junior inscrito Open) **no** es mismatch: PLU §1.3 lo
  permite. Mismatch duro = inscrita fuera de la franja + Open. En Lifters, filas
  con mismatch duro (sin faltantes) van en azul; incompletas en amarillo.
  Headers `X-PLU-Export-Division-Mismatch` y `X-PLU-Export-Division-Open-Upgrade`.
- **Template LiftingCast:** el header de abajo es el que genera el sistema.
  No hay un CSV oficial del importador en el repo, así que el esquema sigue
  pendiente de comparación externa (nombres, orden, mayúsculas, delimitador
  y encoding). Hasta esa comparación no se lo trata como contrato cerrado.
- **Lifters:** header fijo de importación LiftingCast (`name` … `notes`,
  incluyendo `lot`, `platform`, `session`, `flight`, openers, racks,
  `declaredAwardsWeightClass` y `bodyWeight`). `declaredAwardsWeightClass`
  lleva la categoría oficial del pesaje cuando está cargada; si no, la
  categoría declarada en la inscripción. `bodyWeight` usa el peso del pesaje
  cuando está cargado; si no, el peso declarado. Ninguno de los dos se pisa
  al cargar el otro. `session` es la jornada, `flight` la tanda y `platform`
  la plataforma ya asignadas en la grilla. `lot` es el orden por nombre
  dentro de esa tanda; sin tanda queda vacío. La plantilla `official`/`audit` no se descarga si falta
  una columna.
  Una celda sin dato queda vacía;
  la columna no se omite. Fechas `DD/MM/YYYY`. El peso conserva decimales.
  La auditoría de división va en la hoja Summary, no en el header de importación.
  `format=json` incluye `divisionMismatch` y `divisionOpenUpgrade` en readiness.
- **Studio Lifters (UI Inscripciones):** cada columna se puede incluir o
  sacar. Los presets `audit` y `official` marcan el header completo de
  LiftingCast; `minimal` y `contact` arrancan con un subconjunto. El Excel
  descarga exactamente las columnas marcadas, en el orden del template, con
  celda vacía si el dato no está. Siguen el filtro de filas
  (`all`/`complete`/`incomplete`), resaltar vacíos, freeze y la hoja
  **Summary**. Opciones en query (`preset`, `columns`, `rowFilter`,
  `highlightEmpty`, `freezeHeader`, `includeSummarySheet`) y persistidas en
  `localStorage` (`plu-lifters-export-options-v1`).

## Columnas admin

```
atleta, documento, email, telefono, pais, provincia, ciudad, gimnasio, sexo,
fecha_nacimiento, division, division_inscrita, division_desajuste,
division_open_upgrade, segunda_division, modalidades, categoria, peso, codigo_afiliado, estado_afiliacion,
evento, estado_inscripcion, estado_pago, referencia_pago
```

## Columnas PLU USA

```
member_code, first_name, last_name, document_id, birth_date, gender,
country, state, city, gym, division, division_entered, division_mismatch,
division_open_upgrade, category, bodyweight, membership_year,
membership_status, membership_start, membership_expiration, event_name,
registration_status, payment_status
```

## Implementación

| Pieza | Rol |
|-------|-----|
| [`shared/ageDivision.js`](../shared/ageDivision.js) | Edad al día de referencia → división del sistema |
| [`shared/exportRows.js`](../shared/exportRows.js) | Builders + serializeCsv / serializeSpreadsheet |
| [`src/services/exportService.js`](../src/services/exportService.js) | Download en browser + re-exports |
| [`server/modules/athletes/supabaseAthleteRepository.js`](../server/modules/athletes/supabaseAthleteRepository.js) `adminExportDataset` | Query paginada con join |
| [`server/routes/athletes.js`](../server/routes/athletes.js) `GET /admin/export` | Auth + archivo |
| [`src/hooks/useAppData.js`](../src/hooks/useAppData.js) | Wiring + toast vacío/error/truncado |

Demo mode sigue armando el CSV en cliente desde el estado en memoria.

## Target (follow-up)

- Registrar cada export en tabla `Export` (auditoría).
- Sección Admin **Exports** dedicada (hoy es placeholder; los botones viven en Inscripciones).
- `first_name` / `last_name` explícitos en schema (el split de `fullName` tiene limitaciones).

## OpenPowerlifting

Para resultados de competencia, alinear columnas con [spec OpenPowerlifting](https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html).
