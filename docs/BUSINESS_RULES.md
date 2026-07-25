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

El acceso del staff se resuelve con un RBAC jerárquico de cuatro roles base
protegidos y roles operativos personalizados. Cada usuario conserva un rol base
por compatibilidad y referencia un
`AccessRole`, cuya matriz de `AccessPermission` es la fuente autoritativa para
API y panel.

| Jerarquía | Rol | Alcance predeterminado |
|-----------|-----|------------------------|
| 1 | Super Admin | Acceso total y protegido; supervisa toda la jerarquía |
| 2 | Administrador | Acceso total y protegido; administra PLU y Seguridad |
| 3 | PLU | Representación de la federación; lectura operativa y exportación institucional |
| 4 | Seguridad | Eventos y check-in; su alcance puede ampliarse sin delegar administración |

Reglas:

- Los permisos son capacidades explícitas por módulo y acción (`read`, `write`,
  `approve`, `execute`); no se deducen en el frontend.
- Los cuatro roles base no se eliminan ni cambian de jerarquía. Super Admin y
  Administrador pueden crear roles operativos personalizados, que nacen sin
  permisos y usan `operador_plu_arg` como rol base compatible.
- Super Admin y Administrador tienen acceso total; sus matrices no se pueden
  reducir ni modificar desde el panel.
- Super Admin y Administrador pueden otorgar o remover permisos de PLU,
  Seguridad y roles personalizados. Un permiso de escritura, aprobación o
  ejecución exige también la lectura del mismo módulo cuando esa capacidad
  existe.
- Administrador puede crear usuarios y asignar PLU o Seguridad. Super Admin
  también puede asignar Administrador; nadie puede asignar Super Admin.
- Nadie puede cambiar su propio rol ni modificar a otro Super Admin desde el
  panel.
- Ningún rol operativo —PLU, Seguridad o personalizado— puede recibir
  `admin.users.write` ni `admin.roles.write`, aunque el resto de su matriz sea
  configurable.
- El portal de seguridad autoriza por `admin.checkin.execute`, no por nombre de
  rol. Super Admin, Administrador y cualquier rol global con ese permiso pueden
  operar cualquier evento. Una cuenta con evento asignado sólo puede operar ese
  evento, tanto en la interfaz como en la API.
- Toda ruta sensible valida permisos en Express aunque la navegación no muestre
  el módulo.
- Si una matriz personalizada deja de coincidir con un rol base, no se emite un
  token Supabase privilegiado que pueda eludir la autorización de Express.

## Auditoría

Todo cambio sensible debe generar `audit_log` con: acción, entidad, actor,
timestamp. Esto incluye cambios de permisos y reasignación de roles de usuario.

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
