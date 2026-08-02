# Auditoría del flujo afiliación → pago → QR → panel admin

Fecha: 2026-08-02 · Rama: `dev` · Alcance: alta de atleta, afiliación, cobro (Mercado Pago
y transferencia), generación y verificación de credencial QR, y trazabilidad desde el panel.

Método: lectura del código de `src/`, `server/`, `supabase/migrations/` y `prisma/`, más
ejecución real de la suite de tests. No se ejecutó nada contra la base productiva; los
hallazgos marcados como "verificar en DEV" son conclusiones del contrato del código que
conviene confirmar contra Supabase antes de tocar nada.

Estado de la suite: los 48 archivos / 230 tests del proyecto `default` pasan. `npm test`
tal cual está hoy **no arranca** (ver B2).

---

## Resumen

El backend de pagos es sólido: orden primero, monto server-side, idempotencia, webhook
firmado, inbox durable con backoff, conciliación y registro global de `external_payment_id`.
El problema no está ahí. Está en los **bordes**: lo que el socio recibe después de pagar, lo
que el operador puede ver y hacer desde el panel, y lo que queda registrado de todo eso.

Hoy conviven tres cosas que rompen la promesa de "que se registre todo correctamente":

1. La aprobación manual de pagos (transferencia) parece rota a nivel contrato de la RPC.
2. La auditoría del panel es local del navegador, no la de la base — y la base sí tiene los
   datos.
3. El evento más importante del flujo (acreditar el pago y activar la afiliación) no deja
   registro en `domain_audit_logs` ni le avisa al socio con su código.

---

## Bloqueantes

### B1 · La aprobación manual de pagos no puede funcionar

- Última definición de `approve_athlete_payment_order`:
  `supabase/migrations/20260715000200_phase3_billing_mercado_pago.sql:444`.
- Su primera guarda es `select 1 from public.profiles where id = auth.uid() and role in (...)`.
- Desde `20260716000000_infrastructure_hardening.sql:874,902` la función quedó revocada para
  `anon`/`authenticated` y otorgada **solo a `service_role`**.
- Express la invoca con el cliente `service_role` (`server/modules/athletes/supabaseAthleteRepository.js:167`,
  vía `server/routes/athletes.js:465`). Con la key de servicio no hay claim `sub`, así que
  `auth.uid()` es `NULL` y la guarda nunca puede dar verdadero.

Efecto esperado: toda aprobación manual devuelve `42501 · No tenes permisos para esta accion`.
Es decir, ninguna afiliación pagada por transferencia se puede activar desde el panel.

Ningún test cubre esta RPC (`tests/billingMigration.test.js` solo verifica los `revoke` de
la variante de entradas). **Verificar en DEV** antes de escribir la migración correctiva.

Corrección: nueva migración que redefina la función sin el chequeo `auth.uid()` — la
autorización ya vive en Express con `admin.payments.approve` — y que además, en la misma
transacción, escriba `domain_audit_logs` y cree el `membership_cycles` correspondiente (hoy
el camino manual no lo crea; el de Mercado Pago sí, ver `20260715000500:516`). Sumar un test
de contrato sobre el SQL, como los de `billingMigration.test.js`.

### B2 · `npm test` no arranca

El commit `6a7f54b` borró `.storybook/main.js` y `.storybook/preview.jsx`, pero
`vitest.config.js:33` sigue creando el proyecto `storybook` con
`storybookTest({ configDir: path.join(dirname, '.storybook') })`. El plugin falla al cargar
la config, así que **ningún** proyecto corre, ni siquiera `--project default`.

Corrección: restaurar `.storybook/main.js` o sacar el proyecto `storybook` de la config
hasta que vuelva. Es el gate de QA que pide `CLAUDE.md`; hoy está caído.

---

## Alto · lo que no se registra o no se ve

### A3 · La auditoría del panel es del navegador, no del sistema

- La sección "Auditoría" del admin es un `PlaceholderSection` (`src/pages/AdminPage.jsx:289`),
  con `admin.audit.read` ya definido en `src/lib/permissions.js:201` y la entrada de menú
  marcada como no disponible (`src/components/layout/AdminShell.jsx:47`).
- Lo que sí se muestra —el timeline del atleta (`src/pages/admin/AthleteDetailSection.jsx:252`)
  y "actividad reciente" del dashboard— sale de `auditLogs` guardado en **localStorage**
  (`src/hooks/useAppData.js:155,188` y `src/lib/storage.js:28`), armado en el cliente con
  `buildAuditLog()` (`src/hooks/useAppData.js:116`).
- Mientras tanto Postgres tiene `public.domain_audit_logs` (`20260716000000:56`) poblada por
  las RPC de dominio, sin ninguna vía de lectura hacia el panel.

Consecuencia: cada operador ve un historial distinto, se pierde al limpiar el navegador, y no
refleja lo que realmente pasó. Un admin que entra desde otra máquina ve la auditoría vacía.

