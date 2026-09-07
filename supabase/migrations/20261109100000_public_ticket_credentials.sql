-- ---------------------------------------------------------------------------
-- Las credenciales de un tipo de entrada son información de venta — PLU ARG
--
-- `ticket_type_credentials` nació con RLS activo y sin una sola policy: la
-- única lectura que funcionaba era la del panel, que va por Express con service
-- role. Para el navegador la tabla no existía.
--
-- Eso alcanzaba mientras las credenciales fueran un detalle de emisión, pero
-- dejaron de serlo: son lo que distingue una entrada de espectador de una de
-- entrenador, y por lo tanto lo que el comprador tiene que poder leer ANTES de
-- pagar. Sin esta policy el catálogo público muestra dos entradas con dos
-- nombres y ninguna diferencia visible, que es justo lo que la subcategoría
-- venía a resolver.
--
-- No hay nada sensible acá: una etiqueta ("ENTRENADOR") y una lista de zonas.
-- El alcance real lo sigue validando `staff_check_in_ticket` en el servidor
-- contra los scopes CONGELADOS en la entrada emitida, no contra esta tabla, así
-- que exponerla no mueve ninguna decisión de acceso.
--
-- Se copia tal cual el reparto que ya tiene `ticket_types` desde
-- 20260721000000: anon ve lo activo de un evento publicado; authenticated ve
-- eso mismo o todo si es admin; escribir es sólo de admin.
-- ---------------------------------------------------------------------------

drop policy if exists ticket_type_credentials_select_public_anon
  on public.ticket_type_credentials;
drop policy if exists ticket_type_credentials_select_authenticated
  on public.ticket_type_credentials;

create policy ticket_type_credentials_select_public_anon
  on public.ticket_type_credentials
  for select
  to anon
  using (exists (
    select 1
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.id = ticket_type_credentials.ticket_type_id
      and tt.active
      and e.published = true
  ));

create policy ticket_type_credentials_select_authenticated
  on public.ticket_type_credentials
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or exists (
      select 1
      from public.ticket_types tt
      join public.events e on e.id = tt.event_id
      where tt.id = ticket_type_credentials.ticket_type_id
        and tt.active
        and e.published = true
    )
  );

-- La escritura sigue siendo del panel. Se declara igual que en `ticket_types`
-- para que la tabla no dependa de que nadie use nunca el cliente del browser
-- con una sesión de admin.
drop policy if exists ticket_type_credentials_insert_admin
  on public.ticket_type_credentials;
drop policy if exists ticket_type_credentials_update_admin
  on public.ticket_type_credentials;
drop policy if exists ticket_type_credentials_delete_admin
  on public.ticket_type_credentials;

create policy ticket_type_credentials_insert_admin
  on public.ticket_type_credentials for insert to authenticated
  with check ((select plu_private.is_admin()));
create policy ticket_type_credentials_update_admin
  on public.ticket_type_credentials for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));
create policy ticket_type_credentials_delete_admin
  on public.ticket_type_credentials for delete to authenticated
  using ((select plu_private.is_admin()));

grant select on public.ticket_type_credentials to anon, authenticated;
grant insert, update, delete on public.ticket_type_credentials to authenticated;
