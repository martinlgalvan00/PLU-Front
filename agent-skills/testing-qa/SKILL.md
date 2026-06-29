# Testing & QA — Vitest + checklist manual

## Objetivo

Asegurar calidad del código PLU-Front con **tests automatizados (Vitest)** en `tests/` y **QA manual** estructurado para flujos críticos: registro, pagos, admin, exports y permisos.

## Cuándo usarla

- Agregar o modificar lógica en `services/` o `lib/`.
- Antes de merge o release.
- Al corregir bugs de negocio (duplicados, montos, roles).
- Cuando CI falle en `npm run test` o `npm run lint`.
- Para definir casos de prueba manual post-feature.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Código bajo test | Funciones puras preferentemente |
| `vitest.config.js` | Config jsdom + globs |
| Datos fixture | Objetos mínimos en cada test |
| Checklist QA | `docs/QA_CHECKLIST.md` (crear/mantener) |

## Salidas esperadas

- Tests en `tests/**/*.test.js` pasando con `npm run test`.
- Cobertura de reglas de negocio críticas (montos, duplicados, roles).
- Lint limpio con `npm run lint`.
- Checklist manual ejecutado y documentado para releases.

## Procedimiento paso a paso

### 1. Stack de testing

| Herramienta | Uso |
|-------------|-----|
| Vitest 3.x | Runner de tests |
| jsdom | Entorno DOM para componentes React |
| @testing-library/react | Tests de componentes (cuando se agreguen) |

Config (`vitest.config.js`):

```javascript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
  },
})
```

### 2. Tests existentes

| Archivo | Qué cubre |
|---------|-----------|
| `tests/athleteService.test.js` | `calculateAmount`, `findDuplicateAthlete` |
| `tests/roles.test.js` | `canEdit`, `canExport`, `canExportPluUsa`, etc. |
| `tests/format.test.js` | Utilidades `format.js` |

Ejecutar:

```powershell
npm run test          # single run
npm run test:watch    # desarrollo
```

### 3. Convenciones para nuevos tests

```javascript
import { describe, expect, it } from 'vitest'
import { myFunction } from '../src/services/myService.js'

describe('myService', () => {
  it('describe comportamiento esperado en español', () => {
    expect(myFunction(input)).toBe(expected)
  })
})
```

**Priorizar:**

1. Funciones puras en `services/` y `lib/`
2. Reglas de negocio con tablas de casos (`it.each`)
3. Componentes solo si lógica UI compleja

**Evitar:**

- Tests que dependen de localStorage real (mockear `storageService`)
- Tests flaky con `Date.now()` sin mock

### 4. Casos de test recomendados (backlog)

**athleteService:**

- `createRegistrationFromForm` con cada `procedureType`
- Error en duplicado
- `approvePayment` actualiza estados esperados

**exportService:**

- `buildPluUsaExportRows` partición de nombres
- `createCsv` escape de comillas

**paymentService:**

- Mock vs configured mode

**roles:**

- Matriz completa rol × permiso

### 5. Lint

```powershell
npm run lint   # oxlint src server
```

Correr antes de tests en CI local. Oxlint es rápido — no reemplaza revisión de lógica.

### 6. Build smoke

```powershell
npm run build
```

Verifica que Vite compila sin errores de import/export.

### 7. Checklist QA manual

Crear/mantener `docs/QA_CHECKLIST.md` con:

#### Registro público

- [ ] Completar formulario combo → orden creada $78.000
- [ ] Solo afiliación → $38.000
- [ ] Solo inscripción → $45.000
- [ ] Duplicado email → mensaje error
- [ ] Duplicado DNI → mensaje error
- [ ] Método MP → botón simular pago visible
- [ ] Método manual → nota de validación admin

#### Panel admin

- [ ] Métricas coinciden con datos
- [ ] Filtro por estado funciona
- [ ] Búsqueda por nombre/DNI
- [ ] Aprobar pago manual → estados actualizados
- [ ] Export CSV admin (con rol editor)
- [ ] Export PLU USA (con viewer)

#### RBAC

- [ ] `viewer_plu_usa`: exports admin deshabilitado
- [ ] `operador_plu_arg`: puede aprobar, no usuarios

#### Persistencia

- [ ] Refresh página mantiene datos (localStorage)
- [ ] `npm run dev:all` → `/health` OK

#### Responsive

- [ ] Home y Register usables en 375px
- [ ] Tabla admin scroll horizontal

### 8. CI sugerido (futuro)

```yaml
- run: npm ci
- run: npm run lint
- run: npm run test
- run: npm run build
```

## Validaciones

- `npm run test` → 0 failures.
- `npm run lint` → 0 errors.
- `npm run build` → exit 0.
- Tests no dependen de orden de ejecución.
- No secrets en fixtures de test.
- QA checklist actualizado si cambia flujo usuario.

## Errores comunes

| Error | Causa | Fix |
|-------|-------|-----|
| jsdom no definido | Falta config environment | `vitest.config.js` |
| Import ESM falla | Extensión .js requerida | Usar paths completos |
| Test pasa local, falla CI | Timezone | Mock `Date` |
| Flaky duplicate test | Estado global emailLogs | Reset en beforeEach |
| Solo tests happy path | Bugs en edge cases | Agregar casos error |
| Omitir lint | Deuda estilo | Correr oxlint siempre |

## Checklist de aceptación

- [ ] `npm run test` verde
- [ ] `npm run lint` verde
- [ ] `npm run build` verde
- [ ] Tests para toda lógica de negocio nueva
- [ ] `docs/QA_CHECKLIST.md` existe y está actualizado
- [ ] Bug fixes incluyen test de regresión
- [ ] (Futuro) CI configurado en repo

## Referencias oficiales

- [Vitest — Getting Started](https://vitest.dev/guide/)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `vitest.config.js` | Config tests |
| `tests/*.test.js` | Tests unitarios |
| `package.json` | Scripts test, test:watch |
| `docs/QA_CHECKLIST.md` | QA manual (crear) |
| `src/services/athleteService.js` | Lógica crítica a testear |
| `src/lib/roles.js` | RBAC tests |
| `.oxlintrc.json` | Reglas lint |
