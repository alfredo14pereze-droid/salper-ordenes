-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V18: módulo "Pedidos a Proveedor" (tienda deportiva)
--
-- Módulo NUEVO e independiente del flujo de órdenes de producción — no
-- toca orders/order_status_history/order_types/etc. Registro centralizado
-- de qué se pidió a un proveedor, quién lo pidió, qué llegó realmente y a
-- qué costo, para que no se pierda esa información cuando una sola
-- persona hace un pedido sin avisarle a nadie más.
--
-- Privacidad a propósito: igual que anticipos/documentos, SOLO lectura
-- autenticada — trae costos reales de proveedor (precio_unitario), no se
-- abre a `anon` aunque el resto de la app tenga modo invitado desde V10.
--
-- Quién puede escribir: tienda o admin (mismo criterio que crear
-- órdenes) — es compra para la tienda deportiva, fábrica no participa.
--
-- Colores de estado: reusa la paleta ya aprobada de STATUSES (ver
-- constants.js) en vez de inventar hex nuevos — pedido=ámbar claro,
-- recibido=azul, verificado=verde (--color-good, mismo significado que
-- "completado"), con_problema=rojo (--color-danger, mismo significado
-- que "atrasado"). Se define en el frontend (constants.js), no aquí.
--
-- Aditivo: dos tablas nuevas, no modifica ninguna tabla existente.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.pedidos_tienda (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  pedido_por text not null,
  fecha_pedido date not null default current_date,
  estado text not null default 'pedido'
    check (estado in ('pedido', 'recibido', 'verificado', 'con_problema')),
  fecha_recepcion date,
  verificado_por text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pedidos_tienda_articulos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_tienda(id) on delete cascade,
  nombre_articulo text not null,
  cantidad_pedida integer not null check (cantidad_pedida > 0),
  cantidad_recibida integer,
  precio_unitario numeric(10,2),
  nota_problema text
);

create index if not exists pedidos_tienda_articulos_pedido_id_idx
  on public.pedidos_tienda_articulos (pedido_id);

alter table public.pedidos_tienda enable row level security;
alter table public.pedidos_tienda_articulos enable row level security;

drop policy if exists "Lectura autenticada de pedidos_tienda" on public.pedidos_tienda;
create policy "Lectura autenticada de pedidos_tienda" on public.pedidos_tienda
  for select to authenticated using (true);

drop policy if exists "Lectura autenticada de pedidos_tienda_articulos" on public.pedidos_tienda_articulos;
create policy "Lectura autenticada de pedidos_tienda_articulos" on public.pedidos_tienda_articulos
  for select to authenticated using (true);

-- Ver gotcha de siempre: tablas creadas por SQL Editor no traen GRANT
-- automático.
grant select on public.pedidos_tienda to authenticated;
grant select on public.pedidos_tienda_articulos to authenticated;

