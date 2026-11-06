-- =====================================================================
-- V187 — Frisa fase 4: playera lisa (sin procesos) (2026-11-06)
-- =====================================================================
-- La playera que se compra al proveedor antes de procesos (reflejante,
-- impresión). Se lleva por COLOR + MANGA + TALLA; varios productos Frisa
-- usan la misma lisa (ej. la marino manga larga sirve para la de reflejante
-- y la sin reflejante). Sin mínimos ni máximos: se compra lo que piden las
-- órdenes de taller.
--
-- Por lisa (lo calcula la pantalla, utils/frisaLisas.js):
--   stock      = lo que hay en el anaquel = suma de frisa_lisa_movimientos
--   en proceso = piezas de las órdenes de taller ligadas que no se han subido a bodega (informativo)
--   a comprar  = lo que piden las órdenes de taller propuestas − stock (mínimo 0)
-- Las lisas se DESCUENTAN al crear / ligar la orden de taller (salen del
-- anaquel al taller) y REGRESAN si la orden se quita del restock. Así el stock
-- cuadra con un conteo físico del anaquel. Comprar lisas = pedido de compra
-- (como el pantalón); al recibirlo entran (movimiento 'compra'). El stock puede
-- quedar negativo si se usan lisas que nunca se registraron: es la señal de
-- que falta capturar su conteo o una compra.
--
-- Aditivo: 4 tablas nuevas y 3 funciones de V186 reemplazadas con la misma
-- firma (ligar descuenta lisas, quitar las regresa; recibir compra acepta lisas). Se
-- puede correr dos veces. Rollback al final. Requiere V186.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
-- Qué lisa usa cada producto Frisa (solo las playeras compradas).
create table if not exists public.frisa_producto_lisa (
  producto_frisa_id  uuid primary key references public.productos_frisa(id) on delete cascade,
  color              text not null check (btrim(color) <> ''),
  manga              text not null check (manga in ('MC', 'ML')),
  proveedor          text
);

create table if not exists public.frisa_lisas (
  id              uuid primary key default gen_random_uuid(),
  color           text not null check (btrim(color) <> ''),
  manga           text not null check (manga in ('MC', 'ML')),
  talla           text not null check (btrim(talla) <> ''),
  stock           integer not null default 0,
  actualizado_en  timestamptz not null default now(),
  stock_actualizado_en timestamptz,
  stock_actualizado_por_nombre text
);
create unique index if not exists frisa_lisas_uq on public.frisa_lisas (lower(btrim(color)), manga, upper(btrim(talla)));

create table if not exists public.frisa_lisa_movimientos (
  id                 uuid primary key default gen_random_uuid(),
  lisa_id            uuid not null references public.frisa_lisas(id) on delete restrict,
  tipo               text not null check (tipo in ('inicial', 'ajuste', 'compra', 'consumo', 'devolucion')),
  cantidad           integer not null,
  order_id           uuid references public.orders(id) on delete restrict,
  compra_id          uuid references public.frisa_compras(id) on delete restrict,
  referencia         text,
  notas              text,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now(),
  constraint frisa_lisa_mov_cantidad_ck check (
    (tipo = 'inicial' and cantidad >= 0) or (tipo = 'compra' and cantidad > 0)
    or (tipo = 'consumo' and cantidad < 0) or (tipo = 'devolucion' and cantidad > 0) or (tipo = 'ajuste' and cantidad <> 0)
  )
);
create index if not exists frisa_lisa_mov_idx on public.frisa_lisa_movimientos (lisa_id, creado_en desc);

create table if not exists public.frisa_compra_lineas_lisa (
  id         uuid primary key default gen_random_uuid(),
  compra_id  uuid not null references public.frisa_compras(id) on delete cascade,
  lisa_id    uuid not null references public.frisa_lisas(id) on delete restrict,
  cantidad   integer not null check (cantidad > 0),
  recibida   integer check (recibida >= 0),
  unique (compra_id, lisa_id)
);

