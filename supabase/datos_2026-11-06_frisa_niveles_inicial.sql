-- =====================================================================
-- Datos 2026-11-06 — Frisa niveles: carga inicial desde el Sheet
-- "Consumos Frisa Niveles" (hojas Niveles y Supuestos, exportadas hoy).
-- =====================================================================
-- Pedido de Alfredo: cargar el stock actual del Sheet como inventario
-- inicial (después se ajusta si hace falta). Equivale a "Importar del
-- Sheet" en la app, pero se corre en el SQL Editor.
--   · 68 claves, 3,386 piezas en stock.
--   · Supuestos: periodo 289 días, máximo 42, reorden 28, mínimo 20.
--   · Cada clave nueva deja su conteo "importacion" en el historial.
--   · Solo agrega: si una clave ya existe NO se toca (se puede correr dos veces).
-- Requiere V184 (schema_v184_frisa_niveles.sql) aplicado.
-- =====================================================================

update public.frisa_niveles_config
   set dias_periodo = 289, dias_maximo = 42,
       dias_reorden = 28, dias_minimo = 20,
       fecha_inicio_consumo = date '2026-01-01', fecha_corte_consumo = date '2026-10-16',
       actualizado_en = now(), actualizado_por_nombre = 'Carga inicial (Sheet)'
 where id;

