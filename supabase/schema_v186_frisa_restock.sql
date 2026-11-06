-- =====================================================================
-- V186 — Frisa fase 2: restock (2026-11-06)
-- =====================================================================
-- Después de entregar, se repone el inventario de la fábrica:
--   · Lo que se FABRICA (playeras, camisas): órdenes de taller = órdenes
--     Frisa (FR) de siempre, con los productos y procesos de la página.
--     Al completarse (terminado) quedan "por entrar"; cuando se suben
--     físicamente a la bodega se cargan al inventario (movimiento
--     'ingreso_bodega').
--   · Lo que se COMPRA hecho (pantalón, bata, bolsa): pedido de compra al
--     proveedor; al recibirlo entra a la bodega.
-- Cuánto pedir lo calcula la pantalla (utils/frisaRestock.js):
--   proyectado = disponible + en proceso + por entrar
--   si proyectado ≤ reorden → A PEDIR = máximo − proyectado
--
-- Liga clave ↔ producto Frisa + talla: frisa_clave_producto. Se llena sola
-- para las claves cuyo modelo ya existe en Catálogos → Frisa (por el código
-- del modelo en la clave de Microsip). Una clave sin liga = se compra.
--
-- Permisos nuevos (módulo "Frisa restock"):
--   fr.ordenes  Crear órdenes de taller de restock y ligar órdenes FR existentes
--               (las órdenes FR las crean ventas / admin_tienda / admin_general,
--               igual que hoy en Nueva orden)
--   fr.bodega   Subir a bodega lo terminado y recibir pedidos de compra
--   fr.compras  Crear y cancelar pedidos de compra
--
-- Aditivo: 4 tablas, 2 columnas en frisa_inv_movimientos (V185), 3 permisos y
-- funciones nuevas. No toca orders, orden_etapas ni create_order_frisa (solo
-- los lee). Se puede correr dos veces. Rollback al final. Requiere V185.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fr.ordenes', 'Frisa restock', 'Crear órdenes de taller de restock', 'Crear las órdenes de taller (FR) que propone el restock y ligar órdenes FR existentes al inventario de Frisa.', 'editar', 97),
  ('fr.bodega',  'Frisa restock', 'Subir a bodega (Frisa)', 'Marcar que lo terminado ya se subió a la bodega y recibir pedidos de compra: se suma al inventario.', 'editar', 98),
  ('fr.compras', 'Frisa restock', 'Pedidos de compra de Frisa', 'Crear y cancelar pedidos de compra al proveedor (pantalón y lo que se compra hecho).', 'editar', 99)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('fr.ordenes', array['admin_general','admin_tienda']),
  ('fr.bodega',  array['admin_general','admin_fabrica','admin_tienda']),
  ('fr.compras', array['admin_general','admin_fabrica','admin_tienda'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
-- Clave de Microsip ↔ producto Frisa (Catálogos → Frisa) + talla.
create table if not exists public.frisa_clave_producto (
  producto_id        uuid primary key references public.frisa_productos_niveles(id) on delete cascade,
  producto_frisa_id  uuid not null references public.productos_frisa(id) on delete cascade,
  talla              text not null check (btrim(talla) <> ''),
  actualizado_en     timestamptz not null default now()
);
create unique index if not exists frisa_clave_producto_uq
  on public.frisa_clave_producto (producto_frisa_id, upper(btrim(talla)));

-- Órdenes FR que reponen el inventario de la fábrica.
create table if not exists public.frisa_restock_ordenes (
  order_id              uuid primary key references public.orders(id) on delete cascade,
  origen                text not null default 'restock' check (origen in ('restock', 'ligada')),
  creado_por            uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre     text,
  creado_en             timestamptz not null default now(),
  ingresado_en          timestamptz,
  ingresado_por_nombre  text,
  ingreso_notas         text
);

-- Pedidos de compra (lo que se compra hecho).
create table if not exists public.frisa_compras (
  id                    uuid primary key default gen_random_uuid(),
  folio                 integer generated always as identity,
  proveedor             text not null check (btrim(proveedor) <> ''),
  estado                text not null default 'pedida' check (estado in ('pedida', 'recibida', 'cancelada')),
  fecha_esperada        date,
  notas                 text,
  creado_por            uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre     text,
  creado_en             timestamptz not null default now(),
  recibido_en           timestamptz,
  recibido_por_nombre   text,
  recibido_notas        text,
  cancelado_motivo      text,
  cancelado_por_nombre  text,
  cancelado_en          timestamptz
);

create table if not exists public.frisa_compra_lineas (
  id           uuid primary key default gen_random_uuid(),
  compra_id    uuid not null references public.frisa_compras(id) on delete cascade,
  producto_id  uuid not null references public.frisa_productos_niveles(id) on delete restrict,
  clave        text not null,
  cantidad     integer not null check (cantidad > 0),
  recibida     integer check (recibida >= 0),
  unique (compra_id, producto_id)
);

alter table public.frisa_inv_movimientos add column if not exists order_id uuid references public.orders(id) on delete restrict;
alter table public.frisa_inv_movimientos add column if not exists compra_id uuid references public.frisa_compras(id) on delete restrict;
create index if not exists frisa_inv_mov_order_idx on public.frisa_inv_movimientos (order_id);

-- ---------------------------------------------------------------------
-- 3) Liga automática clave ↔ producto Frisa (solo las que falten)
--    Modelo en la clave de Microsip → código en Catálogos → Frisa.
--    Talla = el segmento de talla sin ceros (000S → S, 02XL → 2XL).
-- ---------------------------------------------------------------------
insert into public.frisa_clave_producto (producto_id, producto_frisa_id, talla)
select n.id, pf.id, ltrim(split_part(n.clave, '-', 2), '0')
from public.frisa_productos_niveles n
join (values
  ('01MCMA1I',  'FR-PLA-AM-MC'),
  ('01MLMA1I',  'FR-PLA-AM-ML'),
  ('01MCOM1I',  'FR-PLA-OM-MC'),
  ('01MCVE2I',  'FR-PLA-VE-MC'),
  ('01MCRO2I',  'FR-PLA-RO-MC'),
  ('01MLMA1IS', 'FR-PLA-AM-SR-ML'),
  ('01MZ1B1I',  'FR-CAM-NI'),
  ('01MZ1B',    'FR-CAM-BAS'),
  ('01MEZ1B',   'FR-CAM-BAS')
) as m(modelo, codigo) on upper(split_part(n.clave, '-', 3)) = m.modelo
join public.productos_frisa pf on lower(pf.codigo) = lower(m.codigo)
where ltrim(split_part(n.clave, '-', 2), '0') <> ''
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4) RLS: lectura con fn.ver; sin escritura directa
-- ---------------------------------------------------------------------
alter table public.frisa_clave_producto   enable row level security;
alter table public.frisa_restock_ordenes  enable row level security;
alter table public.frisa_compras          enable row level security;
alter table public.frisa_compra_lineas    enable row level security;

