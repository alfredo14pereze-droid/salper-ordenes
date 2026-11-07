-- =====================================================================
-- Datos 2026-11-07 — Frisa: corregir órdenes de surtido por número de artículo
-- =====================================================================
-- La verificación (consulta_2026-11-07_frisa_verificar_ordenes.sql) encontró
-- 15 órdenes donde la playera M/L A.MARINO CON reflejante (art. 1027936-1027940)
-- quedó cargada como la SIN reflejante (MLMA1IS), y una en otra talla.
-- 1) Números de Frisa de la camisa 1B que no están en Microsip (1029687-1029690).
-- 2) En las órdenes PENDIENTES donde todo el PDF trae números conocidos y las
--    piezas totales cuadran, los renglones se rehacen con lo que dice el PDF.
--    No toca órdenes surtidas ni entregadas (ahí no aparta nada todavía).
-- Se puede correr dos veces (la segunda ya no encuentra nada que corregir).
-- =====================================================================

insert into public.frisa_clave_microsip (codigo, producto_id)
select c.codigo, p.id
from (values ('1029687', 'CAMFR-000S-01MZ1B'), ('1029688', 'CAMFR-000M-01MZ1B'),
             ('1029689', 'CAMFR-000L-01MEZ1B'), ('1029690', 'CAMFR-00XL-01MZ1B')) as c(codigo, clave)
join public.frisa_productos_niveles p on p.clave = c.clave
on conflict (codigo) do nothing;

drop table if exists frisa_fix_pdf, frisa_fix_ordenes;

create temp table frisa_fix_pdf as
select s.id as surtido_id, cm.producto_id, upper(btrim(a->>'codigo')) as codigo,
       a->>'nombre' as nombre, a->>'talla' as talla, (a->>'cantidad')::int as cantidad
from public.frisa_surtidos s
cross join lateral jsonb_array_elements(coalesce(s.leido_pdf->'articulos', '[]'::jsonb)) a
left join public.frisa_clave_microsip cm on cm.codigo = upper(btrim(a->>'codigo'))
where s.estado = 'pendiente';

create temp table frisa_fix_ordenes as
with pdf as (select surtido_id, producto_id, sum(cantidad) as cantidad from frisa_fix_pdf group by surtido_id, producto_id),
     ord as (select surtido_id, producto_id, cantidad from public.frisa_surtido_lineas where surtido_id in (select surtido_id from frisa_fix_pdf))
select s.surtido_id
from (select distinct surtido_id from frisa_fix_pdf) s
where not exists (select 1 from frisa_fix_pdf x where x.surtido_id = s.surtido_id and x.producto_id is null)   -- todo con número conocido
  and (select sum(cantidad) from pdf where pdf.surtido_id = s.surtido_id) = (select sum(cantidad) from ord where ord.surtido_id = s.surtido_id)
  and exists (  -- y algo no coincide
    (select producto_id, cantidad from pdf where pdf.surtido_id = s.surtido_id
     except select producto_id, cantidad from ord where ord.surtido_id = s.surtido_id)
    union all
    (select producto_id, cantidad from ord where ord.surtido_id = s.surtido_id
     except select producto_id, cantidad from pdf where pdf.surtido_id = s.surtido_id));

insert into public.frisa_surtido_eventos (surtido_id, evento, detalle, usuario_nombre)
select o.surtido_id, 'corregida', 'Renglones corregidos por número de artículo de la OC. Antes: ' ||
       (select string_agg(l.clave || ' ' || l.cantidad, ', ' order by l.clave) from public.frisa_surtido_lineas l where l.surtido_id = o.surtido_id),
       'Corrección por número de artículo'
from frisa_fix_ordenes o;

delete from public.frisa_surtido_lineas where surtido_id in (select surtido_id from frisa_fix_ordenes);

insert into public.frisa_surtido_lineas (surtido_id, producto_id, clave, cantidad, texto_pdf, talla_pdf)
select x.surtido_id, x.producto_id, p.clave, sum(x.cantidad), min(x.nombre), min(x.talla)
from frisa_fix_pdf x join public.frisa_productos_niveles p on p.id = x.producto_id
where x.surtido_id in (select surtido_id from frisa_fix_ordenes)
group by x.surtido_id, x.producto_id, p.clave;

-- Comprobación: órdenes corregidas y cuántas pendientes siguen sin cuadrar con su PDF (debe dar 0).
select (select count(*) from frisa_fix_ordenes) as ordenes_corregidas,
       (select string_agg(s.numero_oc, ', ' order by s.numero_oc) from public.frisa_surtidos s where s.id in (select surtido_id from frisa_fix_ordenes)) as ocs,
       (select count(*) from public.frisa_surtidos s where s.estado = 'pendiente' and exists (
          select x.producto_id, sum(x.cantidad) from frisa_fix_pdf x where x.surtido_id = s.id group by x.producto_id
          except select producto_id, cantidad from public.frisa_surtido_lineas l where l.surtido_id = s.id)) as siguen_sin_cuadrar;
