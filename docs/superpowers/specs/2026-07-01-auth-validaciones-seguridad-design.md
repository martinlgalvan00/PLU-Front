# Base de autenticacion, RBAC y validaciones seguras

## Resumen

El proyecto esta en una etapa ideal para fijar una base segura sin sobredisenar. Hoy la app funciona como demo: guarda sesion y datos operativos en `localStorage`, simula login desde React y permite acciones sensibles desde el cliente. Eso sirve para mostrar el MVP, pero no sirve como seguridad real.

La propuesta es implementar una base incremental: autenticacion real en Express, sesion en cookie `HttpOnly`, RBAC aplicado en backend, validaciones Zod compartidas, secretos solo del lado servidor y hardening basico de API. El frontend conserva permisos solo para UX, nunca como control final.

## Objetivos

- Evitar que un usuario pueda darse rol admin editando `localStorage`.
- Impedir confirmaciones de pago desde frontend o desde endpoints sin permisos.
- Centralizar roles y permisos para que coincidan UI, API, Prisma y reglas de negocio.
- Validar entradas en frontend para UX y en backend para seguridad.
- Mover secretos de Mercado Pago y Brevo fuera del bundle Vite.
- Mantener costo bajo: PostgreSQL actual, Express actual, sin proveedor auth pago ni infraestructura extra al inicio.
- Mejorar rendimiento al reducir estados duplicados y preparar migracion gradual desde `localStorage` a API.

## No objetivos

- No implementar OAuth, SSO ni login social en esta fase.
- No sumar Redis obligatorio para sesiones en el arranque.
- No migrar todo el dominio a API en un unico cambio gigante.
- No confirmar pagos manuales desde atleta ni desde el navegador.
- No reemplazar Prisma, Express, React ni Vite.

## Hallazgos que guian el diseno

- `src/hooks/useAppData.js` persiste la sesion en `localStorage`; ese dato es manipulable por el usuario.
- `src/hooks/useAppData.js` simula login con `admin_plu` y `athlete_plu`.
- `src/lib/constants.js` define roles que no coinciden con `docs/BUSINESS_RULES.md` ni con `UserRole` de Prisma.
- `src/config/env.js` lee valores tipo `VITE_MERCADO_PAGO_ACCESS_TOKEN` y `VITE_BREVO_API_KEY`; si existieran, quedarian expuestos al navegador.
- `server/app.js` no tiene headers de seguridad, limite explicito de body, middleware de errores, rate limit ni auth.
- Zod ya existe en `src/lib/validation.js`, pero las reglas deben poder usarse tambien en API.

## Arquitectura propuesta

### Autenticacion

El login se resuelve en backend:

1. `POST /api/auth/login` recibe email y password.
2. Express valida el payload con Zod.
3. Prisma busca el usuario activo por email.
4. El password se compara con hash usando una libreria probada.
5. Si es correcto, el servidor crea una sesion y setea una cookie `HttpOnly`.
6. `GET /api/auth/me` devuelve solo datos seguros: `id`, `email`, `name`, `role`.
7. `POST /api/auth/logout` invalida la sesion.

La cookie debe ser:

- `HttpOnly: true`
- `SameSite: Lax`
- `Secure` solo cuando el entorno este realmente bajo HTTPS
- Nombre propio, no uno generico del framework
- Expiracion acotada, por ejemplo 8 a 12 horas para admins

Para mantener costos bajos, la primera implementacion puede usar una tabla `Session` en PostgreSQL via Prisma. Eso evita Redis al inicio y mantiene la arquitectura simple. Redis puede entrar despues si hay mucho trafico, multiples instancias o necesidad de revocacion masiva con baja latencia.

### Passwords

Se usara `argon2id` si la dependencia funciona bien en el entorno local; si complica instalacion en Windows o deploy, se puede usar `bcryptjs` como opcion pragmatica. En ambos casos:

- Nunca se guarda password plano.
- Nunca se loguea password ni hash.
- El seed crea usuarios demo con hashes reales.
- Usuario `active: false` no puede iniciar sesion.

### RBAC

Los roles canonicos son los de `docs/BUSINESS_RULES.md` y Prisma:

- `admin_maximal`
- `admin_plu_arg`
- `operador_plu_arg`
- `viewer_plu_usa`

Se eliminan como roles reales `admin_plu` y `athlete_plu`. El atleta no es un rol administrativo; para atleta conviene manejar identidad/perfil en otro flujo cuando se migre el area privada. Si se necesita sostener demo, debe quedar bajo `demoAuth` y no mezclado con RBAC productivo.