drop policy if exists frisa_clave_producto_select on public.frisa_clave_producto;
create policy frisa_clave_producto_select on public.frisa_clave_producto
  for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_restock_ordenes_select on public.frisa_restock_ordenes;
create policy frisa_restock_ordenes_select on public.frisa_restock_ordenes
  for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_compras_select on public.frisa_compras;
create policy frisa_compras_select on public.frisa_compras
  for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_compra_lineas_select on public.frisa_compra_lineas;
create policy frisa_compra_lineas_select on public.frisa_compra_lineas
  for select to authenticated using (public.tiene_permiso('fn.ver'));

revoke all on public.frisa_clave_producto, public.frisa_restock_ordenes, public.frisa_compras, public.frisa_compra_lineas from anon, public;
revoke insert, update, delete, truncate on public.frisa_clave_producto, public.frisa_restock_ordenes, public.frisa_compras, public.frisa_compra_lineas from authenticated;
grant select on public.frisa_clave_producto, public.frisa_restock_ordenes, public.frisa_compras, public.frisa_compra_lineas to authenticated;

-- ---------------------------------------------------------------------
-- 5) Ayudantes internos
-- ---------------------------------------------------------------------
-- Una orden FR está terminada si su etapa terminado está completada (o la orden ya está terminado/completado).
create or replace function public.frisa_orden_terminada(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orden_etapas e where e.order_id = p_order and e.etapa = 'terminado' and e.estado = 'completado')
      or exists (select 1 from public.orders o where o.id = p_order and o.status in ('terminado', 'completado'));
