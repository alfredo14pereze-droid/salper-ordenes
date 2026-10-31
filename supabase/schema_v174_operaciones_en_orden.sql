-- =====================================================================
-- V174 — Operaciones de producción en el PDF de la orden (2026-10-31)
-- =====================================================================
-- Pedido de Alfredo: que el PDF interno de la orden traiga la hoja de
-- operaciones de cada prenda (p. ej. CHAMARRA DOMUS), agrupada por parte.
--
-- El catálogo de operaciones hoy solo lo leen los de producción (V88), pero
-- las órdenes las hace ventas. Estas dos funciones dejan que cualquiera con
-- sesión y rol vea SOLO lo que va en esa hoja: nombre de prenda, folio,
-- parte, operación y segundos de las operaciones activas. No dan acceso a la
-- tabla, ni a operadoras, capturas, premios o precios.
--
-- Qué agrega:
--   · prendas_con_operaciones(): lista de prendas con operaciones activas
--     (para escoger en cada prenda de la orden).
--   · operaciones_para_orden(prendas[]): operaciones activas de esas prendas.
-- La prenda escogida se guarda dentro de orders.items (clave
-- prenda_operaciones); items ya es jsonb libre, no se cambia ninguna tabla.
--
-- Aditivo: no toca nada existente.
--
-- Rollback:
--   drop function public.prendas_con_operaciones();
--   drop function public.operaciones_para_orden(text[]);
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.prod_operaciones') is null or to_regprocedure('public.current_user_role()') is null then
    raise exception 'V174: falta prod_operaciones o current_user_role. No se aplicó nada.';
  end if;
end $$;

create or replace function public.prendas_con_operaciones()
returns table (prenda text)
language sql stable security definer set search_path = public as $$
  select distinct o.prenda
    from public.prod_operaciones o
   where o.activa and public.current_user_role() is not null
   order by 1;
$$;
revoke execute on function public.prendas_con_operaciones() from public, anon;
grant execute on function public.prendas_con_operaciones() to authenticated;

create or replace function public.operaciones_para_orden(p_prendas text[])
returns table (folio integer, prenda text, parte text, operacion text, segundos numeric)
language sql stable security definer set search_path = public as $$
  select o.folio, o.prenda, o.parte, o.operacion, o.segundos
    from public.prod_operaciones o
   where o.activa
     and o.prenda = any(coalesce(p_prendas, '{}'))
     and public.current_user_role() is not null
   order by o.prenda, o.folio;
$$;
revoke execute on function public.operaciones_para_orden(text[]) from public, anon;
grant execute on function public.operaciones_para_orden(text[]) to authenticated;

-- Verificación (solo lectura):
--   select proname from pg_proc where proname in ('prendas_con_operaciones', 'operaciones_para_orden');
--   -- 2 renglones