Permisos iniciales:

- `canViewAdmin`: todos los roles administrativos.
- `canEditOperationalData`: `admin_maximal`, `admin_plu_arg`, `operador_plu_arg`.
- `canManageUsers`: `admin_maximal`, `admin_plu_arg`.
- `canApproveManualPayments`: `admin_maximal`, `admin_plu_arg`, `operador_plu_arg`.
- `canExportAdmin`: `admin_maximal`, `admin_plu_arg`, `operador_plu_arg`.
- `canExportPluUsa`: los cuatro roles, incluyendo `viewer_plu_usa`.

Toda ruta sensible debe usar middleware backend, por ejemplo `requireAuth` y `requirePermission('canApproveManualPayments')`. La UI puede ocultar botones, pero si alguien llama directo a la API debe recibir `401` o `403`.

### Validaciones

La validacion vive en schemas compartidos:

- `src/lib/schemas/auth.js`
- `src/lib/schemas/athlete.js`
- `src/lib/schemas/payment.js`
- `src/lib/schemas/common.js`

El frontend los usa para mensajes rapidos y foco por campo. El backend los usa como autoridad en cada endpoint. Los servicios reciben datos ya normalizados.

Reglas clave:

- Email normalizado a lowercase.
- Documento normalizado sin puntos ni espacios.
- Fecha de nacimiento valida, no futura, con parseo consistente.
- Peso como numero normalizado, no string libre.
- Enums alineados con constantes y Prisma.
- Duplicados de email/documento se bloquean en API y DB.
- Idempotencia para creacion de orden de pago.

### Pagos

Mercado Pago se confirma solo por backend:

- `POST /api/payments/preferences` crea preferencia, requiere sesion o flujo publico explicitamente validado.
- `POST /api/payments/webhook` valida firma/secreto y actualiza estados.
- `POST /api/payments/:id/manual-approval` requiere permiso `canApproveManualPayments`.

El boton "Simular pago" queda disponible solo en modo demo local y no debe ejecutar la misma ruta productiva. En produccion se oculta o se reemplaza por estado informativo.

### Secretos e integraciones

El cliente solo puede conocer claves publicas:

- `VITE_MERCADO_PAGO_PUBLIC_KEY`
- `VITE_API_URL`
- `VITE_APP_URL`

Todo lo demas queda en servidor:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `BREVO_API_KEY`
- `AUTH_SECRET` o secretos de sesion

`src/config/env.js` debe dejar de exponer access tokens o API keys privadas. Los servicios de pago/email que necesiten secretos se mueven a `server/services/`.

### Hardening Express

La API debe arrancar con una base segura:

- `app.disable('x-powered-by')`
- `helmet()` con CSP razonable para API
- `express.json({ limit: '100kb' })`
- CORS con allowlist explicita por `APP_URL`
- Middleware de errores sin stack trace en produccion
- 404 JSON consistente
- Rate limit en `/api/auth/login`
- Logs sin secretos

Como la autenticacion propuesta usa cookie, los endpoints mutantes deben tener proteccion CSRF o, minimo para esta fase, una defensa combinada: `SameSite=Lax`, validacion de `Origin` en requests mutantes y header custom requerido para llamadas XHR. Si mas adelante hay formularios cross-site o integraciones complejas, se agrega token CSRF formal.

## Flujo de datos

1. React carga la app y consulta `GET /api/auth/me`.
2. Si hay sesion valida, guarda en estado solo datos publicos del usuario.
3. El admin entra al panel; la UI calcula permisos para mostrar acciones.
4. Al ejecutar una accion sensible, React llama a la API.
5. Express valida sesion, permiso y payload.
6. Prisma ejecuta la mutacion en transaccion cuando aplique.
7. Se registra `AuditLog` con actor real.
8. React refresca el estado desde la respuesta o desde endpoints de lectura.

## Eficiencia y costos

La decision de usar PostgreSQL para sesiones reduce dependencias y costo operativo. Para el volumen inicial de PLU ARG, una consulta indexed por token/session id es suficiente.

Optimizaciones iniciales:

- Indices unicos ya existentes para `User.email`, `Athlete.email`, `Athlete.documentId`.
- Indice recomendado para sesiones: `tokenHash`, `userId`, `expiresAt`.
- No guardar tokens completos en DB; guardar hash.
- Respuestas `me` livianas.
- Validaciones Zod antes de tocar DB para evitar trabajo inutil.
- Transacciones Prisma para operaciones que crean pago + registro + audit log.
- Mantener adaptadores mockeables para MP/Brevo, pero solo en servidor.

