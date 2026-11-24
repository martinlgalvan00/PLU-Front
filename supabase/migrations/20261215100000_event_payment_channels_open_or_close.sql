-- Medios de cobro por evento: abrir y cerrar — PLU ARG
--
-- `events.payment_channel_overrides` dejó de ser "sólo puede cerrar". La matriz
-- de plataforma pasa a ser el valor por defecto y cada evento decide por celda:
--
--   {"registration": {"bank_transfer": "open"}, "ticket": {"cash_pitbull": false}}
--
--   false   cierra el canal en ese concepto.
--   'open'  lo abre aunque la plataforma lo tenga cerrado.
--   (sin clave) hereda la plataforma.
--
-- `true` es la forma heredada de "sin opinión" y se sigue leyendo así: el panel
-- anterior guardaba los cuatro canales en `true` al personalizar, y tomarlo como
-- "abrir" reabriría de golpe canales que Finanzas cerró en eventos ya guardados.
-- Por eso NO hay backfill ni cambio de datos, y la restricción de la columna
-- (`jsonb_typeof = 'object'`) sigue valiendo para todas las formas.
--
-- Lo que un evento no puede abrir: el maestro de cobros, el alta del concepto y
-- las pausas de validación, que se verifican antes del canal. Eso vive en el
-- servidor (`server/modules/payments/eventPaymentProfile.js`), no acá.

comment on column public.events.payment_channel_overrides is
  'Decisiones de cobro del evento por concepto: {registration:{canal:v}, ticket:{canal:v}}, v = false (cierra) | ''open'' (abre aunque la plataforma lo cierre); sin clave hereda platform_payment_channels. true = forma heredada de "sin opinión". Forma plana legada ({canal:v}) vale para los dos conceptos. NULL = heredar plataforma.';
