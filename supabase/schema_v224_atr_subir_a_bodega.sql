-- =====================================================================
-- V224 — ATR: "Subir a bodega" como en Frisa
--
-- Requiere V211, V217, V221 y V223. Aditivo; se puede correr dos veces.
--
-- Decisión de Alfredo (2026-11-26): igual que Frisa. Al completar Terminado,
-- la orden de ATR queda "Por subir" (Surtido ATR → Por subir) y las batas
-- entran al inventario SOLO cuando Terminado o un administrador toca
-- "Subir a bodega" (con las piezas que de verdad subieron).
-- Antes (V211) entraban solas al completar Terminado.
--
-- Qué hace:
--   1) Tablas atr_subidas (una por orden) y atr_subida_lineas (piezas por
--      línea de la orden). Solo se leen/escriben con las funciones de abajo.
--   2) Permiso atr.subir: terminado, admin_fabrica y admin_general.
--   3) Las órdenes que YA entraron al inventario quedan registradas como
--      subidas (mismas piezas), para que nada se revierta.
--   4) atr_lineas_orden (lo que debe estar sumado): ahora sale de la subida,
--      no de lo surtido. Sin subida no se suma nada.
--   5) Si se reabre Terminado, la subida se borra (vuelve a "Por subir" al
--      completarse otra vez) y lo sumado se revierte, como antes.
--   6) RPC: atr_subir_orden, atr_por_subir, atr_subidas_recientes,
--      atr_subida_orden.
--   7) "Qué nos falta": una orden terminada que falta subir sigue contando
--      en "En taller" (con lo surtido) hasta que se sube.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.atr_sincronizar_orden(uuid, text)') is null
     or to_regprocedure('public.atr_lineas_orden(uuid)') is null
     or to_regprocedure('public.atr_faltantes()') is null
     or to_regprocedure('public.atr_apartado_bt(uuid, text)') is null
     or to_regprocedure('public.atr_talla(text)') is null
     or to_regprocedure('public.orders_atr_catalogo_guard()') is null then
    raise exception 'V224: falta V211/V217/V221/V223. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.atr_subidas (
  order_id uuid primary key references public.orders(id) on delete cascade,
  subido_en timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  notas text
);
create table if not exists public.atr_subida_lineas (
  order_id uuid not null references public.atr_subidas(order_id) on delete cascade,
  item_index integer not null,
  size_index integer not null,
  cantidad integer not null check (cantidad >= 0),
  primary key (order_id, item_index, size_index)
);
alter table public.atr_subidas enable row level security;
alter table public.atr_subida_lineas enable row level security;
revoke all on public.atr_subidas, public.atr_subida_lineas from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Permiso
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('atr.subir', 'Inventario ATR', 'Subir a bodega órdenes de ATR',
   'Confirmar que las batas de una orden de ATR terminada ya se subieron a bodega; ahí entran al inventario.', 'editar', 86)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, clave) values
  ('terminado', 'atr.subir'), ('admin_fabrica', 'atr.subir'), ('admin_general', 'atr.subir')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) Lo que ya entró al inventario queda como "subido" (no se revierte nada)
-- ---------------------------------------------------------------------
insert into public.atr_subidas (order_id, subido_en, usuario_nombre, notas)
select m.order_id, min(m.creado_en), 'Automático', 'Entró al completar Terminado (antes de V224).'
from public.atr_movimientos m
join public.orders o on o.id = m.order_id
where m.tipo = 'entrada_produccion' and m.revertido_en is null
group by m.order_id
on conflict (order_id) do nothing;

