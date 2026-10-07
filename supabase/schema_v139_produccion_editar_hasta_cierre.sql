-- =====================================================================
-- V139 — Producción: editar/borrar registros hasta el cierre real de la semana
-- =====================================================================
-- Síntoma (2026-10-07): a Juanis (captura_produccion) le sale "Esta semana ya no
-- está abierta para captura." al editar o borrar un registro, aunque la semana
-- (30 sep – 6 oct) sigue "abierta".
--
-- Causa: prod_puede_editar_semana conservaba la regla de V69 para quien no es
-- administrador (y con el interruptor de semanas cerradas apagado): solo deja
-- editar mientras p_fin >= hoy, es decir, hasta el martes. Pero desde V104/V106
-- la semana cierra el JUEVES a las 11:00 (fecha_fin + 2 días, hora Monterrey), y
-- capturar registros nuevos ya seguía esa regla. Resultado: miércoles y jueves
-- antes de las 11 se podía capturar pero no corregir.
--
-- Arreglo: la regla de editar/borrar usa la misma hora de cierre que
-- prod_cerrar_vencidas. Lo demás queda igual (aprobada nunca; administración
-- siempre; interruptor de semanas cerradas igual que en V123).
-- Misma firma y mismos permisos: solo cambia una línea.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.prod_puede_editar_semana(text,date)') is null then
    raise exception 'V139: no encontré prod_puede_editar_semana(text,date). No se aplicó nada.';
  end if;
end $$;

create or replace function public.prod_puede_editar_semana(p_estado text, p_fin date)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_estado = 'aprobada' then false
    when public.prod_puede_ver_montos() then true
    when public.prod_captura_semanas_anteriores() and p_estado in ('abierta', 'en_revision') then true
    else p_estado = 'abierta'
         and (now() at time zone 'America/Monterrey') < (p_fin + 2)::timestamp + interval '11 hours'
  end
$$;
revoke execute on function public.prod_puede_editar_semana(text, date) from public;
grant execute on function public.prod_puede_editar_semana(text, date) to authenticated;

commit;

-- Verificación (solo lectura):
--   select pg_get_functiondef('public.prod_puede_editar_semana(text,date)'::regprocedure) like '%interval ''11 hours''%';  -- true
--   select has_function_privilege('anon', 'public.prod_puede_editar_semana(text,date)', 'EXECUTE');                       -- false