$$;
revoke execute on function public.frisa_orden_terminada(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Funciones de la app
-- ---------------------------------------------------------------------
-- 6a) Ligar una orden FR al restock (las que crea la pantalla de Restock, o una que ya existía).
create or replace function public.frisa_restock_ligar(p_order_id uuid, p_origen text default 'restock')
returns public.frisa_restock_ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders;
  v_r public.frisa_restock_ordenes;
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
  insert into public.frisa_restock_ordenes (order_id, origen, creado_por, creado_por_nombre)
  values (p_order_id, case when p_origen = 'ligada' then 'ligada' else 'restock' end, auth.uid(), public.frisa_niveles_nombre_usuario())
  on conflict (order_id) do nothing;
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id;
  return v_r;
end $$;

-- 6b) Quitar la liga (si se ligó por error y no se ha subido a bodega).
create or replace function public.frisa_restock_desligar(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_r public.frisa_restock_ordenes;
begin
  if not public.tiene_permiso('fr.ordenes') then
    raise exception 'No tienes permiso para quitar órdenes del restock.' using errcode = '42501';
  end if;
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id for update;
  if not found then raise exception 'La orden no está en el restock.'; end if;
  if v_r.ingresado_en is not null then raise exception 'Esa orden ya se subió a bodega; corrige con un conteo.'; end if;
  delete from public.frisa_restock_ordenes where order_id = p_order_id;
end $$;

-- 6c) Subir a bodega lo de una orden terminada. p_lineas: [{producto_id, cantidad}]
--     (la pantalla las propone con las tallas de la orden; se pueden corregir).
create or replace function public.frisa_restock_ingresar(p_order_id uuid, p_lineas jsonb, p_notas text default null)
returns public.frisa_restock_ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_r public.frisa_restock_ordenes;
  v_o public.orders;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_l jsonb;
  v_cant integer;
  v_clave text;
  v_total integer := 0;
begin
  if not public.tiene_permiso('fr.bodega') then
    raise exception 'No tienes permiso para subir a bodega.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id for update;
  if not found then raise exception 'La orden no está en el restock.'; end if;
  if v_r.ingresado_en is not null then raise exception 'Esa orden ya se subió a bodega.'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not public.frisa_orden_terminada(p_order_id) then
    raise exception 'La orden % todavía no está terminada.', v_o.order_number;
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'Faltan las cantidades.'; end if;
  if (select count(*) <> count(distinct e->>'producto_id') from jsonb_array_elements(p_lineas) e) then
    raise exception 'Hay una clave repetida.';
  end if;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := coalesce((v_l->>'cantidad')::int, 0);
    if v_cant < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
    select n.clave into v_clave
    from public.frisa_clave_producto cp join public.frisa_productos_niveles n on n.id = cp.producto_id
    where cp.producto_id = nullif(v_l->>'producto_id', '')::uuid and cp.producto_frisa_id = v_o.producto_frisa_id;
    if v_clave is null then raise exception 'Una de las claves no es del producto de la orden %.', v_o.order_number; end if;
    if v_cant > 0 then
      insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, order_id, referencia, notas, creado_por, creado_por_nombre)
      values ((v_l->>'producto_id')::uuid, v_clave, 'ingreso_bodega', v_cant, p_order_id,
              format('Orden de taller %s', v_o.order_number), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre);
      v_total := v_total + v_cant;
    end if;
  end loop;
  if v_total = 0 then raise exception 'No hay piezas para subir a bodega.'; end if;
  update public.frisa_restock_ordenes set ingresado_en = now(), ingresado_por_nombre = v_nombre,
         ingreso_notas = nullif(btrim(coalesce(p_notas, '')), '')
   where order_id = p_order_id returning * into v_r;
  return v_r;
end $$;

