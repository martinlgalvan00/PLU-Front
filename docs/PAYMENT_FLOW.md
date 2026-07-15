# Flujo de pagos — Mercado Pago

## Principio

**Nunca confirmar pagos desde el frontend.** El frontend crea la orden y
MercadoPago.js tokeniza el medio de pago. La acreditación ocurre en backend con
la respuesta canónica del proveedor y queda respaldada por el webhook firmado.

## Flujo

```
1. Atleta completa formulario
2. Sistema crea PaymentOrder (estado: creado)
3. Backend crea una preferencia cuando el medio la requiere
4. Payment Brick o Card Payment Brick se renderiza dentro del sitio
5. Backend relee la orden y procesa el token con una idempotency key persistida
6. MP envía webhook POST /api/payments/webhook
7. Backend valida x-signature
8. Backend consulta el recurso canónico en Mercado Pago
9. Si aprobado → actualiza orden, afiliación/inscripción, audit log, email
10. Si una dependencia falla → evento durable + backoff + recuperación automática
```

## Implementación actual

- `MercadoPagoEmbeddedCheckout.jsx` — Payment Brick y Card Payment Brick
- `embeddedPaymentWorkflow.js` — monto server-side e intentos idempotentes
- `subscriptionWorkflow.js` — planes y abonos recurrentes
- Transferencia manual como canal separado con aprobación operativa

## Estados internos

`creado` → `pendiente` → `aprobado` | `rechazado` | `cancelado` | `reembolsado`

La orden representa el resultado agregado, no el último webhook recibido. Si
hay varios intentos, Supabase calcula `aprobado > pendiente > reembolsado >
rechazado > cancelado`. Por eso un rechazo tardío no puede degradar una orden
que tiene otro pago aprobado. Reembolso y contracargo se tratan igual y revocan
el derecho solamente cuando ya no queda otro pago aprobado para esa orden.

## Idempotencia

Cada webhook debe usar `idempotencyKey` para evitar doble procesamiento.

## Tolerancia a fallos

- Inbox durable antes de aplicar efectos.
- Locks con vencimiento para recuperar procesos interrumpidos.
- Reintentos exponenciales con máximo configurable.
- Conciliación automática de intentos embebidos contra Mercado Pago.
- Worker seguro para despliegues con múltiples instancias.
- Panel de operación protegido para observar y reintentar.
- Polling corto desde el Brick para dar feedback sin reemplazar al webhook.

## Migración única de operación

Para una base que ya tiene las fases 1 a 5, la única migración nueva a ejecutar
es `20260715000500_phase6_payment_recovery_operations.sql`. El archivo abre una
transacción, valida todas sus dependencias, instala locks, backoff, conciliación,
máquina de estados y health check, y hace `commit` sólo si la verificación
estructural termina correctamente.

No se debe pegar una parte del archivo ni aplicarla desde SQL Editor: eso evita
que Supabase registre correctamente su historial. Primero se comprueba que las
fases 1 a 5 figuren aplicadas y que `00500` sea la migración de pagos pendiente;
después se hace un dry run y un único push coordinado:

```bash
supabase migration list
supabase db push --dry-run
supabase db push
```

Luego se verifica:

```sql
select public.get_payment_system_health();
```

La respuesta debe informar `schemaVersion = 20260715000500`, sin drift ni locks
vencidos. Después se define `SUPABASE_DATABASE_URL` con la conexión de esa base
y se corre el smoke transaccional, que hace rollback de todos sus fixtures:

```bash
npm run db:verify:payments
```

## Matriz mínima de certificación

| Caso | Resultado esperado |
|------|--------------------|
| Aprobado inmediato | Orden y derecho aprobados una vez |
| Pendiente y webhook posterior | Conciliación termina en el estado canónico |
| Rechazado y nuevo intento aprobado | La orden termina aprobada |
| Rechazo tardío después de aprobar | No degrada la orden |
| Webhook duplicado | Un evento y un solo efecto de dominio |
| API/MP caído temporalmente | Evento `failed`, backoff y retry |
| Worker interrumpido | Lock vence y otro worker recupera |
| Monto, moneda o referencia incorrectos | Falla cerrada sin acreditar |
| Reembolso o contracargo | Ledger y derecho quedan revocados |
| Cobro recurrente rechazado | Suscripción `past_due`, sin extender ciclo |
| Retry del mismo cobro recurrente | No duplica orden, pago ni ciclo |
| Máximo de retries agotado | Visible en Finanzas para intervención manual |

## Referencias

- [Checkout Bricks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/overview)
- [Webhooks](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks)
