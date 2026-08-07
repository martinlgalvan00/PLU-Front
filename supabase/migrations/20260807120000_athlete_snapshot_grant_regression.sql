-- El padrón vuelve a ser service_role-only — PLU ARG
--
-- `20260716000000_infrastructure_hardening.sql` sacó de anon/authenticated las
-- dos RPC que proyectan el dominio de atletas, porque la anon key viaja en el
-- bundle del browser: con ella cualquiera puede llamar a `rpc()` directo contra
-- Supabase, sin pasar por Express ni por la cookie de sesión de atleta.
--
-- `20260806230000_event_registration_schedule.sql` volvió a definir las dos
-- funciones para sumarles la grilla y cerró cada bloque con el `grant` que
-- traían las migraciones de fase 2, anterior al endurecimiento. `create or
-- replace function` conserva los privilegios existentes, así que el grant no
-- era necesario para nada: lo único que hizo fue reabrir lo que se había
-- cerrado.
--
-- Lo que quedaba expuesto:
--
--   * `list_athlete_admin_data()` a `authenticated` — devuelve el padrón
--     COMPLETO (atletas con documento, correo y teléfono, afiliaciones,
--     inscripciones y órdenes de pago). Como el signup de Supabase Auth está
--     abierto, alcanzaba con registrarse para descargarlo entero. Es
--     exactamente el escenario que describe el comentario de la migración de
--     endurecimiento.
--
--   * `get_athlete_snapshot(uuid)` a `anon` — devuelve `to_jsonb(athletes.*)`,
--     que desde `20260806140000_person_credential_token.sql` incluye
--     `credential_token`: el uuid al que apunta el QR de la credencial. Leerlo
--     equivale a tener la credencial de esa persona en la mano, con la PII que
--     la proyección de puerta devuelve solo contra token justamente porque
--     tenerlo se considera prueba de posesión.
--
-- El acceso legítimo no cambia: las dos se llaman desde Express con la service
-- key (`server/modules/athletes/supabaseAthleteRepository.js`), detrás de
-- `requireAthleteSession` y de los guards de permisos del panel.

revoke all on function public.get_athlete_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_athlete_snapshot(uuid) to service_role;

revoke all on function public.list_athlete_admin_data()
  from public, anon, authenticated;
grant execute on function public.list_athlete_admin_data() to service_role;
