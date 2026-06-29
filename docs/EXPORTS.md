# Exportaciones — PLU ARG / PLU USA

## Tipos

| Export | Archivo | Rol |
|--------|---------|-----|
| Admin operativo | `plu-arg-admin-export.csv` | Admin, Operador |
| Consolidado PLU USA | `plu-usa-export.csv` | Todos (PLU USA solo este) |

## Normalización PLU USA

- `first_name` / `last_name` desde `fullName`
- Pesos en kg
- Fechas ISO 8601
- Estados mapeados a inglés donde aplique

## Implementación

`src/services/exportService.js`:
- `buildAdminExportRows()`
- `buildPluUsaExportRows()`
- `createCsv()` — descarga client-side

## Target

- Registrar cada export en tabla `Export`
- Soporte XLSX vía librería `xlsx`
- Filtros por evento/período desde panel admin

## OpenPowerlifting

Para resultados de competencia, alinear columnas con [spec OpenPowerlifting](https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html).
