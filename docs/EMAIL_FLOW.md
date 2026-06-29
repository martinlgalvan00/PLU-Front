# Flujo de emails — Brevo

## Principio

Los emails **no deben romper el flujo principal**. Si Brevo falla o no está configurado, se loguea y continúa.

## Emails transaccionales

| Evento | Template env var |
|--------|------------------|
| Afiliación iniciada | `VITE_BREVO_TEMPLATE_AFFILIATION_STARTED` |
| Pago aprobado | `VITE_BREVO_TEMPLATE_PAYMENT_APPROVED` |
| Inscripción confirmada | `VITE_BREVO_TEMPLATE_REGISTRATION_CONFIRMED` |
| Pago pendiente/rechazado | `VITE_BREVO_TEMPLATE_PAYMENT_PENDING` |
| Notificación admin | `VITE_BREVO_TEMPLATE_ADMIN_NOTIFICATION` |

## Flujo

```
Evento de negocio → emailService.sendTransactionalEmail()
  → si BREVO_API_KEY: POST /api/emails/send (backend)
  → si no: mock + console.info en dev
  → guardar email_log
```

## MVP actual

`src/services/emailService.js` con logs en memoria.

## Referencias

- [Brevo transactional API](https://developers.brevo.com/docs/send-a-transactional-email)