with datos (clave, nombre, tipo, reflejante, manga, color, consumo_2025, consumo_2026, clase_abc, tendencia, nota, stock_actual) as (
  values
  ('BATFR-000L-01LABFR', 'BATA LABORATORIO FRISA T-L', null, null, '-', 'Blanco', 2, 4, 'C', '↑', null, 8),
  ('BOLFR-0000-01MEZC', 'BOLSA DE MEZCLILLA CON CIERRE FRISA', null, null, '-', 'Mezclilla', 15, 0, '-', 'Sin ventas 2026', 'Sin ventas 2026', 0),
  ('CAMFR-000S-01MZ1B1I', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-S', 'Camisa', 'Con', 'Larga', 'Mezclilla', 36, 44, 'C', '↑', null, 0),
  ('CAMFR-000M-01MZ1B1I', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-M', 'Camisa', 'Con', 'Larga', 'Mezclilla', 153, 156, 'B', '↑', null, 0),
  ('CAMFR-000L-01MZ1B1I', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-L', 'Camisa', 'Con', 'Larga', 'Mezclilla', 102, 86, 'C', '=', null, 0),
  ('CAMFR-00XL-01MZ1B1I', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-XL', 'Camisa', 'Con', 'Larga', 'Mezclilla', 33, 35, 'C', '↑', null, 3),
  ('CAMFR-02XL-01MZ1B1I', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-2XL', 'Camisa', 'Con', 'Larga', 'Mezclilla', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 10),
  ('CAMFR-03XL-01MZ1B1I', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-3XL', 'Camisa', 'Con', 'Larga', 'Mezclilla', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 10),
  ('CAMFR-00XS-01MZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-XS', 'Camisa', 'Con', 'Larga', 'Mezclilla', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 0),
  ('CAMFR-000S-01MZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-S', 'Camisa', 'Con', 'Larga', 'Mezclilla', 629, 447, 'A', '↓', null, 125),
  ('CAMFR-000M-01MZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-M', 'Camisa', 'Con', 'Larga', 'Mezclilla', 1347, 914, 'A', '↓', null, 129),
  ('CAMFR-000L-01MEZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-L', 'Camisa', 'Con', 'Larga', 'Mezclilla', 1057, 694, 'A', '↓', null, 127),
  ('CAMFR-00XL-01MZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-XL', 'Camisa', 'Con', 'Larga', 'Mezclilla', 440, 327, 'B', '=', null, 15),
  ('CAMFR-02XL-01MZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-2XL', 'Camisa', 'Con', 'Larga', 'Mezclilla', 33, 25, 'C', '=', null, 23),
  ('CAMFR-03XL-01MZ1B', 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-3XL', 'Camisa', 'Con', 'Larga', 'Mezclilla', 26, 14, 'C', '↓', null, 0),
  ('PANFR-0028-01MEZ', 'PANTALON DE MEZCLILLA TALLA 28 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 115, 91, 'C', '=', null, 56),
  ('PANFR-0029-01MEZ', 'PANTALON DE MEZCLILLA TALLA 29 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 66, 44, 'C', '↓', null, 80),
  ('PANFR-0030-01MEZ', 'PANTALON DE MEZCLILLA TALLA 30 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 520, 380, 'B', '=', null, 44),
  ('PANFR-0031-01MEZ', 'PANTALON DE MEZCLILLA TALLA 31 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 173, 136, 'B', '=', null, 60),
  ('PANFR-0032-01MEZ', 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 1617, 1074, 'A', '↓', null, 124),
  ('PANFR-0033-01MEZ', 'PANTALON DE MEZCLILLA TALLA 33 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 571, 355, 'B', '↓', null, 33),
  ('PANFR-0034-01MEZ', 'PANTALON DE MEZCLILLA TALLA 34 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 2680, 1644, 'A', '↓', null, 93),
  ('PANFR-0036-01MEZ', 'PANTALON DE MEZCLILLA TALLA 36 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 2260, 1502, 'A', '↓', null, 31),
  ('PANFR-0038-01MEZ', 'PANTALON DE MEZCLILLA TALLA 38 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 1140, 842, 'A', '=', null, 174),
  ('PANFR-0040-01MEZ', 'PANTALON DE MEZCLILLA TALLA 40 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 470, 284, 'B', '↓', null, 41),
  ('PANFR-0042-01MEZ', 'PANTALON DE MEZCLILLA TALLA 42 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 202, 133, 'B', '↓', null, 45),
  ('PANFR-0044-01MEZ', 'PANTALON DE MEZCLILLA TALLA 44 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 87, 71, 'C', '=', null, 8),
  ('PANFR-0046-01MEZ', 'PANTALON DE MEZCLILLA TALLA 46 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 43, 34, 'C', '=', null, 15),
  ('PANFR-0048-01MEZ', 'PANTALON DE MEZCLILLA TALLA 48 14OZ FRISA', 'Pantalón', null, '-', 'Mezclilla', 5, 11, 'C', '↑', null, 16),
  ('PANFR-3234-01MEZ', 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA LARGO 34', 'Pantalón', null, '-', 'Mezclilla', 4, 0, '-', 'Sin ventas 2026', 'Sin ventas 2026', 20),
  ('PANFR-3434-01MEZ', 'PANTALON DE MEZCLILLA TALLA 34 14OZ FRISA LARGO 34', 'Pantalón', null, '-', 'Mezclilla', 12, 8, 'C', '↓', null, 23),
  ('PANFR-3634-01MEZ', 'PANTALON DE MEZCLILLA TALLA 36 14OZ FRISA LARGO 34', 'Pantalón', null, '-', 'Mezclilla', 20, 13, 'C', '↓', null, 6),
  ('PLAFR-000S-01MCMA1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-S', 'Playera', 'Con', 'Corta', 'Azul marino', 493, 430, 'B', '↑', null, 160),
  ('PLAFR-000M-01MCMA1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M', 'Playera', 'Con', 'Corta', 'Azul marino', 2954, 2494, 'A', '=', null, 180),
  ('PLAFR-000L-01MCMA1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-L', 'Playera', 'Con', 'Corta', 'Azul marino', 3109, 2476, 'A', '=', null, 115),
  ('PLAFR-00XL-01MCMA1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-XL', 'Playera', 'Con', 'Corta', 'Azul marino', 1282, 1125, 'A', '↑', null, 111),
  ('PLAFR-02XL-01MCMA1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-2XL', 'Playera', 'Con', 'Corta', 'Azul marino', 317, 198, 'B', '↓', null, 25),
  ('PLAFR-03XL-01MCMA1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-3XL', 'Playera', 'Con', 'Corta', 'Azul marino', 57, 44, 'C', '=', null, 13),
  ('PLAFR-000S-01MCOM1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-S', 'Playera', 'Con', 'Corta', 'Mango', 93, 32, 'C', '↓', null, 29),
  ('PLAFR-000M-01MCOM1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-M', 'Playera', 'Con', 'Corta', 'Mango', 186, 47, 'C', '↓', null, 19),
  ('PLAFR-000L-01MCOM1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-L', 'Playera', 'Con', 'Corta', 'Mango', 91, 26, 'C', '↓', null, 45),
  ('PLAFR-00XL-01MCOM1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-XL', 'Playera', 'Con', 'Corta', 'Mango', 28, 7, 'C', '↓', null, 48),
  ('PLAFR-02XL-01MCOM1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-2XL', 'Playera', 'Con', 'Corta', 'Mango', 10, 0, '-', 'Sin ventas 2026', 'Sin ventas 2026', 30),
  ('PLAFR-03XL-01MCOM1I', 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-3XL', 'Playera', 'Con', 'Corta', 'Mango', 10, 0, '-', 'Sin ventas 2026', 'Sin ventas 2026', 10),
  ('PLAFR-000S-01MCVE2I', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-S', 'Playera', 'Con', 'Corta', 'Verde', 105, 122, 'B', '↑', null, 57),
  ('PLAFR-000M-01MCVE2I', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-M', 'Playera', 'Con', 'Corta', 'Verde', 455, 311, 'B', '↓', null, 14),
  ('PLAFR-000L-01MCVE2I', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-L', 'Playera', 'Con', 'Corta', 'Verde', 320, 250, 'B', '=', null, 46),
  ('PLAFR-00XL-01MCVE2I', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-XL', 'Playera', 'Con', 'Corta', 'Verde', 83, 100, 'C', '↑', null, 46),
  ('PLAFR-02XL-01MCVE2I', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-2XL', 'Playera', 'Con', 'Corta', 'Verde', 9, 8, 'C', '↑', null, 56),
  ('PLAFR-03XL-01MCVE2I', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-3XL', 'Playera', 'Con', 'Corta', 'Verde', 13, 9, 'C', '↓', null, 13),
  ('PLAFR-000S-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-S', 'Playera', 'Sin', 'Corta', 'Roja', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 80),
  ('PLAFR-000M-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-M', 'Playera', 'Sin', 'Corta', 'Roja', 297, 293, 'B', '↑', null, 26),
  ('PLAFR-000L-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-L', 'Playera', 'Sin', 'Corta', 'Roja', 230, 165, 'B', '=', null, 35),
  ('PLAFR-00XL-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-XL', 'Playera', 'Sin', 'Corta', 'Roja', 91, 76, 'C', '=', null, 49),
  ('PLAFR-02XL-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-2XL', 'Playera', 'Sin', 'Corta', 'Roja', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 55),
  ('PLAFR-03XL-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-3XL', 'Playera', 'Sin', 'Corta', 'Roja', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 19),
  ('PLAFR-000S-01MLMA1I', 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-S', 'Playera', 'Con', 'Larga', 'Azul marino', 456, 339, 'B', '=', null, 208),
  ('PLAFR-000M-01MLMA1I', 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M', 'Playera', 'Con', 'Larga', 'Azul marino', 2090, 1945, 'A', '↑', null, 61),
  ('PLAFR-000L-01MLMA1I', 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-L', 'Playera', 'Con', 'Larga', 'Azul marino', 2143, 1697, 'A', '=', null, 120),
  ('PLAFR-00XL-01MLMA1I', 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-XL', 'Playera', 'Con', 'Larga', 'Azul marino', 537, 463, 'A', '=', null, 80),
  ('PLAFR-02XL-01MLMA1I', 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-2XL', 'Playera', 'Con', 'Larga', 'Azul marino', 172, 93, 'C', '↓', null, 100),
  ('PLAFR-03XL-01MLMA1I', 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-3XL', 'Playera', 'Con', 'Larga', 'Azul marino', 41, 43, 'C', '↑', null, 10),
  ('PLAFR-000S-01MLMA1IS', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-S', 'Playera', 'Sin', 'Larga', 'Azul marino', 135, 112, 'C', '=', null, 36),
  ('PLAFR-000M-01MLMA1IS', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-M', 'Playera', 'Sin', 'Larga', 'Azul marino', 550, 577, 'A', '↑', null, 20),
  ('PLAFR-000L-01MLMA1IS', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-L', 'Playera', 'Sin', 'Larga', 'Azul marino', 405, 462, 'A', '↑', null, 16),
  ('PLAFR-00XL-01MLMA1IS', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-XL', 'Playera', 'Sin', 'Larga', 'Azul marino', 85, 113, 'C', '↑', null, 85),
  ('PLAFR-02XL-01MLMA1IS', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-2XL', 'Playera', 'Sin', 'Larga', 'Azul marino', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 40),
  ('PLAFR-03XL-01MLMA1IS', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-3XL', 'Playera', 'Sin', 'Larga', 'Azul marino', 0, 0, '-', 'Sin movimiento', 'Sin movimiento', 10)
), nuevos as (
  insert into public.frisa_productos_niveles (clave, nombre, tipo, reflejante, manga, color,
         consumo_2025, consumo_2026, clase_abc, tendencia, nota, stock_actual,
         stock_actualizado_en, stock_actualizado_por_nombre)
  select clave, nombre, tipo, reflejante, manga, color, consumo_2025, consumo_2026, clase_abc, tendencia, nota,
         stock_actual, now(), 'Carga inicial (Sheet)'
  from datos
  on conflict ((lower(btrim(clave)))) do nothing
  returning id, clave, stock_actual
)
insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
select id, clave, null, stock_actual, 'importacion', null, 'Carga inicial (Sheet)', 'Inventario inicial: stock actual del Sheet Consumos Frisa Niveles (2026-11-06)'
from nuevos;

-- Comprobación: debe dar 68 claves y 3386 piezas.
select count(*) as claves, sum(stock_actual) as piezas from public.frisa_productos_niveles;