-- 6d) Pedido de compra. p_lineas: [{producto_id, cantidad}]
create or replace function public.frisa_compra_crear(p_proveedor text, p_fecha_esperada date, p_lineas jsonb, p_notas text default null)
returns public.frisa_compras
language plpgsql security definer set search_path = public as $$
declare
  v_c public.frisa_compras;
  v_l jsonb;
  v_prod public.frisa_productos_niveles;
begin
  if not public.tiene_permiso('fr.compras') then
    raise exception 'No tienes permiso para crear pedidos de compra.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_proveedor, '')), '') is null then raise exception 'Escribe el proveedor.'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El pedido no tiene renglones.';
  end if;
  if (select count(*) <> count(distinct e->>'producto_id') from jsonb_array_elements(p_lineas) e) then
    raise exception 'Hay una clave repetida en el pedido.';
  end if;
  insert into public.frisa_compras (proveedor, fecha_esperada, notas, creado_por, creado_por_nombre)
  values (btrim(p_proveedor), p_fecha_esperada, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), public.frisa_niveles_nombre_usuario())
  returning * into v_c;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    select * into v_prod from public.frisa_productos_niveles where id = nullif(v_l->>'producto_id', '')::uuid;
    if not found then raise exception 'Hay un renglón sin clave.'; end if;
    if coalesce((v_l->>'cantidad')::int, 0) <= 0 then raise exception 'La cantidad de % debe ser mayor que 0.', v_prod.clave; end if;
    insert into public.frisa_compra_lineas (compra_id, producto_id, clave, cantidad)
    values (v_c.id, v_prod.id, v_prod.clave, (v_l->>'cantidad')::int);
  end loop;
  return v_c;
end $$;

-- 6e) Recibir un pedido de compra (entra a la bodega). p_lineas: [{producto_id, cantidad}] = lo que llegó.
create or replace function public.frisa_compra_recibir(p_id uuid, p_lineas jsonb, p_notas text default null)
returns public.frisa_compras
language plpgsql security definer set search_path = public as $$
declare
  v_c public.frisa_compras;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_l jsonb;
  v_lin public.frisa_compra_lineas;
  v_cant integer;
  v_total integer := 0;
begin
  if not public.tiene_permiso('fr.bodega') then
    raise exception 'No tienes permiso para recibir pedidos de compra.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_c from public.frisa_compras where id = p_id for update;
  if not found then raise exception 'No existe el pedido de compra.'; end if;
  if v_c.estado <> 'pedida' then raise exception 'Este pedido ya no está pendiente (está %).', v_c.estado; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'Faltan las cantidades.'; end if;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    select * into v_lin from public.frisa_compra_lineas where compra_id = p_id and producto_id = nullif(v_l->>'producto_id', '')::uuid;
    if not found then raise exception 'Una de las claves no está en el pedido.'; end if;
    v_cant := coalesce((v_l->>'cantidad')::int, 0);
    if v_cant < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
    update public.frisa_compra_lineas set recibida = v_cant where id = v_lin.id;
    if v_cant > 0 then
      insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, compra_id, referencia, notas, creado_por, creado_por_nombre)
      values (v_lin.producto_id, v_lin.clave, 'ingreso_bodega', v_cant, p_id,
              format('Compra #%s · %s', v_c.folio, v_c.proveedor), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre);
      v_total := v_total + v_cant;
    end if;
  end loop;
  if v_total = 0 then raise exception 'No llegó ninguna pieza: si no va a llegar, cancela el pedido.'; end if;
  update public.frisa_compra_lineas set recibida = 0 where compra_id = p_id and recibida is null;
  update public.frisa_compras set estado = 'recibida', recibido_en = now(), recibido_por_nombre = v_nombre,
         recibido_notas = nullif(btrim(coalesce(p_notas, '')), '')
   where id = p_id returning * into v_c;
  return v_c;
end $$;

-- 6f) Cancelar un pedido de compra.
create or replace function public.frisa_compra_cancelar(p_id uuid, p_motivo text)
returns public.frisa_compras
language plpgsql security definer set search_path = public as $$
declare
  v_c public.frisa_compras;
