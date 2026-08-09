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

- `MercadoPagoEmbeddedCheckout.jsx` — Payment Brick, Card Payment Brick y panel mock local
- `createPaymentProviderAdapter.js` — elige `mercado_pago` o `mock` según `PAYMENTS_PROVIDER`
- `mockMercadoPagoAdapter.js` — pagos/suscripciones in-memory para desarrollo
- `embeddedPaymentWorkflow.js` — monto server-side e intentos idempotentes
- `subscriptionWorkflow.js` — planes y abonos recurrentes
- Transferencia manual como canal separado con aprobación operativa

## Modo mock local (sin pagar)

Para recorrer el flujo completo en local sin llamar a Mercado Pago:

```text
PAYMENTS_PROVIDER=mock
VITE_PAYMENTS_PROVIDER=mock
```

Restricciones:

- Solo local/dev (`NODE_ENV !== production` y sin `VERCEL_ENV` production/preview).
- El checkout muestra botones: aprobado / rechazado / pendiente / error proveedor (y autorizar plan en suscripciones).
- Si quedó pendiente, `POST /api/payments/mock/notify` (o el botón “Forzar acreditación”) aplica el camino canónico sin firma de webhook.
- Delay opcional: `MOCK_PAYMENT_DELAY_MS` (máx 10000) para simular latencia.
- El store mock es in-memory: se pierde al reiniciar el server.
- Banner global “Ambiente de desarrollo” solo en Vite DEV + mock.

Para volver a sandbox real: `PAYMENTS_PROVIDER=mercado_pago` y `VITE_PAYMENTS_PROVIDER=mercado_pago` con public key + access token + webhook secret.

## Estados internos

`creado` → `pendiente` → `aprobado` | `rechazado` | `cancelado` | `reembolsado`

La orden representa el resultado agregado, no el último webhook recibido. Si
hay varios intentos, Supabase calcula `aprobado > pendiente > reembolsado >
rechazado > cancelado`. Por eso un rechazo tardío no puede degradar una orden
que tiene otro pago aprobado. Reembolso y contracargo se tratan igual y revocan
el derecho solamente cuando ya no queda otro pago aprobado para esa orden.

## Idempotencia

Cada creación o envío de pago usa una `X-Idempotency-Key` estable y acotada al
recurso. Los webhooks se deduplican por proveedor + notification ID, y cada
`external_payment_id` queda reservado globalmente a una sola orden.

## Tolerancia a fallos

- Inbox durable antes de aplicar efectos.
- Locks con vencimiento para recuperar procesos interrumpidos.
- Reintentos exponenciales con máximo configurable.
- Conciliación automática de intentos embebidos contra Mercado Pago.
- Worker seguro para despliegues con múltiples instancias.
- Panel de operación protegido para observar y reintentar.
- Polling corto desde el Brick para dar feedback sin reemplazar al webhook.

## Migraciones de operación

Las migraciones se aplican completas, en orden y mediante Supabase CLI; nunca se
pega solamente una función desde SQL Editor porque eso deja el historial y el
contrato de aplicación fuera de sincronía. La versión de integridad vigente es
`20260722130000_domain_integrity_payment_hardening.sql`: agrega aislamiento por
organización, registro global de IDs externos, asociación orden-plan, snapshot
económico de suscripciones y preparación/cobro recurrente atómicos.

Sobre esa base, `20260802120000_membership_audit_credential_hardening.sql` corrige
la aprobación manual —dejó de decidir permisos con `auth.uid()`, que con
`service_role` siempre daba falso y hacía imposible acreditar una
transferencia—, audita todo el ciclo de cobro en `domain_audit_logs`
(acreditación, activación, revocación, vencimiento, comprobante) y separa la
proyección de credencial en dos: la pública sin PII ni `qr_token` y una de staff
con documento.

Antes del despliegue se revisa el historial y se hace un dry run:

```bash
supabase migration list
supabase db push --dry-run
supabase db push
```

Luego se verifica:

```sql
select public.get_payment_system_health();
```

La respuesta de health debe quedar sin drift ni locks vencidos. Además,
`select public.get_payment_schema_version();` debe devolver `20260722150000`.
Después se define `SUPABASE_DATABASE_URL` con la conexión de esa base y se corre
el smoke transaccional, que hace rollback de todos sus fixtures:

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
- [Webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks)
