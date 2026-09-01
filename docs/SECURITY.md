# Seguridad y capacidad — PLU ARG / Maximal

Modelo de defensa del backend y presupuesto del plan gratuito de Supabase.
Complementa [`ARCHITECTURE.md`](./ARCHITECTURE.md) y
[`PAYMENTS_OPERATIONS.md`](./PAYMENTS_OPERATIONS.md).

Todo lo que dice este documento sobre el estado de la base se midió contra la
instancia hosteada, no se dedujo del código.

---

## 1. Auditoría de agosto 2026: qué se encontró

### 1.1 `public_events_view` permitía escribir sobre `events` salteando RLS

**Severidad: crítica (latente).** Corregido en
`20260818120000_least_privilege_public_grants.sql`.

La vista se creó en `20260711190000_data_infrastructure_v3_rls.sql` sin
`security_invoker`. Una vista así corre con los privilegios de su dueño
(`postgres`), que además es dueño de `events` y tiene `relforcerowsecurity` en
`false`: **las policies de `events` no se evalúan**. Y como es una vista simple
sobre una sola tabla, Postgres la considera auto-actualizable
(`information_schema.views.is_updatable = YES`).

Con el `grant all` de fábrica de Supabase encima, un `PATCH` o un `DELETE` con la
clave `anon` —que viaja publicada en el bundle del frontend— contra
`/rest/v1/public_events_view` llegaba a `public.events` con RLS desactivada.

Verificado con un id inexistente (no modifica ninguna fila): `PATCH` y `DELETE`
respondían **200**, o sea que el permiso pasaba. Lo único que evitó el daño es
que hoy ninguna fila entra en el `where` de la vista (ningún evento tiene
`visibility_status = 'published'` con `published_at` cargado). Se volvía
explotable al publicar un evento con ese estado.

Corrección por las dos puntas: `security_invoker = true` y `revoke all` dejando
sólo `SELECT`.

### 1.2 `anon` y `authenticated` tenían escritura sobre las 30 tablas de `public`

**Severidad: alta (defensa en profundidad).** Corregido en la misma migración.

Supabase aplica `grant all on all tables in schema public to anon,
authenticated`. RLS estaba bien puesta —verificado: `anon` veía 0 filas en
`memberships`, `athletes`, `tickets` y `event_registrations`— así que no había
agujero activo fuera del punto 1.1.

El problema era estructural: la única barrera entre la clave pública y los datos
de dinero era la capa de policies. Una migración futura con `for all using
(true)`, o un `disable row level security` puesto para depurar, se convertía
directamente en escritura remota sin autenticar.

Ahora `anon`/`authenticated` conservan sólo `SELECT`, y
`alter default privileges` evita que las tablas nuevas vuelvan a nacer abiertas.
La migración **se verifica a sí misma**: si queda algún privilegio de escritura,
lanza excepción y no se marca como aplicada.

### 1.3 El rate limit no se aplicaba en producción

**Severidad: alta.** Corregido en `lib/defense/sharedRateLimitStore.js` +
`20260818130000_adaptive_defense_layer.sql`.

Los presets de `middleware/rateLimit.js` estaban bien calibrados pero corrían
sobre el store en memoria de `express-rate-limit`. En Vercel cada request
concurrente puede aterrizar en una instancia nueva con el contador en cero: el
límite efectivo no era el número configurado sino **ese número por instancia**, y
la cantidad de instancias la elige quien ataca subiendo la concurrencia.

El único escenario en el que el límite tenía que servir era el único en el que no
servía.

### 1.4 No había defensa contra credential stuffing distribuido

**Severidad: alta.** Corregido en `lib/defense/identityGuard.js`.

Todo el control era por IP. Mil IPs probando la misma casilla veían mil
contadores separados, cada una con dos o tres intentos, sin acercarse nunca al
límite de 20 cada 15 minutos.

### 1.5 El login era un amplificador de DoS

**Severidad: media.** Corregido en `middleware/loadShedder.js`.

`verifyPassword` usa bcryptjs con coste 12: JavaScript puro, ~250 ms de un solo
hilo, sin ceder el event loop. Treinta logins concurrentes son ocho segundos
durante los cuales la instancia no atiende nada más —ni health checks, ni
webhooks de Mercado Pago, ni el escaneo de puerta—. El síntoma no era "el login
anda lento": era que se caía todo lo demás.

### 1.6 La analítica pública podía llenar el plan gratuito en una tarde

**Severidad: alta (disponibilidad y costo).** Corregido en
`20260818140000_free_tier_storage_budget.sql`.

`/api/analytics/collect` es público y sin autenticar. Con el límite vigente (120
req/min por IP × 50 eventos por lote) una sola IP escribía **6.000 filas por
minuto**: 8,6 millones por día. El tráfico real de la aplicación son 3.150–4.600
eventos diarios.

No había ninguna cuota: ni por sesión, ni global, ni de tamaño.

---

## 2. Cómo está defendido hoy

Cuatro capas, cada una tapando lo que la anterior no ve.

