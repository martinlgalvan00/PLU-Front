-- El lint de plpgsql falla con --fail-on warning: generate_ticket_gate_code
-- declaraba `i` y el FOR de enteros declara otra `i` con el mismo nombre.
-- La del DECLARE quedaba sin usar. El bucle no necesita declararla.

create or replace function public.generate_ticket_gate_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw text := '';
begin
  for i in 1..6 loop
    raw := raw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(raw, 1, 3) || '-' || substr(raw, 4, 3);
end;
$$;
