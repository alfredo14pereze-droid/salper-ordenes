-- Arreglo de datos (no es migración de esquema) — 2026-10-04
-- 1) Mis pruebas de V129 (bloque que se revertía) quemaron los folios P-0015 y P-0016: las
--    secuencias de Postgres no se revierten. Los 3 pendientes reales quedaron P-0017/18/19; se
--    renumeran a P-0015/16/17 y se reajusta la secuencia para que el siguiente sea P-0018.
-- 2) Se borra el tipo de orden duplicado/mal escrito "borado" (0 órdenes y 0 plantillas lo usan;
--    "bordado" se queda).
do $$
declare n_hist integer; n_ord integer; n_tpl integer; v_next bigint;
begin
  -- guardas: exactamente lo que se vio al revisar
  if (select count(*) from public.pf_pendientes where folio in ('P-0015', 'P-0016')) <> 0 then
    raise exception 'Ya existe P-0015 o P-0016: no se renumera nada.';
  end if;
  if (select count(*) from public.pf_pendientes where folio in ('P-0017', 'P-0018', 'P-0019')) <> 3 then
    raise exception 'No están los 3 pendientes P-0017/18/19 esperados.';
  end if;
  if exists (select 1 from public.pf_pendientes where folio > 'P-0019') then
    raise exception 'Hay pendientes posteriores a P-0019: no se renumera nada.';
  end if;

  update public.pf_pendientes set folio = 'P-0015' where folio = 'P-0017';
  update public.pf_pendientes set folio = 'P-0016' where folio = 'P-0018';
  update public.pf_pendientes set folio = 'P-0017' where folio = 'P-0019';
  perform setval('public.pf_folio_seq', 17, true);   -- el siguiente nextval() será 18

  -- tipo "borado"
  select count(*) into n_ord from public.orders where order_type_key = 'borado';
  select count(*) into n_tpl from public.order_templates where order_type_key = 'borado';
  if n_ord <> 0 or n_tpl <> 0 then
    raise exception 'El tipo "borado" sí tiene órdenes (%) o plantillas (%): no se borra.', n_ord, n_tpl;
  end if;
  delete from public.order_types where key = 'borado';
end $$;