| Capa | Qué frena | Dónde |
|---|---|---|
| Cuota por IP, compartida entre instancias | Una máquina abusando | `middleware/rateLimit.js` |
| Techo de trabajo simultáneo | Muchas máquinas saturando el CPU | `middleware/loadShedder.js` |
| Bloqueo por cuenta | Muchas máquinas contra una casilla | `lib/defense/identityGuard.js` |
| Cuota y presupuesto de escritura | Llenar la base | migración `..._free_tier_storage_budget` |

### 2.1 Rate limit compartido

El principio de diseño es que **el ataque tiene que abaratarse para el defensor a
medida que insiste**, no encarecerse. Contar en Postgres a cada request haría lo
contrario y además no entra en el plan gratuito.

1. **Primero la memoria.** El contador local sube siempre y no cuesta nada.
2. **La base se consulta por lotes.** Se sincronizan varios hits juntos
   (`p_cost`), no uno por uno.
3. **Un bloqueo se cachea local.** Cuando la base responde "bloqueado", la
   instancia deja de preguntar hasta que venza. A partir de ahí los 429 salen de
   memoria.

Modos por preset:

- **`strict`** — sincroniza en cada hit. Login, código de tanda privada,
  checkout, escritura pública, webhook. Una ida a la base por intento de login es
  irrelevante al lado de los ~250 ms de bcrypt del mismo request.
- **`sampled`** — sincroniza cada `ceil(limit/6)` hits y siempre cerca del
  límite. Analítica, lecturas públicas, panel, presencia en vivo.

Bloqueo escalonado en `consume_rate_limit`: 1× la ventana el primer bloqueo,
duplicando hasta 16×. Los strikes se perdonan tras ocho ventanas limpias, así que
un bug de polling paga segundos y quien insiste paga horas.

**Si Supabase no responde** se degrada al contador local (fail-open) y abre un
corte de circuito tras tres fallas: 30 segundos sin intentar. Un incidente de la
base no puede dejar sin login a todo el mundo ni sumarle el timeout de la RPC a
cada request.

`rate_limit_buckets` es `unlogged` a propósito: no va al WAL ni a los backups. Un
contador de rate limit que sobrevive a un crash no vale el disco que ocupa.

### 2.2 Bloqueo por identidad

Escalera de castigo: 5 fallos → 1 min → 5 min → 15 min → 1 h → 6 h.

Tres propiedades que importan:

- **El email nunca llega a la base.** Se guarda un SHA-256 con sal de servidor
  (`AUTH_SECRET`). Un volcado de `identity_lockouts` no dice qué casillas existen.
- **Se consulta antes del bcrypt.** Un intento que ya sabemos que vamos a
  rechazar no puede costar 250 ms de CPU.
- **Se cuenta el fallo aunque la cuenta no exista.** Si sólo contáramos los
  emails reales, la presencia del bloqueo después de cinco intentos delataría qué
  casillas están dadas de alta.

Un login correcto limpia el contador de fallos pero **no** baja el nivel de la
escalera: acertar una vez después de un bloqueo largo es justo lo que consigue
quien dio con la contraseña.

### 2.3 Presupuesto de almacenamiento

Tres controles encadenados, del más fino al más duro:

1. **Techo por sesión** (1.200 eventos). Es el más barato: `visitor_id` se deriva
   en el servidor a partir de IP + sal diaria + user agent, así que un cliente no
   puede fabricarse sesiones rotando un identificador propio. Una IP abusiva
   queda contenida en una sesión cada 30 minutos. No cuesta ninguna consulta
   extra: `event_count` ya viene en la fila que la RPC lee igual.
2. **Techo diario global** (15.000 eventos, ~3,5× el pico real). Se reserva antes
   de escribir: si el lote no entra entero, no entra.
3. **Presupuesto en bytes** (120 MB). Purga lo más viejo por días completos hasta
   entrar. Es la única garantía que no depende de acertar una estimación de
   filas, y por eso es la que hace que el plan gratuito no se pueda llenar.

---

## 3. Estado del plan gratuito

Medido el 15/08/2026, después de aplicar las migraciones.

| | Antes | Después |
|---|---|---|
| Base completa | 43 MB | **32 MB** |
| `analytics_events` | 7.864 kB | **4.376 kB** |
| `cron.job_run_details` | 7.120 kB / 30.350 filas | **992 kB / 4.326 filas** |

Techo del plan: 500 MB. Ocupación: **6,4 %**.

De dónde salió la mejora:

- **Índices sin uso.** `analytics_events` tenía siete índices sobre 10.439 filas:
  5.328 kB de índices contra 2.496 kB de datos. Medido en
  `pg_stat_user_indexes`, `analytics_events_heatmap_idx` tenía **0 escaneos**
  (era subconjunto estricto de `path_idx`, el planner nunca lo elegía) y
  `analytics_events_type_idx` sólo 33 (filtrar once valores de `event_type`
  después del rango de fechas es más barato que mantener 1 MB de índice). Se
  eliminaron los dos; los otros cinco tienen uso comprobado. Menos índices
  también abarata cada `INSERT` de la ingesta, que es el camino caliente.
