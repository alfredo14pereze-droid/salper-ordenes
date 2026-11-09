-- =====================================================================
-- Datos 2026-11-09 — Manuales (página): quién recibe cada pedido de compra
-- =====================================================================
-- Igual que en los PDF: el pantalón lo recibe Gis y la playera lisa, fábrica.
-- Cambia solo esos textos en los manuales de la sección Frisa. Se puede
-- correr dos veces (la segunda ya no encuentra nada que cambiar).
-- =====================================================================
update public.manuales m
   set contenido = replace(replace(replace(replace(replace(replace(replace(replace(replace(contenido,
    '7. Admin sube a bodega / recibe.',
    '7. Admin sube a bodega · Gis recibe el pantalón · fábrica recibe la playera lisa.'),
    'Crea las órdenes de taller y los pedidos de playera lisa y pantalón. |',
    'Crea las órdenes de taller y los pedidos de playera lisa y pantalón. **Recibe el pantalón** cuando llega. |'),
    'Sube a bodega lo que termina el taller y recibe las compras.',
    'Sube a bodega lo que termina el taller. **Fábrica recibe la playera lisa**.'),
    'Cuando llega, el administrador le da **Recibir**. Si el proveedor',
    'Cuando llega, **Gis** le da **Recibir** (ver "Cómo recibir un pedido de compra"). Si el proveedor'),
    'Cuando llega, el administrador le da **Recibir** y se suma al anaquel.',
    'Cuando llega, **fábrica** le da **Recibir** y se suma al anaquel.'),
    '**Lo hace:** quien confirma (admin de fábrica / tienda).',
    '**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **fábrica**.'),
    '| Llega un pedido de pantalón (o bata, bolsa) | Restock → Pantalón → **Recibir** | **Sube** el real | Admin fábrica / tienda |',
    '| Llega un pedido de pantalón (o bata, bolsa) | Restock → Pantalón → **Recibir** | **Sube** el real | Gis |'),
    '| Llega un pedido de playera lisa → **Recibir** (Restock → Playera lisa) | **Sube** |',
    '| Llega un pedido de playera lisa → **Recibir** (Restock → Playera lisa, lo hace fábrica) | **Sube** |'),
    '| Llega un pedido del proveedor | Restock → Pantalón (o Playera lisa) → Recibir → lo que llegó → Recibir |',
    '| Llega un pedido de playera lisa (fábrica) | Restock → Playera lisa → Por recibir → Recibir → lo que llegó → Recibir |'),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (quién recibe)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null)
   and m.contenido is distinct from replace(replace(replace(replace(replace(replace(replace(replace(replace(contenido,
    '7. Admin sube a bodega / recibe.',
    '7. Admin sube a bodega · Gis recibe el pantalón · fábrica recibe la playera lisa.'),
    'Crea las órdenes de taller y los pedidos de playera lisa y pantalón. |',
    'Crea las órdenes de taller y los pedidos de playera lisa y pantalón. **Recibe el pantalón** cuando llega. |'),
    'Sube a bodega lo que termina el taller y recibe las compras.',
    'Sube a bodega lo que termina el taller. **Fábrica recibe la playera lisa**.'),
    'Cuando llega, el administrador le da **Recibir**. Si el proveedor',
    'Cuando llega, **Gis** le da **Recibir** (ver "Cómo recibir un pedido de compra"). Si el proveedor'),
    'Cuando llega, el administrador le da **Recibir** y se suma al anaquel.',
    'Cuando llega, **fábrica** le da **Recibir** y se suma al anaquel.'),
    '**Lo hace:** quien confirma (admin de fábrica / tienda).',
    '**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **fábrica**.'),
    '| Llega un pedido de pantalón (o bata, bolsa) | Restock → Pantalón → **Recibir** | **Sube** el real | Admin fábrica / tienda |',
    '| Llega un pedido de pantalón (o bata, bolsa) | Restock → Pantalón → **Recibir** | **Sube** el real | Gis |'),
    '| Llega un pedido de playera lisa → **Recibir** (Restock → Playera lisa) | **Sube** |',
    '| Llega un pedido de playera lisa → **Recibir** (Restock → Playera lisa, lo hace fábrica) | **Sube** |'),
    '| Llega un pedido del proveedor | Restock → Pantalón (o Playera lisa) → Recibir → lo que llegó → Recibir |',
    '| Llega un pedido de playera lisa (fábrica) | Restock → Playera lisa → Por recibir → Recibir → lo que llegó → Recibir |');

-- Comprobación: manuales de Frisa que todavía dicen que el admin recibe (debe dar 0).
select count(*) as siguen_viejos
from public.manuales m
where m.eliminado_en is null
  and (m.contenido like '%el administrador le da **Recibir**%' or m.contenido like '%quien confirma (admin de fábrica / tienda).%');
