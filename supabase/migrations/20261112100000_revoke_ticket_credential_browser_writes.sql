-- Cierra la escritura de `ticket_type_credentials` al navegador — PLU ARG
--
-- 20261109100000 copió el reparto viejo de `ticket_types`: SELECT público y
-- INSERT/UPDATE/DELETE a `authenticated` detrás de policies de admin. Eso
-- contradice 20260818120000 (el browser no escribe Supabase; el panel escribe
-- con service_role vía Express). `schema_posture.sql` lo detecta: el job de
-- integración falla con "Escritura abierta al navegador".
--
-- La lectura pública se conserva: el comprador tiene que ver ENTRENADOR vs
-- espectador antes de pagar. El alta/edición sigue siendo
-- `staff_merge_ticket_type_credentials`, que ya corre como definer.

revoke insert, update, delete, truncate, references, trigger
  on public.ticket_type_credentials
  from anon, authenticated;

drop policy if exists ticket_type_credentials_insert_admin
  on public.ticket_type_credentials;
drop policy if exists ticket_type_credentials_update_admin
  on public.ticket_type_credentials;
drop policy if exists ticket_type_credentials_delete_admin
  on public.ticket_type_credentials;

grant select on public.ticket_type_credentials to anon, authenticated;

do $$
declare
  v_restante text;
begin
  select string_agg(distinct table_name || ' (' || grantee || ')', ', ')
  into v_restante
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_restante is not null then
    raise exception 'Quedaron privilegios de escritura para anon/authenticated en: %', v_restante;
  end if;
end;
$$;
