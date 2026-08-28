/**
 * paymentFailureCatalog.js — PLU ARG
 *
 * Traduce una falla del flujo de cobro a un diagnostico accionable: que paso,
 * por que, y que hay que hacer para arreglarlo. Es lo que convierte un
 * `error: "Error interno"` en un incidente resoluble sin leer el codigo.
 *
 * Lo consumen tres lugares:
 * - `errorHandler`, para adjuntar `remediation` al log del servidor.
 * - `/api/payments/operations`, para que el panel muestre el motivo real de
 *   cada webhook fallido en vez del texto crudo del proveedor.
 * - `npm run payments:audit`, que audita el estado del ledger.
 *
 * Cada entrada declara `severity`:
 * - `blocker`: no se acredita ningun pago hasta arreglarlo (config rota).
 * - `degraded`: el cobro funciona pero hay riesgo de plata sin acreditar.
 * - `expected`: comportamiento correcto ante un caso de borde del negocio
 *   (orden ya pagada, tarjeta rechazada). No es un bug: no debe despertar a
 *   nadie, pero si quedar registrado.
 */

/** @typedef {{code: string, title: string, cause: string, fix: string[], severity: 'blocker'|'degraded'|'expected', scope: string, retryable: boolean}} PaymentDiagnosis */

const CATALOG = [
  {
    code: 'MP_ACCESS_TOKEN_MISSING',
    match:
      /Mercado Pago no esta configurado|Access Token de Mercado Pago invalido|MERCADO_PAGO_ACCESS_TOKEN/i,
    title: 'Falta el Access Token de Mercado Pago',
    cause:
      'MERCADO_PAGO_ACCESS_TOKEN esta vacio, es un placeholder o supera los 256 caracteres, asi que el adaptador se niega a crear el cobro.',
    fix: [
      'Copiar el Access Token de MP > Tus integraciones > Credenciales (sandbox para dev, produccion para prod).',
      'Cargarlo en Vercel (Environment Variables) y en el .env local; no debe empezar con replace/changeme/your-.',
      'Redeploy y verificar con `npm run mercado-pago:doctor` (consulta /users/me).',
    ],
    severity: 'blocker',
    scope: 'configuracion',
    retryable: false,
  },
  {
    code: 'MP_TOKEN_REJECTED',
    match: /Token rechazado|invalid[_ ]?token|unauthorized|forbidden|HTTP 40[13]/i,
    statuses: [401, 403],
    title: 'Mercado Pago rechazo las credenciales',
    cause:
      'El Access Token existe pero MP lo rechaza: esta revocado, pertenece a otra aplicacion o mezcla sandbox con produccion.',
    fix: [
      'Confirmar que MERCADO_PAGO_ENV (sandbox|production) coincide con el tipo de credencial cargada.',
      'Regenerar las credenciales en el panel de MP y actualizarlas en todos los entornos.',
      'Correr `npm run mercado-pago:doctor`: informa la cuenta a la que responde el token.',
    ],
    severity: 'blocker',
    scope: 'proveedor',
    retryable: false,
  },
  {
    code: 'MP_WEBHOOK_SECRET_MISSING',
    match: /MERCADO_PAGO_WEBHOOK_SECRET|Falta .*webhook/i,
    title: 'Falta el secreto del webhook',
    cause:
      'Sin MERCADO_PAGO_WEBHOOK_SECRET la verificacion de firma responde 503 y ninguna notificacion se acredita. El atleta paga y la afiliacion queda pendiente para siempre.',
    fix: [
      'Panel de MP > Tus integraciones > Webhooks > Clave secreta; copiarla a MERCADO_PAGO_WEBHOOK_SECRET.',
      'Cargarla en el mismo entorno donde corre API_URL (preview y produccion tienen secretos distintos).',
      'Reprocesar los pagos huerfanos desde Panel > Pagos > Recuperar operaciones.',
    ],
    severity: 'blocker',
    scope: 'configuracion',
    retryable: true,
  },
  {
    code: 'MP_WEBHOOK_SIGNATURE_INVALID',
    match: /Firma de webhook invalida/i,
    title: 'Firma del webhook invalida',
    cause:
      'El HMAC no valida contra el manifiesto id/request-id/ts. Suele ser el secreto de otro entorno, un reenvio con timestamp vencido (>300s) o un intento de falsificacion.',
    fix: [
      'Comparar el secreto configurado con el de la MISMA aplicacion de MP que envia la notificacion.',
      'MERCADO_PAGO_WEBHOOK_SECRET admite varios secretos separados por coma: para rotar sin ventana de rechazo, o si dos aplicaciones de MP apuntan a esta URL.',
      'Verificar el reloj del servidor: el manifiesto incluye ts y se rechaza fuera de tolerancia (la unidad del ts se detecta sola: segundos o milisegundos).',
      'Si el secreto era correcto, tratarlo como intento de falsificacion: el evento no se acredito, no hay accion sobre la orden.',
    ],
    severity: 'degraded',
    scope: 'proveedor',
    retryable: false,
  },
  {
    code: 'MP_INTEGRATION_URL_INVALID',
    match:
      /Falta APP_URL|APP_URL (no es una URL valida|debe usar HTTPS)|API_URL (no es una URL valida|debe usar HTTPS)|API_URL o APP_URL/i,
    title: 'URLs de integracion invalidas',
    cause:
      'MP exige HTTPS publico para notification_url y back_urls. Con una URL local o vacia no puede notificar la acreditacion.',
    fix: [
      'Definir APP_URL con el origen HTTPS publico del sitio. Si API_URL no existe, se usa ese mismo origen para la API.',
      'Definir API_URL solamente si la API se publica en un origen HTTPS diferente.',
      'En local, exponer el sitio con un tunel HTTPS (`npm run mercado-pago:urls` imprime las URLs a registrar).',
      'Registrar esa notification_url en MP > Webhooks.',
    ],
    severity: 'blocker',
    scope: 'configuracion',
    retryable: false,
  },
  {
    /**
     * Falla silenciosa por definicion: no la produce ninguna excepcion nuestra,
     * porque el cobro con tarjeta funciona igual (el Brick acredita contra su
     * propia respuesta). Se manifiesta como ausencia — cero filas en
     * `payment_integration_events` — y por eso el catalogo la clasifica por el
     * sintoma, para que quien la encuentre no la busque como error de codigo.
     */
    code: 'MP_WEBHOOK_URL_REDIRECTS',
    match: /notification_url.*(redirect|308|301)|webhook.*redirige|Permanent Redirect/i,
    title: 'La URL de webhook redirige y MP la da por fallida',
    cause:
      'Mercado Pago exige 200/201 en la notification_url y no sigue redirects. Un apex que responde 308 hacia www —invisible en el navegador— hace que toda notificacion se pierda: los cobros con tarjeta siguen acreditando por el Brick, pero la acreditacion diferida (transferencia, efectivo, cuotas), los contracargos y los reembolsos dejan de llegar.',
    fix: [
      'Correr `npm run mercado-pago:urls`: marca el redirect y muestra el destino final.',
      'Poner el destino final (con www si corresponde) en APP_URL/API_URL de Vercel y en OFFICIAL_APP_URL.',
      'Verificar con `curl -i -X POST <notification_url>`: tiene que responder 400 por falta de firma, nunca 3xx.',
      'Confirmar que `payment_integration_events` deja de estar en cero tras el primer pago real.',
    ],
    severity: 'blocker',
    scope: 'configuracion',
    retryable: false,
  },
  {
    code: 'MP_TIMEOUT',
    match:
      /aborted|AbortError|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|provider unavailable|bad gateway/i,
    title: 'Mercado Pago no respondio a tiempo',
    cause:
      'La llamada al proveedor supero el timeout (8s), se corto la conexion o MP devolvio una falla de infraestructura. El cobro puede haberse creado igual del lado de MP.',
    fix: [
      'No recrear el pago a mano: el intento quedo en embedded_payment_attempts y el job de recovery lo concilia contra MP.',
      'Revisar el status de MP (status.mercadopago.com) antes de tocar nada.',
      'Si sigue pendiente pasados unos minutos, reintentar la conciliacion desde Panel > Pagos.',
    ],
    severity: 'degraded',
    scope: 'proveedor',
    retryable: true,
  },
  {
    code: 'MP_ACCOUNT_MISMATCH',
    match: /MP_ACCOUNT_MISMATCH|otra cuenta de Mercado Pago|cuenta cobradora configurada/i,
    title: 'El checkout y la recuperacion usan cuentas distintas de Mercado Pago',
    cause:
      'El intento guarda el collector_id de la cuenta que creo el pago, pero el proceso actual autentica contra otra cuenta. Esa cuenta no puede consultar ni acreditar ese recurso, aunque el id sea valido.',
    fix: [
      'Configurar MERCADO_PAGO_COLLECTOR_ID con el id de /users/me de la MISMA aplicacion que tiene el Access Token.',
      'Separar las variables de Vercel DEV (TEST) y Production (PROD): Access Token, Public Key, webhook secret y collector id deben pertenecer a la misma aplicacion.',
      'Corregir la configuracion y relanzar manualmente la conciliacion desde la orden; no acreditar ni descartar el pago a mano.',
    ],
    severity: 'blocker',
    scope: 'configuracion',
    // Repetir con las mismas credenciales nunca va a poder leer un recurso de
    // otra cuenta. Se detiene hasta que alguien corrija la configuracion y lo
    // relance de forma explicita.
    retryable: false,
  },
  {
    code: 'PROVIDER_PAYMENT_NOT_FOUND',
    match: /Pago mock no encontrado|payment not found|resource not found|Not Found/i,
    title: 'Mercado Pago no reconoce ese pago',
    cause:
      'La consulta canonica por el id devolvio 404. En un webhook puede ser una prueba manual o un id de otra aplicacion; durante la conciliacion de un pago que el checkout ya creo, suele indicar que otro proceso usa una cuenta o entorno distinto, o que el recurso sandbox dejo de existir.',
    fix: [
      'Buscar tanto el id como el external_reference de la orden en la MISMA cuenta y aplicacion que creo el pago.',
      'Comparar MERCADO_PAGO_ENV y la identidad del Access Token en todos los procesos; dejar un solo worker de recovery por entorno.',
      'Si existe evidencia de Payment.create, no aprobar ni descartar a mano. Corregir el entorno y relanzar la conciliacion: validara referencia, monto y moneda antes de aplicar.',
    ],
    severity: 'degraded',
    scope: 'proveedor',
    retryable: false,
  },
  {
    code: 'ORDER_AMOUNT_MISMATCH',
    match: /Monto de pago invalido para la orden|Moneda de pago invalida para la orden/i,
    title: 'El pago no coincide con la orden',
    cause:
      'El monto o la moneda que informa MP difiere de la orden guardada. Es la defensa contra acreditar una orden con un pago de otro valor; la orden NO se toca.',
    fix: [
      'Comparar el pago en el panel de MP contra athlete_payment_orders/ticket_orders (amount, currency).',
      'Si hubo cambio de tarifa con el checkout abierto, cancelar la orden vieja y emitir una nueva por el valor correcto.',
      'Si el importe es correcto y aun asi no coincide, revisar el plan/pricing que genero la orden antes de forzar nada.',
    ],
    severity: 'degraded',
    scope: 'dominio',
    retryable: false,
  },
  {
    code: 'ORDER_PAYMENT_MISMATCH',
    match:
      /El pago no pertenece a la orden informada|Pago sin referencia de orden|Pago mock sin referencia/i,
    title: 'El pago no referencia esta orden',
    cause:
      'El external_reference del pago no es el id de la orden. Pasa cuando se crea el pago fuera del checkout de la app (link manual, cobro suelto).',
    fix: [
      'Buscar el pago en MP y leer su external_reference real.',
      'Si el cobro fue por fuera del flujo, acreditarlo con la aprobacion manual (Panel > Pagos > Aprobar) adjuntando el comprobante.',
      'Nunca editar external_reference: la trazabilidad del cobro se pierde.',
    ],
    severity: 'degraded',
    scope: 'dominio',
    retryable: false,
  },
  {
    code: 'ORDER_NOT_PAYABLE',
    match:
      /La orden ya no admite (un nuevo checkout|pagos)|La orden no usa Mercado Pago|no corresponde a una (afiliacion|suscripcion)/i,
    title: 'La orden ya no admite este cobro',
    cause:
      'La orden esta aprobada, cancelada o reembolsada, o su metodo no es Mercado Pago. El rechazo evita un doble cobro.',
    fix: [
      'Confirmar el estado en Panel > Pagos > Ordenes de atleta.',
      'Si el atleta necesita pagar de nuevo, emitir una orden nueva en vez de reabrir la anterior.',
      'Si figura aprobada sin acreditacion visible, revisar el ledger de webhooks antes de emitir otra.',
    ],
    severity: 'expected',
    scope: 'dominio',
    retryable: false,
  },
  {
    /**
     * No es una falla del sistema: es el sistema haciendo lo que el panel le
     * pidio. Sin catalogar, estos rechazos entraban como
     * `UNCLASSIFIED_PAYMENT_FAILURE` con severidad `degraded` y stack completo.
     * Sobre la bitacora real eran 8 de las 10 "fallas de cobro recientes" que
     * reportaba `npm run payments:audit`: ruido que tapaba las dos que si
     * importaban. Marcarlas `expected` es lo que deja ver una falla de verdad.
     */
    code: 'CHECKOUT_CHANNEL_PAUSED',
    match:
      /est[aá]n? pausad[oa]s?( temporalmente)?|est[aá] pausada desde el panel|Pod[eé]s pagar con Mercado Pago/i,
    title: 'El canal de cobro esta pausado desde el panel',
    cause:
      'Un toggle operativo (pagos, canal manual de transferencia/efectivo, o validacion de afiliaciones) esta apagado. El rechazo es deliberado y le llega al atleta como aviso, no como error.',
    fix: [
      'Si el corte es intencional, no hay nada que hacer: el asiento documenta que se rechazo y por que.',
      'Para reabrirlo, Panel > Configuracion > Toggles de plataforma.',
      'Si nadie lo apago, revisar quien lo cambio en Panel > Auditoria (accion `platform_feature_toggle.updated`).',
    ],
    severity: 'expected',
    scope: 'configuracion',
    retryable: false,
  },
  {
    code: 'COMBO_NOT_AVAILABLE',
    match: /El combo no esta disponible para este evento/i,
    title: 'El combo no esta habilitado para ese evento',
    cause:
      'La orden pidio un combo (afiliacion + inscripcion) que ese evento no ofrece, o que se dio de baja despues de que el atleta abriera el checkout.',
    fix: [
      'Verificar el combo del evento en Panel > Eventos > Inscripciones.',
      'Si el combo deberia existir, revisar su alta; si no, el atleta paga afiliacion e inscripcion por separado.',
    ],
    severity: 'expected',
    scope: 'dominio',
    retryable: false,
  },
  {
    code: 'PAYMENT_IN_FLIGHT',
    match:
      /El pago ya se est[aá] procesando|ya fue procesado o esta en ejecucion|ya finalizo o esta en ejecucion/i,
    title: 'Ya hay un intento en curso',
    cause:
      'Otro proceso tomo el lock de ese intento o evento (doble submit del Brick, o el job de recovery corriendo en paralelo). Es la proteccion contra cobrar dos veces.',
    fix: [
      'Esperar unos segundos y consultar el estado de la orden: el intento en curso lo resuelve.',
      'Si quedo trabado, Panel > Pagos muestra los locks vencidos en Integridad y el boton de recuperar los libera.',
    ],
    severity: 'expected',
    scope: 'dominio',
    retryable: true,
  },
  {
    code: 'WEBHOOK_PAYLOAD_INVALID',
    match:
      /Webhook sin data\.id|identificador del webhook no coincide|Webhook sin identificador|Tipo de webhook no soportado|Evento de pago incompleto/i,
    title: 'Notificacion mal formada',
    cause:
      'La notificacion no trae data.id en la URL, el id del body contradice el de la query, o el tipo no es payment/subscription_preapproval/subscription_authorized_payment.',
    fix: [
      'En MP > Webhooks verificar que la URL registrada sea .../api/payments/webhook/mercadopago y que el evento este habilitado.',
      'Los eventos no soportados se descartan a proposito: no requieren accion.',
      'Si es un pago real que se perdio, forzar la conciliacion desde Panel > Pagos > Recuperar operaciones.',
    ],
    severity: 'degraded',
    scope: 'proveedor',
    retryable: false,
  },
  {
    code: 'EVENT_SOLD_OUT',
    match: /PLU04|No quedan cupos|cupo agotado|agotad[ao]/i,
    title: 'El evento no tiene cupo',
    cause:
      'La inscripcion se corto porque el evento llego a su capacidad. La orden no se creo y no se cobro nada.',
    fix: [
      'Confirmar la capacidad del evento en Panel > Eventos.',
      'Si se habilitan mas lugares, ampliar el cupo y avisar: la pantalla vuelve a permitir la inscripcion sola.',
    ],
    severity: 'expected',
    scope: 'dominio',
    retryable: false,
  },
  {
    code: 'DUPLICATE_REGISTRATION',
    match: /PLU0[67]|Ya existe una cuenta|ATHLETE_EXISTS|ya (esta|est[aá]) inscript|ya fue usad/i,
    title: 'Ya existe ese registro',
    cause:
      'El correo, el documento o la inscripcion ya estaban tomados. Es la proteccion contra altas e inscripciones duplicadas.',
    fix: [
      'Si es el mismo atleta, debe ingresar con su cuenta en vez de crear otra.',
      'Si el documento quedo asociado a una cuenta equivocada, corregirlo desde Panel > Atletas antes de reintentar.',
    ],
    severity: 'expected',
    scope: 'dominio',
    retryable: false,
  },
  {
    code: 'ATHLETE_PROFILE_INCOMPLETE',
    match: /ATHLETE_PROFILE_INCOMPLETE|Complet[aá] tu perfil antes de inscribirte/i,
    title: 'El perfil deportivo está incompleto',
    cause:
      'La inscripción y el combo se frenan antes de crear una orden si faltan datos obligatorios del atleta. No se inició ningún cobro.',
    fix: [
      'Completar los campos indicados en Mi perfil (fecha de nacimiento, sexo competitivo, equipo o gimnasio, teléfono, país y provincia).',
      'Volver a iniciar la inscripción o el combo después de guardar el perfil.',
    ],
    severity: 'expected',
    scope: 'cliente',
    retryable: true,
  },
  {
    code: 'COMBO_PLAN_NOT_CURRENT',
    match: /El plan del combo no est[aá] vigente/i,
    title: 'El plan asociado al combo ya no está vigente',
    cause:
      'La oferta conjunta referencia un plan inactivo, futuro, retirado, recurrente o perteneciente a otra organización. La orden no se creó y no hubo cobro.',
    fix: [
      'En Panel > Tarifas, publicar una versión vigente de la afiliación de pago único.',
      'En Panel > Eventos, vincular esa versión a la oferta de combo y verificar que ambas pertenezcan a la misma organización.',
      'Reintentar recién después de corregir la oferta; no acreditar ni recrear un pago manualmente.',
    ],
    severity: 'expected',
    scope: 'configuracion',
    retryable: true,
  },
  {
    code: 'ORDER_ACCESS_DENIED',
    match:
      /no pertenece a la sesion actual|Token de orden invalido|Falta el token de acceso de la orden/i,
    statuses: [401, 403],
    title: 'La orden no pertenece a quien intenta pagarla',
    cause:
      'La sesion de atleta no es la duena de la orden, o falta/no coincide el token de acceso de una orden de entradas.',
    fix: [
      'El atleta debe volver a iniciar sesion y reabrir el checkout desde su perfil.',
      'En entradas, reenviar el link con el token original: el token es la unica prueba de titularidad de esa compra.',
      'Si se repite sobre la misma orden desde IPs distintas, revisar la auditoria de identidad antes de habilitar nada.',
    ],
    severity: 'expected',
    scope: 'cliente',
    retryable: false,
  },
  {
    code: 'EMAIL_NOT_VERIFIED',
    match: /EMAIL_NOT_VERIFIED|Confirm[aá] tu correo/i,
    title: 'Email sin confirmar',
    cause:
      'Afiliarse e inscribirse exigen email verificado: el comprobante y la credencial viajan a esa direccion.',
    fix: [
      'El atleta pide un enlace nuevo desde el aviso del checkout (POST /api/athletes/me/resend-verification).',
      'Si el mail no llega, revisar el estado del envio en Panel > Auditoria (source=email) y correr `npm run email:doctor`.',
    ],
    severity: 'expected',
    scope: 'cliente',
    retryable: true,
  },
  {
    code: 'SUPABASE_UNAVAILABLE',
    match:
      /Supabase Admin no esta configurado|No se pudo (leer|aplicar|registrar|finalizar|reclamar|guardar)/i,
    title: 'La base no pudo registrar la operacion',
    cause:
      'Falta SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY o la RPC devolvio error. El cobro puede existir en MP sin estar acreditado en el dominio.',
    fix: [
      'Verificar las variables de Supabase del entorno y correr `npm run supabase:assert`.',
      'Correr `npm run db:verify:payments` para confirmar que estan todas las funciones del flujo de cobro.',
      'Una vez restablecida la base, Panel > Pagos > Recuperar operaciones reprocesa los eventos pendientes.',
    ],
    severity: 'blocker',
    scope: 'infraestructura',
    retryable: true,
  },
  {
    code: 'SUPABASE_RPC_MISSING',
    match: /PGRST202|Could not find the function|schema cache/i,
    title: 'Falta una funcion del flujo de cobro',
    cause:
      'PostgREST no encuentra la RPC: la migracion no corrio en ese proyecto o el cache de esquema quedo viejo.',
    fix: [
      'Aplicar las migraciones pendientes (`npm run setup:all`).',
      'Recargar el cache de esquema en Supabase (Settings > API > Reload schema).',
      'Confirmar con `npm run db:verify:payments`.',
    ],
    severity: 'blocker',
    scope: 'infraestructura',
    retryable: true,
  },
  {
    code: 'CHECKOUT_CLOSED',
    match:
      /PAID_CHECKOUT|cobros? .*(cerrad|no est[aá] habilitad)|inscripciones? .*no est[aá]n? abiertas/i,
    title: 'La ventana de cobros esta cerrada',
    cause:
      'El gate de cobros (PAID_CHECKOUT_ENABLED o registration_opens_at del evento) todavia no abrio o ya cerro.',
    fix: [
      'Revisar registration_opens_at del evento en Panel > Eventos.',
      'Para habilitar antes de la fecha, usar el override PAID_CHECKOUT_ENABLED del entorno correspondiente.',
    ],
    severity: 'expected',
    scope: 'configuracion',
    retryable: false,
  },
  {
    code: 'PAYMENTS_MOCK_MISCONFIGURED',
    match: /PAYMENTS_MOCK|PAYMENTS_PROVIDER|adaptador mock/i,
    title: 'Proveedor de pagos mal configurado',
    cause:
      'PAYMENTS_MOCK/PAYMENTS_PROVIDER tiene un valor invalido, o se pidio el mock en un entorno productivo (esta prohibido a proposito).',
    fix: [
      'En produccion y previews de Vercel: PAYMENTS_MOCK=false (o sin definir).',
      'En local: PAYMENTS_MOCK=true habilita el harness sin credenciales reales.',
      'Valores aceptados: true|false. Cualquier otro corta el arranque del cobro.',
    ],
    severity: 'blocker',
    scope: 'configuracion',
    retryable: false,
  },
  {
    code: 'RATE_LIMITED',
    statuses: [429],
    title: 'Demasiados intentos',
    cause: 'El limitador corto la rafaga de intentos de checkout desde el mismo origen.',
    fix: [
      'Es esperable ante reintentos rapidos: se libera solo pasada la ventana.',
      'Si un atleta legitimo queda trabado, confirmar que no haya un loop de reintentos en la pantalla antes de tocar los limites.',
    ],
    severity: 'expected',
    scope: 'cliente',
    retryable: true,
  },
]

