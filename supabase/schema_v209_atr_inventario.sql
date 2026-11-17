-- =====================================================================
-- V209 — Cliente ATR + inventario de batas (Parte 1: cliente, catálogo y tablas)
--
-- Aditivo: 1 cliente, 23 productos, 1 tabla, 1 vista, 3 permisos.
-- No toca tablas ni funciones existentes. Se puede correr dos veces sin
-- duplicar nada.
--
-- Decisiones (confirmadas por Alfredo el 2026-11-17):
--  * ATR = cliente industrial. Un producto por bata y color
--    ("Bata con bolsa Blanca"…): 9 con bolsa + 14 sin bolsa = 23.
--  * Existencia = suma de movimientos (nunca un número que se edita).
--  * La línea de una orden se identifica por orden + prenda + talla
--    (items[i].sizes[j]); no existe orden_linea_id.
--  * Reabrir Terminado no borra: marca la entrada como revertida y agrega
--    un movimiento 'reversa_produccion' negativo.
--  * super_admin = admin_general.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cliente ATR (el índice único por nombre evita duplicados)
-- ---------------------------------------------------------------------
insert into public.clientes (nombre, tipo_orden)
values ('ATR', array['industrial'])
on conflict (nombre_normalizado) do nothing;

-- ---------------------------------------------------------------------
-- 2) Catálogo de batas de ATR (23 productos)
-- ---------------------------------------------------------------------
with atr as (
  select id from public.clientes where nombre_normalizado = 'atr'
), nuevos (bolsa, color) as (
  values
    (true, 'Blanca'), (true, 'Café'), (true, 'Gris Rata'), (true, 'Negra'),
    (true, 'Azul Rey'), (true, 'Verde Jade'), (true, 'Azul Marino'),
    (true, 'Guinda'), (true, 'Azul Cielo'),
    (false, 'Negra'), (false, 'Naranja'), (false, 'Lila'), (false, 'Verde Bandera'),
    (false, 'Guinda'), (false, 'Verde Fosfo'), (false, 'Beige'), (false, 'Amarillo'),
    (false, 'Paja'), (false, 'Gris Rata'), (false, 'Verde Grasa'), (false, 'Café'),
    (false, 'Azul Cielo'), (false, 'Blanca')
)
insert into public.productos (cliente_id, nombre, garment, color, tallas, especificaciones, pendiente_validar)
select atr.id,
       'Bata ' || case when n.bolsa then 'con' else 'sin' end || ' bolsa ' || n.color,
       'Bata',
       n.color,
       array['CH', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
       jsonb_build_object('bolsa', n.bolsa),
       false
from nuevos n cross join atr
where not exists (
  select 1 from public.productos p
  where p.cliente_id = atr.id
    and lower(p.nombre) = lower('Bata ' || case when n.bolsa then 'con' else 'sin' end || ' bolsa ' || n.color)
);

-- ---------------------------------------------------------------------
-- 3) Permisos
--    atr.ver      → ver el módulo
--    atr.entregar → registrar entregas a ATR
--    atr.cargar   → carga inicial y ajustes
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('atr.ver', 'Inventario ATR', 'Ver inventario ATR',
   'Ver existencias de batas de ATR y su historial de movimientos.', 'ver', 80),
  ('atr.entregar', 'Inventario ATR', 'Registrar entregas a ATR',
   'Registrar salidas de batas entregadas a ATR.', 'editar', 81),
  ('atr.cargar', 'Inventario ATR', 'Carga inicial y ajustes',
   'Hacer la carga inicial del inventario ATR y registrar ajustes con nota.', 'editar', 82)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave) values
  ('admin_general', 'atr.ver'), ('admin_fabrica', 'atr.ver'), ('admin_tienda', 'atr.ver'),
  ('terminado', 'atr.ver'), ('admin_fabrica_lectura', 'atr.ver'),
  ('admin_general', 'atr.entregar'), ('admin_fabrica', 'atr.entregar'), ('terminado', 'atr.entregar'),
  ('admin_general', 'atr.cargar'), ('admin_fabrica', 'atr.cargar')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4) Bitácora de movimientos
