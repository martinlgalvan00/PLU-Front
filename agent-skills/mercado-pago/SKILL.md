# Mercado Pago — Checkout Pro

## Objetivo

Integrar **Mercado Pago Checkout Pro** para cobrar afiliaciones e inscripciones en ARS, con confirmación de pago **exclusivamente en backend** vía webhooks y validación de firma `x-signature`. El frontend solo inicia el checkout; nunca decide si un pago fue aprobado.

## Cuándo usarla

- Implementar creación de preferencias de pago.
- Configurar webhook de notificaciones IPN.
- Modificar `paymentService.js` o endpoints en `server/`.
- Depurar estados de pago desincronizados.
- Reemplazar el mock/simulación del MVP.

## Entradas requeridas

| Variable / dato | Ubicación |
|-----------------|-----------|
| `MERCADO_PAGO_ACCESS_TOKEN` | `.env` (solo server) |
| `VITE_MERCADO_PAGO_PUBLIC_KEY` | `.env` (frontend, init checkout) |
| `MERCADO_PAGO_WEBHOOK_SECRET` | `.env` (validar x-signature) |
| `MERCADO_PAGO_ENV` | `sandbox` \| `production` |
| Monto, concepto, athleteId | Desde registro / orden |

## Salidas esperadas

- `PaymentOrder` en DB con `preferenceId`, `status: pendiente`.
- URL `init_point` para redirigir al checkout MP.
- Webhook procesado idempotentemente → `Payment.status: aprobado`.
- Side effects: activar membership, confirmar registration, enviar emails.
- Frontend muestra estado pendiente hasta confirmación server.

## Procedimiento paso a paso

### 1. Principio de seguridad (NO NEGOCIABLE)

```
❌ Frontend llama GET /v1/payments/{id} y marca aprobado
❌ Botón "Simular pago aprobado" en producción
✅ Backend crea preferencia con ACCESS_TOKEN
✅ Backend recibe webhook → valida firma → consulta MP → actualiza DB
✅ Frontend poll o SSE /api/payments/status/{orderId} (opcional)
```

Comentario en código (`paymentService.js` línea 49-51):

> Regla: solo el backend debe llamar GET /v1/payments/{id}

### 2. Flujo end-to-end

```
Atleta submit form
    → athleteService crea PaymentOrder (pendiente)
    → POST /api/payments/preferences { amount, concept, athleteId, idempotencyKey }
    → MP API crea preferencia
    → Response { preferenceId, initPoint }
    → Redirect atleta a initPoint (Checkout Pro)
    → Atleta paga en MP
    → MP POST /api/payments/webhook (notification)
    → Backend valida x-signature
    → Backend GET payment from MP API
    → Si approved: actualizar PaymentOrder, Payment, Membership, Registration
    → Disparar emails Brevo
```

### 3. Crear preferencia (backend)

Endpoint scaffold (implementar en `server/index.js`):

```javascript
// POST /api/payments/preferences
// Body: { amount, concept, athleteId, idempotencyKey }
// Headers: Authorization Bearer MERCADO_PAGO_ACCESS_TOKEN

const preference = {
  items: [{ title: concept, quantity: 1, unit_price: amount, currency_id: 'ARS' }],
  external_reference: orderId,
  notification_url: `${API_URL}/api/payments/webhook`,
  back_urls: {
    success: `${VITE_APP_URL}/register?status=success`,
    failure: `${VITE_APP_URL}/register?status=failure`,
    pending: `${VITE_APP_URL}/register?status=pending`,
  },
  auto_return: 'approved',
}
```

Persistir `preferenceId` en `PaymentOrder`.

### 4. Webhook e idempotencia

```javascript
// POST /api/payments/webhook
// 1. Leer headers x-signature, x-request-id
// 2. Validar firma con MERCADO_PAGO_WEBHOOK_SECRET
// 3. Extraer payment id del body (topic payment)
// 4. Si idempotencyKey ya procesada → 200 OK sin re-procesar
// 5. GET https://api.mercadadopago.com/v1/payments/{id}
// 6. Mapear status MP → PaymentStatus enum
// 7. Transacción Prisma: order + payment + membership + registration
```

### 5. Adaptador frontend (`src/services/paymentService.js`)

Estado actual: **mock** si no hay token.

| Función | Responsabilidad |
|---------|-----------------|
| `isMercadoPagoConfigured()` | Detecta config |
| `createPreference()` | Delega a POST `/api/payments/preferences` |
| `createPaymentReference()` | Referencia legible (solo display) |
| `getPaymentStatusForMethod()` | Estado inicial según método |
| `validatePayment()` | **Solo mock** — producción vía webhook |

Migración: quitar `VITE_MERCADO_PAGO_ACCESS_TOKEN` del frontend; token solo en server.

### 6. Método manual (`manual_link`)

- Atleta paga por link compartido fuera del flujo automático.
- Estado inicial: `manual_pending` / `pendiente`.
- Operador con `canApprovePayments` aprueba desde Admin.
- `approvePayment()` en `athleteService.js` — hoy simula aprobación admin.

### 7. Mapeo estados MP → Prisma

| MP status | PaymentStatus |
|-----------|---------------|
| pending | pendiente |
| approved | aprobado |
| rejected | rechazado |
| cancelled | cancelado |
| refunded | reembolsado |

## Validaciones

- `MERCADO_PAGO_ACCESS_TOKEN` nunca en bundle frontend.
- Webhook rechaza requests sin firma válida (`401`).
- Mismo `idempotencyKey` no duplica cobros ni side effects.
- Monto en preferencia = monto en `PaymentOrder`.
- Tests de integración en sandbox MP antes de producción.
- Logs sin exponer tokens ni datos de tarjeta.

## Errores comunes

| Error | Impacto | Fix |
|-------|---------|-----|
| Confirmar desde RegisterPage | Fraude / estados falsos | Solo webhook + admin manual |
| Token en `VITE_*` | Filtración | Mover a server env |
| No validar x-signature | Webhook spoofing | Implementar HMAC MP |
| Re-procesar webhook | Doble afiliación | Idempotency key + unique constraint |
| back_urls HTTP en prod | Redirect roto | HTTPS obligatorio |
| Olvidar notification_url | Pagos huérfanos | Configurar en preferencia |

## Checklist de aceptación

- [ ] Preferencia creada solo desde `server/`
- [ ] Webhook con validación `x-signature`
- [ ] GET payment a MP solo en backend
- [ ] `PaymentOrder.idempotencyKey` implementado
- [ ] Side effects atómicos (transacción DB)
- [ ] Mock deshabilitado cuando hay credenciales reales
- [ ] `.env.example` documenta variables MP
- [ ] Botón simular pago oculto en producción

## Referencias oficiales

- [Mercado Pago — Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing)
- [Crear preferencia](https://www.mercadopago.com.ar/developers/es/reference/preferences/_checkout_preferences/post)
- [Webhooks](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks)
- [Validar firma x-signature](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#validate-signature)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/services/paymentService.js` | Adaptador frontend |
| `src/services/athleteService.js` | Crea payment en registro |
| `server/index.js` | Endpoints preferences + webhook |
| `prisma/schema.prisma` | `PaymentOrder`, `Payment`, enums |
| `.env.example` | Variables MP |
| `src/pages/RegisterPage.jsx` | UI checkout (sin confirmar) |
| `src/pages/AdminPage.jsx` | Aprobación manual |
| `src/lib/constants.js` | `PAYMENT_METHODS`, `PRICING` |
