# Forms & Validation — Registro de atleta

## Objetivo

Implementar y mantener el **formulario de registro** de atletas con validación robusta, detección de duplicados (email/documento), cálculo de montos y UX clara — preparado para migrar validaciones a **Zod** sin reescribir la página.

## Cuándo usarla

- Modificar campos del registro en `RegisterPage.jsx`.
- Agregar reglas de validación (edad, formato DNI, peso).
- Integrar Zod schemas compartidos frontend/backend.
- Corregir bugs de submit, duplicados o totales incorrectos.
- Alinear opciones de formulario con `FORM_OPTIONS` en constants.

## Entradas requeridas

| Entrada | Fuente |
|---------|--------|
| Estado del form | `form` en `useAppData` (`DEFAULT_FORM`) |
| Opciones select | `FORM_OPTIONS` en `constants.js` |
| Atletas existentes | Para check de duplicados |
| Tipo de trámite | `procedureType` → monto en `PROCEDURE_TYPES` |

## Salidas esperadas

- Formulario enviado solo si pasa validación.
- Error claro si email o documento duplicado.
- Orden de pago creada (`createdOrder`) con monto correcto.
- Form reseteado a `DEFAULT_FORM` tras éxito.
- (Futuro) Schema Zod reutilizable en `server/` para POST `/api/athletes`.

## Procedimiento paso a paso

### 1. Estructura del formulario

Archivo: `src/pages/RegisterPage.jsx`

**Campos obligatorios:**

| Campo | name | Tipo |
|-------|------|------|
| Nombre y apellido | `fullName` | text |
| DNI/documento | `documentId` | text |
| Fecha nacimiento | `birthDate` | date |
| Email | `email` | email |
| Teléfono | `phone` | text |
| País | `country` | text (default Argentina) |
| Provincia | `province` | text |
| Ciudad | `city` | text |
| Gimnasio | `gym` | text |
| Sexo | `sex` | select |
| División | `division` | select |
| Categoría | `category` | select |
| Peso estimado | `estimatedWeight` | text |
| Tipo trámite | `procedureType` | select |
| Método pago | `paymentMethod` | select |

Componentes: `Field`, `Select` de `FormFields.jsx`.

### 2. Flujo de submit

```
onSubmit (RegisterPage)
  → handleSubmit (useAppData) — event.preventDefault()
  → createRegistrationFromForm(form, athletes, ...)
  → si error: alert/mostrar mensaje
  → si ok: actualizar athletes, memberships, registrations, payments, auditLog
  → setCreatedOrder, reset form
```

### 3. Validación actual (HTML5 + servicio)

- `required` en campos críticos vía prop en `Field`.
- Duplicados: `findDuplicateAthlete(athletes, { email, documentId })` en `athleteService.js`.
- Comparación email case-insensitive.

### 4. Migración a Zod (recomendada)

Crear `src/lib/schemas/athleteRegistration.js`:

```javascript
import { z } from 'zod'

export const athleteRegistrationSchema = z.object({
  fullName: z.string().min(3, 'Nombre muy corto'),
  documentId: z.string().regex(/^\d{7,8}$/, 'DNI inválido'),
  birthDate: z.string().refine((d) => new Date(d) < new Date(), 'Fecha futura'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(8),
  country: z.string().min(2),
  province: z.string().min(2),
  city: z.string().min(2),
  gym: z.string().min(2),
  sex: z.enum(['Masculino', 'Femenino']),
  division: z.enum(['Open', 'Junior', 'Sub-Junior', 'Master I', 'Master II']),
  category: z.enum(['Raw', 'Classic Raw', 'Equipped']),
  estimatedWeight: z.string().min(1),
  procedureType: z.enum(['both', 'membership', 'event']),
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
})
```

Uso en `handleSubmit`:

```javascript
const result = athleteRegistrationSchema.safeParse(form)
if (!result.success) {
  setErrors(result.error.flatten().fieldErrors)
  return
}
```

Zod ya está en `package.json` (`^3.25.76`).

### 5. Reglas de negocio en validación

| Regla | Implementación |
|-------|----------------|
| Duplicado email/DNI | `findDuplicateAthlete` antes de crear |
| Junior pricing | Si `division` es Junior/Sub-Junior → usar `PRICING.membershipJunior` (pendiente en `calculateAmount`) |
| Solo evento sin afiliación | Permitido en MVP; validar `requiresMembership` al confirmar |
| Monto visible | `PROCEDURE_TYPES[procedureType].amount` en UI |

### 6. Panel lateral de orden

Muestra `createdOrder` post-submit:

- Nombre, monto (`money()`), concepto, `StatusPill`, referencia.
- Botón simular pago (solo demo MP).
- Link a panel admin.

### 7. Mensajes de error UX

- Duplicado: *"Ya existe un atleta con ese email o documento (Nombre)."*
- Validación Zod: errores por campo bajo cada input (futuro).
- Evitar `alert()` en producción — usar banner o toast.

## Validaciones

- Submit sin campos vacíos obligatorios.
- Email formato válido.
- `birthDate` no futura.
- Duplicados rechazados antes de mutar estado.
- Total en footer = `calculateAmount(procedureType)`.
- Tests en `tests/athleteService.test.js` para duplicados y montos.
- (Futuro) Mismo schema Zod en API server.

## Errores comunes

| Error | Causa | Fix |
|-------|-------|-----|
| Total desactualizado | `procedureType` cambió sin re-render | Derivar de `form.procedureType` |
| Duplicado no detectado | Comparación case-sensitive email | `.toLowerCase()` (ya implementado) |
| Form no resetea | Olvidar `resetForm` | Retornar en `createRegistrationFromForm` |
| Validación solo HTML | Bypass con devtools | Agregar Zod en submit |
| DNI con puntos | Regex estricto | Normalizar input (strip non-digits) |

## Checklist de aceptación

- [ ] Todos los campos requeridos validados
- [ ] Duplicados bloqueados con mensaje claro
- [ ] Monto correcto para each `procedureType`
- [ ] Orden creada y visible en panel lateral
- [ ] Form resetea tras éxito
- [ ] Tests unitarios de duplicados y montos pasan
- [ ] (Opcional) Schema Zod integrado
- [ ] Estilos en `src/styles/pages/register.css`

## Referencias oficiales

- [Zod documentation](https://zod.dev/)
- [MDN — Constraint validation](https://developer.mozilla.org/es/docs/Web/HTML/Constraint_validation)
- `docs/BUSINESS_RULES.md` — duplicados y precios

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/pages/RegisterPage.jsx` | UI del formulario |
| `src/components/ui/FormFields.jsx` | Field, Select |
| `src/hooks/useAppData.js` | handleSubmit, estado form |
| `src/services/athleteService.js` | createRegistrationFromForm, findDuplicateAthlete |
| `src/lib/constants.js` | DEFAULT_FORM, FORM_OPTIONS, PRICING |
| `src/lib/format.js` | money(), generateId() |
| `src/styles/pages/register.css` | Estilos |
| `tests/athleteService.test.js` | Tests validación negocio |
