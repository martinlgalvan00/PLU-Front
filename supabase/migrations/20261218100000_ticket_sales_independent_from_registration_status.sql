-- La inscripción de atletas y la venta de entradas tienen controles propios.
-- Cerrar la inscripción (`events.status = 'cerrado'`) no debe impedir que el
-- público compre entradas: el interruptor, las ventanas y los cupos de tickets
-- continúan siendo la autoridad. Un evento finalizado sí sigue siendo terminal.

do $migration$
declare
  v_function_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.create_ticket_order_v3(text,jsonb,jsonb,text,text,text)'::regprocedure
  )
  into v_function_definition;

  if v_function_definition is null then
    raise exception 'No existe create_ticket_order_v3; no se puede actualizar la regla de venta de entradas.'
      using errcode = 'PLU01';
  end if;

  v_updated_definition := replace(
    v_function_definition,
    'if v_event.status in (''cerrado'', ''finalizado'') then',
    'if v_event.status = ''finalizado'' then'
  );

  if v_updated_definition = v_function_definition then
    raise exception 'create_ticket_order_v3 no contiene la regla esperada para el estado cerrado.'
      using errcode = 'PLU01';
  end if;

  execute v_updated_definition;
end
$migration$;

do $verification$
declare
  v_function_definition text;
begin
  select pg_get_functiondef(
    'public.create_ticket_order_v3(text,jsonb,jsonb,text,text,text)'::regprocedure
  )
  into v_function_definition;

  if position('v_event.status in (''cerrado'', ''finalizado'')' in v_function_definition) > 0
     or position('v_event.status = ''finalizado''' in v_function_definition) = 0 then
    raise exception 'La regla de estados de create_ticket_order_v3 no quedó aplicada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
