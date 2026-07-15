# Pagos, Afiliaciones y Renovaciones con Mercado Pago

**Objetivo:** unificar personas, usuarios, afiliaciones, inscripciones, pagos y
renovaciones en un flujo backend-first, auditable e idempotente, preparado para
planes mensuales y anuales.

**Arquitectura:** PostgreSQL es la fuente de verdad. Mercado Pago confirma
recursos externos; el backend decide, dentro de una transaccion, que derecho de
acceso se activa, renueva, vence o revoca. React solo crea solicitudes y muestra
el estado devuelto por la API.

**Estrategia de cobro recomendada:**

- Payment Brick embebido para cobros unicos: inscripciones, entradas, combos y
  renovacion anual explicita.
- Suscripciones de Mercado Pago para abonos con debito recurrente mensual o
  anual y consentimiento del pagador.
- Transferencia/manual como canal alternativo, aprobado solo por un rol
  autorizado y con comprobante/auditoria.
- Un unico ledger interno (`PaymentOrder`, `Payment`, `PaymentAllocation`) para
  todos los canales.

---

## 1. Diagnostico del estado actual

El repositorio ya contiene la mayor parte del contrato normalizado en
`prisma/schema.prisma`:

- `Person` representa a la persona real y puede ser pagador, atleta o asistente.
- `MembershipPlan`, `MembershipPeriod` y `Membership` modelan la afiliacion.
- `PaymentOrder`, `PaymentOrderItem`, `Payment` y `PaymentAllocation` separan
  intencion de cobro, transaccion y destino del dinero.
- `IntegrationEvent`, `IntegrationAttempt`, `OutboxEvent` y `AuditLog` permiten
  idempotencia, reintentos y trazabilidad.

Todavia no hay una base productiva de pagos porque:

1. `server/modules/payments/paymentWorkflow.js` genera ordenes locales y guarda
   eventos en memoria; no usa Prisma ni llama a Mercado Pago.
2. `server/routes/payments.js` no valida `x-signature`, no consulta el recurso
   canonico en Mercado Pago y no activa entidades en una transaccion.
3. `src/services/paymentService.js` conserva fallbacks que pueden simular una
   aprobacion y acepta monto/concepto originados en el cliente.
4. Las migraciones Supabase `20260715000000` y `20260715000100`, actualmente en
   desarrollo, crean un segundo contrato simplificado (`athlete_payment_orders`)
   que no coincide con el modelo Prisma v3.
5. `approve_athlete_payment_order` es una RPC publica de simulacion. Eso debe
   quedar restringido a demo/test; en produccion una aprobacion solo puede
   provenir de un webhook verificado o de un operador autenticado.
6. El identificador de atleta puede conocerse sin una sesion fuerte. No alcanza
   como autorizacion para consultar datos personales, crear cobros o modificar
   el perfil.
7. La afiliacion actual esta atada a `year` y una fecha fija. Ese contrato no
   representa cuotas mensuales, vigencia rolling ni historial de renovaciones.
8. `IntegrationEvent.externalId` mezcla el id de notificacion con el id del
   recurso. Un mismo pago puede emitir varias actualizaciones; deduplicarlo solo
   por `paymentId` puede descartar una actualizacion posterior valida.

### Decision previa obligatoria

No construir Mercado Pago encima de `athlete_payment_orders`. Primero hay que
elegir un solo contrato de escritura y llevar Supabase al modelo Prisma v3. La
recomendacion es:

```
prisma/schema.prisma = contrato canonico
PostgreSQL/Supabase   = persistencia del contrato canonico
Express workflows    = unica frontera de escritura de pagos e integraciones
Supabase RPC/views   = lecturas y operaciones acotadas que respetan ese contrato
```

---

## 2. Modelo de dominio objetivo

### Identidad y asociacion del pago

| Entidad | Responsabilidad |
|---|---|
| `User` | Cuenta autenticada. Puede ser atleta o miembro del staff. |
| `Person` | Persona legal/operativa a la que pertenecen afiliaciones y pagos. |
| `OrganizationAthlete` | Rol deportivo de esa persona dentro de PLU ARG. |
| `PaymentOrder.payerPersonId` | Persona que debe pagar la orden. |
| `Payment.payerPersonId` | Pagador informado/confirmado por el proveedor. |