Corrección: endpoint protegido `GET /api/admin/audit` (filtros por entidad, actor, rango y
acción) sobre `domain_audit_logs`, sección real en el panel, y reemplazo del timeline del
atleta y de la actividad reciente por esa fuente. Después borrar `auditLogs` de `storage.js`
y de `useAppData`.

### A4 · Acreditar el pago no deja rastro de auditoría

`apply_mercado_pago_payment` (`20260715000500:415`) y `approve_athlete_payment_order` no
insertan en `domain_audit_logs`. Tampoco lo hacen la activación de la afiliación, la
reversión por reembolso ni `expire_memberships`.

Lo que sí se audita: `membership.created`, `registration.created`, `ticket_order.approved`,
`ticket.checked_in`, `registration.checked_in`, `ticket_addon.redeemed`, upsert de eventos.

O sea: se audita crear la orden, pero no cobrarla ni activar el derecho. Justo el evento que
hay que poder reconstruir ante un reclamo.

Corrección: agregar los `insert into public.domain_audit_logs` en las RPC de aplicación de
pago, activación, reembolso y vencimiento, con `actor_type` (`webhook` / `staff` / `cron`) y
`metadata` con `externalPaymentId`, monto y estado previo.

### A5 · Quien paga online nunca recibe su código de socio

En el camino de Mercado Pago —el principal— cuando el pago se aprueba, la RPC deja la
afiliación en `activa` de una (`20260715000500:509-532`), pero
`server/modules/notifications/paymentNotificationService.js:93` manda `affiliation_started`
("tu afiliación está en curso").

El email `affiliation_approved` —el que lleva `memberCode`, vencimiento y link a la cuenta—
solo se dispara en la aprobación manual (`server/routes/athletes.js:426`).

Resultado: el socio que paga con tarjeta recibe comprobante pero nunca la confirmación de
afiliación ni su código. El copy de `affiliation_started` además contradice el estado real.

Corrección: en `paymentNotificationService`, cuando `order.concept` es `membership`/`combo` y
el pago quedó aprobado, mandar `affiliation_approved` con los datos de la membresía (hay que
devolver la membresía aplicada desde el repositorio de pagos, ya viene en el `jsonb` de la
RPC). Dejar `affiliation_started` solo para el estado `pendiente`.

### A6 · Callejón sin salida por email no verificado

Afiliarse e inscribirse exigen email confirmado (`server/routes/athletes.js:183`). Si no lo
está, el checkout devuelve *"Confirmá tu correo antes de continuar. Te reenviamos el enlace
desde tu cuenta."*

Pero en la cuenta no hay nada de eso:

- `resendAthleteVerification()` existe (`src/services/athleteApi.js:191`) y el endpoint
  también (`server/routes/athletes.js:220`), pero **ninguna UI los usa**.
- `get_athlete_snapshot` devuelve el atleta completo, `email_verified_at` incluido, pero
  `toCamelAthlete` no lo mapea (`src/services/athleteApi.js:18`), así que el frontend ni
  siquiera sabe si el correo está confirmado.

El atleta queda trabado sin acción posible y sin entender por qué.

Corrección: mapear `emailVerifiedAt`, banner persistente en `/mi-cuenta` con botón "reenviar
enlace" cableado a `resendAthleteVerification()`, y bloquear el botón de pago con ese motivo
explícito en vez de fallar recién al enviar.

### A7 · No hay bandeja de pagos de afiliación en el panel

La sección "Finanzas" (`src/pages/admin/PaymentsOperationsSection.jsx`) muestra eventos de
integración de Mercado Pago, conciliaciones pendientes y órdenes de **entradas**. Las órdenes
de atleta (afiliación, inscripción, combo) no aparecen en ninguna lista: la única forma de
aprobar una es Atletas → buscar el atleta → detalle → pestaña Pagos
(`src/pages/admin/AthleteDetailSection.jsx:188`).

Peor: `handleNavigatePayments` del dashboard (`src/pages/AdminPage.jsx:129`) manda a la
sección de pagos con un `paymentId` que esa sección no renderiza. El operador clickea una
acción pendiente y aterriza en una pantalla donde el ítem no existe.

Corrección: lista de `athlete_payment_orders` con filtros (estado, método, concepto, evento,
rango de fechas), aprobación en línea y foco por `paymentId` al llegar desde el dashboard.

### A8 · Transferencia sin comprobante

Las órdenes de entrada tienen ciclo completo de comprobante: `register_ticket_payment_proof`,
subida a `ticket-payment-proofs`, revisión en `TicketOrdersSection` y `staff_approve_ticket_order`
que **exige** `payment_proof_path` (`20260716000000:721`).

Las órdenes de afiliación tienen las columnas `payment_proof_path` y `payment_proof_uploaded_at`
(`20260715000000:59`) y `athleteApi.js:67` ya las mapea, pero no hay RPC, ni endpoint, ni UI.
El modal de transferencia (`src/pages/profile/MembershipPurchaseSection.jsx:11`) solo muestra
alias/CBU y dice "avisanos".

