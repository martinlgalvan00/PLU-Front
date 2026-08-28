-- Una decision manual activa del entrenador tiene prioridad sobre una
-- notificacion tardia de Mercado Pago que informa rechazo o cancelacion.
--
-- No desactiva la validacion de Mercado Pago: el webhook sigue registrando el
-- intento y su estado. Solo evita que un fallo del proveedor revoque un
-- derecho que el staff ya reviso y acepto manualmente. Una baja manual cambia
-- `manual_override_status` a `cancelada`, por lo que no queda bloqueada.

create or replace function public.preserve_manual_membership_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'activa'
     and old.manual_override_status = 'activa'
     and new.status in ('cancelada', 'reembolsada')
     and new.manual_override_status = 'activa' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_preserve_manual_override on public.memberships;

create trigger memberships_preserve_manual_override
before update of status on public.memberships
for each row
execute function public.preserve_manual_membership_override();

revoke all on function public.preserve_manual_membership_override() from public, anon, authenticated;

