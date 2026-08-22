-- ---------------------------------------------------------------------------
-- El tombstone de staff_set_membership_status usa sus parámetros
-- ---------------------------------------------------------------------------
--
-- La firma de 3 argumentos sigue negándose (20260910100000), pero su cuerpo
-- ignoraba los parámetros y `supabase db lint --fail-on warning` corta el CI
-- por eso. En vez de silenciar el linter, la excepción ahora dice qué llamada
-- rechazó: mismo mensaje, mismo errcode PLU01, con el detalle de membership,
-- estado y actor que el caller viejo intentó colar.

create or replace function public.staff_set_membership_status(
  p_membership_id uuid,
  p_status text,
  p_actor text
)
returns jsonb
language plpgsql
as $$
begin
  raise exception 'Usa staff_set_membership_status(uuid, text, text, text, text): la activacion o baja manual exige motivo y canal.'
    using errcode = 'PLU01',
      detail = format(
        'Llamada rechazada: membership %s, estado %s, actor %s.',
        p_membership_id, p_status, p_actor
      );
end;
$$;

-- create or replace conserva los privilegios, pero el cierre se re-declara
-- para que esta migración se sostenga sola si alguien la lee aislada.
revoke all on function public.staff_set_membership_status(uuid, text, text)
  from public, anon, authenticated;

do $verification$
declare
  v_legacy_ok boolean;
begin
  -- La firma de 3 argumentos tiene que seguir negándose después del reemplazo.
  begin
    perform public.staff_set_membership_status(
      '00000000-0000-0000-0000-000000000000'::uuid, 'activa', 'verificacion'
    );
    v_legacy_ok := false;
  exception when others then
    v_legacy_ok := true;
  end;
  if not v_legacy_ok then
    raise exception 'staff_set_membership_status(uuid,text,text) sigue aceptando cambios sin motivo.'
      using errcode = 'PLU01';
  end if;
end;
$verification$;
