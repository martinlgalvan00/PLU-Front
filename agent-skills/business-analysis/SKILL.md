# Business Analysis — PLU ARG

## Objetivo

Alinear toda implementación técnica con las **reglas de negocio de Powerlifting Union Argentina (PLU ARG)** operada por Maximal: flujos de afiliación, inscripción a eventos, pagos, estados y permisos. Evitar decisiones ad-hoc que contradigan el MVP documentado.

## Cuándo usarla

- Antes de modificar lógica en `athleteService.js`, `useAppData.js` o el schema Prisma.
- Al diseñar nuevos estados, transiciones o validaciones.
- Al estimar alcance de features (qué entra en MVP vs. fases futuras).
- Cuando hay duda sobre precios, combos, requisitos de afiliación o roles.
- Al escribir tests que modelen comportamiento de negocio.

## Entradas requeridas

| Entrada | Fuente |
|---------|--------|
| Tipo de trámite | `both`, `membership`, `event` en formulario |
| Datos del atleta | Nombre, documento, email, división, categoría |
| Evento target | Hoy: **Pitbull Classic** (MVP) |
| Método de pago | `mercado_pago` o `manual_link` |
| Rol del actor | Admin, operador, viewer PLU USA |
| Documentación | `docs/BUSINESS_RULES.md` |

## Salidas esperadas

- Estados coherentes en atleta, afiliación, inscripción y pago.
- Montos calculados según `PRICING` en `constants.js`.
- Registro de auditoría (`audit_log`) en acciones sensibles.
- Rechazo explícito de duplicados (email o documento).
- Transiciones de estado documentadas y testeables.

## Procedimiento paso a paso

### 1. Entender el dominio MVP

**Actores:**

- Atleta (público): se registra, paga, consulta estado.
- Operador PLU ARG: aprueba pagos manuales, filtra inscripciones.
- Admin PLU ARG / Maximal: todo lo operativo + usuarios.
- Viewer PLU USA: lectura y export consolidado.

**Fuentes de verdad:**

| Dato | Fuente actual | Target |
|------|---------------|--------|
| Atletas / afiliaciones / inscripciones | localStorage (`storageService`) | PostgreSQL + Prisma |
| Confirmación de pago | Simulación / admin manual | Webhook Mercado Pago (backend) |
| Resultados de levantamiento | — | Import LiftingCast |

### 2. Mapear estados (Prisma enums = contrato)

**Atleta (`AthleteStatus`):**

```
pre_registrado → registrado → afiliado_activo → afiliado_vencido
                                    ↓
                               bloqueado (manual)
```

**Afiliación (`MembershipStatus`):**

```
pendiente_pago → activa → vencida
       ↓           ↓
  cancelada    reembolsada
```

**Inscripción (`RegistrationStatus`):**

```
borrador → pendiente_pago → pagada → confirmada
                              ↓         ↓
                         cancelada   observada
```

**Pago (`PaymentStatus`):**

```
creado → pendiente → aprobado | rechazado | cancelado | reembolsado
```

### 3. Flujo de afiliación

1. Atleta completa formulario con `procedureType: membership` o `both`.
2. Sistema crea atleta en `pre_registrado`.
3. Se genera `Membership` con `pendiente_pago` y `memberCode` único (`PLU-ARG-2026-NNN`).
4. Se crea `Payment` con monto según trámite.
5. **Solo cuando el pago está `aprobado`** (webhook o admin):
   - Membership → `activa`
   - Atleta → `afiliado_activo` (o `registrado` si solo inscripción)
   - Email `affiliation_started` vía Brevo

### 4. Flujo de inscripción (Pitbull Classic)

1. Atleta elige `procedureType: event` o `both`.
2. Se crea `EventRegistration` con `pendiente_pago`.
3. Evento MVP: **Pitbull Classic** — `requiresMembership: true` en schema.
4. Validar afiliación activa antes de confirmar (regla de negocio; hoy parcial en demo).
5. Al aprobar pago:
   - Registration → `confirmada`
   - Email `registration_confirmed`

### 5. Precios MVP (ARS)

| Concepto | Clave | Monto |
|----------|-------|-------|
| Afiliación atleta | `PRICING.membership` | $38.000 |
| Afiliación juvenil | `PRICING.membershipJunior` | $28.000 |
| Inscripción evento | `PRICING.event` | $45.000 |
| Combo afiliación + Pitbull | `PRICING.combo` | $78.000 |

Implementación: `calculateAmount(procedureType)` en `athleteService.js`.

### 6. Reglas transversales

- **Duplicados:** mismo `email` o `documentId` → error, no crear segundo atleta.
- **Auditoría:** toda acción sensible (`athlete.registered`, `payment.approved`) → `auditLog`.
- **Pagos:** nunca confirmar desde frontend; ver skill `mercado-pago`.
- **Compat demo:** el código acepta aliases en inglés (`active`, `approved`) por datos seed; nuevos datos deben usar enums en español del schema.

## Validaciones

- Monto del pago = suma correcta según `procedureType`.
- `memberCode` único por afiliación anual.
- No dos atletas con mismo email o documento.
- Inscripción a evento con `requiresMembership` exige afiliación `activa`.
- Transiciones de estado solo en dirección permitida (no saltar de `borrador` a `confirmada` sin pago).
- Acciones de escritura bloqueadas para `viewer_plu_usa`.

## Errores comunes

| Error de negocio | Síntoma | Corrección |
|------------------|---------|------------|
| Confirmar pago en frontend | Estado `aprobado` sin webhook | Mover lógica a `server/` |
| Precio hardcodeado en JSX | Desincronización con `PRICING` | Usar `constants.js` |
| Afiliar sin pago | Membership `activa` directo | Exigir `pendiente_pago` → pago → `activa` |
| Permitir duplicados | Dos atletas mismo DNI | Usar `findDuplicateAthlete` |
| Mezclar estados EN/ES | Filtros admin rotos | Normalizar a enums Prisma |
| Ignorar auditoría | Sin trazabilidad | Agregar `auditLog` en mutaciones |

## Checklist de aceptación

- [ ] Estados alineados con enums de `prisma/schema.prisma`
- [ ] Precios centralizados en `src/lib/constants.js`
- [ ] Flujo afiliación documentado y cubierto por tests de monto/duplicados
- [ ] Flujo inscripción Pitbull Classic con estados correctos
- [ ] Duplicados rechazados con mensaje claro al usuario
- [ ] Acciones sensibles generan `auditLog`
- [ ] Roles respetados según `src/lib/roles.js`
- [ ] Cambios de negocio reflejados en `docs/BUSINESS_RULES.md`

## Referencias oficiales

- Documentación interna: `docs/BUSINESS_RULES.md`
- [IPF — Reglas de competencia](https://www.powerlifting.sport/) (referencia deportiva, no legal)
- Enums Prisma: `prisma/schema.prisma`

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `docs/BUSINESS_RULES.md` | Fuente funcional |
| `prisma/schema.prisma` | Contrato de estados y entidades |
| `src/lib/constants.js` | Precios, labels, opciones de formulario |
| `src/services/athleteService.js` | Lógica de registro y aprobación |
| `src/hooks/useAppData.js` | Orquestación de estado en UI |
| `src/lib/roles.js` | Permisos por rol |
| `tests/athleteService.test.js` | Tests de negocio |
