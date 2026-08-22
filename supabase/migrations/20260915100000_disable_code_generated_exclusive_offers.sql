-- Las ofertas exclusivas generadas por código están retiradas de PLU ARG.
-- Se preserva la historia contable, pero ninguna fila nueva o existente puede
-- quedar activa ni volver a alimentar una superficie comercial.

update public.discount_codes
set active = false,
    updated_at = now()
where kind in ('offer', 'access')
  and active is distinct from false;

create or replace function plu_private.disable_code_generated_exclusive_offer()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
begin
  if new.kind in ('offer', 'access') then
    new.active := false;
  end if;
  return new;
end;
$$;

drop trigger if exists discount_codes_disable_code_generated_exclusive_offer on public.discount_codes;
create trigger discount_codes_disable_code_generated_exclusive_offer
before insert or update of kind, active on public.discount_codes
for each row
execute function plu_private.disable_code_generated_exclusive_offer();

comment on function plu_private.disable_code_generated_exclusive_offer() is
  'Garantiza que las modalidades históricas offer/access nunca queden activas ni puedan mostrarse o comprarse.';
