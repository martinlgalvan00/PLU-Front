# Auditoría y hardening completo de Mercado Pago

Quiero que realices una auditoría profunda de toda la integración actual de Mercado Pago de este proyecto y luego implementes una solución robusta, simple de mantener y segura.

No quiero un refactor teórico ni una reescritura masiva.

Primero inspeccioná cómo funciona realmente el proyecto actual, identificá el problema y recién después modificá el código.

## Contexto del problema

Actualmente estamos teniendo inconsistencias graves entre el estado real de los pagos en Mercado Pago y el estado mostrado/persistido en nuestra aplicación.

Casos reales que estamos viendo:

- Pagos que siguen figurando como `Esperando pago` aunque el usuario ya pagó.
- Pagos que aparentemente fueron aprobados pero nunca actualizaron correctamente nuestra base de datos.
- Pagos que figuran como `Cancelado` aunque Mercado Pago realmente recibió el dinero.
- Una inscripción puede haber sido dada de alta manualmente pero conservar un estado viejo de pago.
- Puede existir un intento rechazado o cancelado y después un segundo intento aprobado, pero nuestro sistema puede seguir mostrando el primer resultado.
- No tenemos suficiente resiliencia ante webhooks perdidos, timeouts, errores temporales o respuestas demoradas.
- Necesitamos permitir que un usuario cuyo pago fue rechazado pueda presionar `Reintentar pago` sin riesgo de duplicar cobros.
- Necesitamos tener una forma automática y manual de reconciliar el estado con Mercado Pago.

El objetivo fundamental es:

> Si la aplicación muestra `Aprobado`, debe existir evidencia real del pago en Mercado Pago.
>
> Si muestra `Cancelado`, debe ser porque el pago efectivamente está cancelado, vencido o nunca fue acreditado.
>
> Si Mercado Pago recibió el dinero, nuestra aplicación eventualmente debe corregirse sola aunque haya fallado un webhook.

---

# FASE 1: AUDITORÍA

Antes de modificar código, inspeccioná todo el repositorio.

Buscá específicamente:

1. Qué producto/integración de Mercado Pago estamos utilizando:
   - Checkout Pro
   - Checkout Bricks
   - Checkout API
   - Orders API
   - otra

2. Dónde se crean:
   - preferences
   - orders
   - payments
   - payment tokens
   - external references

3. Dónde se procesan:
   - Webhooks
   - IPN si todavía existe
   - success URLs
   - failure URLs
   - pending URLs

4. Qué tablas y columnas guardan actualmente:
   - estado del pago
   - Mercado Pago payment ID
   - order ID
   - preference ID
   - external_reference
   - inscripción
   - atleta
   - evento
   - monto
   - timestamps

5. Qué acciones administrativas pueden modificar:
   - inscripción
   - pago
   - confirmación
   - cancelación

6. Dónde se renderiza en frontend el badge:
   - Aprobado
   - Esperando pago
   - Rechazado
   - Cancelado
   - cualquier otro estado

7. Verificá especialmente si actualmente:
   - se confía en el redirect del navegador para confirmar pagos
   - el frontend modifica el estado financiero
   - un webhook escribe directamente un estado sin consultar Mercado Pago
   - se sobrescriben pagos anteriores
   - solamente se guarda un payment por inscripción
   - una inscripción puede tener varios intentos pero el modelo actual no los contempla
   - webhooks viejos pueden sobrescribir información más nueva
   - un `rejected` anterior puede sobrescribir un pago posterior `approved`
   - existe alguna race condition
   - existen updates parciales sin transacción
   - se está usando `external_reference` correctamente
   - existe `X-Idempotency-Key`

Antes de implementar nada, entregame un diagnóstico corto con:

### Arquitectura actual

### Flujo actual del pago

### Problemas encontrados

### Causa probable de las inconsistencias

### Archivos involucrados

### Modelo de datos involucrado

Luego continuá con la implementación.

---

# FASE 2: PRINCIPIO DE DISEÑO

Separar completamente:

## Estado de inscripción

de

## Estado financiero del pago

Nunca utilizar el mismo campo para ambos conceptos.

Una inscripción puede estar:

```text
pending
confirmed
cancelled
```

Pero el pago puede estar:

```text
pending
in_process
approved
rejected
cancelled
expired
refunded
partially_refunded
charged_back
unknown
```

Adaptá estos nombres al modelo existente y al producto específico de Mercado Pago que realmente utilice este repositorio.

No inventes estados si Mercado Pago utiliza otros para nuestra integración.