begin
  if not public.tiene_permiso('fr.compras') then
    raise exception 'No tienes permiso para cancelar pedidos de compra.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Escribe el motivo.'; end if;
  select * into v_c from public.frisa_compras where id = p_id for update;
  if not found then raise exception 'No existe el pedido de compra.'; end if;
  if v_c.estado <> 'pedida' then raise exception 'Solo se cancela un pedido que no ha llegado.'; end if;
  update public.frisa_compras set estado = 'cancelada', cancelado_motivo = btrim(p_motivo),
         cancelado_por_nombre = public.frisa_niveles_nombre_usuario(), cancelado_en = now()
   where id = p_id returning * into v_c;
  return v_c;
end $$;

-- 6g) Corregir la liga de una clave (o quitarla con producto null → la clave se compra).
create or replace function public.frisa_clave_producto_guardar(p_producto_id uuid, p_producto_frisa_id uuid, p_talla text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_permiso('fn.supuestos') then
    raise exception 'No tienes permiso para cambiar la liga de claves.' using errcode = '42501';
  end if;
  if p_producto_frisa_id is null then
    delete from public.frisa_clave_producto where producto_id = p_producto_id;
    return;
  end if;
  if nullif(btrim(coalesce(p_talla, '')), '') is null then raise exception 'Falta la talla.'; end if;
  insert into public.frisa_clave_producto (producto_id, producto_frisa_id, talla)
  values (p_producto_id, p_producto_frisa_id, upper(btrim(p_talla)))
  on conflict (producto_id) do update set producto_frisa_id = excluded.producto_frisa_id, talla = excluded.talla, actualizado_en = now();
end $$;

-- ---------------------------------------------------------------------
-- 7) Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.frisa_restock_ligar(uuid, text) from public, anon;
revoke execute on function public.frisa_restock_desligar(uuid) from public, anon;
revoke execute on function public.frisa_restock_ingresar(uuid, jsonb, text) from public, anon;
revoke execute on function public.frisa_compra_crear(text, date, jsonb, text) from public, anon;
revoke execute on function public.frisa_compra_recibir(uuid, jsonb, text) from public, anon;
revoke execute on function public.frisa_compra_cancelar(uuid, text) from public, anon;
revoke execute on function public.frisa_clave_producto_guardar(uuid, uuid, text) from public, anon;
grant execute on function public.frisa_restock_ligar(uuid, text) to authenticated;
grant execute on function public.frisa_restock_desligar(uuid) to authenticated;
grant execute on function public.frisa_restock_ingresar(uuid, jsonb, text) to authenticated;
grant execute on function public.frisa_compra_crear(text, date, jsonb, text) to authenticated;
grant execute on function public.frisa_compra_recibir(uuid, jsonb, text) to authenticated;
grant execute on function public.frisa_compra_cancelar(uuid, text) to authenticated;
grant execute on function public.frisa_clave_producto_guardar(uuid, uuid, text) to authenticated;

-- Comprobación: claves ligadas a un producto Frisa (se fabrican) y sin liga (se compran).
select (select count(*) from public.frisa_clave_producto) as claves_ligadas,
       (select count(*) from public.frisa_productos_niveles n where not exists (select 1 from public.frisa_clave_producto c where c.producto_id = n.id)) as claves_se_compran;

-- ---------------------------------------------------------------------
-- Rollback (NO correr salvo que se quiera quitar todo V186):
--   drop function if exists public.frisa_clave_producto_guardar(uuid, uuid, text);
--   drop function if exists public.frisa_compra_cancelar(uuid, text);
--   drop function if exists public.frisa_compra_recibir(uuid, jsonb, text);
--   drop function if exists public.frisa_compra_crear(text, date, jsonb, text);
--   drop function if exists public.frisa_restock_ingresar(uuid, jsonb, text);
--   drop function if exists public.frisa_restock_desligar(uuid);
--   drop function if exists public.frisa_restock_ligar(uuid, text);
--   drop function if exists public.frisa_orden_terminada(uuid);
--   (los movimientos 'ingreso_bodega' ya hechos se quedan; para quitar las columnas habría que conservarlos)
--   drop table if exists public.frisa_compra_lineas, public.frisa_compras, public.frisa_restock_ordenes, public.frisa_clave_producto;
--   delete from public.rol_permisos where clave like 'fr.%';
--   delete from public.permisos_catalogo where clave like 'fr.%';
-- ---------------------------------------------------------------------
