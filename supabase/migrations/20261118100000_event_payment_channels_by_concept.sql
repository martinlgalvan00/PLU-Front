-- Medios de cobro por concepto — PLU ARG
--
-- `events.payment_channel_overrides` pasa a aceptar la forma por concepto:
--   {"registration": {"cash_pitbull": true}, "ticket": {"cash_pitbull": false}}
--
-- Antes era un solo juego de banderas para todo el evento, y eso hacía que
-- cerrar el efectivo para entradas lo cerrara también para la inscripción de
-- atletas. Las filas que ya existen siguen guardando la forma plana; la app la
-- lee como "lo mismo para los dos conceptos" (ver
-- src/lib/eventPaymentChannels.js), así que NO hay backfill ni cambio de datos.
--
-- La restricción de la columna sigue siendo la misma (`jsonb_typeof = 'object'`)
-- y las dos formas la cumplen: esto es solo documentación del contrato.

comment on column public.events.payment_channel_overrides is
  'Override opcional de canales de cobro. Forma actual: {registration:{canal:bool}, ticket:{canal:bool}}. Forma legada (plana, {canal:bool}) = vale para los dos conceptos. NULL = heredar plataforma. Solo puede cerrar, nunca reabrir lo que cerró platform_payment_channels.';
