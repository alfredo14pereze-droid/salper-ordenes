-- =====================================================================
-- Datos 2026-11-06 — Frisa: inventario inicial = existencias de Microsip
-- (reporte "Existencia y valor del inventario", línea FRISA, archivo
-- "frisa noviembre 2026.xlsx" del Drive de Alfredo).
-- =====================================================================
-- Pedido de Alfredo: usar las existencias de Microsip en lugar del stock
-- del Sheet. Se hace con movimientos 'ajuste' (la diferencia contra el stock
-- que haya AL CORRERLO), así no se pierde nada de lo que ya se movió en la
-- página y queda en el historial de cada clave.
--   · 63 artículos de Microsip ligados a su clave (por clave o por nombre):
--     3,717 piezas. Hoy difieren del Sheet 15 claves.
--   · Las 5 claves del Sheet que no salen en Microsip se dejan como
--     están (todas tienen 0): BOLFR-0000-01MEZC, CAMFR-000S-01MZ1B1I, CAMFR-000M-01MZ1B1I, CAMFR-00XS-01MZ1B, CAMFR-03XL-01MZ1B.
--   · Se puede correr dos veces: la segunda vez ya no hay diferencias.
-- Requiere V185 (inventario por movimientos).
-- =====================================================================

with microsip (clave, codigo_microsip, existencia) as (
  values
  ('BATFR-000L-01LABFR', '1020166', 8),
  ('CAMFR-000L-01MEZ1B', '1027962', 127),
  ('CAMFR-000L-01MZ1B1I', '1033131', 0),
  ('CAMFR-000M-01MZ1B', '1027961', 129),
  ('CAMFR-000S-01MZ1B', '1027960', 125),
  ('CAMFR-00XL-01MZ1B', '1027963', 15),
  ('CAMFR-00XL-01MZ1B1I', '1033132', 3),
  ('CAMFR-02XL-01MZ1B', '1027964', 23),
  ('CAMFR-02XL-01MZ1B1I', 'CAMFR-02XL-01MZ1B1I', 10),
  ('CAMFR-03XL-01MZ1B1I', 'CAMFR-03XL-01MZ1B1I', 10),
  ('PANFR-0028-01MEZ', '1020311', 56),
  ('PANFR-0029-01MEZ', '1020312', 80),
  ('PANFR-0030-01MEZ', '1020313', 44),
  ('PANFR-0031-01MEZ', '1020314', 60),
  ('PANFR-0032-01MEZ', '1020315', 124),
  ('PANFR-0033-01MEZ', '1020316', 33),
  ('PANFR-0034-01MEZ', '1020317', 93),
  ('PANFR-0036-01MEZ', '1020318', 31),
  ('PANFR-0038-01MEZ', '1020319', 174),
  ('PANFR-0040-01MEZ', '1020320', 41),
  ('PANFR-0042-01MEZ', '1020321', 45),
  ('PANFR-0044-01MEZ', '1020322', 8),
  ('PANFR-0046-01MEZ', '1020310', 15),
  ('PANFR-0048-01MEZ', '1020323', 16),
  ('PANFR-3234-01MEZ', '1021886', 20),
  ('PANFR-3434-01MEZ', '1012564', 23),
  ('PANFR-3634-01MEZ', '1012565', 6),
  ('PLAFR-000L-01MCMA1I', '1027932', 170),
  ('PLAFR-000L-01MCOM1I', '1027950', 45),
  ('PLAFR-000L-01MCRO2I', '1020328', 35),
  ('PLAFR-000L-01MCVE2I', '1027944', 86),
  ('PLAFR-000L-01MLMA1I', '1027938', 170),
  ('PLAFR-000L-01MLMA1IS', '1023673', 21),
  ('PLAFR-000M-01MCMA1I', '1027931', 185),
  ('PLAFR-000M-01MCOM1I', '1027949', 29),
  ('PLAFR-000M-01MCRO2I', '1020329', 26),
  ('PLAFR-000M-01MCVE2I', '1027943', 75),
  ('PLAFR-000M-01MLMA1I', '1027937', 96),
  ('PLAFR-000M-01MLMA1IS', '1023670', 40),
  ('PLAFR-000S-01MCMA1I', '1027930', 170),
  ('PLAFR-000S-01MCOM1I', '1027948', 29),
  ('PLAFR-000S-01MCRO2I', 'PLAFR-000S-01MCRO2I', 80),
  ('PLAFR-000S-01MCVE2I', '1027942', 57),
  ('PLAFR-000S-01MLMA1I', '1027936', 213),
  ('PLAFR-000S-01MLMA1IS', '1024583', 36),
  ('PLAFR-00XL-01MCMA1I', '1027933', 126),
  ('PLAFR-00XL-01MCOM1I', '1027951', 48),
  ('PLAFR-00XL-01MCRO2I', '1020327', 49),
  ('PLAFR-00XL-01MCVE2I', '1027945', 46),
  ('PLAFR-00XL-01MLMA1I', '1027939', 90),
  ('PLAFR-00XL-01MLMA1IS', '1024762', 85),
  ('PLAFR-02XL-01MCMA1I', '1027934', 30),
  ('PLAFR-02XL-01MCOM1I', 'PLAFR-02XL-01MCOM1I', 30),
  ('PLAFR-02XL-01MCRO2I', 'PLAFR-02XL-01MCRO2I', 55),
  ('PLAFR-02XL-01MCVE2I', '1027946', 56),
  ('PLAFR-02XL-01MLMA1I', '1027940', 100),
  ('PLAFR-02XL-01MLMA1IS', 'PLAFR-02XL-01MLMA1IS', 40),
  ('PLAFR-03XL-01MCMA1I', '1027935', 18),
  ('PLAFR-03XL-01MCOM1I', 'PLAFR-03XL-01MCOM1I', 10),
  ('PLAFR-03XL-01MCRO2I', 'PLAFR-03XL-01MCRO2I', 19),
  ('PLAFR-03XL-01MCVE2I', '1027947', 13),
  ('PLAFR-03XL-01MLMA1I', '1027941', 10),
  ('PLAFR-03XL-01MLMA1IS', 'PLAFR-03XL-01MLMA1IS', 10)
), dif as (
  select p.id, p.clave, p.stock_actual, m.existencia, m.codigo_microsip
  from microsip m
  join public.frisa_productos_niveles p on lower(btrim(p.clave)) = lower(btrim(m.clave))
  where p.stock_actual <> m.existencia
), conteo as (
  insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
  select id, clave, stock_actual, existencia, 'captura', null, 'Microsip', 'Existencias de Microsip (frisa noviembre 2026), código ' || codigo_microsip
  from dif
  returning producto_id
)
insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, referencia, notas, creado_por, creado_por_nombre)
select id, clave, 'ajuste', existencia - stock_actual, 'Existencias de Microsip (frisa noviembre 2026)', 'Código Microsip ' || codigo_microsip, null, 'Microsip'
from dif;

-- Comprobación: debe dar 3717 piezas en las 63 claves de Microsip y 0 diferencias.
with microsip (clave, existencia) as (
  values
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
)
select sum(p.stock_actual) as piezas_microsip,
       count(*) filter (where p.stock_actual <> m.existencia) as diferencias,
       (select sum(stock_actual) from public.frisa_productos_niveles) as piezas_total
from microsip m join public.frisa_productos_niveles p on lower(btrim(p.clave)) = lower(btrim(m.clave));
