-- Los egresos financieros se operan exclusivamente desde Express con
-- service_role. RLS deja la tabla cerrada ante cualquier acceso directo del
-- navegador y conserva el acceso server-side ya usado por la RPC y Finanzas.
alter table public.financial_expenses enable row level security;

revoke all on table public.financial_expenses from public, anon, authenticated;
grant select, insert, update, delete on table public.financial_expenses to service_role;
