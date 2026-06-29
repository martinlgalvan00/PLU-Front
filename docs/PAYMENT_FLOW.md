# Flujo de pagos — Mercado Pago

## Principio

**Nunca confirmar pagos desde el frontend.** El frontend solo crea la orden y redirige. La confirmación ocurre en backend vía webhook o consulta API.

## Flujo

```
1. Atleta completa formulario
2. Sistema crea PaymentOrder (estado: creado)
3. Backend crea preferencia MP → devuelve init_point
4. Atleta paga en Mercado Pago
5. MP envía webhook POST /api/payments/webhook
6. Backend valida x-signature
7. Backend consulta GET /v1/payments/{id}
8. Si aprobado → actualiza orden, afiliación/inscripción, audit log, email
```

## MVP actual

- `src/services/paymentService.js` — adaptador mock
- Simulación manual desde RegisterPage y AdminPage
- Fallback: link MP + validación manual por operador

## Estados internos

`creado` → `pendiente` → `aprobado` | `rechazado` | `cancelado` | `reembolsado`

## Idempotencia

Cada webhook debe usar `idempotencyKey` para evitar doble procesamiento.

## Referencias

- [Checkout Pro AR](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/overview)
- [Webhooks](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks)