---

# FASE 3: MERCADO PAGO COMO FUENTE DE VERDAD

El frontend NO puede decidir que un pago está aprobado.

Un redirect a:

```text
/success
```

tampoco debe considerarse prueba suficiente del pago.

Los parámetros enviados desde el navegador tampoco deben considerarse fuente confiable.

El estado definitivo debe obtenerse server-side desde Mercado Pago.

Crear una función central equivalente a:

```text
syncPayment(...)
```

o

```text
reconcilePayment(...)
```

que sea el ÚNICO lugar responsable de consultar Mercado Pago, interpretar el estado y persistirlo.

Conceptualmente:

```text
Mercado Pago
      |
      v
syncPayment()
      |
      v
payment_attempt
      |
      v
recomputePaymentState()
      |
      +--> payment status
      |
      +--> registration business rules
```

Evitar tener lógica de mapeo de estados distribuida por diferentes endpoints.

---

# FASE 4: PAYMENT ATTEMPTS

Una inscripción debe poder tener múltiples intentos de pago.

Ejemplo:

```text
Registration #123

Attempt 1
MP payment: AAA
status: rejected

Attempt 2
MP payment: BBB
status: approved
```

El resultado de la inscripción NO puede continuar diciendo `Rechazado` simplemente porque el primer intento falló.

Si el modelo actual no soporta esto, crear una estructura equivalente a:

```text
payment_attempts
```

Como mínimo debería poder almacenar:

```text
id
registration_id

mercadopago_payment_id
mercadopago_order_id
mercadopago_preference_id

external_reference

status
status_detail

amount
currency

attempt_number

created_at
updated_at
approved_at

last_synced_at
sync_source
```

No agregues columnas innecesarias.

Adaptalo al esquema y convenciones actuales.

Crear constraints e índices razonables, especialmente para IDs de Mercado Pago que deban ser únicos.

---

# FASE 5: EXTERNAL REFERENCE

Revisá que podamos relacionar inequívocamente cada pago con nuestra inscripción.

Utilizar una referencia estable que permita recuperar la relación aun si algún webhook se pierde.

Por ejemplo, conceptualmente:

```text
registration:<registration_id>
```

o el mecanismo equivalente más compatible con nuestra integración actual.

Si ya existe una estrategia correcta, conservarla.

Agregar metadata únicamente cuando aporte valor real.

No guardar información sensible innecesaria.

---

# FASE 6: WEBHOOK ROBUSTO

Auditar y corregir completamente el webhook.

El webhook debe:

1. Validar que realmente provenga de Mercado Pago.
2. Validar `x-signature` usando el mecanismo oficial correspondiente.
3. No confiar ciegamente en el payload para determinar el estado final.
4. Obtener el ID del recurso notificado.
5. Consultar Mercado Pago server-side.
6. Ejecutar `syncPayment`.
7. Ser idempotente.
8. Tolerar notificaciones duplicadas.
9. Tolerar notificaciones fuera de orden.
10. Evitar que una notificación vieja destruya información correcta más nueva.

Si el procesamiento actual es pesado, implementar el patrón más sencillo compatible con nuestra infraestructura:

```text
Webhook
   |
   +--> validar
   |
   +--> registrar evento
   |
   +--> responder correctamente
   |
   +--> procesar/sincronizar
```

No agregues Redis, Kafka, RabbitMQ ni infraestructura nueva salvo que el proyecto ya la utilice.

Busco robustez con la menor complejidad posible.

---

# FASE 7: IDEMPOTENCIA

Todas las operaciones de creación de pagos que lo requieran deben utilizar:

```text
X-Idempotency-Key
```

La clave debe representar UNA operación lógica.

Si ocurre:

```text
POST Mercado Pago
        |
        +--> timeout
```

no debemos crear inmediatamente un nuevo pago sin saber qué ocurrió.

Debemos poder repetir la misma operación con la misma idempotency key cuando corresponda y evitar pagos duplicados.

IMPORTANTE:

Diferenciar dos conceptos.

## Retry técnico

Ejemplo:

```text
timeout
network error
HTTP 5xx
429
resource temporarily unavailable
```

Puede reintentarse de manera controlada.

## Retry comercial

Ejemplo:

```text
payment rejected
insufficient funds
card rejected
fraud rejection
```

NO se debe reintentar automáticamente cobrando nuevamente.

En estos casos debe permitirse que el usuario explícitamente seleccione:

```text
Reintentar pago
```

Ese botón debe iniciar un NUEVO payment attempt.