const FALLBACK = {
  code: 'UNCLASSIFIED_PAYMENT_FAILURE',
  title: 'Falla no catalogada del flujo de cobro',
  cause:
    'El error no coincide con ningun patron conocido. El stack completo queda en el log y en la auditoria operativa.',
  fix: [
    'Buscar el requestId del incidente en los logs: trae stack, etapa y orden afectada.',
    'Revisar la orden en Panel > Pagos y el pago en el panel de MP antes de reintentar.',
    'Si se repite, agregar el patron a paymentFailureCatalog.js para que quede diagnosticado.',
  ],
  severity: 'degraded',
  scope: 'desconocido',
  retryable: true,
}

/**
 * Detalles de rechazo de Mercado Pago. No son fallas del sistema: son la
 * respuesta que hay que darle al atleta cuando pregunta por que no le paso la
 * tarjeta. Sin esto, el panel muestra `cc_rejected_call_for_authorize` crudo.
 */
const REJECTION_DETAILS = {
  cc_rejected_insufficient_amount:
    'Fondos insuficientes. Probar con otro medio o pedir un limite mayor al banco.',
  cc_rejected_bad_filled_card_number: 'Numero de tarjeta mal ingresado. Cargarlo de nuevo.',
  cc_rejected_bad_filled_date: 'Fecha de vencimiento incorrecta.',
  cc_rejected_bad_filled_security_code: 'Codigo de seguridad incorrecto.',
  cc_rejected_bad_filled_other: 'Algun dato de la tarjeta quedo mal cargado.',
  cc_rejected_call_for_authorize:
    'El banco pide autorizacion expresa: el atleta tiene que llamar y autorizar ese monto.',
  cc_rejected_card_disabled: 'Tarjeta inactiva. El atleta debe activarla con el banco.',
  cc_rejected_duplicated_payment:
    'Pago duplicado: ya existe uno igual reciente. Verificar antes de reintentar.',
  cc_rejected_high_risk:
    'Mercado Pago rechazó el pago por prevención de fraude. No acreditar ni reintentar desde el panel; pedirle al atleta que use otro medio de pago o consulte con Mercado Pago.',
  cc_rejected_max_attempts: 'Se agotaron los intentos permitidos. Esperar y usar otra tarjeta.',
  cc_rejected_other_reason: 'El emisor rechazo el pago sin detalle. Reintentar con otro medio.',
  cc_rejected_invalid_installments: 'La tarjeta no admite esa cantidad de cuotas.',
  cc_rejected_card_type_not_allowed: 'Ese tipo de tarjeta no esta habilitado para este cobro.',
  pending_contingency: 'MP esta procesando el pago. Se acredita solo por webhook; no reintentar.',
  pending_review_manual:
    'MP lo dejo en revision manual. Se resuelve por webhook en minutos u horas.',
  pending_waiting_transfer: 'Esperando la transferencia del atleta.',
  pending_waiting_payment: 'Cupon emitido, esperando el pago en efectivo.',
  accredited: 'Acreditado.',
}

