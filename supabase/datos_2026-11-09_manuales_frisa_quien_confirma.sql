-- =====================================================================
-- Datos 2026-11-09 — Manuales (página): quién confirma cada cosa
-- =====================================================================
-- Igual que los PDF: Gis confirma las entregas de Leo y recibe el pantalón;
-- Jackie o Adriana suben a bodega y reciben la playera lisa. Además corrige el
-- "Lo hace" de "Cómo confirmar Ya entregó el chofer" y "Cómo subir a bodega",
-- que el SQL anterior cambió por error. Se puede correr dos veces.
-- =====================================================================
update public.manuales m
   set contenido = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(contenido,
    '4. El chofer entrega y el admin confirma "Ya entregó el chofer".',
    '4. Leo entrega y Gis confirma "Ya entregó el chofer".'),
    '7. Admin sube a bodega · Gis recibe el pantalón · fábrica recibe la playera lisa.',
    '7. Jackie o Adriana suben a bodega lo del taller y reciben la playera lisa · Gis recibe el pantalón.'),
    '**Recibe el pantalón** cuando llega. |',
    '**Recibe el pantalón** cuando llega y **confirma las entregas** de Leo. |'),
    '| **Quien confirma** (admin de fábrica / tienda) | Confirma "Ya entregó el chofer" cuando el chofer regresa de entregar. Sube a bodega lo que termina el taller. **Fábrica recibe la playera lisa**. Lo demás lo puede **ver**, pero no cambiar. | Todas (solo de vista, salvo sus confirmaciones) |',
    '| **Jackie o Adriana** (bodega) | Suben a bodega lo que termina el taller, reciben la playera lisa y cuentan el anaquel. Lo demás lo pueden **ver**, pero no cambiar. | Todas (solo de vista, salvo lo suyo) |'),
    '**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **fábrica**.

Se confirma cuando el chofer',
    '**Lo hace:** Gis (ventas), cuando Leo regresa de entregar.

Se confirma cuando el chofer'),
    '**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **fábrica**.

Cuando en Producción',
    '**Lo hace:** Jackie o Adriana.

Cuando en Producción'),
    '**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **fábrica**.

Los pedidos que hace Gis',
    '**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **Jackie o Adriana**.

Los pedidos que hace Gis'),
    'Cuando llega, **fábrica** le da **Recibir** y se suma al anaquel.',
    'Cuando llega, **Jackie o Adriana** le dan **Recibir** y se suma al anaquel.'),
    '| **Baja** el real | Admin fábrica / tienda |',
    '| **Baja** el real | Gis |'),
    '| **Sube** el real | Admin fábrica / tienda |',
    '| **Sube** el real | Jackie o Adriana |'),
    '(Restock → Playera lisa, lo hace fábrica)',
    '(Restock → Playera lisa, lo hacen Jackie o Adriana)'),
    '| El chofer ya entregó una orden |',
    '| Leo ya entregó una orden (Gis) |'),
    '| Llega lo que terminó el taller |',
    '| Llega lo que terminó el taller (Jackie o Adriana) |'),
    '| Llega un pedido de playera lisa (fábrica) |',
    '| Llega un pedido de playera lisa (Jackie o Adriana) |'),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (quién confirma)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

update public.manuales m
   set contenido = replace(replace(replace(contenido,
    'avísale al administrador: él la puede regresar a pendiente.',
    'avísale a Gis: ella la puede regresar a pendiente.'),
    'No la surtas a medias: avísale a Gis o al administrador.',
    'No la surtas a medias: avísale a Gis.'),
    'Cuando el taller la termina, un administrador la sube a la bodega y ahí entra al inventario.',
    'Cuando el taller la termina, Jackie o Adriana la suben a la bodega y ahí entra al inventario.')
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

-- Comprobación: debe dar 0 viejos y los 3 "Lo hace" correctos.
select (select count(*) from public.manuales where eliminado_en is null and (contenido like '%**playera lisa**, **fábrica**%'
          or contenido like '%Admin fábrica / tienda%' or contenido like '%el admin confirma%' or contenido like '%administrador%')) as siguen_viejos,
       (select left(contenido, 60) from public.manuales where eliminado_en is null and titulo like 'Cómo confirmar%') as entrega,
       (select left(contenido, 40) from public.manuales where eliminado_en is null and titulo like 'Cómo subir a bodega%') as bodega;