---

# FASE 8: ESTRATEGIA SIMPLE DE RETRIES

Implementar retry solamente para errores transitorios.

No quiero una librería compleja si no es necesaria.

Utilizar algo equivalente a:

```text
Attempt 1: inmediato
Attempt 2: ~500 ms
Attempt 3: ~1500 ms
Attempt 4: ~3500 ms
```

con exponential backoff y pequeño jitter.

No reintentar indiscriminadamente errores 4xx.

Para `429`, respetar `Retry-After` si Mercado Pago lo devuelve.

Para un timeout ocurrido después de crear un pago:

NO asumir que Mercado Pago no lo creó.

Primero intentar determinar el resultado utilizando:

- idempotency key
- payment ID si existe
- order ID si existe
- external_reference
- API de consulta correspondiente

antes de crear una nueva operación lógica.

---

# FASE 9: REINTENTAR PAGO DESDE UI

Cuando un pago termine realmente rechazado, mostrar:

```text
Pago rechazado
```

y una acción:

```text
Reintentar pago
```

El usuario no debe tener que volver a crear toda la inscripción.

La inscripción existente debe conservarse.

El nuevo checkout crea solamente:

```text
payment attempt #N+1
```

Nunca sobrescribir el intento anterior.

Ejemplo:

```text
Intento 1: rechazado
Intento 2: rechazado
Intento 3: aprobado
```

Resultado final:

```text
Pago: Aprobado
Inscripción: Confirmada
```

manteniendo los intentos anteriores para auditoría.

---

# FASE 10: RECONCILIACIÓN AUTOMÁTICA

No depender exclusivamente de los Webhooks.

Crear un mecanismo sencillo de reconciliación para pagos que hayan quedado en estados no finales.

Por ejemplo:

```text
pending
in_process
unknown
```

El mecanismo debe buscar pagos locales pendientes y consultar Mercado Pago nuevamente.

Preferir infraestructura que ya exista en el proyecto.

Si utilizamos Supabase y ya tenemos Edge Functions/Cron, evaluar esa alternativa.

No incorporar infraestructura externa innecesaria.

Una estrategia razonable sería:

```text
Pago creado
    |
    +--> webhook normal
    |
    +--> reconciliación periódica si sigue pending
```

Luego de cierto tiempo se pueden espaciar las verificaciones.

No hacer polling agresivo.

---

# FASE 11: RECONCILIACIÓN MANUAL

En administración agregar una acción segura equivalente a:

```text
Sincronizar pago
```

Esta acción:

1. NO modifica manualmente el estado.
2. Consulta Mercado Pago.
3. Ejecuta `syncPayment`.
4. Actualiza la UI.
5. Informa el resultado.

Ejemplo:

```text
Estado anterior:
Cancelado

Mercado Pago:
approved / accredited

Resultado:
Aprobado
```

Esto nos permitirá reparar casos históricos.

Agregar también:

```text
Última sincronización
```

en el detalle del pago si no genera ruido visual.

---

# FASE 12: CÁLCULO DEL ESTADO GLOBAL

Definir una función única para calcular el estado financiero visible de una inscripción basándose en sus payment attempts.

Conceptualmente:

```text
si existe un payment attempt válido aprobado:
    APPROVED

si existe refunded:
    REFUNDED

si existe charged_back:
    CHARGED_BACK

si el último intento está pending/in_process:
    PENDING

si el último intento está rejected:
    REJECTED

si el último intento está cancelled/expired:
    CANCELLED

si no podemos verificar:
    UNKNOWN
```

Pero revisá cuidadosamente precedencias y estados reales antes de implementar.

Un intento rechazado antiguo nunca puede hacer que una inscripción con un pago posterior aprobado figure como rechazada.

---

# FASE 13: CANCELACIÓN

No utilizar la palabra `Cancelado` para cualquier error.

Diferenciar:

```text
Rechazado
Cancelado
Vencido
Pendiente
En proceso
Aprobado
Reembolsado
Contracargo
Requiere revisión
```

Si Mercado Pago devuelve un `status_detail`, persistirlo.

Puede usarse para mostrar información contextual al usuario o al administrador sin exponer mensajes internos innecesarios.

---

# FASE 14: INSCRIPCIÓN CANCELADA CON PAGO APROBADO

No mezclar ambos estados.

Puede existir:

```text
Inscripción: Cancelada
Pago: Aprobado
```

Esto debe interpretarse como un caso de negocio que posiblemente necesite devolución.

NO cambiar artificialmente:

