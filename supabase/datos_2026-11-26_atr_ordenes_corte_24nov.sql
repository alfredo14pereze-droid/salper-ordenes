-- =====================================================================
-- Datos 2026-11-26 — Dos órdenes de taller de ATR (corte del 24/11/26, 115 batas)
-- Pedido de Alfredo. Se crean con atr_crear_orden_taller (como la pantalla),
-- a nombre de Alfredo Pérez, fecha de creación 24-nov-2026, entrega 4-dic-2026,
-- tela Tafetan, tipo Industrial, sin precio. CH = S (tallas Microsip).
--   Orden 1 (papel verde, 51): sin bolsa Azul Cielo S20 M20 L5 2XL1 3XL2; con bolsa Café 2XL3
--   Orden 2 (libreta − papel verde, 64): sin bolsa Azul Cielo S12 M24 2XL12 3XL7; con bolsa Café 2XL9
-- Si ya existen (misma descripción), no crea nada.
-- =====================================================================
begin;

select set_config('request.jwt.claims',
  json_build_object('sub', '4edb166b-e790-4f9b-90bb-cc76bb9b25de', 'role', 'authenticated')::text, true);

do $$
begin
  if exists (select 1 from public.orders where client_id = public.atr_cliente_id()
             and description like 'Corte del 24/11/26%' and eliminada_en is null) then
    raise exception 'Las órdenes del corte del 24/11/26 ya existen. No se creó nada.';
  end if;
  if public.current_user_role() is distinct from 'admin_general' then
    raise exception 'No se pudo usar el usuario de Alfredo. No se creó nada.';
  end if;
end $$;

create temp table _atr_corte on commit drop as
with tela as (select id, nombre from public.telas where nombre = 'Tafetan'),
lineas (orden, producto_id, talla, cantidad, pos) as (values
  (1, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, 'S',   20, 1),
  (1, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, 'M',   20, 2),
  (1, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, 'L',    5, 3),
  (1, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, '2XL',  1, 4),
  (1, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, '3XL',  2, 5),
  (1, '6e171c08-e253-4b41-98e8-8872fb3eb23c'::uuid, '2XL',  3, 6),
  (2, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, 'S',   12, 1),
  (2, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, 'M',   24, 2),
  (2, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, '2XL', 12, 4),
  (2, 'd80278ef-2774-4f85-91f6-0b0f8895073c'::uuid, '3XL',  7, 5),
  (2, '6e171c08-e253-4b41-98e8-8872fb3eb23c'::uuid, '2XL',  9, 6)
),
prendas as (
  select l.orden, p.id, min(l.pos) as pos,
         jsonb_build_object(
           'id', gen_random_uuid(), 'producto_id', p.id, 'producto_nombre', p.nombre,
           'garment', coalesce(p.garment, 'Bata'), 'color', coalesce(p.color, ''), 'pantone', '',
           'tela_id', t.id, 'tela_nombre', t.nombre, 'foto_url', coalesce(p.foto_url, ''),
           'manga', '', 'vivos', '', 'cuello', '', 'punos', '', 'observaciones', '',
           'logotipos', '', 'numeros', '', 'lleva_bolsas', false, 'tiene_roster', false, 'roster', '[]'::jsonb,
           'lleva_bordado', false, 'bordados', '[]'::jsonb, 'bordado_ubicacion', '',
           'sizes', jsonb_agg(jsonb_build_object('talla', l.talla, 'cantidad', l.cantidad) order by l.pos)) as item
  from lineas l
  join public.productos p on p.id = l.producto_id and p.cliente_id = public.atr_cliente_id()
  cross join tela t
  group by l.orden, p.id, p.nombre, p.garment, p.color, p.foto_url, t.id, t.nombre
)
select orden, jsonb_agg(item order by pos) as items from prendas group by orden;

do $$
begin
  if (select count(*) from _atr_corte) <> 2
     or (select sum(jsonb_array_length(items)) from _atr_corte) <> 4
     or not exists (select 1 from public.telas where nombre = 'Tafetan') then
    raise exception 'No encontré las batas o la tela Tafetan. No se creó nada.';
  end if;
end $$;

select o.order_number, o.description, o.atr_inventario,
       (select sum((s->>'cantidad')::int) from jsonb_array_elements(o.items) it, jsonb_array_elements(it->'sizes') s) as batas,
       (select count(*) from public.orden_etapas e where e.order_id = o.id) as etapas
from _atr_corte c
cross join lateral public.atr_crear_orden_taller(
  case c.orden when 1 then 'Corte del 24/11/26 · Orden 1, la del papel verde (51 batas).'
               else 'Corte del 24/11/26 · Orden 2, la libreta menos el papel verde (64 batas).' end,
  '2026-12-04'::date, c.items, '{}'::text[], '2026-11-24 12:00:00-06'::timestamptz) o
order by c.orden;

commit;
