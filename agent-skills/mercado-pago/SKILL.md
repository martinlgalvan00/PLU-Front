# Mercado Pago — Checkout Bricks embebido

## Objetivo

Integrar Mercado Pago dentro del sitio con `Payment Brick` para cobros únicos y
`Card Payment Brick` para suscripciones mensuales o anuales. La UI tokeniza; el
backend define el monto, crea el pago o suscripción y aplica el resultado. El
webhook firmado es la confirmación canónica y el mecanismo de recuperación.

## Cuándo usarla

- Modificar pagos de afiliaciones, inscripciones o entradas.
- Crear o renovar planes recurrentes.
- Cambiar `paymentService.js`, `server/routes/payments.js` o sus workflows.
- Depurar pagos duplicados, pendientes o webhooks desincronizados.

## Configuración requerida

| Variable | Alcance |
|----------|---------|
| `PAYMENTS_MOCK` | Backend+frontend; `true` = mock local; `false` = Mercado Pago real |
| `PAYMENTS_PROVIDER` | Alias legacy de `PAYMENTS_MOCK` (`mock` / `mercado_pago`) |
| `VITE_MERCADO_PAGO_PUBLIC_KEY` | Frontend; inicializa MercadoPago.js (no hace falta en mock) |
| `MERCADO_PAGO_ACCESS_TOKEN` | Sólo backend (no hace falta en mock) |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Sólo backend; valida `x-signature` (en mock usá `/api/payments/mock/notify`) |
| `MERCADO_PAGO_ENV` | `sandbox` o `production` |
| `APP_URL`, `API_URL` | Retornos y `notification_url` HTTPS |

### URLs de webhook (Vercel)

| Entorno | Webhook |
|---------|---------|
| DEV | `https://plu-git-dev-martinlgalvan00s-projects.vercel.app/api/payments/webhook/mercadopago` |
| PROD | `https://www.powerliftingunited.ar/api/payments/webhook/mercadopago` |

Detalle de variables y `back_urls`: `docs/PAYMENTS_OPERATIONS.md`.

## Modo mock local

```text
PAYMENTS_MOCK=true
```

- Solo permitido fuera de production / Vercel preview-prod.
- El Brick se reemplaza por botones de outcome; el workflow (`processEmbeddedPayment` → `applyCanonicalPayment`) es el mismo.
- Outcomes: `mock_approved`, `mock_rejected`, `mock_pending`, `mock_error`.
- `MOCK_PAYMENT_DELAY_MS` agrega latencia artificial (máx 10s).
- `POST /api/payments/mock/notify` fuerza acreditación sin firma MP.

## Reglas no negociables

```text
❌ Confiar en monto, moneda, plan, estado o referencia enviados por el browser
❌ Guardar token efímero o datos de tarjeta
❌ Marcar aprobado desde React
❌ Procesar webhooks sin validar x-signature y consultar el recurso en MP
✅ Crear primero una orden server-side
✅ Usar idempotency key persistente por intento
✅ Aplicar pago, afiliación, inscripción o ticket en una transacción/RPC
✅ Mantener el webhook como respaldo aunque exista respuesta inmediata
```

## Flujo de cobro único

```text
UI crea orden pendiente
  → backend crea preferencia (sólo para medios que la requieren)
  → Payment Brick tokeniza/selecciona el medio dentro del sitio
  → POST /api/payments/embedded/process { paymentOrderId, formData }
  → backend descarta transaction_amount del browser y relee la orden
  → claim_embedded_payment_attempt bloquea duplicados
  → Payment.create con X-Idempotency-Key
  → apply_mercado_pago_payment / apply_ticket_mercado_pago_payment
  → webhook firmado vuelve a consultar GET /v1/payments/{id}
  → recovery job reconcilia si el webhook o la instancia fallan
```

## Flujo recurrente

```text
UI crea orden ligada al plan recurrente
  → Card Payment Brick genera card token efímero
  → POST /api/payments/subscriptions/process
  → backend valida que orden, afiliación, plan, monto y moneda coincidan
  → crea/reutiliza preapproval plan
  → crea preapproval con card_token_id y status authorized
  → webhook subscription_preapproval sincroniza estado
  → webhook subscription_authorized_payment acredita cada ciclo
```

## Mapeo de estados

| Mercado Pago | Dominio |
|--------------|---------|
| `pending`, `in_process` | `pendiente` |
| `approved` | `aprobado` |
| `rejected` | `rechazado` |
| `cancelled` | `cancelado` |
| `refunded`, `charged_back` | `reembolsado` |

## Checklist

- [ ] Public key solamente en frontend; access token solamente en backend.
- [ ] Monto, moneda, referencia y plan salen de la orden persistida.
- [ ] Token de tarjeta no aparece en DB, logs ni respuestas propias.
- [ ] `X-Idempotency-Key` y constraint de intento único activos.
- [ ] Webhook valida firma, timestamp y `data.id`.
- [ ] Backend consulta el recurso a Mercado Pago antes de acreditar.
- [ ] RPC aplica side effects en forma atómica e idempotente.
- [ ] Pruebas con usuarios y tarjetas sandbox antes de producción.
- [ ] HTTPS y webhook público configurados en producción.
- [ ] `PAYMENT_RECOVERY_JOB_ENABLED=true` en una instancia de worker.
- [ ] Panel Finanzas sin eventos agotados ni conciliaciones estancadas.
- [ ] `get_payment_system_health()` sin drift ni locks vencidos.
- [ ] `npm run db:verify:payments` aprobado contra la base migrada.

## Referencias oficiales

- [Checkout Bricks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/overview)
- [Payment Brick](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/payment-brick/introduction)
- [Card Payment Brick](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/card-payment-brick/introduction)
- [Crear suscripción asociada a un plan](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-configuration/subscription-associated-plan)
- [Webhooks](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks)

## Archivos relacionados

| Archivo | Rol |
|---------|-----|
| `src/components/ui/MercadoPagoEmbeddedCheckout.jsx` | Renderiza los Bricks o el panel mock |
| `src/services/paymentService.js` | Cliente de la API propia |
| `server/routes/payments.js` | Endpoints y validación Zod |
| `server/modules/payments/createPaymentProviderAdapter.js` | Factory mock / mercado_pago |
| `server/modules/payments/mockMercadoPagoAdapter.js` | Provider in-memory local |
| `server/modules/payments/embeddedPaymentWorkflow.js` | Cobro único seguro |
| `server/modules/subscriptions/subscriptionWorkflow.js` | Suscripciones |
| `server/modules/payments/mercadoPagoAdapter.js` | SDK oficial server-side |
| `supabase/migrations/20260715000400_phase5_embedded_checkout.sql` | Intentos idempotentes |
| `server/modules/payments/paymentRecoveryWorkflow.js` | Reintentos y conciliación |
| `server/jobs/paymentRecoveryJob.js` | Worker periódico |
| `supabase/migrations/20260715000500_phase6_payment_recovery_operations.sql` | Locks, backoff y métricas |
