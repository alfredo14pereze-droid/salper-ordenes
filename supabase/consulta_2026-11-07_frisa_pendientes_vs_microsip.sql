-- =====================================================================
-- Consulta 2026-11-07 — Frisa: lo pendiente en la página contra Microsip
-- =====================================================================
-- SOLO LEE. Compara, por número de artículo, las piezas de las órdenes de
-- surtido pendientes o surtidas (sin entregar) contra el reporte de Microsip
-- "Pendientes de surtir por artículo" (pedidos frisa noviembre.xlsx: 32
-- artículos, 620 pzas). Si la página tiene menos, falta subir alguna OC (o se
-- cargó con otra clave); si tiene más, hay algo de más o Microsip ya lo dio por surtido.
-- =====================================================================
with microsip (codigo, piezas) as (values
  ('1020311', 3),
  ('1020313', 5),
  ('1020316', 12),
  ('1020317', 55),
  ('1020318', 46),
  ('1020319', 19),
  ('1020320', 16),
  ('1020321', 5),
  ('1020322', 4),
  ('1020327', 6),
  ('1020328', 6),
  ('1020329', 13),
  ('1023670', 34),
  ('1023673', 27),
  ('1024583', 8),
  ('1024762', 13),
  ('1027931', 22),
  ('1027932', 15),
  ('1027933', 29),
  ('1027934', 6),
  ('1027936', 15),
  ('1027937', 79),
  ('1027938', 96),
  ('1027939', 23),
  ('1027940', 2),
  ('1027945', 4),
  ('1027960', 15),
  ('1027961', 18),
  ('1027962', 11),
  ('1027963', 6),
  ('1027964', 3),
  ('1033132', 4)
), ms as (
  select cm.producto_id, m.codigo, m.piezas from microsip m
  left join public.frisa_clave_microsip cm on cm.codigo = m.codigo
), pagina as (
  select l.producto_id, sum(l.cantidad) as piezas
  from public.frisa_surtido_lineas l join public.frisa_surtidos s on s.id = l.surtido_id
  where s.estado in ('pendiente', 'surtida') group by l.producto_id
), cruce as (
  select coalesce(ms.producto_id, pg.producto_id) as producto_id, ms.codigo,
         coalesce(ms.piezas, 0) as microsip, coalesce(pg.piezas, 0) as pagina
  from ms full join pagina pg on pg.producto_id = ms.producto_id
)
select * from (
select coalesce(p.clave, '(sin clave)') as clave,
       coalesce(c.codigo, (select min(codigo) from public.frisa_clave_microsip x where x.producto_id = c.producto_id and x.codigo ~ '^[0-9]+$'), '') as articulo,
       p.nombre, c.microsip, c.pagina, c.pagina - c.microsip as diferencia
from cruce c left join public.frisa_productos_niveles p on p.id = c.producto_id
where c.microsip <> c.pagina
union all
select 'TOTAL', '', '', sum(microsip), sum(pagina), sum(pagina) - sum(microsip) from cruce
) t
order by clave = 'TOTAL', abs(diferencia) desc, clave;