Finanzas aprueba a ciegas y no queda evidencia adjunta a la orden.

Corrección: replicar el patrón de entradas — upload firmado, `register_athlete_payment_proof`,
columna visible en la bandeja de A7 y exigencia de comprobante para aprobar.

---

## Medio · QR y puerta

### M9 · Una credencial ya usada se muestra como válida

`get_membership_by_code_or_token` no devuelve el check-in de la inscripción
(`20260716000000:947`). Entonces `toCamelRegistrationEntry` arma `checkedInAt: null`
(`src/services/athleteApi.js:73`), `registrationCheckinStatus` responde `pagada`
(`src/services/checkinScanService.js:6`) y tanto la página pública como el panel de escaneo
muestran "Credencial válida · Marcar ingreso" en el segundo escaneo.

El backend sí lo frena (`PLU06`, `20260716000000:768`), pero recién cuando el operador
aprieta el botón. En una fila de acreditación eso es ruido garantizado.

Corrección: incluir el `check_in` en el `jsonb` de la RPC (ya se hace en
`staff_get_event_checkin_allowlist`, `20260716000000:702`).

### M10 · El scanner de staff perdió el DNI

`buildAthleteRow` arma la fila del escaneo con `athlete.documentId`
(`src/services/checkinScanService.js:12`), y el panel lo muestra como dato de cotejo. Pero
desde `20260716000000:941` la RPC solo devuelve `id` y `full_name`: el hardening de PII de
`20260715000600` recortaba a tres campos incluyendo `document_id`, y la versión siguiente lo
sacó sin reemplazo.

Resultado: el operador ve el nombre pero no el documento justo cuando tiene que compararlo
con el DNI físico.

Corrección: endpoint de staff autenticado que devuelva la proyección con documento (la RPC
pública tiene que seguir sin PII), y que `checkinScanService` lo use cuando hay sesión.

### M11 · El `member_code` enumerable filtra el `qr_token`

La RPC pública acepta tanto el `qr_token` (uuid opaco) como el `member_code`, que es
correlativo por diseño (`next_member_code`, secuencia `membership_code_seq`). Y en la
respuesta devuelve **el `qr_token`** (`20260716000000:945`).

Iterando `?credencial=PLU-ARG-2026-001`, `-002`, `-003`… desde la home se puede cosechar el
token opaco de cualquier socio, que es exactamente lo que la credencial protege. La migración
`20260715000600` ya identificó la enumerabilidad como problema y recortó la PII, pero el
token quedó en la respuesta.

Corrección: sacar `qr_token` del `jsonb` de respuesta (ningún consumidor lo usa:
`CredentialPage` lee `memberCode`, `checkinScanService` no lo toca para membresías), y sumar
rate limit por IP en el lookup público.

### M12 · El admin no puede ver ni reemitir una credencial

Desde el panel no hay forma de ver el QR de un socio, reenviarle la credencial por email ni
rotar el `qr_token` si se filtró. `MembershipsSection` es solo lectura: no permite renovar,
dar de baja ni reemitir (`src/pages/admin/MembershipsSection.jsx`).

Corrección: en el detalle del atleta, bloque de credencial con vista previa del QR, botón de
reenvío por email y rotación de token con auditoría.

---

## Plan sugerido, en orden

**Tanda 1 — destrabar (nada nuevo funciona hasta esto)**

1. B2: arreglar `vitest.config.js` para recuperar el gate de QA.
2. B1: verificar en DEV y migrar `approve_athlete_payment_order` (sin `auth.uid()`,
   con audit log y `membership_cycles`), + test de contrato.

**Tanda 2 — que el socio reciba lo que pagó**

3. A5: `affiliation_approved` en el camino Mercado Pago.
4. A6: estado de verificación de email visible + botón de reenvío.

**Tanda 3 — que el operador pueda operar y auditar**

5. A4: auditoría en las RPC de acreditación, activación, reembolso y vencimiento.
6. A3: endpoint + sección real de auditoría; retirar `auditLogs` de localStorage.
7. A7: bandeja de órdenes de atleta con aprobación en línea.
8. A8: comprobante de transferencia para afiliaciones.

**Tanda 4 — puerta y credencial**

9. M9 y M10: check-in y documento en la resolución del escaneo.
10. M11: sacar `qr_token` de la respuesta pública + rate limit.
11. M12: credencial gestionable desde el detalle del atleta.

---

## Notas

- `src/services/membershipService.js` y `adminService.js` no necesitan cambios de fondo: la
  lógica de negocio está bien ubicada. El trabajo es casi todo backend + una sección nueva de
  panel.
- Ninguno de estos cambios toca marca, paleta ni tokens; la parte de UI que sí toca
  (auditoría, bandeja de pagos, credencial) tiene que pasar por `plu-frontend-design` antes
  de maquetarse.
- Al momento de la auditoría el working tree tenía cambios sin commitear en
  `server/routes/events.js`, `src/services/eventAdminService.js` y sus tests, más tests de
  integración sin trackear. No son de esta auditoría y no se tocaron.
