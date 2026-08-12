# QA Checklist — PLU ARG MVP

## Landing pública

- [ ] Home carga con hero, misión e involucrate
- [ ] Navegación funciona en todas las vistas
- [ ] Responsive en mobile (720px, 1060px)

## Navegación pública

- [ ] Header inicial y scrolled conservan contraste en tema claro y oscuro
- [ ] Desktop no presenta colisiones en 1440, 1366, 1280 y 1152px
- [ ] Tablet/mobile activa el drawer sin overflow en 1024, 900, 768, 430, 390 y 360px
- [ ] Calendario oficial es un acceso directo y mantiene `aria-current="page"`
- [ ] Competencias y Recursos abren con click y teclado; flechas recorren el menú
- [ ] Escape, Tab, click afuera y selección de destino cierran cada dropdown
- [ ] Drawer bloquea scroll y fondo, contiene el foco y lo devuelve al botón hamburguesa
- [ ] Recursos mobile expande sin altura fija y conserva targets táctiles de 44px
- [ ] Tema, idioma, Acceder y Afiliarme siguen disponibles en desktop y drawer
- [ ] `prefers-reduced-motion` elimina stagger, blur y desplazamientos largos
- [ ] No hay overflow horizontal, errores de consola ni hydration warnings

## Registro

- [ ] Formulario valida campos requeridos
- [ ] Fecha de nacimiento futura/inexistente, teléfono fuera de rango y categoría inválida se rechazan también en la API
- [ ] Duplicado email/documento muestra error
- [ ] Combo/afiliación/solo evento calcula monto correcto
- [ ] Pitbull Classic muestra y crea la orden de inscripción por ARS 75.000 aunque exista un snapshot local viejo
- [ ] Pitbull Classic está publicado y en `inscripcion_abierta`; la ventana vigente no contradice el estado
- [ ] Combo crea una sola orden y afiliación + inscripción comparten `payment_order_id`
- [ ] Repetir la misma idempotency key del combo devuelve la misma orden sin consumir otro cupo
- [ ] Fallar plan, oferta o cupo revierte el combo completo sin dejar filas huérfanas
- [ ] Acreditar el combo activa afiliación e inscripción; cancelar/reembolsar revierte ambas
- [ ] El `credential_token` del atleta no cambia antes/después de acreditar el combo
- [ ] Ese único QR devuelve afiliación activa + inscripción confirmada, con y sin contexto de evento
- [ ] Seguridad puede hacer check-in desde la inscripción resuelta por el QR único
- [ ] Orden se crea y aparece en panel
- [ ] El alta deja `welcome` y `email_verification` enviados o en reintento antes del 201

## Flujo de afiliación y emails

- [ ] Webhook duplicado de pago no duplica afiliación ni emails
- [ ] Pago aprobado activa afiliación y dispara aprobación + comprobante con claves idempotentes
- [ ] Activación/cancelación manual envía el email correspondiente sin revertir el cambio si Brevo falla
- [ ] Reembolso envía comprobante y cancelación de afiliación cuando corresponde
- [ ] Email inválido, params faltantes y supresión quedan en el log con estado y código de error
- [ ] Error transitorio queda en `retrying`; el job lo reclama una sola vez y respeta el máximo de intentos
- [ ] Webhook Brevo mueve `sent` a `delivered`, `rejected` o `bounced` y conserva cada transición en auditoría
- [ ] Auditoría alerta pagos aprobados sin afiliación activa y afiliaciones activas sin email `delivered`

## Panel admin

- [ ] Dashboard muestra métricas
- [ ] La jerarquía muestra exactamente Super Admin, Administrador, PLU y Seguridad
- [ ] Super Admin y Administrador conservan acceso total con matrices protegidas
- [ ] Administrador puede otorgar y remover permisos de PLU y Seguridad
- [ ] Super Admin puede asignar Administrador; Administrador sólo asigna PLU o Seguridad
- [ ] Cambiar el rol de un usuario persiste y actualiza su sesión efectiva
- [ ] PLU ve únicamente los módulos configurados para representar a la federación
- [ ] Seguridad inicia con eventos y check-in y admite permisos operativos adicionales
- [ ] PLU y Seguridad no pueden recibir gestión de usuarios ni de roles
- [ ] Un permiso `read` no habilita mutaciones y un permiso `write` no evita la
      validación server-side
- [ ] Nadie puede autoasignarse otro rol ni elevar a Super Admin
- [ ] Modificar permisos y reasignar usuarios genera auditoría
- [ ] Auditoría filtra por origen/estado y muestra salud, reintentos e incidencias sin falsos “saludable” si el resumen falla
- [ ] La matriz no produce overflow horizontal en 1366, 390 y 360px
- [ ] Roles y permisos conservan contraste y foco visible en tema claro y oscuro
- [ ] Filtros de inscripciones funcionan
- [ ] Aprobar pago actualiza estados
- [ ] Export CSV admin y PLU USA descargan

## Integraciones (mock)

- [ ] Sin credenciales MP: modo mock sin errores
- [ ] Sin credenciales Brevo: emails en consola dev
- [ ] API `/health` responde 200

## Integraciones (producción)

- [ ] Con `APP_PRODUCTION=true`, afiliación automática no aparece en planes y sus endpoints responden `FEATURE_COMING_SOON`
- [ ] Con `APP_PRODUCTION=true`, el combo vigente sigue disponible y crea una única orden para ambos derechos
- [ ] `npm run email:doctor` termina sin bloqueos: remitente validado, URL HTTPS pública y webhook transaccional activo
- [ ] Un envío real pasa de `sent` a `delivered` en Auditoría
- [ ] `npm run mercado-pago:doctor` valida Access Token y secreto del webhook

## Build

- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin errores
- [ ] `npm run test` pasa
