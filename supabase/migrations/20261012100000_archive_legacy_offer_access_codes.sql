-- Las filas históricas kind = offer/access quedaron solo con active = false
-- (20260915100000) y seguían vivas en el índice único parcial
-- discount_codes_org_code_live_uidx (archived_at is null). El panel de Tarifas
-- las filtra, así que bloqueaban "Ya existe un código..." sin verse.
-- Archivarlas libera el nombre y alinea listado + unicidad.

update public.discount_codes
set archived_at = coalesce(archived_at, now()),
    active = false,
    updated_at = now()
where kind in ('offer', 'access')
  and archived_at is null;

create or replace function plu_private.disable_code_generated_exclusive_offer()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
begin
  if new.kind in ('offer', 'access') then
    new.active := false;
    -- Sale del unique live y del catálogo staff (archived_at is null).
    new.archived_at := coalesce(new.archived_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists discount_codes_disable_code_generated_exclusive_offer on public.discount_codes;
create trigger discount_codes_disable_code_generated_exclusive_offer
before insert or update of kind, active, archived_at on public.discount_codes
for each row
execute function plu_private.disable_code_generated_exclusive_offer();

comment on function plu_private.disable_code_generated_exclusive_offer() is
  'Garantiza que las modalidades históricas offer/access queden inactivas y archivadas (fuera del unique live y del panel).';
