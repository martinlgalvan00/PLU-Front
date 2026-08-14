-- Corrige el estado inicial de las órdenes por transferencia (manual_link).
--
-- `athlete_payment_status_for_method` ponía cualquier orden que no fuera
-- Mercado Pago directamente en 'validacion_manual' desde el momento en que
-- se crea — antes de que el atleta suba ningún comprobante. La sección de
-- afiliación (y cualquier otro checkout por transferencia: inscripción,
-- combo, entradas) trata 'validacion_manual' como "Finanzas ya lo está
-- revisando", así que la persona veía "Comprobante enviado" y perdía la
-- opción de seguir pagando apenas elegía transferencia — sin haber adjuntado
-- nada. `register_athlete_payment_proof` ya asume que el punto de partida es
-- 'pendiente' (`status = case when status = 'pendiente' then
-- 'validacion_manual' else status end`, ver 20260816130000): esta es la
-- pieza que quedó desalineada con esa contrato desde el principio.

create or replace function public.athlete_payment_status_for_method(p_method text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select 'pendiente'::text;
$$;
