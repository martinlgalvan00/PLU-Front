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

Los planes de afiliación se leen de `membership_plans`. Cada cambio económico
publica una fila versionada (`family_code`, `version`, `effective_from` y
`retired_at`); nunca modifica el monto de una versión usada por una orden o
vinculada a Mercado Pago.

La inscripción se cotiza desde `events.price`, y las entradas desde el catálogo
del evento y `rules.ticketPricing`. El editor del torneo sólo administra el
precio propio de inscripción. Las afiliaciones y las ofertas conjuntas se
administran desde **Tarifas**, para evitar dos valores distintos para el mismo
concepto. El frontend nunca puede enviar el monto autoritativo de una orden.

Una oferta conjunta vive en `event_combo_offers`, referencia una versión de
afiliación de pago único y no puede superar la suma del plan más la inscripción.
La compra se crea con `create_membership_registration_combo_order`: bajo una
misma transacción bloquea atleta, evento, oferta y plan; reserva el cupo; crea
una sola `athlete_payment_order` con `concept=combo`; y vincula a esa orden la
afiliación y la inscripción. El precio, la moneda y el plan siempre se releen
del catálogo en PostgreSQL y nunca llegan como datos autoritativos del browser.
Su activación y ventana son independientes por evento. La compra del combo (y
cualquier otro checkout de pago) exige que "Cobros generales" esté habilitado
en el panel (Administración > Acceso y habilitación), que abre por defecto y
cubre afiliación, inscripción, entradas y suscripciones con un solo
interruptor — reemplaza a la variable de entorno `PAID_CHECKOUT_ENABLED`, que
queda en el código sólo como freno de emergencia si Supabase no respondiera.
El combo además exige "Afiliaciones" **y** "Inscripciones" habilitadas, cada
una con su propio interruptor. La fecha **Abre la inscripción** del panel
(`registration_opens_at`) alimenta el countdown, no el cobro. La
administración del catálogo económico conserva su política de escritura
separada.

Cada atleta tiene un único `credential_token` estable. Pagar un combo no crea
otro QR ni modifica el anterior: la consulta de credencial resuelve en tiempo
real la afiliación activa y todas las inscripciones visibles. Con contexto de
evento debe devolver la inscripción de ese torneo y ambos derechos tienen que
habilitar el check-in cuando el evento exige afiliación. Un ticket de público
general no comparte este token y mantiene su QR opaco ligado al evento.

Los planes con `collection_mode=recurring` representan afiliación automática
por Mercado Pago. Con `APP_PRODUCTION=true` no se publican en `/api/payments/plans`
y Express rechaza tanto la creación de su orden como el procesamiento de la
suscripción con `FEATURE_COMING_SOON`.

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
- Sólo Super Admin puede eliminar cuentas de staff. No puede eliminar su propia
  cuenta ni otra cuenta Super Admin. La operación es atómica: borra perfil,
  sesiones, identidades, preferencias y membresías organizativas; las
  referencias históricas conservadas quedan anonimizadas, y se registra la
  acción en auditoría.
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

Las transiciones técnicas de identidad, emails, webhooks y conciliación de pagos
se guardan en `operational_event_logs`, de forma append-only. El estado actual
puede cambiar, pero su historia no se sobrescribe. La bitácora de identidad
incluye alta de cuentas, login exitoso o fallido y cierre de sesión; los intentos
anónimos usan fingerprints y nunca guardan contraseñas, cookies ni tokens.

Cada cambio del ledger de Mercado Pago —pendiente, aprobado, rechazado,
cancelado o reembolsado— genera una entrada propia. Un error de carga del Brick,
un intento inválido, suprimido, rechazado o agotado también debe quedar
registrado con código de error y próximo reintento cuando corresponda.

La auditoría operativa debe poder detectar, como mínimo, pagos aprobados sin
afiliación activa y afiliaciones activas sin confirmación de entrega del email.
Que el proveedor acepte un email no equivale a que el destinatario lo haya
recibido: la confirmación es el evento `delivered` del webhook.

## Duplicados

No permitir registro con mismo email o documento que atleta existente.

Toda creación de orden requiere idempotency key. El evento se bloquea al tomar
cupos, los códigos se generan por secuencia y las reservas impagas vencen para
liberar capacidad. Una renovación crea un ciclo nuevo y nunca acorta ni
sobrescribe el derecho vigente. Una inscripción requiere evento publicado,
ventana abierta y cupo disponible. La afiliación activa vigente **no** es
condición para crear ni pagar la inscripción: puede quedar pendiente en
paralelo. Si el evento tiene `requires_membership`, el **check-in en puerta**
sí exige afiliación activa y vigente; sin ese requisito, la inscripción
confirmada alcanza para ingresar.

Los pagos de Mercado Pago se acreditan únicamente por webhook firmado o por
conciliación server-side. Finanzas puede aprobar solamente métodos manuales.

Un `external_payment_id` de un proveedor pertenece a una única orden en todo el
sistema, incluso entre entradas y afiliaciones. Una suscripción queda ligada al
plan de la orden, conserva un snapshot inmutable de monto, moneda y frecuencia,
y su primer cobro usa exactamente el ciclo reservado al crear la orden. Un plan
ya asociado a Mercado Pago no se edita económicamente: se publica una versión
nueva.
