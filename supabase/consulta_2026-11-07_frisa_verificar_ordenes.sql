-- =====================================================================
-- Consulta 2026-11-07 — Frisa: verificar las órdenes de surtido contra su OC
-- =====================================================================
-- SOLO LEE, no cambia nada. Para cada orden de surtido no cancelada compara
-- lo que se guardó (renglones) contra lo que se leyó del PDF de la OC al
-- subirla (leido_pdf), usando el número de material = número de artículo
-- (frisa_clave_microsip). Un renglón por OC: OK o la lista de problemas.
-- =====================================================================
with s as (
  select * from public.frisa_surtidos where estado <> 'cancelada'
), pdf as (   -- lo que trae el PDF, por número de material
  select s.id as surtido_id, upper(btrim(a->>'codigo')) as codigo, a->>'nombre' as nombre,
         coalesce(a->>'talla', '') as talla, (a->>'cantidad')::int as cantidad, cm.producto_id
  from s
  cross join lateral jsonb_array_elements(coalesce(s.leido_pdf->'articulos', '[]'::jsonb)) a
  left join public.frisa_clave_microsip cm on cm.codigo = upper(btrim(a->>'codigo'))
), pdf_prod as (
  select surtido_id, producto_id, sum(cantidad) as cantidad, string_agg(codigo, '/') as codigos
  from pdf where producto_id is not null group by surtido_id, producto_id
), cruce as (  -- renglones guardados contra el PDF (solo artículos con número conocido)
  select coalesce(l.surtido_id, pp.surtido_id) as surtido_id, coalesce(l.clave, pn.clave) as clave,
         pp.codigos, l.cantidad as en_orden, pp.cantidad as en_pdf
  from (select * from public.frisa_surtido_lineas where surtido_id in (select id from s)) l
  full join pdf_prod pp on pp.surtido_id = l.surtido_id and pp.producto_id = l.producto_id
  left join public.frisa_productos_niveles pn on pn.id = pp.producto_id
), problemas as (
  select surtido_id, format('%s (art. %s): la OC pide %s y la orden tiene %s', clave, codigos, en_pdf, en_orden) as p
    from cruce where en_orden is not null and en_pdf is not null and en_orden <> en_pdf
  union all
  select surtido_id, format('FALTA en la orden: %s (art. %s) %s pzas', clave, codigos, en_pdf)
    from cruce where en_orden is null
  union all  -- de más: solo se puede decir si todo el PDF trae números conocidos
  select c.surtido_id, format('DE MÁS en la orden: %s %s pzas (no viene en la OC con su número)', c.clave, c.en_orden)
    from cruce c where c.en_pdf is null
     and exists (select 1 from pdf where pdf.surtido_id = c.surtido_id)
     and not exists (select 1 from pdf where pdf.surtido_id = c.surtido_id and pdf.producto_id is null)
  union all
  select surtido_id, format('Revisar a mano: "%s" %s, %s pzas, art. %s (número que no está en Microsip)', nombre, talla, cantidad, coalesce(codigo, 'sin número'))
    from pdf where producto_id is null
  union all
  select id, 'Sin lectura del PDF (se capturó a mano): no se puede comparar'
    from s where jsonb_array_length(coalesce(leido_pdf->'articulos', '[]'::jsonb)) = 0
  union all
  select id, format('El PDF dice OC %s', leido_pdf->>'numero')
    from s where nullif(leido_pdf->>'numero', '') is not null and regexp_replace(leido_pdf->>'numero', '\D', '', 'g') <> regexp_replace(numero_oc, '\D', '', 'g')
)
select s.numero_oc as oc, s.planta, s.estado,
       (select count(*) from public.frisa_surtido_lineas l where l.surtido_id = s.id) as renglones,
       (select coalesce(sum(cantidad), 0) from public.frisa_surtido_lineas l where l.surtido_id = s.id) as piezas_orden,
       (select coalesce(sum(cantidad), 0) from pdf where pdf.surtido_id = s.id) as piezas_pdf,
       coalesce((select string_agg(p, ' · ') from problemas pr where pr.surtido_id = s.id), 'OK') as revision
from s
order by (select count(*) from problemas pr where pr.surtido_id = s.id) = 0, s.fecha_limite nulls last, s.numero_oc;
