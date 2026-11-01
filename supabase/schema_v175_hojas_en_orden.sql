-- =====================================================================
-- V175 — Hojas impresas como opción en la orden (2026-11-01)
-- =====================================================================
-- Pedido de Alfredo: al imprimir operaciones desde Admin producción se le
-- pone un título (p. ej. "CHAMARRA VASCO DE QUIROGA SECUNDARIA") y la hoja
-- se guarda en «Hojas impresas» (V173). Luego esa hoja se puede escoger en
-- una prenda de la orden y sale en el PDF interno.
--
-- No se crean operaciones ni folios: la hoja guarda los folios originales,
-- así la captura de producción sigue igual.
--
-- «Hojas impresas» solo lo leen los de producción (V173), pero las órdenes
-- las hace ventas. Estas dos funciones dejan ver SOLO lo que va en la hoja
-- (título, prenda, folio, parte, operación y segundos) a quien tenga rol.
--
-- Qué agrega:
--   · hojas_para_orden(): id, título y prenda de las hojas guardadas.
--   · hojas_operaciones_para_orden(ids[]): esas hojas con sus operaciones.
-- Aditivo: no cambia tablas ni funciones existentes.
--
-- Rollback:
--   drop function public.hojas_para_orden();
--   drop function public.hojas_operaciones_para_orden(uuid[]);
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.hojas_impresas') is null or to_regprocedure('public.current_user_role()') is null then
    raise exception 'V175: falta hojas_impresas (V173) o current_user_role. No se aplicó nada.';
  end if;
end $$;

create or replace function public.hojas_para_orden()
returns table (id uuid, titulo text, prenda text)
language sql stable security definer set search_path = public as $$
  select h.id, h.titulo, h.prenda
    from public.hojas_impresas h
   where h.eliminada_en is null and public.current_user_role() is not null
   order by h.titulo;
$$;
revoke execute on function public.hojas_para_orden() from public, anon;
grant execute on function public.hojas_para_orden() to authenticated;

create or replace function public.hojas_operaciones_para_orden(p_ids uuid[])
returns table (id uuid, titulo text, prenda text, operaciones jsonb)
language sql stable security definer set search_path = public as $$
  select h.id, h.titulo, h.prenda, h.operaciones
    from public.hojas_impresas h
   where h.eliminada_en is null
     and h.id = any(coalesce(p_ids, '{}'))
     and public.current_user_role() is not null;
$$;
revoke execute on function public.hojas_operaciones_para_orden(uuid[]) from public, anon;
grant execute on function public.hojas_operaciones_para_orden(uuid[]) to authenticated;

-- Verificación (solo lectura):
select proname from pg_proc where proname in ('hojas_para_orden', 'hojas_operaciones_para_orden');
-- 2 renglones
