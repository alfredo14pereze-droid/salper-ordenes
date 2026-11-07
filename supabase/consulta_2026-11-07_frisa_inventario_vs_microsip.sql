select * from (
  with microsip (clave, existencia) as (values
  ('BATFR-000L-01LABFR', 8),
  ('CAMFR-000L-01MEZ1B', 127),
  ('CAMFR-000L-01MZ1B1I', 0),
  ('CAMFR-000M-01MZ1B', 129),
  ('CAMFR-000S-01MZ1B', 125),
  ('CAMFR-00XL-01MZ1B', 15),
  ('CAMFR-00XL-01MZ1B1I', 3),
  ('CAMFR-02XL-01MZ1B', 23),
  ('CAMFR-02XL-01MZ1B1I', 10),
  ('CAMFR-03XL-01MZ1B1I', 10),
  ('PANFR-0028-01MEZ', 56),
  ('PANFR-0029-01MEZ', 80),
  ('PANFR-0030-01MEZ', 44),
  ('PANFR-0031-01MEZ', 60),
  ('PANFR-0032-01MEZ', 124),
  ('PANFR-0033-01MEZ', 33),
  ('PANFR-0034-01MEZ', 93),
  ('PANFR-0036-01MEZ', 31),
  ('PANFR-0038-01MEZ', 174),
  ('PANFR-0040-01MEZ', 41),
  ('PANFR-0042-01MEZ', 45),
  ('PANFR-0044-01MEZ', 8),
  ('PANFR-0046-01MEZ', 15),
  ('PANFR-0048-01MEZ', 16),
  ('PANFR-3234-01MEZ', 20),
  ('PANFR-3434-01MEZ', 23),
  ('PANFR-3634-01MEZ', 6),
  ('PLAFR-000L-01MCMA1I', 170),
  ('PLAFR-000L-01MCOM1I', 45),
  ('PLAFR-000L-01MCRO2I', 35),
  ('PLAFR-000L-01MCVE2I', 86),
  ('PLAFR-000L-01MLMA1I', 170),
  ('PLAFR-000L-01MLMA1IS', 21),
  ('PLAFR-000M-01MCMA1I', 185),
  ('PLAFR-000M-01MCOM1I', 29),
  ('PLAFR-000M-01MCRO2I', 26),
  ('PLAFR-000M-01MCVE2I', 75),
  ('PLAFR-000M-01MLMA1I', 96),
  ('PLAFR-000M-01MLMA1IS', 40),
  ('PLAFR-000S-01MCMA1I', 170),
  ('PLAFR-000S-01MCOM1I', 29),
  ('PLAFR-000S-01MCRO2I', 80),
  ('PLAFR-000S-01MCVE2I', 57),
  ('PLAFR-000S-01MLMA1I', 213),
  ('PLAFR-000S-01MLMA1IS', 36),
  ('PLAFR-00XL-01MCMA1I', 126),
  ('PLAFR-00XL-01MCOM1I', 48),
  ('PLAFR-00XL-01MCRO2I', 49),
  ('PLAFR-00XL-01MCVE2I', 46),
  ('PLAFR-00XL-01MLMA1I', 90),
  ('PLAFR-00XL-01MLMA1IS', 85),
  ('PLAFR-02XL-01MCMA1I', 30),
  ('PLAFR-02XL-01MCOM1I', 30),
  ('PLAFR-02XL-01MCRO2I', 55),
  ('PLAFR-02XL-01MCVE2I', 56),
  ('PLAFR-02XL-01MLMA1I', 100),
  ('PLAFR-02XL-01MLMA1IS', 40),
  ('PLAFR-03XL-01MCMA1I', 18),
  ('PLAFR-03XL-01MCOM1I', 10),
  ('PLAFR-03XL-01MCRO2I', 19),
  ('PLAFR-03XL-01MCVE2I', 13),
  ('PLAFR-03XL-01MLMA1I', 10),
  ('PLAFR-03XL-01MLMA1IS', 10)
  ), despues as (   -- movimientos después de cargar Microsip
    select mv.clave, sum(mv.cantidad) as neto,
           string_agg(format('%s %s', mv.tipo, mv.cantidad), ', ' order by mv.creado_en) as cuales
    from public.frisa_inv_movimientos mv
    where mv.creado_en > (select max(creado_en) from public.frisa_inv_movimientos where referencia = 'Existencias de Microsip (frisa noviembre 2026)')
    group by mv.clave
  ), cruce as (
    select p.clave, p.nombre, coalesce(m.existencia, 0) as microsip, p.stock_actual as pagina,
           coalesce(d.neto, 0) as movido_despues, d.cuales
    from public.frisa_productos_niveles p
    left join microsip m on m.clave = p.clave
    left join despues d on d.clave = p.clave
    where p.activo
  )
  select clave, nombre, microsip, pagina, pagina - microsip as diferencia, movido_despues,
         case when pagina - microsip = movido_despues then 'cuadra (solo movimientos de la página)' else 'NO CUADRA' end as revision, cuales
  from cruce where pagina <> microsip
  union all
  select 'TOTAL', '', sum(microsip), sum(pagina), sum(pagina) - sum(microsip), sum(movido_despues),
         case when sum(pagina) - sum(microsip) = sum(movido_despues) then 'cuadra' else 'NO CUADRA' end, null
  from cruce
) t
order by clave = 'TOTAL', revision = 'NO CUADRA' desc, clave;
