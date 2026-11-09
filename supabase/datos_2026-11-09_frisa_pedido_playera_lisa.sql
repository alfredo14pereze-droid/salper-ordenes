-- =====================================================================
-- Datos 2026-11-09 — Frisa: pedido de playera lisa activo (580 pzas)
-- =====================================================================
-- Del Excel "PEDIDO PLAYERAS" de Alfredo. La playera lisa es por color, manga
-- y talla (con y sin reflejante usan la misma lisa), así que el azul marino
-- manga larga S/REF (M 65, L 50) y C/REF (M 180, L 120, 3XL 10) se suman.
--   Azul marino manga larga: M 245 · L 170 · 3XL 10  = 425
--   Azul marino manga corta: M 40 · L 60 · XL 30 · 2XL 5 = 135
--   Roja manga corta:        M 20                    = 20
--   Verde y oro mango: 0.                            Total 580
-- =====================================================================
with compra as (
  insert into public.frisa_compras (proveedor, fecha_esperada, notas, creado_por, creado_por_nombre)
  values ('Proveedor de playera lisa',   -- ← aquí el nombre del proveedor
          current_date, 'Pedido activo de playera lisa (580 pzas)', null, 'Alfredo')
  returning id
)
insert into public.frisa_compra_lineas_lisa (compra_id, lisa_id, cantidad)
select c.id, l.id, v.cant
from compra c
cross join (values ('Azul marino', 'ML', 'M', 245), ('Azul marino', 'ML', 'L', 170), ('Azul marino', 'ML', '3XL', 10),
                   ('Azul marino', 'MC', 'M', 40), ('Azul marino', 'MC', 'L', 60), ('Azul marino', 'MC', 'XL', 30), ('Azul marino', 'MC', '2XL', 5),
                   ('Roja', 'MC', 'M', 20)) as v(color, manga, talla, cant)
join public.frisa_lisas l on lower(btrim(l.color)) = lower(v.color) and l.manga = v.manga and upper(btrim(l.talla)) = v.talla;

-- Comprobación: debe dar 8 renglones y 580 piezas.
select c.folio, c.proveedor, c.estado, count(l.*) as renglones, sum(l.cantidad) as piezas
from public.frisa_compras c join public.frisa_compra_lineas_lisa l on l.compra_id = c.id
where c.creado_en > now() - interval '10 minutes'
group by c.id order by c.folio desc limit 1;