/** Quita los campos de matcheo: al llamador solo le sirve el diagnostico. */
function toDiagnosis(entry) {
  return {
    code: entry.code,
    title: entry.title,
    cause: entry.cause,
    fix: [...entry.fix],
    severity: entry.severity,
    scope: entry.scope,
    retryable: entry.retryable,
  }
}

function normalizeMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return [
    error.message,
    error.details?.code,
    error.code,
    error.provider?.code,
    error.provider?.detail,
  ]
    .filter(Boolean)
    .join(' | ')
}

/**
 * @param {unknown} error
 * @returns {PaymentDiagnosis}
 */
export function diagnosePaymentFailure(error) {
  const message = normalizeMessage(error)
  const status = Number(error?.status ?? error?.statusCode ?? NaN)

  for (const entry of CATALOG) {
    const byMessage = entry.match ? entry.match.test(message) : false
    const byStatus = entry.statuses ? entry.statuses.includes(status) : false
    if (byMessage || (byStatus && !entry.match)) return toDiagnosis(entry)
  }
  // El status solo desempata cuando el mensaje no dijo nada.
  for (const entry of CATALOG) {
    if (entry.statuses?.includes(status)) return toDiagnosis(entry)
  }
  return { ...FALLBACK }
}

/** Explicacion operativa de un status_detail de Mercado Pago. */
export function explainPaymentStatusDetail(statusDetail) {
  const key = String(statusDetail ?? '').trim()
  if (!key) return null
  return (
    REJECTION_DETAILS[key] ??
    'Detalle no catalogado: consultar el pago en el panel de Mercado Pago.'
  )
}

/** Solo para el script de auditoria y los tests: catalogo completo. */
export function listPaymentFailureCodes() {
  return CATALOG.map((entry) => entry.code)
}