- **Bitácora de pg_cron.** Supabase no la purga. La generaba sobre todo
  `expire-domain-orders-minute`, que corre cada minuto y deja 1.440 filas
  diarias. Es la única tabla del top que no escribe la aplicación.
- **`vacuum full`** para devolver al sistema el espacio de las filas borradas. La
  purga sola marca las páginas como reutilizables pero no baja el tamaño, y lo
  que factura el plan es el tamaño.

### Mantenimiento automático

| Job | Horario | Qué hace |
|---|---|---|
| `plu-analytics-nightly` | 04:20 | Rollup diario + purga de detalle crudo (90 días) |
| `plu-storage-nightly` | 04:40 | Contadores de defensa, retención de bitácoras, historial de cron, presupuesto en bytes y sesiones/cuotas efímeras |

Retención: auditoría operativa y traza de webhooks 365 días, logs de email 180.
`purge_operational_history` resuelve la columna de fecha contra
`information_schema` en vez de asumir `created_at` —`payment_integration_events`
usa `received_at`— y purga cada tabla en su propio bloque, para que una que falle
no arrastre a las otras.

Las tablas append-only conservan ese contrato. Los cortes de retención usan
índices BRIN por fecha para no sumar B-trees pesados a las tablas de mayor
crecimiento. `purge_ephemeral_history` elimina únicamente sesiones vencidas o
revocadas con más de 30 días y cuotas diarias de analítica con más de 120 días;
no borra auditoría, ledger ni trazas financieras vigentes.

### Visibilidad

`GET /api/analytics/database-usage` (permiso `admin.analytics.read`) devuelve
ocupación, proporción del plan, top de tablas y consumo de la cuota diaria de
analítica. Que el plan se mantenga gratis no es un estado: hay que mirarlo, y lo
que no está en el panel propio no se mira.

---

## 4. Pendientes y decisiones abiertas

- **Retención de analítica: 90 días.** No se tocó porque bajarla es una decisión
  de producto —afecta heatmaps y recorridos individuales, no la serie histórica,
  que vive en `analytics_daily_rollups` y es perpetua—. Con el presupuesto en
  bytes ya no hace falta tomarla por capacidad. A 4.000 eventos/día el estado
  estacionario son ~180.000 filas ≈ 90 MB; si el tráfico se triplica, el
  presupuesto empieza a recortar solo y conviene decidir la ventana a mano.
- **`force row level security`** en las tablas críticas: haría que ni el dueño
  saltee RLS. No se aplicó porque las funciones `security definer` son propiedad
  de `postgres` y quedarían sujetas a las policies, lo que rompería medio
  backend. Requiere migrar esas funciones a un rol propio antes.
- **`AccessPermission` / `AccessRolePermission` se leen en cada request
  autenticado** (46.027 y 23.161 seq scans, 1,48 M tuplas). Son tablas de 72
  filas, así que el escaneo es de una página, pero son round-trips extra al
  pooler en cada llamada al panel. Un caché en memoria con TTL corto los
  eliminaría; hay que coordinarlo con `revokeSessionsForUser`, que es lo que hoy
  garantiza que un cambio de rol tenga efecto inmediato.
- **`get_membership_by_code_or_token`** es un wrapper público sobre una función
  `security definer` de `plu_private`, y devuelve nombre y apellido del atleta a
  cualquiera con el código. Es el diseño buscado (verificación de credencial en
  la puerta, sin sesión) y la proyección ya excluye documento y `qr_token`. Queda
  anotado porque es la mayor superficie de datos personales sin autenticar del
  sistema.

---

## 5. Cómo verificar que sigue en pie

```bash
npm run test:unit -- tests/defenseLayer.test.js   # capa de defensa y contrato de las migraciones
npm run test:unit -- tests/infra.databaseSchema.test.js  # postura de las 134 migraciones (texto)
npm run test:unit -- tests/infra.apiSurface.test.js      # guards y limitadores de las 168 rutas
npm run test:unit -- tests/infra.httpHardening.test.js   # cabeceras, CORS, 401 sin sesión
npm run db:verify:schema                           # postura contra el catálogo real (solo lectura)
npm run supabase:diagnose                          # conectividad y permisos contra la base hosteada
```

Los tres primeros auditan lo que **dice** el repositorio; `db:verify:schema`
pregunta lo que la base **tiene puesto**, que es distinto en cuanto una
migración se aplica a medias o alguien cambia un privilegio desde el panel de
Supabase. Los dos hacen falta y ambos corren en CI (los tests en el job
`application`, la verificación de catálogo en `supabase-integration`).

Contra la base, con la clave `anon`, un `DELETE` sobre cualquier tabla de
`public` tiene que responder **401 con código `42501`** (permiso denegado), no
200 con lista vacía. Un 200 significa que el privilegio volvió y que la única
barrera es otra vez RLS.