Agregar una relacion explicita `User.personId` opcional y unica. El backend debe
resolver `payerPersonId` desde la sesion. Para un alta publica previa al login,
usar un `CheckoutSession` aleatorio, hasheado, de un solo uso y con vencimiento,
ligado a `personId` y `paymentOrderId`; nunca confiar solamente en un
`athleteId` recibido desde React.

### Separar afiliacion de vigencia pagada

La renovacion no debe sobrescribir la afiliacion anterior. La estructura
recomendada es:

| Entidad | Responsabilidad |
|---|---|
| `MembershipPlan` | Producto: afiliacion PLU anual, abono mensual, juvenil, etc. |
| `MembershipPlanVersion` | Precio, moneda, frecuencia y vigencia comercial versionados. |
| `Membership` | Vinculo estable persona-plan y codigo de miembro. |
| `MembershipCycle` | Ventana de cobertura pagada: `startsAt`, `endsAt`, estado y pago. |
| `BillingSubscription` | Autorizacion recurrente opcional y su id `preapproval` de MP. |

`MembershipPeriod` puede migrarse a `MembershipPlanVersion`, o mantenerse con
ese rol si se eliminan las restricciones que lo atan solamente a un anio. El
punto indispensable es que exista un ciclo por cada periodo cobrado.

Campos minimos de plan/version:

- `intervalUnit`: `month` o `year`.
- `intervalCount`: normalmente `1`.
- `validityMode`: `rolling` o `calendar_period`.
- `collectionMode`: `one_time` o `recurring`.
- `price`, `currency`, `validFrom`, `validUntil`.
- `graceDays` y offsets de recordatorio.
- `providerPlanId` solo en la version de precio que se sincroniza con MP.

Campos minimos de suscripcion:

- `personId`, `membershipId`, `planVersionId`.
- `provider`, `providerSubscriptionId`, `providerPlanId`.
- `status`: `pending`, `authorized`, `paused`, `past_due`, `cancelled`, `ended`.
- `currentPeriodStart`, `currentPeriodEnd`, `nextBillingAt`.
- `cancelAtPeriodEnd`, `cancelledAt`, `rawStatus`.

### Ledger de pagos

Mantener el modelo ya presente:

```
PaymentOrder
  -> PaymentOrderItem[]
  -> Payment[]
  -> PaymentAllocation[]
       -> MembershipCycle | EventRegistration | TicketOrder
```

Invariantes:

1. El cliente envia `planVersionId`, `eventId` o `ticketTypeId`; nunca envia el
   precio autoritativo.
2. El backend calcula items, descuentos, moneda y total usando catalogo vigente.
3. Cada intento de compra tiene una `PaymentOrder` estable. Reintentar checkout
   no crea otra afiliacion ni duplica la asignacion.
4. Cada transaccion externa se identifica por
   `@@unique([provider, externalPaymentId])`.
5. La suma de `PaymentAllocation.amount` no supera el pago aprobado ni la orden.
6. Una membresia/inscripcion solo se activa por una asignacion aprobada.
7. Reembolso o contracargo genera una transicion compensatoria y auditoria; no
   se borra historial.

### Eventos de integracion

Separar:

- `providerNotificationId`: id del webhook, usado para deduplicar la entrega.
- `providerResourceId`: payment/preapproval/authorized_payment consultado.
- `type` y `action`: clase de evento y transicion notificada.
- `requestId`, firma validada, payload, resultado y numero de intentos.

La unicidad debe deduplicar la notificacion, no impedir actualizaciones futuras
del mismo recurso. Tras validar la firma, el worker consulta la API de Mercado
Pago y procesa el estado canonico actual; no confia en el `status` del body.

---

## 3. Flujos end-to-end

### A. Cobro unico y renovacion explicita

1. El usuario elige un plan o una inscripcion.
2. `POST /api/billing/orders` recibe ids de catalogo y una clave idempotente.
3. El backend resuelve usuario/persona, calcula el precio y crea en una
   transaccion la orden, items, destino pendiente, auditoria y outbox.
4. El backend crea una preferencia para los medios que la requieren y entrega
   su id al Payment Brick embebido.
5. El Brick tokeniza y el backend procesa el pago usando la orden como fuente
   del monto, moneda y referencia.
6. Mercado Pago envia el webhook; la API valida firma y persiste la entrega.
7. Un worker consulta `/v1/payments/{id}` y, si corresponde, hace una sola
   transaccion para actualizar pago/orden, asignar el monto, activar el ciclo y
   emitir eventos de email/auditoria.

### B. Suscripcion recurrente mensual o anual