-- El stock de la lisa sigue a sus movimientos; los movimientos no se editan.
create or replace function public.frisa_lisa_mov_aplicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.frisa_lisas set stock = stock + new.cantidad, actualizado_en = now() where id = new.lisa_id;
  return new;
end $$;
revoke execute on function public.frisa_lisa_mov_aplicar() from public, anon, authenticated;
drop trigger if exists frisa_lisa_mov_aplicar_trg on public.frisa_lisa_movimientos;
create trigger frisa_lisa_mov_aplicar_trg after insert on public.frisa_lisa_movimientos
  for each row execute function public.frisa_lisa_mov_aplicar();
drop trigger if exists frisa_lisa_mov_inmutable_trg on public.frisa_lisa_movimientos;
create trigger frisa_lisa_mov_inmutable_trg before update or delete on public.frisa_lisa_movimientos
  for each row execute function public.frisa_inv_mov_inmutable();

-- ---------------------------------------------------------------------
-- 2) Qué lisa usa cada playera, y las lisas (S a 3XL) — solo las que falten
-- ---------------------------------------------------------------------
insert into public.frisa_producto_lisa (producto_frisa_id, color, manga, proveedor)
select pf.id, m.color, m.manga, pf.proveedor
from (values
  ('FR-PLA-AM-MC',    'Azul marino', 'MC'),
  ('FR-PLA-AM-ML',    'Azul marino', 'ML'),
  ('FR-PLA-AM-SR-ML', 'Azul marino', 'ML'),
  ('FR-PLA-OM-MC',    'Oro mango',   'MC'),
  ('FR-PLA-VE-MC',    'Verde',       'MC'),
  ('FR-PLA-RO-MC',    'Roja',        'MC')
) as m(codigo, color, manga)
join public.productos_frisa pf on lower(pf.codigo) = lower(m.codigo)
on conflict do nothing;

insert into public.frisa_lisas (color, manga, talla)
select distinct pl.color, pl.manga, t.talla
from public.frisa_producto_lisa pl
cross join (values ('S'), ('M'), ('L'), ('XL'), ('2XL'), ('3XL')) as t(talla)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) RLS: lectura con fn.ver; sin escritura directa
-- ---------------------------------------------------------------------
alter table public.frisa_producto_lisa       enable row level security;
alter table public.frisa_lisas               enable row level security;
alter table public.frisa_lisa_movimientos    enable row level security;
alter table public.frisa_compra_lineas_lisa  enable row level security;

drop policy if exists frisa_producto_lisa_select on public.frisa_producto_lisa;
create policy frisa_producto_lisa_select on public.frisa_producto_lisa for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_lisas_select on public.frisa_lisas;
create policy frisa_lisas_select on public.frisa_lisas for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_lisa_movimientos_select on public.frisa_lisa_movimientos;
create policy frisa_lisa_movimientos_select on public.frisa_lisa_movimientos for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_compra_lineas_lisa_select on public.frisa_compra_lineas_lisa;
create policy frisa_compra_lineas_lisa_select on public.frisa_compra_lineas_lisa for select to authenticated using (public.tiene_permiso('fn.ver'));

revoke all on public.frisa_producto_lisa, public.frisa_lisas, public.frisa_lisa_movimientos, public.frisa_compra_lineas_lisa from anon, public;
revoke insert, update, delete, truncate on public.frisa_producto_lisa, public.frisa_lisas, public.frisa_lisa_movimientos, public.frisa_compra_lineas_lisa from authenticated;
grant select on public.frisa_producto_lisa, public.frisa_lisas, public.frisa_lisa_movimientos, public.frisa_compra_lineas_lisa to authenticated;

-- ---------------------------------------------------------------------
-- 4) Funciones nuevas
-- ---------------------------------------------------------------------
-- 4a) Capturar el conteo de una lisa (queda como ajuste; el primero, como inicial).
create or replace function public.frisa_lisa_capturar(p_lisa_id uuid, p_stock integer, p_comentario text default null)
returns public.frisa_lisas
language plpgsql security definer set search_path = public as $$
declare
  v_l public.frisa_lisas;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_primero boolean;