```text
Pago aprobado
```

a

```text
Pago cancelado
```

solo porque la inscripción fue cancelada.

Si existe lógica de refund, tratarla como operación financiera independiente.

---

# FASE 15: ALTA MANUAL

Revisar qué significa actualmente `dar de alta` desde administración.

Si `dar de alta` solamente confirma una inscripción, NO debe modificar el estado del pago.

Si realmente existe un pago manual/offline, modelarlo explícitamente como algo equivalente a:

```text
payment_source = manual
```

o según las convenciones actuales.

Nunca fabricar:

```text
mercadopago status = approved
```

para un pago que Mercado Pago nunca aprobó.

Toda modificación administrativa relacionada con dinero debe quedar auditada.

---

# FASE 16: SEGURIDAD

Verificar:

- Access Token únicamente en backend.
- Ningún secreto de Mercado Pago expuesto al frontend.
- Validación del webhook.
- El cliente no puede establecer `payment_status = approved`.
- Validar amount.
- Validar currency.
- Validar relación entre payment y registration.
- Validar external_reference.
- Evitar confiar en parámetros provenientes del redirect.
- No almacenar información completa de tarjetas.
- No loggear secrets.
- No loggear información sensible innecesaria.

---

# FASE 17: AUDITORÍA

Necesito poder entender posteriormente:

```text
qué pasó
cuándo pasó
qué informó Mercado Pago
qué cambió nuestro sistema
por qué se cambió
```

Implementar un mecanismo liviano utilizando las tablas/logs existentes o una tabla específica si realmente es necesaria.

Registrar al menos:

```text
payment_attempt_id
mercadopago_payment_id
previous_status
new_status
status_detail
source
timestamp
```

Sources posibles:

```text
webhook
checkout
reconciliation
manual_sync
admin
```

No guardar payloads completos si contienen datos innecesarios o sensibles.

---

# FASE 18: FRONTEND

Actualizar los badges para representar correctamente el estado.

Estados deseados conceptualmente:

```text
Aprobado
Pendiente
En proceso
Rechazado
Cancelado
Vencido
Reembolsado
Contracargo
Requiere revisión
```

Mantener el lenguaje visual actual de PLU.

No rediseñar innecesariamente la tabla.

La prioridad es que la información sea correcta.

Cuando sea útil, mostrar:

```text
Rechazado
No pudimos procesar el pago.

[Reintentar pago]
```

Para administración:

```text
Pago: Aprobado
MP #123456789
Última sincronización: ...
```

No mostrar IDs técnicos a usuarios comunes salvo que sea útil para soporte.

---

# FASE 19: CASOS QUE DEBEN FUNCIONAR

Crear tests automatizados para estos escenarios.

## Caso 1

```text
payment created
webhook approved
```

Resultado:

```text
payment = approved
registration = confirmed
```

## Caso 2

Webhook duplicado 3 veces.

Resultado:

```text
una única actualización lógica
sin duplicación
sin errores
```

## Caso 3

Webhook nunca llega.

La reconciliación consulta Mercado Pago.

Resultado:

```text
approved
```

## Caso 4

La aplicación recibe timeout al crear el pago pero Mercado Pago sí lo creó.

Resultado:

```text
no crear un segundo cobro
```

## Caso 5

Primer intento:

```text
rejected
```

Usuario presiona:

```text
Reintentar pago
```

Segundo intento:

```text
approved
```

Resultado:

```text
payment = approved
registration = confirmed
```

## Caso 6

Webhook viejo:

```text
attempt 1 = rejected
```

llega después de:

```text
attempt 2 = approved
```

Resultado final debe continuar:

```text
approved
```

## Caso 7

Pago local:

```text
cancelled
```

Mercado Pago:

```text
approved
```

Se ejecuta reconciliación.

Resultado:

```text
approved
```

## Caso 8

Pago aprobado y luego refund.

Resultado:

```text
refunded
```

## Caso 9

Inscripción cancelada pero pago aprobado.

Resultado:

```text
registration = cancelled
payment = approved
```

y marcar el caso correctamente para devolución o revisión según la lógica existente.

## Caso 10

Error transitorio Mercado Pago:

```text
500
```

Resultado:

```text
retry controlado
```

## Caso 11

Rate limit:

```text
429
Retry-After
```

Resultado:

```text
esperar el intervalo correcto
reintentar
```

## Caso 12

Webhook con firma inválida.

Resultado:

```text
rechazado
ninguna modificación financiera
```

---

# FASE 20: CASOS HISTÓRICOS