-- ---------------------------------------------------------------------
-- create_pedido_tienda: crea el pedido + sus artículos en una sola
-- llamada (mismo patrón que create_order con items). p_articulos es un
-- jsonb array de {nombre_articulo, cantidad_pedida}.
-- ---------------------------------------------------------------------
create or replace function public.create_pedido_tienda(
  p_proveedor text,
  p_pedido_por text,
  p_fecha_pedido date,
  p_notas text,
  p_articulos jsonb
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

  insert into public.pedidos_tienda (proveedor, pedido_por, fecha_pedido, notas)
  values (trim(p_proveedor), trim(p_pedido_por), coalesce(p_fecha_pedido, current_date), nullif(trim(coalesce(p_notas, '')), ''))
  returning * into v_pedido;

  for v_articulo in select * from jsonb_array_elements(p_articulos)
  loop
    if trim(coalesce(v_articulo->>'nombre_articulo', '')) = '' then
      raise exception 'Cada artículo necesita un nombre.';
    end if;
    if coalesce((v_articulo->>'cantidad_pedida')::integer, 0) <= 0 then
      raise exception 'La cantidad pedida de "%" debe ser mayor a cero.', v_articulo->>'nombre_articulo';
    end if;

    insert into public.pedidos_tienda_articulos (pedido_id, nombre_articulo, cantidad_pedida)
    values (v_pedido.id, trim(v_articulo->>'nombre_articulo'), (v_articulo->>'cantidad_pedida')::integer);
  end loop;

  return v_pedido;
end;
$$;

revoke execute on function public.create_pedido_tienda(text, text, date, text, jsonb) from public;
grant execute on function public.create_pedido_tienda(text, text, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- marcar_pedido_recibido: solo cambia estado + fecha_recepcion. Solo
-- válido desde 'pedido' — evita marcar "recibido" dos veces o pisar un
-- pedido que ya se verificó.
-- ---------------------------------------------------------------------
create or replace function public.marcar_pedido_recibido(p_pedido_id uuid) returns public.pedidos_tienda
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_pedido public.pedidos_tienda;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden marcar un pedido como recibido.';
  end if;

  select * into v_pedido from public.pedidos_tienda where id = p_pedido_id;
  if v_pedido.id is null then
    raise exception 'Pedido % no encontrado', p_pedido_id;
  end if;
  if v_pedido.estado <> 'pedido' then
    raise exception 'Este pedido ya no está en estado "pedido" (está en "%").', v_pedido.estado;
  end if;

  update public.pedidos_tienda
  set estado = 'recibido', fecha_recepcion = current_date, updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end;
$$;

revoke execute on function public.marcar_pedido_recibido(uuid) from public;
grant execute on function public.marcar_pedido_recibido(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- verificar_pedido_tienda: actualiza cantidad_recibida/precio_unitario/
-- nota_problema de cada artículo (p_articulos: jsonb array de {id,
-- cantidad_recibida, precio_unitario, nota_problema}) y decide el estado
-- final del pedido — 'con_problema' si algún artículo quedó con nota de
-- problema o con cantidad_recibida distinta a cantidad_pedida (o sin
-- capturar), 'verificado' si todo cuadra. Solo válido desde 'pedido' o
-- 'recibido' (no re-verificar uno que ya se cerró, para no pisar datos
-- por accidente).
-- ---------------------------------------------------------------------
create or replace function public.verificar_pedido_tienda(
  p_pedido_id uuid,
  p_verificado_por text,
  p_articulos jsonb
) returns public.pedidos_tienda
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_pedido public.pedidos_tienda;
  v_articulo jsonb;
  v_hay_problema boolean;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden verificar un pedido.';
  end if;
  if trim(coalesce(p_verificado_por, '')) = '' then
    raise exception 'Falta indicar quién verificó el pedido.';
  end if;

  select * into v_pedido from public.pedidos_tienda where id = p_pedido_id;
  if v_pedido.id is null then
    raise exception 'Pedido % no encontrado', p_pedido_id;
  end if;
  if v_pedido.estado not in ('pedido', 'recibido') then
    raise exception 'Este pedido ya fue verificado (está en "%").', v_pedido.estado;
  end if;

  for v_articulo in select * from jsonb_array_elements(coalesce(p_articulos, '[]'::jsonb))
  loop
    update public.pedidos_tienda_articulos
    set
      cantidad_recibida = (v_articulo->>'cantidad_recibida')::integer,
      precio_unitario = nullif(v_articulo->>'precio_unitario', '')::numeric,
      nota_problema = nullif(trim(coalesce(v_articulo->>'nota_problema', '')), '')
    where id = (v_articulo->>'id')::uuid
      and pedido_id = p_pedido_id;
  end loop;

  select exists (
    select 1 from public.pedidos_tienda_articulos
    where pedido_id = p_pedido_id
      and (
        cantidad_recibida is null
        or cantidad_recibida <> cantidad_pedida
        or nota_problema is not null
      )
  ) into v_hay_problema;

  update public.pedidos_tienda
  set
    estado = case when v_hay_problema then 'con_problema' else 'verificado' end,
    verificado_por = trim(p_verificado_por),
    updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end;
$$;

revoke execute on function public.verificar_pedido_tienda(uuid, text, jsonb) from public;
grant execute on function public.verificar_pedido_tienda(uuid, text, jsonb) to authenticated;