-- ---------------------------------------------------------------------
create table if not exists public.atr_movimientos (
  id             bigint generated always as identity primary key,
  producto_id    uuid not null references public.productos(id) on delete restrict,
  talla          text not null check (btrim(talla) <> ''),
  tipo           text not null check (tipo in (
                   'carga_inicial', 'entrada_produccion', 'reversa_produccion',
                   'salida_entrega', 'ajuste')),
  cantidad       integer not null check (cantidad <> 0),   -- + entra, − sale
  -- Solo entrada_produccion / reversa_produccion: el renglón de la orden.
  order_id       uuid references public.orders(id) on delete set null,
  item_index     integer,
  size_index     integer,
  -- reversa_produccion apunta a la entrada que revierte; la entrada
  -- revertida guarda cuándo (la cantidad nunca se modifica).
  revierte_id    bigint references public.atr_movimientos(id),
  revertido_en   timestamptz,
  fecha_corte    date,                                     -- solo carga_inicial
  nota           text,
  usuario_id     uuid,
  usuario_nombre text,
  creado_en      timestamptz not null default now(),

  constraint atr_mov_signo_ck check (
    (tipo in ('carga_inicial', 'entrada_produccion') and cantidad > 0) or
    (tipo in ('salida_entrega', 'reversa_produccion') and cantidad < 0) or
    tipo = 'ajuste'),
  constraint atr_mov_nota_ajuste_ck check (
    tipo <> 'ajuste' or coalesce(btrim(nota), '') <> ''),
  constraint atr_mov_corte_ck check (
    tipo <> 'carga_inicial' or fecha_corte is not null),
  constraint atr_mov_linea_ck check (
    tipo not in ('entrada_produccion', 'reversa_produccion') or
    (item_index is not null and size_index is not null)),
  constraint atr_mov_revierte_ck check (
    (tipo = 'reversa_produccion') = (revierte_id is not null))
);

-- Una misma línea de orden solo puede estar sumada una vez a la vez.
create unique index if not exists atr_mov_entrada_vigente_key
  on public.atr_movimientos (order_id, item_index, size_index)
  where tipo = 'entrada_produccion' and revertido_en is null;

create index if not exists atr_mov_linea_idx
  on public.atr_movimientos (producto_id, talla, creado_en desc);
create index if not exists atr_mov_orden_idx
  on public.atr_movimientos (order_id) where order_id is not null;

-- Lectura solo con permiso; escritura solo por RPC (Parte 2 y 3).
alter table public.atr_movimientos enable row level security;
drop policy if exists "atr lee movimientos" on public.atr_movimientos;
create policy "atr lee movimientos" on public.atr_movimientos
  for select to authenticated using (public.tiene_permiso('atr.ver'));
revoke all on public.atr_movimientos from public, anon, authenticated;
grant select on public.atr_movimientos to authenticated;

-- ---------------------------------------------------------------------
-- 5) Existencias = suma de movimientos por producto + talla
--    security_invoker: respeta el permiso de la tabla.
-- ---------------------------------------------------------------------
create or replace view public.atr_existencias
with (security_invoker = true) as
select m.producto_id,
       p.nombre                                   as producto,
       p.color,
       coalesce((p.especificaciones->>'bolsa')::boolean, false) as con_bolsa,
       m.talla,
       sum(m.cantidad)::integer                   as existencia,
       max(m.creado_en)                           as ultimo_movimiento
from public.atr_movimientos m
join public.productos p on p.id = m.producto_id
group by m.producto_id, p.nombre, p.color, p.especificaciones, m.talla;

revoke all on public.atr_existencias from public, anon, authenticated;
grant select on public.atr_existencias to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: 1 · 23 · 3 · 10 · true)
-- ---------------------------------------------------------------------
select
  (select count(*) from public.clientes where nombre_normalizado = 'atr')            as cliente_atr,
  (select count(*) from public.productos p join public.clientes c on c.id = p.cliente_id
     where c.nombre_normalizado = 'atr' and p.garment = 'Bata')                      as productos_bata,
  (select count(*) from public.permisos_catalogo where clave like 'atr.%')           as permisos,
  (select count(*) from public.rol_permisos where clave like 'atr.%')                as roles_con_permiso,
  (select to_regclass('public.atr_existencias') is not null)                         as vista_creada;
