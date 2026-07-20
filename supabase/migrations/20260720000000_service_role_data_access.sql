-- El backend Express usa exclusivamente la service_role para acceder a los
-- dominios transaccionales. RLS no reemplaza los privilegios SQL base: aun
-- siendo BYPASSRLS, el rol necesita permisos sobre schema, tablas y secuencias.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select, update
  on all sequences in schema public
  to service_role;

-- Mantiene el contrato para objetos public creados por migraciones futuras.
-- No se amplian permisos de anon/authenticated ni la ejecucion de funciones:
-- los RPC sensibles conservan sus GRANT EXECUTE explicitos.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select, update on sequences to service_role;