1. El usuario elige una version con `collectionMode=recurring`.
2. El backend crea/reutiliza el plan `preapproval_plan` de esa version.
3. Se crea `BillingSubscription` en `pending` y la suscripcion MP con
   `external_reference` interno.
4. El webhook `subscription_preapproval` actualiza la autorizacion.
5. Cada `subscription_authorized_payment` crea/actualiza un `Payment` y, cuando
   queda aprobado, genera el siguiente `MembershipCycle`.
6. Rechazos dejan la suscripcion `past_due`; no extienden vigencia sin pago.
7. Pausa/cancelacion detiene futuros cobros, pero conserva el ciclo ya pagado
   hasta su fecha de fin, salvo reembolso/contracargo.

### C. Renovacion y vencimiento

Reglas recomendadas:

- Si se paga antes de vencer, el nuevo ciclo comienza al finalizar el actual;
  el socio no pierde dias ya abonados.
- Si ya vencio, el ciclo rolling comienza al aprobarse el nuevo pago.
- En planes por temporada/calendario, las fechas salen del periodo comercial y
  no de la fecha de pago.
- La autorizacion de acceso se calcula siempre con fechas (`startsAt <= now <
  endsAt`); un job que marca `vencida` mejora consultas, pero no es la unica
  defensa.
- Recordatorios sugeridos: 30, 15, 7 y 1 dia antes; el dia del vencimiento; 3 y
  7 dias despues. Cada envio usa una clave unica por ciclo/canal/offset.
- Al vencer sin pago: ciclo `expired`, afiliacion `vencida`, credencial sin
  acceso y CTA "Renovar afiliacion". Nunca se cobra sin una autorizacion
  recurrente vigente.

---

## 4. Limites de seguridad y confiabilidad

- `MERCADO_PAGO_ACCESS_TOKEN` y el secreto de webhook viven solo en el servidor.
- Validar `x-signature`, `x-request-id` y `data.id` antes de aceptar el evento.
- Responder `2xx` rapido despues de persistir; procesar efectos con worker/outbox.
- Usar una clave de idempotencia distinta por operacion de proveedor.
- Aplicar RBAC a pagos manuales, devoluciones, cambios de precio y cancelaciones.
- Guardar montos en unidades enteras de ARS y snapshots de concepto/precio en la
  orden; un cambio de catalogo no altera deuda historica.
- No registrar tokens, datos completos de tarjeta ni secretos en logs/payloads.
- Rate limit en alta publica, creacion de orden y consulta de estado.
- Auditoria para `order.created`, `payment.approved`, `membership.activated`,
  `membership.expired`, `subscription.cancelled`, `refund.applied` y aprobacion
  manual.
- Job de reconciliacion para ordenes pendientes, webhooks fallidos y estados
  externos que no llegaron. El webhook sigue siendo el camino principal.

---

## 5. Plan de implementacion por fases

### Fase 0 - Congelar el contrato

- [ ] Definir afiliacion anual PLU como calendario o rolling. Recomendado para
      PLU: periodo de temporada explicito; para abonos de club: rolling.
- [ ] Definir si el codigo de socio es permanente. Recomendado: permanente; los
      ciclos guardan el historial anual/mensual.
- [ ] Definir que planes usan renovacion manual y cuales debito automatico.
- [ ] Alinear las migraciones Supabase en curso con Prisma v3 antes de aplicarlas.
- [ ] Eliminar la aprobacion publica de pagos fuera de demo/test.

### Fase 1 - Schema y repositorios

**Archivos principales:**

- Modify: `prisma/schema.prisma`
- Modify: `tests/prismaSchema.test.js`
- Create: `supabase/migrations/<timestamp>_billing_memberships_v3.sql`
- Create: `server/modules/billing/billingRepository.js`
- Create: `server/modules/billing/billingSchemas.js`

- [ ] Relacionar `User` con `Person`.
- [ ] Agregar version de plan, ciclo de membresia y suscripcion recurrente.
- [ ] Separar notification id de resource id en `IntegrationEvent`.
- [ ] Agregar estados necesarios para proceso, mora, reembolso y contracargo.
- [ ] Migrar datos actuales sin perder memberships ni ordenes.
- [ ] Aplicar RLS y revocar RPCs publicas de aprobacion/modificacion sensible.

### Fase 2 - Orden autoritativa y adaptadores

**Archivos principales:**

