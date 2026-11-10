-- =====================================================================
-- V200 — Costura puede VER las hojas de operaciones impresas (solo lectura)
-- =====================================================================
-- Pedido de Alfredo (2026-11-09): que la persona de costura (Carmen) vea las
-- hojas que ya se imprimieron («Hojas impresas»). Nada más.
--
-- Qué cambia: SOLO la política de lectura de public.hojas_impresas. Además de
-- quien ya la veía (puede_ver_hojas_impresas(), V177), ahora la ven los roles
-- 'costura' y 'produccion' (el rol viejo de costura, por si Carmen lo sigue
-- teniendo).
--
-- Qué NO cambia:
--   * puede_ver_hojas_impresas() queda igual, así costura NO puede registrar
--     impresiones (registrar_hoja_impresa), ni editar ni quitar hojas.
--   * La tabla no tiene políticas de escritura (todo pasa por funciones), así
--     que costura sigue sin poder crear/editar/borrar nada.
--   * prod_operaciones, prod_config y el cotizador no se tocan.
--   * La copia de operaciones de cada hoja solo trae folio, prenda, parte,
--     operación y segundos: ningún precio ni costo.
--
-- Compatible con V1: solo amplía quién puede leer; no cambia columnas.
-- Rollback (deja la regla de V177):
--   drop policy if exists "Lectura hojas_impresas" on public.hojas_impresas;
--   create policy "Lectura hojas_impresas" on public.hojas_impresas
--     for select to authenticated using (eliminada_en is null and public.puede_ver_hojas_impresas());
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.hojas_impresas') is null
     or to_regprocedure('public.puede_ver_hojas_impresas()') is null
     or to_regprocedure('public.current_user_role()') is null then
    raise exception 'V200: falta hojas_impresas, puede_ver_hojas_impresas o current_user_role (V173/V177). No se aplicó nada.';
  end if;
end $$;

drop policy if exists "Lectura hojas_impresas" on public.hojas_impresas;
create policy "Lectura hojas_impresas" on public.hojas_impresas
  for select to authenticated using (
    eliminada_en is null
    and (
      public.puede_ver_hojas_impresas()
      or coalesce(public.current_user_role(), '') in ('costura', 'produccion')
    )
  );

-- Verificación (solo lectura):
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--    where polrelid = 'public.hojas_impresas'::regclass;
--   -- 1 renglón, con 'costura' y 'produccion' en la regla
