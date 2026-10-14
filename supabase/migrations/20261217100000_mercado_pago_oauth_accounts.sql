-- Cuentas de Mercado Pago vinculadas por OAuth + cuenta fija por orden — PLU ARG
--
-- 1) Cuenta fija por orden.
--    Hasta acá la orden no recordaba con qué cuenta de MP se cobró: el backend
--    leía `events.mercado_pago_profile_id` por join en cada llamada. Si el staff
--    cambiaba la cuenta del evento con ventas en curso, el retorno, el reintento
--    de preferencia o el pago embebido de una orden ya abierta salían con la
--    cuenta NUEVA — que no tiene ese pago y responde 404, o cobra en otra cuenta
--    lo que se había empezado en la anterior.
--
--    `mercado_pago_account_pinned_at` distingue "fijada a la cuenta global"
--    (pinned_at con profile_id NULL) de "todavía sin fijar" (pinned_at NULL,
--    que sigue leyendo la cuenta del evento como antes). La fija el backend la
--    primera vez que crea la preferencia o el pago embebido.
--
--    `on delete restrict`: una cuenta con órdenes fijadas no se puede borrar,
--    solo archivar. Con `set null` la orden pasaría en silencio a la cuenta
--    global, que es justo el bug que esto corrige.
--
-- 2) Una cuenta OAuth por usuario de MP.
--    Reconectar la misma cuenta de Mercado Pago tiene que renovar el perfil que
--    ya existe, no crear un segundo con el mismo collector (el webhook resuelve
--    la cuenta por `user_id` y dos perfiles para el mismo serían ambiguos). Los
--    perfiles cargados a mano quedan afuera del índice: puede haber históricos
--    repetidos y no se tocan.
--
-- Los tokens OAuth viven en `secrets_ciphertext` (mismo cifrado que los
-- manuales: {accessToken, refreshToken, webhookSecret:''}); la metadata no
-- secreta (connection, expiresAt, cuenta, estado) en `config`.

alter table public.athlete_payment_orders
  add column if not exists mercado_pago_profile_id uuid
    references public.payment_profiles(id) on delete restrict,
  add column if not exists mercado_pago_account_pinned_at timestamptz;

alter table public.ticket_orders
  add column if not exists mercado_pago_profile_id uuid
    references public.payment_profiles(id) on delete restrict,
  add column if not exists mercado_pago_account_pinned_at timestamptz;

create index if not exists athlete_payment_orders_mp_profile_idx
  on public.athlete_payment_orders (mercado_pago_profile_id)
  where mercado_pago_profile_id is not null;

create index if not exists ticket_orders_mp_profile_idx
  on public.ticket_orders (mercado_pago_profile_id)
  where mercado_pago_profile_id is not null;

comment on column public.athlete_payment_orders.mercado_pago_profile_id is
  'Cuenta de MP con la que se abrió el cobro. Vale solo si mercado_pago_account_pinned_at no es NULL (NULL fijado = cuenta global del entorno).';
comment on column public.athlete_payment_orders.mercado_pago_account_pinned_at is
  'Cuándo se fijó la cuenta de MP de la orden. NULL = sin fijar: se usa la cuenta actual del evento.';
comment on column public.ticket_orders.mercado_pago_profile_id is
  'Cuenta de MP con la que se abrió el cobro. Vale solo si mercado_pago_account_pinned_at no es NULL (NULL fijado = cuenta global del entorno).';
comment on column public.ticket_orders.mercado_pago_account_pinned_at is
  'Cuándo se fijó la cuenta de MP de la orden. NULL = sin fijar: se usa la cuenta actual del evento.';

create unique index if not exists payment_profiles_mp_oauth_collector_key
  on public.payment_profiles (organization_id, (config ->> 'collectorId'))
  where kind = 'mercado_pago' and config ->> 'connection' = 'oauth';

comment on column public.payment_profiles.secrets_ciphertext is
  'AES-256-GCM (PAYMENT_PROFILE_SECRETS_KEY). JSON {accessToken,webhookSecret} (manual) o {accessToken,refreshToken,webhookSecret:''} (OAuth). Nunca exponer al browser.';
