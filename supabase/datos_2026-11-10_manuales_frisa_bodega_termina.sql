-- Manuales (página): la orden de taller Frisa termina al subirla a bodega (V203).
update public.manuales m
   set contenido = replace(contenido,
    $q$4. Toca **Confirmar: subir … pzas**. Se suman al inventario y la orden sale de "Por entrar".$q$,
    $q$4. Toca **Confirmar: subir … pzas**. Se suman al inventario y **la orden queda terminada**: pasa a Órdenes pasadas. No hay que confirmar entrega al cliente.$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (bodega termina la orden)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%la orden queda terminada**: pasa a Órdenes pasadas%') as ya_lo_explica
from public.manuales where eliminado_en is null;
