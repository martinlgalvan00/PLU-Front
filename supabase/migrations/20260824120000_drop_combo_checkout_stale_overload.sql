-- Dropeo del overload huérfano de create_membership_registration_combo_checkout
--
-- 20260824100000 reemplazó los tres wrappers _checkout (p_order_amount ->
-- p_default_price + p_manual_price), pero su DROP de la combo apuntaba a una
-- firma de 10 argumentos que nunca existió: la versión real de
-- 20260823170000 tenía 9 (sin p_discount). Con `drop function if exists` el
-- error fue silencioso y quedaron DOS overloads vivos con el mismo nombre.
--
-- PostgREST no resuelve RPCs con overloads ambiguos: toda llamada a la combo
-- --con cualquier firma-- falla con PGRST205 "Could not find the function
-- public.create_membership_registration_combo_checkout(...) in the schema
-- cache", aunque la función exista. El server ya llama solo con la firma
-- nueva (p_default_price/p_manual_price, ver supabaseAthleteRepository.js);
-- el overload viejo no tiene llamadores.

drop function if exists public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text
);

drop function if exists public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text, text
);