Cuando crezca:

- Redis para sesiones/rate limit distribuido.
- Cache de lecturas publicas, no de datos sensibles administrativos.
- Paginacion y filtros server-side para tablas admin.

## Modelo de datos propuesto

Agregar a Prisma:

```prisma
model Session {
  id         String   @id @default(cuid())
  tokenHash  String   @unique
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  userAgent  String?
  ipHash     String?
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([userId])
  @@index([expiresAt])
}
```

Tambien conviene agregar `lastLoginAt` a `User` para auditoria operativa.

## Error handling

Errores esperados:

- `400`: payload invalido.
- `401`: falta sesion o sesion vencida.
- `403`: rol sin permiso.
- `409`: duplicado de email/documento o idempotencia repetida.
- `429`: demasiados intentos de login.
- `500`: error inesperado con mensaje generico.

Los mensajes al usuario deben ser claros, pero no deben revelar si existe o no una cuenta en login. Para login, usar un mensaje unico: "Credenciales invalidas."

## Testing y QA

Pruebas minimas:

- Unit tests de permisos por rol.
- Unit tests de schemas Zod.
- API tests de login correcto, password incorrecto, usuario inactivo y logout.
- API tests de `401` sin sesion y `403` con rol insuficiente.
- API tests de aprobacion manual de pago solo con permiso.
- API tests de validacion server-side para registro/orden.

Validaciones manuales:

- Editar `localStorage` no otorga acceso admin.
- Un viewer PLU USA puede exportar PLU USA pero no aprobar pagos.
- Un operador puede aprobar pagos manuales pero no gestionar usuarios.
- No aparece ningun secreto privado en el bundle build.

## Plan de implementacion por etapas

### Etapa 1: Alinear roles y permisos

- Actualizar `ROLES` y `roles.js`.
- Ajustar tests de roles.
- Adaptar UI admin a permisos canonicos.
- Mantener compatibilidad demo solo en un wrapper temporal si hace falta.

### Etapa 2: Hardening API

- Instalar dependencias minimas de seguridad.
- Configurar headers, CORS, limite de body, error handler y 404.
- Agregar helpers de respuesta y validacion.

### Etapa 3: Auth real

- Agregar `Session` a Prisma.
- Crear servicios server-side de password y sesion.
- Crear rutas `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`.
- Agregar middleware `requireAuth` y `requirePermission`.
- Seed de usuarios administrativos con passwords documentados solo para local/demo.

### Etapa 4: Validaciones compartidas

- Mover schemas a `src/lib/schemas`.
- Reusar schemas en frontend y API.
- Normalizar email, documento, fecha y peso.
- Reforzar duplicados desde DB.

### Etapa 5: Pagos y secretos server-side

- Quitar secretos privados de `src/config/env.js`.
- Mover Mercado Pago y Brevo server-side.
- Proteger aprobacion manual con RBAC.
- Dejar simulacion solo para demo local.

### Etapa 6: Limpieza del demo

- Reemplazar login de botones por formulario real.
- Quitar sesion admin desde `localStorage`.
- Documentar variables de entorno y comandos de validacion.

## Riesgos y mitigaciones

- Riesgo: cortar el flujo demo mientras se migra auth. Mitigacion: feature flag `DEMO_AUTH_ENABLED` solo local.
- Riesgo: cookies `Secure` rompen dev HTTP. Mitigacion: activar `Secure` solo con entorno HTTPS o flag explicito.
- Riesgo: CSRF incompleto. Mitigacion: `SameSite=Lax`, Origin check y header custom desde el primer corte; token CSRF formal si aparecen flows que lo requieran.
- Riesgo: instalar una lib nativa de hashing complica Windows. Mitigacion: preferir `argon2`, fallback pragmatica a `bcryptjs`.
- Riesgo: migrar todo a DB frena avance. Mitigacion: proteger primero API/auth/pagos y migrar dominio por endpoints pequenos.

## Criterios de aceptacion

- No hay secretos privados `VITE_*` para Mercado Pago/Brevo.
- Login admin usa API, no selector ni hardcode de rol.
- Sesion productiva no vive en `localStorage`.
- Rutas sensibles devuelven `401` sin sesion y `403` sin permiso.
- Roles canonicos coinciden entre docs, Prisma y frontend.
- Confirmacion/aprobacion de pagos no se puede ejecutar desde frontend sin backend autorizado.
- Validaciones Zod corren tambien en server.
- `npm test` y `npm run lint` pasan.
- El build no contiene access tokens ni API keys privadas.
