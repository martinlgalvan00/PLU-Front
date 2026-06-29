# Reglas de negocio — PLU ARG

## Fuente de verdad

- **Atletas, afiliaciones e inscripciones:** base propia (hoy localStorage, target PostgreSQL).
- **Pagos:** Mercado Pago confirma el evento; el sistema decide qué activar.
- **Resultados:** LiftingCast durante el evento; el sistema normaliza y exporta.

## Estados

### Atleta
`pre_registrado` → `registrado` → `afiliado_activo` → `afiliado_vencido` | `bloqueado`

### Afiliación
`pendiente_pago` → `activa` → `vencida` | `cancelada` | `reembolsada`

### Inscripción
`borrador` → `pendiente_pago` → `pagada` → `confirmada` | `observada` | `cancelada`

### Pago
`creado` → `pendiente` → `aprobado` | `rechazado` | `cancelado` | `reembolsado`

## Precios MVP (ARS)

| Concepto | Monto |
|----------|-------|
| Afiliación atleta | $38.000 |
| Afiliación juvenil | $28.000 |
| Inscripción evento | $45.000 |
| Combo afiliación + Pitbull Classic | $78.000 |

## Roles

| Rol | Permisos |
|-----|----------|
| Admin Maximal | Todo |
| Admin PLU ARG | Todo operativo + usuarios |
| Operador PLU ARG | Datos operativos, sin usuarios |
| PLU USA | Solo lectura y exportación autorizada |

## Auditoría

Todo cambio sensible debe generar `audit_log` con: acción, entidad, actor, timestamp.

## Duplicados

No permitir registro con mismo email o documento que atleta existente.