begin
  if not public.tiene_permiso('fr.bodega') then
    raise exception 'No tienes permiso para capturar playera lisa.' using errcode = '42501';
  end if;
  if p_stock is null or p_stock < 0 then raise exception 'El conteo debe ser un número entero de 0 o más.'; end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_l from public.frisa_lisas where id = p_lisa_id for update;
  if not found then raise exception 'No existe esa playera lisa.'; end if;
  v_primero := not exists (select 1 from public.frisa_lisa_movimientos where lisa_id = p_lisa_id);
  if v_primero then
    insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, referencia, notas, creado_por, creado_por_nombre)
    values (p_lisa_id, 'inicial', p_stock - v_l.stock, 'Primer conteo', nullif(btrim(coalesce(p_comentario, '')), ''), auth.uid(), v_nombre);
  elsif p_stock <> v_l.stock then
    insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, referencia, notas, creado_por, creado_por_nombre)
    values (p_lisa_id, 'ajuste', p_stock - v_l.stock, 'Conteo', nullif(btrim(coalesce(p_comentario, '')), ''), auth.uid(), v_nombre);
  end if;
  update public.frisa_lisas set stock_actualizado_en = now(), stock_actualizado_por_nombre = v_nombre
   where id = p_lisa_id returning * into v_l;
  return v_l;
end $$;

-- 4b) Pedido de compra de playera lisa. p_lineas: [{lisa_id, cantidad}]
create or replace function public.frisa_compra_crear_lisas(p_proveedor text, p_fecha_esperada date, p_lineas jsonb, p_notas text default null)
returns public.frisa_compras
language plpgsql security definer set search_path = public as $$
declare
  v_c public.frisa_compras;
  v_l jsonb;
begin
  if not public.tiene_permiso('fr.compras') then
    raise exception 'No tienes permiso para crear pedidos de compra.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_proveedor, '')), '') is null then raise exception 'Escribe el proveedor.'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El pedido no tiene renglones.';
  end if;
  if (select count(*) <> count(distinct e->>'lisa_id') from jsonb_array_elements(p_lineas) e) then
    raise exception 'Hay una playera repetida en el pedido.';
  end if;
  insert into public.frisa_compras (proveedor, fecha_esperada, notas, creado_por, creado_por_nombre)
  values (btrim(p_proveedor), p_fecha_esperada, coalesce(nullif(btrim(coalesce(p_notas, '')), ''), 'Playera lisa'), auth.uid(), public.frisa_niveles_nombre_usuario())
  returning * into v_c;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    if not exists (select 1 from public.frisa_lisas where id = nullif(v_l->>'lisa_id', '')::uuid) then
      raise exception 'Hay un renglón sin playera lisa.';
    end if;
    if coalesce((v_l->>'cantidad')::int, 0) <= 0 then raise exception 'Las cantidades deben ser mayores que 0.'; end if;
    insert into public.frisa_compra_lineas_lisa (compra_id, lisa_id, cantidad) values (v_c.id, (v_l->>'lisa_id')::uuid, (v_l->>'cantidad')::int);
  end loop;
  return v_c;
end $$;

-- ---------------------------------------------------------------------
-- 5) V186 reemplazadas (misma firma)
-- ---------------------------------------------------------------------
-- Lisas de una orden FR por talla (solo si su producto usa lisa): [lisa_id, piezas].
create or replace function public.frisa_lisas_de_orden(p_order uuid)
returns table (lisa_id uuid, piezas integer)
language sql stable security definer set search_path = public as $$
  select li.id, sum((sz->>'cantidad')::int)::int
  from public.orders o
  cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
  cross join lateral jsonb_array_elements(case when jsonb_typeof(it->'sizes') = 'array' then it->'sizes' else '[]'::jsonb end) sz
  join public.frisa_producto_lisa pl on pl.producto_frisa_id = o.producto_frisa_id
  join public.frisa_lisas li on lower(btrim(li.color)) = lower(btrim(pl.color)) and li.manga = pl.manga
                            and upper(btrim(li.talla)) = upper(btrim(sz->>'talla'))
  where o.id = p_order and coalesce(nullif(sz->>'cantidad', '')::int, 0) > 0
  group by li.id;