- Create: `server/modules/billing/orderWorkflow.js`
- Create: `server/modules/payments/mercadoPagoAdapter.js`
- Create: `server/modules/subscriptions/mercadoPagoSubscriptionsAdapter.js`
- Modify: `server/routes/payments.js`
- Modify: `server/app.js`

- [ ] Crear orden por ids de catalogo, no por monto del cliente.
- [ ] Persistir orden/items/destinos pendientes antes de llamar al proveedor.
- [ ] Crear preferencia para Payment Brick con referencia interna.
- [ ] Crear plan/suscripcion recurrente con referencia interna.
- [ ] Guardar ids y URLs de proveedor sin convertirlos en fuente de verdad.

### Fase 3 - Webhook y activacion atomica

**Archivos principales:**

- Create: `server/modules/integrations/webhookVerifier.js`
- Create: `server/modules/integrations/prismaIntegrationEventStore.js`
- Rewrite: `server/modules/payments/paymentWorkflow.js`
- Create: `server/modules/subscriptions/subscriptionWorkflow.js`
- Create: `server/modules/billing/allocationWorkflow.js`

- [ ] Validar firma sobre los valores exactos recibidos.
- [ ] Persistir cada notificacion idempotentemente y responder rapido.
- [ ] Consultar el payment/preapproval autorizado en Mercado Pago.
- [ ] En una transaccion: pago, orden, allocation, ciclo, estado deportivo,
      auditoria y outbox.
- [ ] Soportar eventos repetidos, desordenados, reembolsos y contracargos.

### Fase 4 - Renovaciones y comunicaciones

**Archivos principales:**

- Create: `server/modules/memberships/renewalWorkflow.js`
- Create: `server/jobs/membershipRenewalJob.js`
- Reuse: `server/modules/notifications/notificationWorkflow.js`

- [ ] Generar recordatorios idempotentes segun politica del plan.
- [ ] Marcar ciclos vencidos y proyectar el estado del atleta.
- [ ] Exponer CTA de renovacion con orden nueva/reutilizable.
- [ ] Notificar pago aprobado, rechazado, proximo vencimiento y vencimiento.
- [ ] Reconciliar suscripciones `past_due`, pausadas y canceladas.

### Fase 5 - Frontend, admin y salida productiva

**Archivos principales:**

- Modify: `src/services/paymentService.js`
- Modify: `src/services/athleteApi.js`
- Modify: `src/pages/RegisterPage.jsx`
- Modify: `src/pages/profile/MembershipPurchaseSection.jsx`
- Modify: panel admin de pagos/afiliaciones

- [ ] Quitar simulacion de aprobacion y fallback productivo.
- [ ] Mostrar `pendiente`, `en proceso`, `aprobado`, `rechazado` y `vencido`
      desde la API.
- [ ] Agregar eleccion mensual/anual y manual/recurrente segun catalogo.
- [ ] Agregar cancelar/pausar renovacion con confirmacion clara.
- [ ] Panel de conciliacion: orden, pago MP, allocation y entidad activada.
- [ ] Probar credenciales y usuarios de prueba, webhooks de test y produccion.
- [ ] Activar por feature flag y monitorear diferencias de conciliacion.

---

## 6. Criterios de aceptacion

- [ ] Ningun monto o estado aprobado depende del frontend.
- [ ] Todo pago se asocia a una `Person` y a una orden interna antes del checkout.
- [ ] Repetir request o webhook no duplica orden, pago, ciclo ni email.
- [ ] Un webhook aprobado activa exactamente los items asignados.
- [ ] Renovar temprano conserva los dias ya pagados.
- [ ] Vencido sin pago pierde acceso aunque el job nocturno no haya corrido.
- [ ] Reembolso/contracargo deja historial y aplica el efecto compensatorio.
- [ ] La aprobacion manual exige sesion, permiso, evidencia y auditoria.
- [ ] Se puede conciliar cada `externalPaymentId` contra orden, persona y entidad.
- [ ] Secretos y llamadas privilegiadas no aparecen en el bundle React.
- [ ] Supabase y Prisma describen las mismas tablas, constraints y estados.

## 7. Documentacion oficial de referencia

- Mercado Pago - Suscripciones:
  https://www.mercadopago.com.ar/developers/es/docs/subscriptions/overview
- Suscripciones con plan asociado:
  https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-configuration/subscription-associated-plan
- Gestion de suscripciones:
  https://www.mercadopago.com.ar/developers/es/docs/subscriptions/subscription-management
- Webhooks de suscripciones:
  https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- Notificaciones de pagos Checkout Bricks:
  https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/payment-notifications
