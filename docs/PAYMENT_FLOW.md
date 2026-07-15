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
```

## Implementación actual

- `MercadoPagoEmbeddedCheckout.jsx` — Payment Brick y Card Payment Brick
- `embeddedPaymentWorkflow.js` — monto server-side e intentos idempotentes
- `subscriptionWorkflow.js` — planes y abonos recurrentes
- Transferencia manual como canal separado con aprobación operativa

## Estados internos

`creado` → `pendiente` → `aprobado` | `rechazado` | `cancelado` | `reembolsado`

## Idempotencia

Cada webhook debe usar `idempotencyKey` para evitar doble procesamiento.

## Referencias

- [Checkout Bricks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/overview)
- [Webhooks](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks)
