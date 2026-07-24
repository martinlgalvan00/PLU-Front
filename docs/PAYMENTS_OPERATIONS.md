# Operacion de pagos y dominios transaccionales

## Fuente de verdad

- Prisma conserva usuarios, roles y sesiones del staff.
- Supabase conserva eventos, cupos, atletas, afiliaciones, inscripciones, entradas, ordenes, pagos, webhooks y conciliaciones.
- Express es la unica frontera de escritura para el navegador. Usa `service_role` despues de validar sesion, rol, propiedad e input.
- Mercado Pago se muestra embebido con Bricks. Solamente el webhook firmado o la conciliacion server-side acreditan un pago de Mercado Pago.

## Despliegue de base

Hacer backup antes de aplicar cambios. Desde un checkout limpio:

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push --include-all --dry-run
npx supabase db push --include-all
```

`--include-all` incorpora el puente de compatibilidad anterior a v3 en proyectos que ya tengan versiones posteriores registradas. En una instalacion nueva, CI ejecuta toda la cadena con `supabase db reset`.

La migracion `20260716000000_infrastructure_hardening.sql` instala la base operativa. `20260722130000_domain_integrity_payment_hardening.sql` completa el aislamiento por organizacion, los indices de consulta/FK, la identidad global de pagos y la atomicidad del ciclo de suscripciones.

Los atletas nuevos crean una contraseña de al menos 12 caracteres. Para cuentas anteriores a esta migracion, un administrador debe acordar una contraseña inicial por canal seguro usando `POST /api/athletes/admin/:athleteId/credential`; el hash vive en `athlete_credentials`, nunca en la tabla publica de perfiles.

## Variables obligatorias

```text
SUPABASE_DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
MERCADO_PAGO_ACCESS_TOKEN
VITE_MERCADO_PAGO_PUBLIC_KEY
MERCADO_PAGO_WEBHOOK_SECRET
APP_URL
API_URL
PAYMENT_RECOVERY_JOB_ENABLED=true
DOMAIN_MAINTENANCE_JOB_ENABLED=true
CRON_SECRET
```

`DATABASE_URL` puede configurarse explícitamente o derivarse de
`SUPABASE_DATABASE_URL` con el schema `plu_prisma`. En producción usar
`SESSION_COOKIE_SECURE=true`. Nunca exponer `SUPABASE_SERVICE_ROLE_KEY`,
`MERCADO_PAGO_ACCESS_TOKEN`, `CRON_SECRET` ni el secreto del webhook al bundle
Vite.

## Webhook Mercado Pago

Configurar la URL publica HTTPS `POST /api/payments/webhook`. El endpoint exige `data.id` en la query, valida `x-signature`, `x-request-id` y tolerancia temporal, guarda cada notificacion de forma idempotente y no acredita desde datos enviados por el navegador. Si Mercado Pago reintenta, la clave unica evita duplicar el efecto. El recovery job reclama eventos fallidos con lock, backoff y maximo de intentos; la conciliacion consulta el estado autoritativo de Mercado Pago.

## Readiness y workers

- `GET /api/health`: confirma que la Function responde.
- `GET /api/ready`: devuelve 200 solamente si Prisma y Supabase responden.
- `PAYMENT_RECOVERY_JOB_ENABLED=true`: reprocesamiento de webhook y conciliacion.
- `DOMAIN_MAINTENANCE_JOB_ENABLED=true`: vence reservas de tickets y ordenes de inscripcion abandonadas.
- `MEMBERSHIP_RENEWAL_JOB_ENABLED=true`: envia avisos de renovacion. La migracion cron existente vence afiliaciones por fecha como segunda barrera.

En Vercel, un scheduler invoca por `GET` los endpoints
`/api/internal/jobs/payment-recovery`,
`/api/internal/jobs/membership-renewal` y
`/api/internal/jobs/security-user-lifecycle` con
`Authorization: Bearer <CRON_SECRET>`. El mantenimiento de reservas y órdenes
corre cada minuto en Supabase mediante la migración
`20260724000000_domain_maintenance_cron.sql`. Los RPC de claim y las
actualizaciones atómicas mantienen los reintentos idempotentes.

## Pruebas de aceptacion

Antes de habilitar produccion verificar en sandbox:

1. Compra aprobada, pendiente y rechazada con Brick embebido.
2. Webhook duplicado, fuera de orden, con firma invalida y caida temporal de Supabase.
3. Reintento del mismo checkout con igual idempotency key sin nueva orden.
4. Dos compras simultaneas por el ultimo cupo: solo una debe confirmar la reserva.
5. Reserva abandonada: debe cancelarse y liberar cupo.
6. Transferencia: comprobante privado, acceso por token de orden y aprobacion solo por finanzas.
7. Renovacion de afiliacion activa: crea un nuevo ciclo sin acortar ni sobrescribir el vigente.
8. Inscripcion fuera de ventana, evento lleno o afiliacion vencida: debe rechazarse en DB.
9. Doble escaneo simultaneo: uno ingresa y el segundo recibe `ya utilizada`.
10. Caida de Mercado Pago despues de enviar el pago: la conciliacion debe resolver sin doble cobro.

Los comandos locales de control son:

```bash
npm run lint
npm test
npm run build
npx prisma validate
npm audit --omit=dev
```
