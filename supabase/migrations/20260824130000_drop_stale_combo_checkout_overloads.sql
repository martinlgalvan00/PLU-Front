-- plpgsql_check / `supabase db lint` sigue encontrando un overload de
-- create_membership_registration_combo_checkout cuyo cuerpo llama a
-- configure_atomic_checkout_pricing(text, text, text, numeric). Esa firma se
-- dropeó en 20260824100000; el wrapper viejo (9 o 10 argumentos, con
-- p_order_amount) quedó vivo porque CREATE OR REPLACE con más parámetros no
-- reemplaza, crea otro overload, y los DROP por lista de tipos no cubrieron
-- todas las firmas históricas.
--
-- Acá se dropea cualquier overload que no sea el wrapper vigente de 11
-- argumentos (p_default_price + p_manual_price). Idempotente.

do $cleanup$
declare
  r record;
  v_count int;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_membership_registration_combo_checkout'
      and (
        p.pronargs <> 11
        or p.prosrc like '%p_order_amount%'
      )
  loop
    execute format('drop function %s', r.sig);
  end loop;

  select count(*)
  into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_membership_registration_combo_checkout';

  if v_count <> 1 then
    raise exception
      'Debe quedar una sola create_membership_registration_combo_checkout (quedaron %).',
      v_count
      using errcode = 'PLU01';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_membership_registration_combo_checkout'
      and p.prosrc like '%p_order_amount%'
  ) then
    raise exception 'El wrapper combo todavía referencia p_order_amount.'
      using errcode = 'PLU01';
  end if;

  if to_regprocedure(
    'public.create_membership_registration_combo_checkout(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text)'
  ) is null then
    raise exception 'Falta el wrapper combo de 11 argumentos.'
      using errcode = 'PLU02';
  end if;
end
$cleanup$;
