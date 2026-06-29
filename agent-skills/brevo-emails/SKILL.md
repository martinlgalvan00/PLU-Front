# Brevo — Emails transaccionales

## Objetivo

Enviar emails transaccionales del flujo PLU ARG (afiliación iniciada, pago aprobado, inscripción confirmada, etc.) vía **Brevo API** (`POST /v3/smtp/email`), con templates parametrizados, logging en `EmailLog` y **fallback mock** que no rompe el flujo si no hay API key.

## Cuándo usarla

- Agregar o modificar notificaciones por email.
- Configurar templates en Brevo y mapearlos en `.env`.
- Implementar `POST /api/emails/send` en `server/`.
- Depurar emails que no llegan o se duplican.
- Auditar envíos desde admin (futuro).

## Entradas requeridas

| Entrada | Variable / ubicación |
|---------|----------------------|
| API key server | `BREVO_API_KEY` |
| API key frontend (evitar en prod) | `VITE_BREVO_API_KEY` |
| Remitente | `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` |
| Template IDs | `VITE_BREVO_TEMPLATE_*` en `.env.example` |
| Datos atleta/pago | Desde `athleteService.approvePayment` |

## Salidas esperadas

- Email enviado vía Brevo con template correcto y params.
- Registro en memoria (`emailLogs`) o DB (`EmailLog`) con status.
- En dev sin key: log en consola `[Brevo mock]` sin throw.
- Funciones de alto nivel: `notifyAffiliationStarted`, `notifyPaymentApproved`, etc.

## Procedimiento paso a paso

### 1. Tipos de email soportados

Definidos en `src/services/emailService.js`:

| Tipo | Función helper | Momento del flujo |
|------|----------------|-------------------|
| `affiliation_started` | `notifyAffiliationStarted` | Pago de afiliación aprobado |
| `payment_approved` | `notifyPaymentApproved` | Cualquier pago aprobado |
| `registration_confirmed` | `notifyRegistrationConfirmed` | Inscripción Pitbull confirmada |
| `payment_pending` | — | Recordatorio pendiente (futuro) |
| `admin_notification` | — | Alerta a operadores (futuro) |

### 2. Configuración de templates

En Brevo Dashboard → Transactional → Templates:

1. Crear template con placeholders: `{{ params.name }}`, `{{ params.memberCode }}`, etc.
2. Copiar template ID numérico a `.env`:

```env
VITE_BREVO_TEMPLATE_AFFILIATION_STARTED=1
VITE_BREVO_TEMPLATE_PAYMENT_APPROVED=2
VITE_BREVO_TEMPLATE_REGISTRATION_CONFIRMED=3
```

Mapeo en código:

```javascript
const TEMPLATES = {
  affiliation_started: import.meta.env.VITE_BREVO_TEMPLATE_AFFILIATION_STARTED,
  // ...
}
```

### 3. API Brevo — payload estándar

```http
POST https://api.brevo.com/v3/smtp/email
api-key: {BREVO_API_KEY}
Content-Type: application/json

{
  "sender": { "name": "PLU ARG", "email": "soporte@pluarg.com" },
  "to": [{ "email": "atleta@example.com", "name": "Nombre" }],
  "templateId": 2,
  "params": {
    "name": "Martina Rivas",
    "amount": 78000,
    "concept": "Afiliación anual + Pitbull Classic"
  }
}
```

### 4. Adaptador actual (`emailService.js`)

```javascript
export async function sendTransactionalEmail(type, { to, params = {} }) {
  // 1. Resolver templateId desde TEMPLATES[type]
  // 2. Si !BREVO_ENABLED → mock_sent + console.info en DEV
  // 3. Si enabled → POST /api/emails/send (futuro) o directo desde server
  // 4. Push a emailLogs con status sent | failed | mock_sent
}
```

**Regla:** en producción, la API key debe vivir solo en `server/` — el frontend llama al proxy backend.

### 5. Integración con flujo de pago

En `athleteService.approvePayment`:

```javascript
emails: async (athlete) => {
  await notifyPaymentApproved(athlete, payment)
  if (payment.concept.includes('Pitbull')) {
    await notifyRegistrationConfirmed(athlete, 'Pitbull Classic')
  }
  if (payment.concept.includes('Afiliación')) {
    await notifyAffiliationStarted({ ...athlete, memberCode })
  }
}
```

Invocar desde `useAppData.handleApprovePayment` después de actualizar estado.

### 6. Endpoint backend (implementar)

```javascript
// POST /api/emails/send — server/index.js (hoy 501)
app.post('/api/emails/send', async (req, res) => {
  const { type, to, params } = req.body
  // Validar type permitido
  // Llamar Brevo con BREVO_API_KEY
  // Persistir EmailLog en Prisma
  res.json({ status: 'sent', id: logId })
})
```

### 7. Modelo `EmailLog` (Prisma)

```prisma
model EmailLog {
  id         String   @id @default(cuid())
  type       String
  to         String
  templateId String?
  status     String   // sent | failed | mock_sent
  params     Json?
  error      String?
  createdAt  DateTime @default(now())
}
```

## Validaciones

- Email destino con formato válido antes de enviar.
- `templateId` existe o fallback a email HTML simple (futuro).
- Errores de Brevo capturados; flujo de pago no revierte por email fallido.
- No loguear API keys ni contenido sensible completo.
- `getEmailLogs()` disponible para debug en dev.
- Rate limiting en endpoint server (futuro).

## Errores comunes

| Error | Síntoma | Fix |
|-------|---------|-----|
| API key en frontend prod | Exposición | Proxy server-only |
| Template ID incorrecto | 400 de Brevo | Verificar dashboard |
| Params sin match template | Campos vacíos en email | Alinear nombres `params` |
| Email bloquea approvePayment | UX rota | try/catch, log error |
| Duplicar envíos | 2 emails por webhook retry | Idempotency por paymentId |
| Remitente no verificado | Rechazo Brevo | Verificar dominio en Brevo |

## Checklist de aceptación

- [ ] Todos los tipos de email tienen template o documentación de creación
- [ ] Mock funciona sin `BREVO_API_KEY`
- [ ] Envío real funciona en sandbox/staging
- [ ] `approvePayment` dispara emails correctos según concepto
- [ ] Logs consultables (`getEmailLogs` o Prisma)
- [ ] API key solo en server para producción
- [ ] `.env.example` actualizado

## Referencias oficiales

- [Brevo — Send transactional email](https://developers.brevo.com/reference/sendtransacemail)
- [Brevo — Transactional templates](https://developers.brevo.com/docs/send-a-transactional-email)
- [Brevo API authentication](https://developers.brevo.com/docs/authentication)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/services/emailService.js` | Adaptador + helpers |
| `src/services/athleteService.js` | Dispara emails post-aprobación |
| `src/hooks/useAppData.js` | Llama `emails()` tras approve |
| `server/index.js` | Endpoint proxy (pendiente) |
| `prisma/schema.prisma` | `EmailLog` |
| `.env.example` | Keys y template IDs |
