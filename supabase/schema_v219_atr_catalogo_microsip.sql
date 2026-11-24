-- =====================================================================
-- V219 — ATR: catálogo de batas igual que Microsip (solo datos)
--
-- Requiere V209–V217. Se puede correr dos veces. No borra nada.
-- Fuente: "EXISTENCIAS ATR.xlsx" de Microsip (116 artículos = 23 batas:
-- 10 con bolsa y 13 sin bolsa).
--
--   1) Agrega "Bata con bolsa Naranja" (existe en Microsip, faltaba aquí),
--      con las tallas XS–5XL.
--   2) "Gris Rata" se llama "Gris" (como en Microsip), con y sin bolsa. Solo
--      cambia el nombre: el id de la bata, su inventario y su historial no
--      cambian.
--   3) "Verde Jade" → "Verde Supervisor" (ya se hizo el 17-nov con
--      datos_2026-11-17_atr_verde_supervisor.sql; aquí solo por si acaso).
--   4) "Bata sin bolsa Guinda" NO existe en Microsip; no se toca (avisa
--      Alfredo si se quita).
--   5) Manual de ATR: la sección "Cómo ver cuántas batas hay" explica el
--      inventario nuevo (colores, con/sin bolsa, tallas en columnas, filtros).
--      Solo si nadie lo editó en la app.
-- =====================================================================

-- 1) Bata con bolsa Naranja
insert into public.productos (cliente_id, nombre, garment, color, tallas, especificaciones, pendiente_validar)
select public.atr_cliente_id(), 'Bata con bolsa Naranja', 'Bata', 'Naranja',
       array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
       jsonb_build_object('bolsa', true), false
where public.atr_cliente_id() is not null
  and not exists (select 1 from public.productos
                  where cliente_id = public.atr_cliente_id() and lower(nombre) = 'bata con bolsa naranja');

-- 2) Gris Rata → Gris (si ya existe una "Gris" del mismo tipo, no se toca)
update public.productos p
   set nombre = 'Bata ' || case when coalesce((p.especificaciones->>'bolsa')::boolean, false) then 'con' else 'sin' end || ' bolsa Gris',
       color = 'Gris'
 where p.cliente_id = public.atr_cliente_id()
   and lower(p.color) = 'gris rata'
   and not exists (select 1 from public.productos q
                   where q.cliente_id = p.cliente_id and q.id <> p.id and lower(q.color) = 'gris'
                     and coalesce((q.especificaciones->>'bolsa')::boolean, false) = coalesce((p.especificaciones->>'bolsa')::boolean, false));

-- 3) Verde Jade → Verde Supervisor (normalmente ya no hay ninguna)
update public.productos p
   set nombre = replace(p.nombre, 'Verde Jade', 'Verde Supervisor'), color = 'Verde Supervisor'
 where p.cliente_id = public.atr_cliente_id() and lower(p.color) = 'verde jade'
   and not exists (select 1 from public.productos q
                   where q.cliente_id = p.cliente_id and q.id <> p.id and lower(q.color) = 'verde supervisor'
                     and coalesce((q.especificaciones->>'bolsa')::boolean, false) = coalesce((p.especificaciones->>'bolsa')::boolean, false));

-- 4) Manual
update public.manuales
   set contenido = replace(contenido, $a$### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR** (pestaña **Inventario**).
2. Busca en **Buscar color, talla…** o filtra por producto.
3. Cada línea dice **Producto**, **Talla**, **Color** y **Existencia**. Toca una línea para ver su historial (con la orden o la OC de cada movimiento).
$a$, $b$### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR** (pestaña **Inventario**).
2. Cada renglón es una bata: su **color** (la etiqueta viene del mismo color) y si es **● Con bolsa** (negra) u **○ Sin bolsa** (punteada). Salen todas las batas del catálogo, aunque estén en 0.
3. Las **tallas son columnas** (S, M, L, XL, 2XL, 3XL; XS, 4XL y 5XL salen si tienen algo) y al final el **Total**. Abajo, el total por talla.
4. Filtra con **Todas / ● Con bolsa / ○ Sin bolsa** y tocando un **color**; también puedes buscar o marcar **Solo con existencia**.
5. Toca un número para ver el historial de esa bata y talla (con la orden o la OC de cada movimiento).
$b$),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null
   and actualizado_por_nombre = 'Carga inicial'
   and position('Las **tallas son columnas**' in contenido) = 0;

-- Comprobación (debe dar: 10 · 14 · 0 · 1 · true)
--   batas con bolsa · batas sin bolsa (las 13 de Microsip + Guinda) ·
--   batas que se siguen llamando "Gris Rata" · existe la con bolsa Naranja ·
--   el manual ya explica el inventario nuevo
select
  (select count(*) from public.productos where cliente_id = public.atr_cliente_id()
     and coalesce((especificaciones->>'bolsa')::boolean, false))                              as con_bolsa,
  (select count(*) from public.productos where cliente_id = public.atr_cliente_id()
     and not coalesce((especificaciones->>'bolsa')::boolean, false))                          as sin_bolsa,
  (select count(*) from public.productos where cliente_id = public.atr_cliente_id()
     and lower(color) = 'gris rata')                                                          as gris_rata,
  (select count(*) from public.productos where cliente_id = public.atr_cliente_id()
     and lower(nombre) = 'bata con bolsa naranja')                                            as con_bolsa_naranja,
  (select bool_and(position('Las **tallas son columnas**' in contenido) > 0)
     from public.manuales where clave = 'atr' and eliminado_en is null)                       as manual_nuevo;