$$;
revoke execute on function public.frisa_lisas_de_orden(uuid) from public, anon, authenticated;

-- 5a) Ligar una orden FR al restock: además se descuentan sus lisas (salen al taller).
create or replace function public.frisa_restock_ligar(p_order_id uuid, p_origen text default 'restock')
returns public.frisa_restock_ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders;
  v_r public.frisa_restock_ordenes;
  v_nueva boolean;
begin
  if not public.tiene_permiso('fr.ordenes') then
    raise exception 'No tienes permiso para ligar órdenes de taller de Frisa.' using errcode = '42501';
  end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'No existe la orden.'; end if;
  if v_o.order_type_key <> 'frisa' then raise exception 'La orden % no es de Frisa.', v_o.order_number; end if;
  if v_o.cancelled_at is not null or v_o.eliminada_en is not null then
    raise exception 'La orden % está cancelada o eliminada.', v_o.order_number;
  end if;
  if not exists (select 1 from public.frisa_clave_producto where producto_frisa_id = v_o.producto_frisa_id) then
    raise exception 'El producto de la orden % no está ligado a ninguna clave de inventario.', v_o.order_number;
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  v_nueva := not exists (select 1 from public.frisa_restock_ordenes where order_id = p_order_id);
  insert into public.frisa_restock_ordenes (order_id, origen, creado_por, creado_por_nombre)
  values (p_order_id, case when p_origen = 'ligada' then 'ligada' else 'restock' end, auth.uid(), public.frisa_niveles_nombre_usuario())
  on conflict (order_id) do nothing;
  if v_nueva then
    insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, order_id, referencia, creado_por, creado_por_nombre)
    select x.lisa_id, 'consumo', -x.piezas, p_order_id, format('Orden de taller %s', v_o.order_number), auth.uid(), public.frisa_niveles_nombre_usuario()
    from public.frisa_lisas_de_orden(p_order_id) x;
  end if;
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id;
  return v_r;
end $$;

-- 5b) Quitar la orden del restock: sus lisas regresan al anaquel.
create or replace function public.frisa_restock_desligar(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_r public.frisa_restock_ordenes;
  v_o public.orders;
begin
  if not public.tiene_permiso('fr.ordenes') then
    raise exception 'No tienes permiso para quitar órdenes del restock.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id for update;
  if not found then raise exception 'La orden no está en el restock.'; end if;
  if v_r.ingresado_en is not null then raise exception 'Esa orden ya se subió a bodega; corrige con un conteo.'; end if;
  select * into v_o from public.orders where id = p_order_id;
  -- Regresa lo que se descontó al ligarla (neto de esa orden).
  insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, order_id, referencia, creado_por, creado_por_nombre)
  select m.lisa_id, 'devolucion', -sum(m.cantidad), p_order_id, format('Se quitó del restock la orden %s', v_o.order_number), auth.uid(), public.frisa_niveles_nombre_usuario()
  from public.frisa_lisa_movimientos m
  where m.order_id = p_order_id and m.tipo in ('consumo', 'devolucion')
  group by m.lisa_id
  having sum(m.cantidad) < 0;
  delete from public.frisa_restock_ordenes where order_id = p_order_id;
end $$;

-- 5c) Recibir un pedido de compra: renglones de claves (producto_id) y/o de lisas (lisa_id).
create or replace function public.frisa_compra_recibir(p_id uuid, p_lineas jsonb, p_notas text default null)
returns public.frisa_compras
language plpgsql security definer set search_path = public as $$
declare
  v_c public.frisa_compras;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_l jsonb;
  v_lin public.frisa_compra_lineas;
  v_lis public.frisa_compra_lineas_lisa;
  v_cant integer;
  v_total integer := 0;
  v_ref text;
