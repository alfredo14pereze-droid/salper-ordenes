-- =====================================================================
-- Datos 2026-11-06 — Frisa plantas: arranque con lo acumulado al 15/10/2026
-- =====================================================================
-- De salper-frisa (frisa_movimientos_2026-10-15.csv, el mismo cálculo del
-- "Resumen_stock_FRISA_2026-10-15"): por planta y clave, lo remitido y lo
-- facturado del 11/03 al 15/10/2026. 18,867 remitidas − 16,170 facturadas = 2,697 en plantas.
-- También guarda los folios ya contados (776 remisiones y 70 facturas) para que, al
-- subir archivos nuevos, esos documentos no se vuelvan a contar.
-- Solo corre si todavía no hay movimientos en plantas (se puede correr dos veces). Requiere V189.
-- =====================================================================

do $$
begin
  if exists (select 1 from public.frisa_pl_movimientos) then
    raise notice 'Ya hay movimientos en plantas: no se vuelve a cargar.';
    return;
  end if;

  with acumulado (planta, clave, remitido, facturado) as (
    values
  ('FRISA ACERIA', 'PLAFR-000L-01MLMA1IS', 357, 323),
  ('FRISA ACERIA', 'PLAFR-000M-01MLMA1IS', 447, 400),
  ('FRISA ACERIA', 'PLAFR-000S-01MLMA1IS', 92, 77),
  ('FRISA ACERIA', 'PLAFR-00XL-01MLMA1IS', 91, 83),
  ('FRISA AEROSPACE', 'BATFR-000L-01LABFR', 4, 3),
  ('FRISA AEROSPACE', 'CAMFR-000L-01MEZ1B', 248, 212),
  ('FRISA AEROSPACE', 'CAMFR-000L-01MZ1B1I', 41, 38),
  ('FRISA AEROSPACE', 'CAMFR-000M-01MZ1B', 266, 217),
  ('FRISA AEROSPACE', 'CAMFR-000M-01MZ1B1I', 65, 50),
  ('FRISA AEROSPACE', 'CAMFR-000S-01MZ1B', 165, 135),
  ('FRISA AEROSPACE', 'CAMFR-000S-01MZ1B1I', 25, 16),
  ('FRISA AEROSPACE', 'CAMFR-00XL-01MZ1B', 111, 94),
  ('FRISA AEROSPACE', 'CAMFR-00XL-01MZ1B1I', 18, 12),
  ('FRISA AEROSPACE', 'CAMFR-02XL-01MZ1B', 20, 16),
  ('FRISA AEROSPACE', 'CAMFR-03XL-01MZ1B', 12, 9),
  ('FRISA AEROSPACE', 'PANFR-0028-01MEZ', 34, 30),
  ('FRISA AEROSPACE', 'PANFR-0029-01MEZ', 16, 13),
  ('FRISA AEROSPACE', 'PANFR-0030-01MEZ', 111, 89),
  ('FRISA AEROSPACE', 'PANFR-0031-01MEZ', 30, 21),
  ('FRISA AEROSPACE', 'PANFR-0032-01MEZ', 345, 279),
  ('FRISA AEROSPACE', 'PANFR-0033-01MEZ', 106, 93),
  ('FRISA AEROSPACE', 'PANFR-0034-01MEZ', 446, 377),
  ('FRISA AEROSPACE', 'PANFR-0036-01MEZ', 401, 318),
  ('FRISA AEROSPACE', 'PANFR-0038-01MEZ', 235, 215),
  ('FRISA AEROSPACE', 'PANFR-0040-01MEZ', 104, 88),
  ('FRISA AEROSPACE', 'PANFR-0042-01MEZ', 47, 41),
  ('FRISA AEROSPACE', 'PANFR-0044-01MEZ', 17, 15),
  ('FRISA AEROSPACE', 'PANFR-0046-01MEZ', 16, 9),
  ('FRISA AEROSPACE', 'PLAFR-000L-01MCMA1I', 888, 767),
  ('FRISA AEROSPACE', 'PLAFR-000L-01MCOM1I', 22, 10),
  ('FRISA AEROSPACE', 'PLAFR-000L-01MCVE2I', 133, 111),
  ('FRISA AEROSPACE', 'PLAFR-000L-01MLMA1I', 490, 417),
  ('FRISA AEROSPACE', 'PLAFR-000M-01MCMA1I', 791, 687),
  ('FRISA AEROSPACE', 'PLAFR-000M-01MCOM1I', 26, 14),
  ('FRISA AEROSPACE', 'PLAFR-000M-01MCVE2I', 163, 132),
  ('FRISA AEROSPACE', 'PLAFR-000M-01MLMA1I', 644, 567),
  ('FRISA AEROSPACE', 'PLAFR-000S-01MCMA1I', 180, 157),
  ('FRISA AEROSPACE', 'PLAFR-000S-01MCOM1I', 22, 12),
  ('FRISA AEROSPACE', 'PLAFR-000S-01MCVE2I', 67, 54),
  ('FRISA AEROSPACE', 'PLAFR-000S-01MLMA1I', 153, 129),
  ('FRISA AEROSPACE', 'PLAFR-00XL-01MCMA1I', 357, 313),
  ('FRISA AEROSPACE', 'PLAFR-00XL-01MCOM1I', 7, 0),
  ('FRISA AEROSPACE', 'PLAFR-00XL-01MCVE2I', 52, 45),
  ('FRISA AEROSPACE', 'PLAFR-00XL-01MLMA1I', 136, 120),
  ('FRISA AEROSPACE', 'PLAFR-02XL-01MCMA1I', 78, 62),
  ('FRISA AEROSPACE', 'PLAFR-02XL-01MCVE2I', 2, 0),
  ('FRISA AEROSPACE', 'PLAFR-02XL-01MLMA1I', 29, 19),
  ('FRISA AEROSPACE', 'PLAFR-03XL-01MCMA1I', 15, 11),
  ('FRISA AEROSPACE', 'PLAFR-03XL-01MCVE2I', 5, 3),
  ('FRISA AEROSPACE', 'PLAFR-03XL-01MLMA1I', 21, 17),
  ('FRISA PRECISION', 'CAMFR-000L-01MEZ1B', 8, 6),
  ('FRISA PRECISION', 'CAMFR-000M-01MZ1B', 10, 8),
  ('FRISA PRECISION', 'CAMFR-000S-01MZ1B', 9, 6),
  ('FRISA PRECISION', 'PANFR-0030-01MEZ', 2, 0),
  ('FRISA PRECISION', 'PANFR-0032-01MEZ', 20, 17),
  ('FRISA PRECISION', 'PANFR-0033-01MEZ', 18, 16),
  ('FRISA PRECISION', 'PANFR-0034-01MEZ', 20, 15),
  ('FRISA PRECISION', 'PANFR-0036-01MEZ', 25, 16),
  ('FRISA PRECISION', 'PLAFR-000L-01MCMA1I', 32, 25),
  ('FRISA PRECISION', 'PLAFR-000L-01MLMA1I', 47, 33),
  ('FRISA PRECISION', 'PLAFR-000M-01MCMA1I', 26, 14),
  ('FRISA PRECISION', 'PLAFR-000M-01MLMA1I', 36, 36),
  ('FRISA PRECISION', 'PLAFR-000S-01MCMA1I', 6, 4),
  ('FRISA PRECISION', 'PLAFR-000S-01MLMA1I', 6, 4),
  ('FRISA PRECISION', 'PLAFR-00XL-01MCMA1I', 19, 13),
  ('FRISA PRECISION', 'PLAFR-00XL-01MLMA1I', 16, 19),
  ('FRISA PRECISION', 'PLAFR-02XL-01MCMA1I', 2, 0),
  ('FRISA SANTA CATARINA', 'CAMFR-000L-01MEZ1B', 82, 69),
  ('FRISA SANTA CATARINA', 'CAMFR-000L-01MZ1B1I', 9, 7),
  ('FRISA SANTA CATARINA', 'CAMFR-000M-01MZ1B', 165, 137),
  ('FRISA SANTA CATARINA', 'CAMFR-000M-01MZ1B1I', 20, 16),
  ('FRISA SANTA CATARINA', 'CAMFR-000S-01MZ1B', 69, 62),
  ('FRISA SANTA CATARINA', 'CAMFR-000S-01MZ1B1I', 8, 6),
  ('FRISA SANTA CATARINA', 'CAMFR-00XL-01MZ1B', 54, 51),
  ('FRISA SANTA CATARINA', 'CAMFR-00XL-01MZ1B1I', 3, 2),
  ('FRISA SANTA CATARINA', 'PANFR-0028-01MEZ', 16, 14),
  ('FRISA SANTA CATARINA', 'PANFR-0029-01MEZ', 9, 7),
  ('FRISA SANTA CATARINA', 'PANFR-0030-01MEZ', 65, 54),
  ('FRISA SANTA CATARINA', 'PANFR-0031-01MEZ', 42, 38),
  ('FRISA SANTA CATARINA', 'PANFR-0032-01MEZ', 179, 155),
  ('FRISA SANTA CATARINA', 'PANFR-0033-01MEZ', 54, 43),
  ('FRISA SANTA CATARINA', 'PANFR-0034-01MEZ', 264, 234),
  ('FRISA SANTA CATARINA', 'PANFR-0036-01MEZ', 243, 202),
  ('FRISA SANTA CATARINA', 'PANFR-0038-01MEZ', 154, 137),
  ('FRISA SANTA CATARINA', 'PANFR-0040-01MEZ', 28, 23),
  ('FRISA SANTA CATARINA', 'PANFR-0042-01MEZ', 13, 9),
  ('FRISA SANTA CATARINA', 'PANFR-0044-01MEZ', 18, 14),
  ('FRISA SANTA CATARINA', 'PANFR-0046-01MEZ', 2, 0),
  ('FRISA SANTA CATARINA', 'PANFR-0048-01MEZ', 3, 1),
  ('FRISA SANTA CATARINA', 'PLAFR-000L-01MCMA1I', 402, 340),
  ('FRISA SANTA CATARINA', 'PLAFR-000L-01MCRO2I', 47, 41),
  ('FRISA SANTA CATARINA', 'PLAFR-000L-01MCVE2I', 15, 0),
  ('FRISA SANTA CATARINA', 'PLAFR-000L-01MLMA1I', 268, 244),
  ('FRISA SANTA CATARINA', 'PLAFR-000M-01MCMA1I', 354, 331),
  ('FRISA SANTA CATARINA', 'PLAFR-000M-01MCRO2I', 101, 92),
  ('FRISA SANTA CATARINA', 'PLAFR-000M-01MCVE2I', 15, 0),
  ('FRISA SANTA CATARINA', 'PLAFR-000M-01MLMA1I', 283, 246),
  ('FRISA SANTA CATARINA', 'PLAFR-000S-01MCMA1I', 65, 58),
  ('FRISA SANTA CATARINA', 'PLAFR-000S-01MCVE2I', 10, 0),
  ('FRISA SANTA CATARINA', 'PLAFR-000S-01MLMA1I', 29, 22),
  ('FRISA SANTA CATARINA', 'PLAFR-00XL-01MCMA1I', 188, 165),
  ('FRISA SANTA CATARINA', 'PLAFR-00XL-01MCRO2I', 12, 5),
  ('FRISA SANTA CATARINA', 'PLAFR-00XL-01MCVE2I', 10, 0),
  ('FRISA SANTA CATARINA', 'PLAFR-00XL-01MLMA1I', 68, 61),
  ('FRISA SANTA CATARINA', 'PLAFR-02XL-01MCMA1I', 26, 17),
  ('FRISA SANTA CATARINA', 'PLAFR-02XL-01MCVE2I', 3, 0),
  ('FRISA SANTA CATARINA', 'PLAFR-02XL-01MLMA1I', 7, 5),
  ('FRISA SANTA CATARINA', 'PLAFR-03XL-01MCMA1I', 9, 7),
  ('FRISA SANTA CATARINA', 'PLAFR-03XL-01MCVE2I', 2, 0),
  ('FRISA SANTA CATARINA', 'PLAFR-03XL-01MLMA1I', 6, 2),
  ('FRISA VILLA GARCIA', 'CAMFR-000L-01MEZ1B', 206, 192),
  ('FRISA VILLA GARCIA', 'CAMFR-000L-01MZ1B1I', 15, 12),
  ('FRISA VILLA GARCIA', 'CAMFR-000M-01MZ1B', 261, 238),
  ('FRISA VILLA GARCIA', 'CAMFR-000M-01MZ1B1I', 26, 17),
  ('FRISA VILLA GARCIA', 'CAMFR-000S-01MZ1B', 115, 106),
  ('FRISA VILLA GARCIA', 'CAMFR-000S-01MZ1B1I', 3, 2),
  ('FRISA VILLA GARCIA', 'CAMFR-00XL-01MZ1B', 94, 83),
  ('FRISA VILLA GARCIA', 'CAMFR-00XL-01MZ1B1I', 8, 6),
  ('FRISA VILLA GARCIA', 'PANFR-0028-01MEZ', 16, 11),
  ('FRISA VILLA GARCIA', 'PANFR-0029-01MEZ', 7, 5),
  ('FRISA VILLA GARCIA', 'PANFR-0030-01MEZ', 111, 90),
  ('FRISA VILLA GARCIA', 'PANFR-0031-01MEZ', 35, 29),
  ('FRISA VILLA GARCIA', 'PANFR-0032-01MEZ', 291, 258),
  ('FRISA VILLA GARCIA', 'PANFR-0033-01MEZ', 86, 69),
  ('FRISA VILLA GARCIA', 'PANFR-0034-01MEZ', 489, 442),
  ('FRISA VILLA GARCIA', 'PANFR-0036-01MEZ', 468, 362),
  ('FRISA VILLA GARCIA', 'PANFR-0038-01MEZ', 243, 207),
  ('FRISA VILLA GARCIA', 'PANFR-0040-01MEZ', 72, 59),
  ('FRISA VILLA GARCIA', 'PANFR-0042-01MEZ', 51, 44),
  ('FRISA VILLA GARCIA', 'PANFR-0044-01MEZ', 22, 16),
  ('FRISA VILLA GARCIA', 'PANFR-0046-01MEZ', 9, 6),
  ('FRISA VILLA GARCIA', 'PANFR-0048-01MEZ', 1, 0),
  ('FRISA VILLA GARCIA', 'PANFR-3434-01MEZ', 8, 6),
  ('FRISA VILLA GARCIA', 'PANFR-3634-01MEZ', 11, 8),
  ('FRISA VILLA GARCIA', 'PLAFR-000L-01MCMA1I', 932, 825),
  ('FRISA VILLA GARCIA', 'PLAFR-000L-01MCRO2I', 89, 69),
  ('FRISA VILLA GARCIA', 'PLAFR-000L-01MCVE2I', 42, 29),
  ('FRISA VILLA GARCIA', 'PLAFR-000L-01MLMA1I', 493, 443),
  ('FRISA VILLA GARCIA', 'PLAFR-000M-01MCMA1I', 993, 866),
  ('FRISA VILLA GARCIA', 'PLAFR-000M-01MCOM1I', 7, 0),
  ('FRISA VILLA GARCIA', 'PLAFR-000M-01MCRO2I', 144, 135),
  ('FRISA VILLA GARCIA', 'PLAFR-000M-01MCVE2I', 73, 58),
  ('FRISA VILLA GARCIA', 'PLAFR-000M-01MLMA1I', 513, 480),
  ('FRISA VILLA GARCIA', 'PLAFR-000S-01MCMA1I', 146, 130),
  ('FRISA VILLA GARCIA', 'PLAFR-000S-01MCVE2I', 20, 14),
  ('FRISA VILLA GARCIA', 'PLAFR-000S-01MLMA1I', 74, 68),
  ('FRISA VILLA GARCIA', 'PLAFR-00XL-01MCMA1I', 452, 405),
  ('FRISA VILLA GARCIA', 'PLAFR-00XL-01MCRO2I', 49, 42),
  ('FRISA VILLA GARCIA', 'PLAFR-00XL-01MCVE2I', 26, 16),
  ('FRISA VILLA GARCIA', 'PLAFR-00XL-01MLMA1I', 156, 136),
  ('FRISA VILLA GARCIA', 'PLAFR-02XL-01MCMA1I', 66, 59),
  ('FRISA VILLA GARCIA', 'PLAFR-02XL-01MCVE2I', 3, 0),
  ('FRISA VILLA GARCIA', 'PLAFR-02XL-01MLMA1I', 39, 35),
  ('FRISA VILLA GARCIA', 'PLAFR-03XL-01MCMA1I', 16, 15),
  ('FRISA VILLA GARCIA', 'PLAFR-03XL-01MCVE2I', 2, 0),
  ('FRISA VILLA GARCIA', 'PLAFR-03XL-01MLMA1I', 11, 8)
  ), ligado as (
    select pl.id as planta_id, p.id as producto_id, p.clave, a.remitido, a.facturado
    from acumulado a
    join public.frisa_pl_plantas pl on upper(pl.nombre_microsip) = a.planta
    join public.frisa_productos_niveles p on lower(p.clave) = lower(a.clave)
  )
  insert into public.frisa_pl_movimientos (planta_id, producto_id, clave, tipo, cantidad, folio, fecha, notas, creado_por, creado_por_nombre)
  select planta_id, producto_id, clave, 'remision', remitido, 'Acumulado al 15/10/2026', date '2026-10-15', 'Carga inicial (salper-frisa)', null::uuid, 'Carga inicial'
  from ligado where remitido > 0
  union all
  select planta_id, producto_id, clave, 'factura', -facturado, 'Acumulado al 15/10/2026', date '2026-10-15', 'Carga inicial (salper-frisa)', null::uuid, 'Carga inicial'
  from ligado where facturado > 0;

  -- Folios ya contados, por rangos (los huecos son folios que no son de Frisa).
  insert into public.frisa_pl_folios (tipo, folio)
  select 'remision', n::text
  from (values (27,54), (60,61), (63,796), (798,809)) as r(desde, hasta), generate_series(r.desde, r.hasta) n
  on conflict do nothing;
  insert into public.frisa_pl_folios (tipo, folio)
  select 'factura', 'FS' || n
  from (values (1125,1129), (1135,1136), (1138,1139), (1211,1216), (1282,1282), (1284,1284), (1286,1288), (1369,1369), (1371,1374), (1446,1446), (1448,1451), (1509,1513), (1596,1600), (1647,1651), (1720,1724), (1808,1812), (1901,1905), (2016,2020), (2094,2098)) as r(desde, hasta), generate_series(r.desde, r.hasta) n
  on conflict do nothing;
end $$;

-- Comprobación: debe dar 18867 remitidas, 16170 facturadas, 2697 en plantas, 776 remisiones y 70 facturas.
select (select coalesce(sum(cantidad), 0) from public.frisa_pl_movimientos where tipo = 'remision') as remitidas,
       (select coalesce(-sum(cantidad), 0) from public.frisa_pl_movimientos where tipo = 'factura') as facturadas,
       (select coalesce(sum(cantidad), 0) from public.frisa_pl_movimientos) as en_plantas,
       (select count(*) from public.frisa_pl_folios where tipo = 'remision') as remisiones,
       (select count(*) from public.frisa_pl_folios where tipo = 'factura') as facturas;