insert into public.atr_subida_lineas (order_id, item_index, size_index, cantidad)
select m.order_id, m.item_index, m.size_index, sum(m.cantidad)::integer
from public.atr_movimientos m
join public.orders o on o.id = m.order_id
where m.tipo = 'entrada_produccion' and m.revertido_en is null
group by m.order_id, m.item_index, m.size_index
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4) Lo que DEBE estar sumado: lo subido (no lo surtido)
-- ---------------------------------------------------------------------
create or replace function public.atr_lineas_orden(p_order_id uuid)
returns table (item_index integer, size_index integer, producto_id uuid, talla text, cantidad integer)
language sql stable security definer set search_path = public as $$
  select (it.n - 1)::integer, (sz.m - 1)::integer, p.id, public.atr_talla(sz.s->>'talla'), sl.cantidad
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality it(i, n)
  join public.productos p
    on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
  cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) with ordinality sz(s, m)
  join public.atr_subida_lineas sl
    on sl.order_id = o.id and sl.item_index = (it.n - 1) and sl.size_index = (sz.m - 1)
  where o.id = p_order_id
    and o.client_id = public.atr_cliente_id()
    and o.eliminada_en is null
    and exists (select 1 from public.orden_etapas e
                where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado')
    and coalesce(btrim(sz.s->>'talla'), '') <> ''
    and sl.cantidad > 0
$$;
revoke execute on function public.atr_lineas_orden(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Reabrir Terminado borra la subida (vuelve a "Por subir")
-- ---------------------------------------------------------------------
create or replace function public.atr_orden_etapas_trg()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if coalesce(new.etapa, old.etapa) <> 'terminado' then return null; end if;
  if not exists (select 1 from public.orders where id = v_order and client_id = public.atr_cliente_id())
     and not exists (select 1 from public.atr_movimientos where order_id = v_order) then
    return null;
  end if;
  -- V224: si Terminado deja de estar completado, la subida ya no vale.
  if tg_op = 'DELETE' or new.estado <> 'completado' then
    delete from public.atr_subidas where order_id = v_order;
  end if;
  perform public.atr_sincronizar_orden(v_order,
    case when tg_op = 'DELETE' then 'Se quitó la etapa Terminado'
         when new.estado <> 'completado' then 'Se reabrió Terminado'
         else null end);
  return null;
end;
$$;
revoke execute on function public.atr_orden_etapas_trg() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Funciones para la pantalla
-- ---------------------------------------------------------------------

-- Órdenes de ATR terminadas que faltan subir, con sus líneas (para el modal).
create or replace function public.atr_por_subir()
returns table (order_id uuid, order_number text, requested_delivery_date date, terminado_en timestamptz,
               piezas integer, lineas jsonb, prendas_sin_ligar integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_number, o.requested_delivery_date,
         (select max(e.estado_cambiado_en) from public.orden_etapas e where e.order_id = o.id and e.etapa = 'terminado'),
         coalesce((select sum((l->>'surtida')::integer) from jsonb_array_elements(x.lineas) l), 0)::integer,
         x.lineas,
         (select count(*) from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it(i)
          where not exists (select 1 from public.productos p
                            where p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id))::integer
  from public.orders o
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_index', it.n - 1, 'size_index', sz.m - 1,
             'producto_id', p.id, 'producto', p.nombre, 'color', p.color,
             'con_bolsa', coalesce((p.especificaciones->>'bolsa')::boolean, false),
             'talla', public.atr_talla(sz.s->>'talla'),
             'pedida', case when coalesce(sz.s->>'cantidad', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                            then floor((sz.s->>'cantidad')::numeric)::integer else 0 end,
             'surtida', case when jsonb_typeof(sz.s->'cantidad_surtida') = 'number'
                             then floor((sz.s->>'cantidad_surtida')::numeric)::integer else 0 end)
           order by it.n, sz.m), '[]'::jsonb) as lineas
    from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality it(i, n)
    join public.productos p on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
    cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) with ordinality sz(s, m)
    where coalesce(btrim(sz.s->>'talla'), '') <> ''
  ) x
  where o.client_id = public.atr_cliente_id()
    and o.eliminada_en is null
    and exists (select 1 from public.orden_etapas e
                where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado')
    and not exists (select 1 from public.atr_subidas s where s.order_id = o.id)
    and (public.tiene_permiso('atr.ver') or public.tiene_permiso('atr.subir'))
  order by 4 nulls last, o.order_number
$$;
revoke execute on function public.atr_por_subir() from public, anon;
grant execute on function public.atr_por_subir() to authenticated;

-- Subidas de los últimos p_dias días.
create or replace function public.atr_subidas_recientes(p_dias integer default 15)
returns table (order_id uuid, order_number text, subido_en timestamptz, usuario_nombre text, piezas integer, notas text)
language sql stable security definer set search_path = public as $$
  select s.order_id, o.order_number, s.subido_en, s.usuario_nombre,
         coalesce((select sum(l.cantidad) from public.atr_subida_lineas l where l.order_id = s.order_id), 0)::integer,
         s.notas
  from public.atr_subidas s
  join public.orders o on o.id = s.order_id
  where s.subido_en >= now() - make_interval(days => greatest(1, coalesce(p_dias, 15)))
    and (public.tiene_permiso('atr.ver') or public.tiene_permiso('atr.subir'))
  order by s.subido_en desc
$$;
revoke execute on function public.atr_subidas_recientes(integer) from public, anon;
grant execute on function public.atr_subidas_recientes(integer) to authenticated;

-- Para la etiqueta de la orden: ¿terminada? ¿subida? ¿por quién?
create or replace function public.atr_subida_orden(p_order_id uuid)
returns table (es_atr boolean, terminado boolean, subida boolean, subido_en timestamptz, usuario_nombre text, piezas integer)
language sql stable security definer set search_path = public as $$
  select o.client_id is not distinct from public.atr_cliente_id(),
         exists (select 1 from public.orden_etapas e
                 where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado'),
         s.order_id is not null, s.subido_en, s.usuario_nombre,
         coalesce((select sum(l.cantidad) from public.atr_subida_lineas l where l.order_id = o.id), 0)::integer
  from public.orders o
  left join public.atr_subidas s on s.order_id = o.id
  where o.id = p_order_id and auth.uid() is not null
$$;
revoke execute on function public.atr_subida_orden(uuid) from public, anon;
grant execute on function public.atr_subida_orden(uuid) to authenticated;

-- Subir a bodega. p_lineas: [{item_index, size_index, cantidad}] (líneas de
-- bata de ATR de la orden). Las que no vengan cuentan como 0.
create or replace function public.atr_subir_orden(p_order_id uuid, p_lineas jsonb, p_notas text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders;
  v_total integer;
  v_malo text;
begin
  if not public.tiene_permiso('atr.subir') then
    raise exception 'No tienes permiso para subir a bodega órdenes de ATR.';
  end if;
  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  select * into v_o from public.orders where id = p_order_id;
  if v_o.id is null or v_o.client_id is distinct from public.atr_cliente_id() then
    raise exception 'Esa orden no es de ATR.';
  end if;
  if v_o.eliminada_en is not null then raise exception 'La orden % está eliminada.', v_o.order_number; end if;
  if not exists (select 1 from public.orden_etapas e
                 where e.order_id = v_o.id and e.etapa = 'terminado' and e.estado = 'completado') then
    raise exception 'La orden % todavía no completa Terminado.', v_o.order_number;
  end if;
  if exists (select 1 from public.atr_subidas where order_id = v_o.id) then
    raise exception 'La orden % ya se subió a bodega.', v_o.order_number;
  end if;
  if jsonb_typeof(coalesce(p_lineas, 'null'::jsonb)) <> 'array' then
    raise exception 'Formato de líneas inválido.';
  end if;

  -- Cada línea: entero >= 0 y que sea una bata de ATR de esta orden.
  select string_agg(coalesce(l->>'item_index', '?') || '/' || coalesce(l->>'size_index', '?'), ', ') into v_malo
  from jsonb_array_elements(p_lineas) l
  where coalesce(l->>'cantidad', '') !~ '^[0-9]+$'
     or not exists (
       select 1
       from jsonb_array_elements(coalesce(v_o.items, '[]'::jsonb)) with ordinality it(i, n)
       join public.productos p on p.id::text = it.i->>'producto_id' and p.cliente_id = v_o.client_id
       cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) with ordinality sz(s, m)
       where (it.n - 1)::text = l->>'item_index' and (sz.m - 1)::text = l->>'size_index'
         and coalesce(btrim(sz.s->>'talla'), '') <> '');
  if v_malo is not null then
    raise exception 'Hay líneas que no son batas de ATR de la orden o con cantidad inválida (%).', v_malo;
  end if;
  if (select count(*) from jsonb_array_elements(p_lineas) l) <>
     (select count(distinct (l->>'item_index') || '/' || (l->>'size_index')) from jsonb_array_elements(p_lineas) l) then
    raise exception 'Hay líneas repetidas.';
  end if;

  select coalesce(sum((l->>'cantidad')::integer), 0) into v_total from jsonb_array_elements(p_lineas) l;
  if v_total <= 0 then raise exception 'Captura cuántas batas se subieron.'; end if;

  insert into public.atr_subidas (order_id, usuario_id, usuario_nombre, notas)
  values (v_o.id, auth.uid(), public.atr_usuario_nombre(), nullif(btrim(coalesce(p_notas, '')), ''));
  insert into public.atr_subida_lineas (order_id, item_index, size_index, cantidad)
  select v_o.id, (l->>'item_index')::integer, (l->>'size_index')::integer, (l->>'cantidad')::integer
  from jsonb_array_elements(p_lineas) l;

  perform public.atr_sincronizar_orden(v_o.id, null);
  -- En el historial: quién subió (no "automático").
  update public.atr_movimientos
     set usuario_nombre = public.atr_usuario_nombre(),
         nota = coalesce(nota, 'Subido a bodega')
   where order_id = v_o.id and tipo = 'entrada_produccion' and revertido_en is null and creado_en >= now();
  return v_total;
end;
$$;
revoke execute on function public.atr_subir_orden(uuid, jsonb, text) from public, anon;
grant execute on function public.atr_subir_orden(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Qué nos falta: lo terminado que falta subir sigue "En taller"
-- ---------------------------------------------------------------------
create or replace function public.atr_faltantes()
returns table (
  producto_id uuid, producto text, color text, con_bolsa boolean, talla text,
  pendiente integer, existencia integer, en_taller integer, faltante integer,
  en_taller_ordenes jsonb, apartado integer, disponible integer
)
language sql stable security definer set search_path = public as $$
  with pend as (
    select l.producto_id, l.talla,
           sum(greatest(0, l.cantidad_pedida - public.atr_linea_entregado(l.id) - public.atr_linea_apartado(l.id)))::integer as pendiente
    from public.atr_oc_lineas l
    join public.atr_ordenes_compra o on o.id = l.oc_id
    where o.estado in ('abierta', 'parcial')
    group by 1, 2
  ), exist as (
    select m.producto_id, m.talla, sum(m.cantidad)::integer as existencia
    from public.atr_movimientos m group by 1, 2
  ), taller_lineas as (
    -- V224: hasta que se sube a bodega. Ya terminada cuenta lo surtido.
    select p.id as producto_id, public.atr_talla(sz.s->>'talla') as talla,
           o.id as order_id, o.order_number, c.q as cantidad, t.term as por_subir
    from public.orders o
    cross join lateral (select exists (select 1 from public.orden_etapas e
                         where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado') as term) t
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it(i)
    join public.productos p on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
    cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) sz(s)
    cross join lateral (select (case
        when t.term and jsonb_typeof(sz.s->'cantidad_surtida') = 'number' then floor((sz.s->>'cantidad_surtida')::numeric)
        when coalesce(sz.s->>'cantidad', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then floor((sz.s->>'cantidad')::numeric)
        else 0 end)::integer as q) c
    where o.client_id = public.atr_cliente_id()
      and o.eliminada_en is null
      and not exists (select 1 from public.atr_subidas su where su.order_id = o.id)
      and coalesce(btrim(sz.s->>'talla'), '') <> ''
      and c.q > 0
  ), taller as (
    select producto_id, talla, sum(cantidad)::integer as en_taller,
           jsonb_agg(jsonb_build_object('order_id', order_id, 'order_number', order_number, 'cantidad', cantidad,
                                        'por_subir', por_subir)
                     order by order_number) as ordenes
    from taller_lineas group by 1, 2
  )
  select pd.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         pd.talla, pd.pendiente,
         coalesce(e.existencia, 0),
         coalesce(t.en_taller, 0),
         greatest(0, pd.pendiente - greatest(0, coalesce(e.existencia, 0) - x.apa) - coalesce(t.en_taller, 0)),
         coalesce(t.ordenes, '[]'::jsonb),
         x.apa,
         coalesce(e.existencia, 0) - x.apa
  from pend pd
  join public.productos p on p.id = pd.producto_id
  left join exist e on e.producto_id = pd.producto_id and e.talla = pd.talla
  left join taller t on t.producto_id = pd.producto_id and t.talla = pd.talla
  cross join lateral (select public.atr_apartado_bt(pd.producto_id, pd.talla) as apa) x
  where pd.pendiente > 0 and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], pd.talla), pd.talla
$$;
revoke execute on function public.atr_faltantes() from public, anon;
grant execute on function public.atr_faltantes() to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: true · 3 · 0 · true · false)
--   tablas · roles con atr.subir · órdenes que perderían su entrada ·
--   funciones nuevas · anon puede subir
-- ---------------------------------------------------------------------
select
  to_regclass('public.atr_subidas') is not null and to_regclass('public.atr_subida_lineas') is not null as tablas,
  (select count(*) from public.rol_permisos where clave = 'atr.subir')                                  as roles_subir,
  (select count(*) from (select distinct m.order_id from public.atr_movimientos m
                         where m.tipo = 'entrada_produccion' and m.revertido_en is null
                           and not exists (select 1 from public.atr_lineas_orden(m.order_id) d
                                           where d.item_index = m.item_index and d.size_index = m.size_index
                                             and d.cantidad = m.cantidad)) z)                          as se_revertirian,
  to_regprocedure('public.atr_subir_orden(uuid, jsonb, text)') is not null
    and to_regprocedure('public.atr_por_subir()') is not null
    and to_regprocedure('public.atr_subida_orden(uuid)') is not null                                   as funciones,
  has_function_privilege('anon', 'public.atr_subir_orden(uuid, jsonb, text)', 'EXECUTE')               as anon_puede;