begin
  if not public.tiene_permiso('fr.bodega') then
    raise exception 'No tienes permiso para recibir pedidos de compra.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_c from public.frisa_compras where id = p_id for update;
  if not found then raise exception 'No existe el pedido de compra.'; end if;
  if v_c.estado <> 'pedida' then raise exception 'Este pedido ya no está pendiente (está %).', v_c.estado; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'Faltan las cantidades.'; end if;
  v_ref := format('Compra #%s · %s', v_c.folio, v_c.proveedor);
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := coalesce((v_l->>'cantidad')::int, 0);
    if v_cant < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
    if nullif(v_l->>'lisa_id', '') is not null then
      select * into v_lis from public.frisa_compra_lineas_lisa where compra_id = p_id and lisa_id = (v_l->>'lisa_id')::uuid;
      if not found then raise exception 'Una de las playeras lisas no está en el pedido.'; end if;
      update public.frisa_compra_lineas_lisa set recibida = v_cant where id = v_lis.id;
      if v_cant > 0 then
        insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, compra_id, referencia, notas, creado_por, creado_por_nombre)
        values (v_lis.lisa_id, 'compra', v_cant, p_id, v_ref, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre);
      end if;
    else
      select * into v_lin from public.frisa_compra_lineas where compra_id = p_id and producto_id = nullif(v_l->>'producto_id', '')::uuid;
      if not found then raise exception 'Una de las claves no está en el pedido.'; end if;
      update public.frisa_compra_lineas set recibida = v_cant where id = v_lin.id;
      if v_cant > 0 then
        insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, compra_id, referencia, notas, creado_por, creado_por_nombre)
        values (v_lin.producto_id, v_lin.clave, 'ingreso_bodega', v_cant, p_id, v_ref, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre);
      end if;
    end if;
    v_total := v_total + v_cant;
  end loop;
  if v_total = 0 then raise exception 'No llegó ninguna pieza: si no va a llegar, cancela el pedido.'; end if;
  update public.frisa_compra_lineas set recibida = 0 where compra_id = p_id and recibida is null;
  update public.frisa_compra_lineas_lisa set recibida = 0 where compra_id = p_id and recibida is null;
  update public.frisa_compras set estado = 'recibida', recibido_en = now(), recibido_por_nombre = v_nombre,
         recibido_notas = nullif(btrim(coalesce(p_notas, '')), '')
   where id = p_id returning * into v_c;
  return v_c;
end $$;

revoke execute on function public.frisa_lisa_capturar(uuid, integer, text) from public, anon;
revoke execute on function public.frisa_compra_crear_lisas(text, date, jsonb, text) from public, anon;
revoke execute on function public.frisa_restock_ligar(uuid, text) from public, anon;
revoke execute on function public.frisa_restock_desligar(uuid) from public, anon;
revoke execute on function public.frisa_compra_recibir(uuid, jsonb, text) from public, anon;
grant execute on function public.frisa_lisa_capturar(uuid, integer, text) to authenticated;
grant execute on function public.frisa_compra_crear_lisas(text, date, jsonb, text) to authenticated;
grant execute on function public.frisa_restock_ligar(uuid, text) to authenticated;
grant execute on function public.frisa_restock_desligar(uuid) to authenticated;
grant execute on function public.frisa_compra_recibir(uuid, jsonb, text) to authenticated;

-- Comprobación: playeras con lisa y lisas (color × manga × talla).
select (select count(*) from public.frisa_producto_lisa) as playeras_con_lisa,
       (select count(*) from public.frisa_lisas) as lisas;

-- ---------------------------------------------------------------------
-- Rollback (NO correr salvo que se quiera quitar todo V187):
--   drop function if exists public.frisa_compra_crear_lisas(text, date, jsonb, text);
--   drop function if exists public.frisa_lisa_capturar(uuid, integer, text);
--   drop function if exists public.frisa_lisas_de_orden(uuid);
--   -- y volver a correr las secciones 6a, 6b y 6e de schema_v186_frisa_restock.sql
--   drop table if exists public.frisa_compra_lineas_lisa, public.frisa_lisa_movimientos, public.frisa_lisas, public.frisa_producto_lisa;
--   drop function if exists public.frisa_lisa_mov_aplicar();
-- ---------------------------------------------------------------------
