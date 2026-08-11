# Previews de emails transaccionales

HTML generados desde el mismo fallback que usa producción
(`server/modules/notifications/emailTemplates.js`).

## Regenerar

```bash
npm run email:previews
```

Opcional: `APP_URL=https://tu-dominio.com npm run email:previews` para que el
logo apunte a ese host. Por defecto usa `https://pluarg.com`.

## Archivos

| Archivo | Tipo |
|---|---|
| `email_verification.html` | Confirmación de correo (registro) |
| `password_reset.html` | Olvidé mi contraseña |
| `payment_receipt.html` | Comprobante de pago |
| `payment_confirmation.html` | Pago + afiliación/inscripción/entrada consolidados |
| `affiliation_approved.html` | Afiliación activa + QR de perfil |
| `membership_renewal.html` | Último recordatorio, el día del vencimiento |
| `registration_confirmed.html` | Inscripción confirmada + QR de perfil |
| `event_announcement.html` | Aviso de fecha |

Abrilos en el navegador. El logo usa una ruta relativa a
`public/brand/plu-argentina-email.png` (emblema de `src/assets/PLU Argentina.png`)
para que se vea offline; en producción el mail usa
`{APP_URL}/brand/plu-argentina-email.png`.

Header negro = solo marca (emblema croppeado + wordmark). El título del mail
va en el cuerpo blanco. Firma de marca: franja celeste|oro de 2px.

## Brevo vs fallback

Si hay un `BREVO_TEMPLATE_*` configurado, Brevo envía el HTML del dashboard y
**no** este diseño. Para que los atletas vean este layout, dejá esos IDs vacíos
o alineá los templates del dashboard con estos previews.

No hay email de login: el inicio de sesión no dispara correo.
