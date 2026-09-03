-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V19: catálogo de proveedores + talla por artículo de pedido
--
-- Dos cambios, ambos dentro del módulo "Pedidos a Proveedor"
-- (schema_v18_pedidos_tienda.sql), aplicados juntos porque llegaron en
-- la misma sesión:
--
-- 1) Tabla `proveedores` (nombre, contacto, tipo_material, notas) —
--    mismo patrón "crear o reusar" que telas/clientes
--    (schema_v12_catalogos.sql), pero de lectura SOLO autenticada (no se
--    abre a `anon`): igual que el resto del módulo de Pedidos a
--    Proveedor, que no tiene modo invitado (ver canViewPedidosTienda en
--    permissions.js). `pedidos_tienda` gana una columna nueva nullable
--    `proveedor_id` — la columna `proveedor` (texto) se queda igual,
--    como snapshot del nombre al momento del pedido (mismo criterio que
--    `orders.client_name` + `orders.client_id` en schema_v12): si un
--    proveedor se renombra o se borra después, el pedido viejo no se
--    rompe.
--
-- 2) `pedidos_tienda_articulos` gana columna nullable `talla` — para el
--    reconocimiento automático por foto (ver api/pedido-ocr.js), que
--    puede leer una talla cuando el artículo la tiene (ej. playeras,
--    tenis). Un pedido sin fotos capturado a mano se sigue viendo y
--    editando igual, con talla en null.
--
-- create_pedido_tienda gana un parámetro más (p_proveedor_id) → cambia
-- la lista de tipos, así que hace falta tirar la firma vieja primero
-- (ver gotcha de firmas de RPC en SALPER_Contexto.md).
--
-- Aditivo: columnas nullable + una tabla nueva. No rompe ningún pedido
-- ya creado.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) proveedores
-- ---------------------------------------------------------------------
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text generated always as (lower(trim(nombre))) stored,
  contacto text,
  tipo_material text,
  notas text,
  created_at timestamptz not null default now()
);

create unique index if not exists proveedores_nombre_normalizado_key on public.proveedores (nombre_normalizado);

alter table public.proveedores enable row level security;

drop policy if exists "Lectura autenticada de proveedores" on public.proveedores;
create policy "Lectura autenticada de proveedores" on public.proveedores
  for select to authenticated using (true);

grant select on public.proveedores to authenticated;

-- "Crear o reusar", mismo patrón que create_cliente/create_tela — el
-- alta rápida desde el formulario de pedido solo manda nombre (+
-- opcionalmente contacto/tipo_material); si el proveedor ya existe
-- (nombre normalizado igual), se regresa el existente TAL CUAL está
-- (no se pisan contacto/tipo_material/notas ya capturados).
create or replace function public.create_proveedor(
  p_nombre text,
  p_contacto text default null,
  p_tipo_material text default null,
  p_notas text default null
) returns public.proveedores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_proveedor public.proveedores;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden registrar proveedores.';
  end if;
  if trim(coalesce(p_nombre, '')) = '' then
    raise exception 'El nombre del proveedor no puede estar vacío.';
  end if;

  insert into public.proveedores (nombre, contacto, tipo_material, notas)
  values (trim(p_nombre), nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_tipo_material, '')), ''), nullif(trim(coalesce(p_notas, '')), ''))
  on conflict (nombre_normalizado) do nothing;

  select * into v_proveedor from public.proveedores where nombre_normalizado = lower(trim(p_nombre));
  return v_proveedor;
end;
$$;

revoke execute on function public.create_proveedor(text, text, text, text) from public;
grant execute on function public.create_proveedor(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) pedidos_tienda.proveedor_id + pedidos_tienda_articulos.talla
-- ---------------------------------------------------------------------
alter table public.pedidos_tienda
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

alter table public.pedidos_tienda_articulos
  add column if not exists talla text;

-- create_pedido_tienda gana p_proveedor_id (nullable — un pedido puede
-- seguir capturando el proveedor como texto libre si no se eligió del
-- catálogo) y cada artículo del jsonb gana `talla` opcional.
drop function if exists public.create_pedido_tienda(text, text, date, text, jsonb);

create or replace function public.create_pedido_tienda(
  p_proveedor text,
  p_pedido_por text,
  p_fecha_pedido date,
  p_notas text,
  p_articulos jsonb,
  p_proveedor_id uuid default null
) returns public.pedidos_tienda
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_pedido public.pedidos_tienda;
  v_articulo jsonb;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden registrar pedidos a proveedor.';
  end if;
  if trim(coalesce(p_proveedor, '')) = '' then
    raise exception 'Falta indicar el proveedor.';
  end if;
  if trim(coalesce(p_pedido_por, '')) = '' then
    raise exception 'Falta indicar quién hizo el pedido.';
  end if;
  if p_articulos is null or jsonb_array_length(p_articulos) = 0 then
    raise exception 'El pedido necesita al menos un artículo.';
  end if;

  insert into public.pedidos_tienda (proveedor, proveedor_id, pedido_por, fecha_pedido, notas)
  values (trim(p_proveedor), p_proveedor_id, trim(p_pedido_por), coalesce(p_fecha_pedido, current_date), nullif(trim(coalesce(p_notas, '')), ''))
  returning * into v_pedido;

  for v_articulo in select * from jsonb_array_elements(p_articulos)
  loop
    if trim(coalesce(v_articulo->>'nombre_articulo', '')) = '' then
      raise exception 'Cada artículo necesita un nombre.';
    end if;
    if coalesce((v_articulo->>'cantidad_pedida')::integer, 0) <= 0 then
      raise exception 'La cantidad pedida de "%" debe ser mayor a cero.', v_articulo->>'nombre_articulo';
    end if;

    insert into public.pedidos_tienda_articulos (pedido_id, nombre_articulo, cantidad_pedida, talla)
    values (
      v_pedido.id,
      trim(v_articulo->>'nombre_articulo'),
      (v_articulo->>'cantidad_pedida')::integer,
      nullif(trim(coalesce(v_articulo->>'talla', '')), '')
    );
  end loop;

  return v_pedido;
end;
$$;

revoke execute on function public.create_pedido_tienda(text, text, date, text, jsonb, uuid) from public;
grant execute on function public.create_pedido_tienda(text, text, date, text, jsonb, uuid) to authenticated;
