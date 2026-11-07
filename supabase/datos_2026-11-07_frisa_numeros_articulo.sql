-- =====================================================================
-- Datos 2026-11-07 — Frisa: número de artículo de cada clave
-- =====================================================================
-- Del Excel "frisa noviembre 2026" (Existencia y valor del inventario de Microsip):
-- el número a la izquierda de cada artículo. Es el mismo número que viene en la
-- columna MATERIAL de las órdenes de compra de Frisa, así que al subir una OC la
-- clave se encuentra por ese número y no por el nombre. 54 números (las 9 claves
-- que en Microsip no tienen número, como las tallas 2XL/3XL nuevas, se siguen
-- ligando por el nombre). Se puede correr dos veces. Requiere V188.
-- =====================================================================

insert into public.frisa_clave_microsip (codigo, producto_id)
select c.codigo, p.id
from (values
  ('1012564', 'PANFR-3434-01MEZ'),
  ('1012565', 'PANFR-3634-01MEZ'),
  ('1020166', 'BATFR-000L-01LABFR'),
  ('1020310', 'PANFR-0046-01MEZ'),
  ('1020311', 'PANFR-0028-01MEZ'),
  ('1020312', 'PANFR-0029-01MEZ'),
  ('1020313', 'PANFR-0030-01MEZ'),
  ('1020314', 'PANFR-0031-01MEZ'),
  ('1020315', 'PANFR-0032-01MEZ'),
  ('1020316', 'PANFR-0033-01MEZ'),
  ('1020317', 'PANFR-0034-01MEZ'),
  ('1020318', 'PANFR-0036-01MEZ'),
  ('1020319', 'PANFR-0038-01MEZ'),
  ('1020320', 'PANFR-0040-01MEZ'),
  ('1020321', 'PANFR-0042-01MEZ'),
  ('1020322', 'PANFR-0044-01MEZ'),
  ('1020323', 'PANFR-0048-01MEZ'),
  ('1020327', 'PLAFR-00XL-01MCRO2I'),
  ('1020328', 'PLAFR-000L-01MCRO2I'),
  ('1020329', 'PLAFR-000M-01MCRO2I'),
  ('1021886', 'PANFR-3234-01MEZ'),
  ('1023670', 'PLAFR-000M-01MLMA1IS'),
  ('1023673', 'PLAFR-000L-01MLMA1IS'),
  ('1024583', 'PLAFR-000S-01MLMA1IS'),
  ('1024762', 'PLAFR-00XL-01MLMA1IS'),
  ('1027930', 'PLAFR-000S-01MCMA1I'),
  ('1027931', 'PLAFR-000M-01MCMA1I'),
  ('1027932', 'PLAFR-000L-01MCMA1I'),
  ('1027933', 'PLAFR-00XL-01MCMA1I'),
  ('1027934', 'PLAFR-02XL-01MCMA1I'),
  ('1027935', 'PLAFR-03XL-01MCMA1I'),
  ('1027936', 'PLAFR-000S-01MLMA1I'),
  ('1027937', 'PLAFR-000M-01MLMA1I'),
  ('1027938', 'PLAFR-000L-01MLMA1I'),
  ('1027939', 'PLAFR-00XL-01MLMA1I'),
  ('1027940', 'PLAFR-02XL-01MLMA1I'),
  ('1027941', 'PLAFR-03XL-01MLMA1I'),
  ('1027942', 'PLAFR-000S-01MCVE2I'),
  ('1027943', 'PLAFR-000M-01MCVE2I'),
  ('1027944', 'PLAFR-000L-01MCVE2I'),
  ('1027945', 'PLAFR-00XL-01MCVE2I'),
  ('1027946', 'PLAFR-02XL-01MCVE2I'),
  ('1027947', 'PLAFR-03XL-01MCVE2I'),
  ('1027948', 'PLAFR-000S-01MCOM1I'),
  ('1027949', 'PLAFR-000M-01MCOM1I'),
  ('1027950', 'PLAFR-000L-01MCOM1I'),
  ('1027951', 'PLAFR-00XL-01MCOM1I'),
  ('1027960', 'CAMFR-000S-01MZ1B'),
  ('1027961', 'CAMFR-000M-01MZ1B'),
  ('1027962', 'CAMFR-000L-01MEZ1B'),
  ('1027963', 'CAMFR-00XL-01MZ1B'),
  ('1027964', 'CAMFR-02XL-01MZ1B'),
  ('1033131', 'CAMFR-000L-01MZ1B1I'),
  ('1033132', 'CAMFR-00XL-01MZ1B1I')
) as c(codigo, clave)
join public.frisa_productos_niveles p on p.clave = c.clave
on conflict (codigo) do update set producto_id = excluded.producto_id, actualizado_en = now();

-- Comprobación: debe dar 54.
select count(*) as numeros_de_articulo from public.frisa_clave_microsip where codigo ~ '^[0-9]+$';