Necesito poder reparar datos ya existentes.

Crear una herramienta/script/admin action segura para reconciliar pagos históricos.

Por ejemplo:

```text
reconcile payments
where local status != authoritative Mercado Pago status
```

No ejecutar modificaciones masivas a ciegas.

Primero generar un dry-run:

```text
registration
local_status
mp_status
payment_id
proposed_change
```

Luego permitir ejecutar la reparación.

Si no existe suficiente información para identificar un pago histórico:

```text
requires_manual_review
```

No adivinar.

---

# FASE 21: OBSERVABILIDAD

Agregar logging útil para errores.

Necesito poder encontrar fácilmente:

```text
registration_id
payment_attempt_id
mercadopago_payment_id
external_reference
operation
status
status_detail
```

Nunca imprimir:

```text
access token
card token
secret
datos sensibles
```

Errores de sincronización no deben fallar silenciosamente.

---

# FASE 22: RESTRICCIONES

No quiero:

- Refactor masivo de todo el proyecto.
- Cambiar arquitectura que funciona sin motivo.
- Introducir microservicios.
- Redis nuevo.
- Kafka.
- RabbitMQ.
- Dependencias innecesarias.
- Romper rutas existentes.
- Cambiar diseño sin necesidad.
- Eliminar datos históricos.
- Sobrescribir intentos anteriores.
- Confirmar pagos desde frontend.
- Crear retries automáticos de pagos rechazados.
- Inventar estados.

Quiero la solución mínima que nos dé:

```text
consistencia
idempotencia
reconciliación
retry seguro
auditoría
trazabilidad
```

---

# FASE 23: IMPLEMENTACIÓN INCREMENTAL

Preferir este orden:

## P0

1. Encontrar bug actual.
2. Separar payment status de registration status.
3. Centralizar `syncPayment`.
4. Corregir webhook.
5. Consultar Mercado Pago como fuente de verdad.
6. Implementar idempotency key.
7. Soportar múltiples payment attempts.
8. Corregir cálculo del estado mostrado.

## P1

9. Botón `Reintentar pago`.
10. Botón admin `Sincronizar pago`.
11. Reconciliación automática.
12. Auditoría.

## P2

13. Reparación de casos históricos.
14. Métricas y observabilidad adicional.

Si para arreglar P0 no es necesario completar P2, no bloquees la solución inicial.

---

# FASE 24: ENTREGA

Al finalizar quiero un reporte con este formato:

## Diagnóstico

Qué estaba causando las inconsistencias.

## Arquitectura anterior

Flujo anterior completo.

## Arquitectura nueva

Flujo nuevo completo.

## Cambios implementados

Lista concreta.

## Base de datos

Migraciones y nuevas constraints.

## Mercado Pago

Endpoints, webhooks, idempotencia y reconciliación utilizados.

## Archivos modificados

Lista completa.

## Estados

Tabla:

| Mercado Pago | Estado interno | UI |
|---|---|---|

## Retries

Qué errores se reintentan y cuáles no.

## Seguridad

Qué controles se agregaron.

## Tests

Tests creados y resultado.

## Casos históricos

Cómo reconciliarlos.

## QA manual

Pasos exactos para verificar:

1. Pago aprobado.
2. Pago rechazado.
3. Retry de pago.
4. Webhook duplicado.
5. Webhook perdido.
6. Pago aprobado que localmente figuraba cancelado.
7. Cancelación de inscripción.
8. Refund.
9. Error de Mercado Pago.
10. Reconciliación manual.

## Build

Ejecutar los tests existentes y el build de producción.

No declares que algo funciona si no fue realmente probado.

---

# CRITERIO FINAL

La implementación estará terminada únicamente si podemos garantizar razonablemente que:

```text
Mercado Pago aprobado
        =
nuestra aplicación aprobado
```

y que ante una inconsistencia temporal:

```text
webhook perdido
timeout
problema de red
servidor caído
estado local desactualizado
```

el sistema eventualmente se reconcilia automáticamente con Mercado Pago.

Además:

```text
rejected != cancelled
cancelled != registration cancelled
retry técnico != nuevo intento de pago
payment attempt != registration
```

Estas diferencias deben quedar reflejadas claramente tanto en el código como en la base de datos y la interfaz.

Antes de implementar, inspeccioná el código real y adaptá este diseño a nuestra arquitectura existente. No implementes tablas, endpoints o abstracciones simplemente porque aparecen sugeridas en este prompt si el proyecto ya posee una alternativa equivalente y correcta.