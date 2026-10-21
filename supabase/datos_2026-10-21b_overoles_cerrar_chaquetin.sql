-- =====================================================================
-- Datos 2026-10-21 (b) — Overoles: nueva operación "CERRAR CHAQUETIN /
-- CERRAR COSTADO" y folios recorridos
-- =====================================================================
-- Fuente: "overoles 2026.xlsx" de Alfredo. Cada overol trae una parte nueva
-- CERRAR CHAQUETIN → Cerrar costado (0.30 × 2 = 0.60 → 60 s), justo
-- después de ESPALDA. Pedido de Alfredo: meterla ahí y recorrer los folios
-- siguientes uno hacia abajo para que el folio siga el orden del Excel.
-- Los segundos que ya estaban (incluidas las 7 operaciones divididas entre
-- 3) no se tocan; solo cambia el folio.
--
--   OVEROL CON DOBLE REFLEJANTE  nueva 1322; 1322–1362 → 1323–1363
--   OVEROL CIENEGA               nueva 1420; 1420–1459 → 1421–1460
--   OVEROL MILPILLAS             nueva 1520; 1520–1560 → 1521–1561
--
-- Excepción a "un folio nunca se reutiliza": estos folios se cargaron hoy
-- y no tienen ninguna captura de producción (prod_registros). Si ya la
-- tuvieran, o si el catálogo de overoles cambió desde la carga, no se hace
-- nada.
-- =====================================================================
do $$
declare
  v_hash text;
begin
  if exists (select 1 from public.prod_registros where folio_operacion between 1300 and 1599) then
    raise exception 'Ya hay producción capturada con folios de overoles. No se cambió nada.';
  end if;

  select md5(string_agg(folio || '|' || prenda || '|' || parte || '|' || operacion || '|' || segundos || '|' || activa, ';' order by folio))
    into v_hash
    from public.prod_operaciones where folio between 1300 and 1599;
  if v_hash is distinct from '1b7e5f78f15074a5a654efa9dd777df3' then
    raise exception 'El catálogo de overoles cambió desde la carga (hash %). No se cambió nada.', v_hash;
  end if;

  -- Recorrer en dos pasos para no chocar con la llave del folio.
  update public.prod_operaciones
     set folio = folio + 100000
   where folio between 1322 and 1362 or folio between 1420 and 1459 or folio between 1520 and 1560;
  update public.prod_operaciones
     set folio = folio - 100000 + 1, updated_at = now()
   where folio >= 100000;

  insert into public.prod_operaciones (folio, prenda, parte, operacion, segundos) values
    (1322, 'OVEROL CON DOBLE REFLEJANTE', 'CERRAR CHAQUETIN', 'CERRAR COSTADO', 60),
    (1420, 'OVEROL CIENEGA', 'CERRAR CHAQUETIN', 'CERRAR COSTADO', 60),
    (1520, 'OVEROL MILPILLAS', 'CERRAR CHAQUETIN', 'CERRAR COSTADO', 60);

  select md5(string_agg(folio || '|' || prenda || '|' || parte || '|' || operacion || '|' || segundos || '|' || activa, ';' order by folio))
    into v_hash
    from public.prod_operaciones where folio between 1300 and 1599;
  if v_hash is distinct from '63121e7249246844e2243fe10191db93' then
    raise exception 'El resultado no es el esperado (hash %). No se cambió nada.', v_hash;
  end if;
end $$;
