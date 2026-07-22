# Reglas de negocio — PLU ARG

## Fuente de verdad

- **Eventos, atletas, afiliaciones, inscripciones y entradas:** Supabase detrás de la API Express.
- **Usuarios y roles del staff:** Prisma; atletas usan una sesión opaca HTTP-only independiente.
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

## Precios

Los planes de afiliación se leen de `membership_plans`. La inscripción y las
entradas se cotizan desde el evento y su `rules.ticketPricing`; el frontend no
puede enviar el monto autoritativo.

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

Toda creación de orden requiere idempotency key. El evento se bloquea al tomar
cupos, los códigos se generan por secuencia y las reservas impagas vencen para
liberar capacidad. Una renovación crea un ciclo nuevo y nunca acorta ni
sobrescribe el derecho vigente. Una inscripción requiere evento publicado,
ventana abierta, cupo disponible y afiliación activa durante la fecha válida.

Los pagos de Mercado Pago se acreditan únicamente por webhook firmado o por
conciliación server-side. Finanzas puede aprobar solamente métodos manuales.

Un `external_payment_id` de un proveedor pertenece a una única orden en todo el
sistema, incluso entre entradas y afiliaciones. Una suscripción queda ligada al
plan de la orden, conserva un snapshot inmutable de monto, moneda y frecuencia,
y su primer cobro usa exactamente el ciclo reservado al crear la orden. Un plan
ya asociado a Mercado Pago no se edita económicamente: se publica una versión
nueva.
