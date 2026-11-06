-- =====================================================================
-- V185 — Frisa fase 1: inventario por movimientos + órdenes de surtido
-- (2026-11-06)
-- =====================================================================
-- Flujo (ver SALPER_Contexto.md, "Flujo Frisa"):
--   1. Llega la OC de Frisa en PDF → se sube a la página → orden de surtido
--      (una OC = una planta, con fecha límite).
--   2. Urgente: disponible − órdenes pendientes (lo calcula la pantalla).
--   3. Surtido: quien surte la marca "surtida" eligiendo quién surtió. Las
--      piezas quedan APARTADAS (no salen del inventario). Solo se puede si
--      el disponible alcanza para TODA la orden (Frisa no acepta parciales).
--   4. "Salió el chofer" (cualquier admin): folio de remisión de Microsip y
--      ahora sí se DESCUENTA del inventario.
--
-- Inventario SALPER (bodega de la fábrica), por clave:
--   real       = suma de frisa_inv_movimientos (= frisa_productos_niveles.stock_actual,
--                que ahora lo mantiene un disparador)
--   apartado   = líneas de órdenes en estado 'surtida'
--   disponible = real − apartado
-- El stock que ya estaba cargado (Sheet, 2026-11-06) queda como movimiento
-- 'inicial'. Capturar el stock a mano ahora deja un movimiento 'ajuste'.
--
-- Permisos nuevos (módulo "Frisa surtido", editables en Roles y permisos):
--   fs.ver       Ver órdenes de surtido, Urgente y movimientos
--   fs.oc        Subir órdenes de compra, corregirlas y cancelarlas
--   fs.surtir    Marcar una orden como surtida (chofer y admins)
--   fs.entregar  Marcar "salió el chofer" / regresar una surtida (admins)
--
-- Aditivo: 5 tablas, 4 permisos, funciones nuevas y 2 funciones de V184
-- reemplazadas con la misma firma (captura e importación ahora dejan
-- movimiento). No toca nada de V1. Se puede correr dos veces. Rollback al final.
-- Requiere V184.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fs.ver',      'Frisa surtido', 'Ver órdenes de surtido de Frisa', 'Ver las órdenes de surtido, la pestaña Urgente y los movimientos del inventario de Frisa.', 'ver', 93),
  ('fs.oc',       'Frisa surtido', 'Subir órdenes de compra de Frisa', 'Subir el PDF de una orden de compra de Frisa (crea la orden de surtido), corregirla y cancelarla.', 'editar', 94),
  ('fs.surtir',   'Frisa surtido', 'Surtir órdenes de Frisa', 'Marcar una orden de surtido como surtida (aparta las piezas) eligiendo quién la surtió.', 'editar', 95),
  ('fs.entregar', 'Frisa surtido', 'Entregar órdenes de Frisa', 'Marcar que salió el chofer con el folio de remisión (descuenta del inventario) o regresar una orden surtida.', 'editar', 96)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('fs.ver', array['ventas','contabilidad','admin_tienda','corte','bordado','sublimado','produccion',
                   'terminado','admin_fabrica','admin_general','lectura','tienda','captura_produccion',
                   'admin_fabrica_lectura','costura','consulta_tienda','chofer']),
  ('fs.oc',       array['admin_general','admin_fabrica','admin_tienda']),
  ('fs.surtir',   array['chofer','admin_general','admin_fabrica']),
  ('fs.entregar', array['admin_general','admin_fabrica','admin_tienda'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.frisa_surtidos (
  id                      uuid primary key default gen_random_uuid(),
  numero_oc               text not null check (btrim(numero_oc) <> ''),
  planta                  text not null check (btrim(planta) <> ''),
  fecha_oc                date,
  fecha_limite            date,
  estado                  text not null default 'pendiente'
                          check (estado in ('pendiente', 'surtida', 'entregada', 'cancelada')),
  pdf_path                text,
  leido_pdf               jsonb,          -- lo que se leyó del PDF, tal cual
  notas                   text,
  creado_por              uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre       text,
  creado_en               timestamptz not null default now(),
  surtido_por_id          uuid references public.profiles(id) on delete set null,  -- quien surtió (elegido)
  surtido_por_nombre      text,
  surtido_registrado_por  text,           -- quien lo marcó en la app
  surtido_en              timestamptz,
  remision                text,
  fecha_entrega           date,
  entregado_por_nombre    text,
  entregado_en            timestamptz,
  cancelado_motivo        text,
  cancelado_por_nombre    text,
  cancelado_en            timestamptz
);
-- Una OC no se puede subir dos veces (salvo que la anterior esté cancelada).
create unique index if not exists frisa_surtidos_numero_uq
  on public.frisa_surtidos (lower(btrim(numero_oc))) where estado <> 'cancelada';
create index if not exists frisa_surtidos_estado_idx on public.frisa_surtidos (estado, fecha_limite);

create table if not exists public.frisa_surtido_lineas (
  id           uuid primary key default gen_random_uuid(),
  surtido_id   uuid not null references public.frisa_surtidos(id) on delete cascade,
  producto_id  uuid not null references public.frisa_productos_niveles(id) on delete restrict,
  clave        text not null,
  cantidad     integer not null check (cantidad > 0),
  texto_pdf    text,                      -- descripción como venía en el PDF
  talla_pdf    text,
  unique (surtido_id, producto_id)
);
create index if not exists frisa_surtido_lineas_producto_idx on public.frisa_surtido_lineas (producto_id);

-- Historial de cada orden de surtido (creada, surtida, regresada, entregada, cancelada…).
create table if not exists public.frisa_surtido_eventos (
  id              uuid primary key default gen_random_uuid(),
  surtido_id      uuid not null references public.frisa_surtidos(id) on delete cascade,
  evento          text not null,
  detalle         text,
  usuario_id      uuid references public.profiles(id) on delete set null default auth.uid(),
  usuario_nombre  text,
  fecha           timestamptz not null default now()
);
create index if not exists frisa_surtido_eventos_idx on public.frisa_surtido_eventos (surtido_id, fecha);

-- Movimientos del inventario SALPER. real = suma de cantidad.
create table if not exists public.frisa_inv_movimientos (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references public.frisa_productos_niveles(id) on delete restrict,
  clave              text not null,
  tipo               text not null check (tipo in ('inicial', 'ajuste', 'entrega', 'ingreso_bodega')),
  cantidad           integer not null,
  surtido_id         uuid references public.frisa_surtidos(id) on delete restrict,
  referencia         text,
  notas              text,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now(),
  constraint frisa_inv_mov_cantidad_ck check (
    (tipo = 'inicial' and cantidad >= 0)
    or (tipo = 'entrega' and cantidad < 0)
    or (tipo = 'ingreso_bodega' and cantidad > 0)
    or (tipo = 'ajuste' and cantidad <> 0)
  )
);
create index if not exists frisa_inv_mov_producto_idx on public.frisa_inv_movimientos (producto_id, creado_en desc);
create index if not exists frisa_inv_mov_surtido_idx on public.frisa_inv_movimientos (surtido_id);

-- Lo que se aprende del PDF: descripción + talla → clave.
create table if not exists public.frisa_niveles_alias (
  texto           text primary key,
  producto_id     uuid not null references public.frisa_productos_niveles(id) on delete cascade,
  actualizado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) Disparador: el stock_actual (real) sigue a los movimientos
-- ---------------------------------------------------------------------
create or replace function public.frisa_inv_mov_aplicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.frisa_productos_niveles
     set stock_actual = stock_actual + new.cantidad, actualizado_en = now()
   where id = new.producto_id;
  -- stock_actual tiene check >= 0: si un movimiento lo deja negativo, truena aquí.
  return new;
end $$;
revoke execute on function public.frisa_inv_mov_aplicar() from public, anon, authenticated;

drop trigger if exists frisa_inv_mov_aplicar_trg on public.frisa_inv_movimientos;
create trigger frisa_inv_mov_aplicar_trg after insert on public.frisa_inv_movimientos
  for each row execute function public.frisa_inv_mov_aplicar();

-- Los movimientos no se editan ni se borran: una corrección es otro movimiento.
create or replace function public.frisa_inv_mov_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Los movimientos de inventario no se modifican ni se borran; registra un ajuste.';
end $$;
drop trigger if exists frisa_inv_mov_inmutable_trg on public.frisa_inv_movimientos;
create trigger frisa_inv_mov_inmutable_trg before update or delete on public.frisa_inv_movimientos
  for each row execute function public.frisa_inv_mov_inmutable();

-- ---------------------------------------------------------------------
-- 4) El stock ya cargado queda como movimiento 'inicial' (una sola vez)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.frisa_inv_movimientos where tipo = 'inicial') then
    -- stock_actual YA tiene ese inventario: se registra sin volver a sumarlo.
    alter table public.frisa_inv_movimientos disable trigger frisa_inv_mov_aplicar_trg;
    insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, referencia, creado_por, creado_por_nombre, creado_en)
    select id, clave, 'inicial', stock_actual, 'Inventario inicial (Sheet Consumos Frisa Niveles)', null,
           coalesce(stock_actualizado_por_nombre, 'Carga inicial'), coalesce(stock_actualizado_en, now())
    from public.frisa_productos_niveles;
    alter table public.frisa_inv_movimientos enable trigger frisa_inv_mov_aplicar_trg;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) RLS: lectura con fs.ver; sin escritura directa
-- ---------------------------------------------------------------------
alter table public.frisa_surtidos         enable row level security;
alter table public.frisa_surtido_lineas   enable row level security;
alter table public.frisa_surtido_eventos  enable row level security;
alter table public.frisa_inv_movimientos  enable row level security;
alter table public.frisa_niveles_alias    enable row level security;

drop policy if exists frisa_surtidos_select on public.frisa_surtidos;
create policy frisa_surtidos_select on public.frisa_surtidos
  for select to authenticated using (public.tiene_permiso('fs.ver'));
drop policy if exists frisa_surtido_lineas_select on public.frisa_surtido_lineas;
create policy frisa_surtido_lineas_select on public.frisa_surtido_lineas
  for select to authenticated using (public.tiene_permiso('fs.ver'));
drop policy if exists frisa_surtido_eventos_select on public.frisa_surtido_eventos;
create policy frisa_surtido_eventos_select on public.frisa_surtido_eventos
  for select to authenticated using (public.tiene_permiso('fs.ver'));
drop policy if exists frisa_inv_movimientos_select on public.frisa_inv_movimientos;
create policy frisa_inv_movimientos_select on public.frisa_inv_movimientos
  for select to authenticated using (public.tiene_permiso('fs.ver') or public.tiene_permiso('fn.ver'));
drop policy if exists frisa_niveles_alias_select on public.frisa_niveles_alias;
create policy frisa_niveles_alias_select on public.frisa_niveles_alias
  for select to authenticated using (public.tiene_permiso('fs.oc'));

revoke all on public.frisa_surtidos, public.frisa_surtido_lineas, public.frisa_surtido_eventos,
              public.frisa_inv_movimientos, public.frisa_niveles_alias from anon, public;
revoke insert, update, delete, truncate on public.frisa_surtidos, public.frisa_surtido_lineas, public.frisa_surtido_eventos,
              public.frisa_inv_movimientos, public.frisa_niveles_alias from authenticated;
grant select on public.frisa_surtidos, public.frisa_surtido_lineas, public.frisa_surtido_eventos,
              public.frisa_inv_movimientos, public.frisa_niveles_alias to authenticated;

-- ---------------------------------------------------------------------
-- 6) Ayudantes internos
-- ---------------------------------------------------------------------
-- Piezas apartadas de una clave (órdenes surtidas sin entregar), opcionalmente sin contar una orden.
create or replace function public.frisa_apartado_clave(p_producto uuid, p_excepto uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.cantidad), 0)::int
  from public.frisa_surtido_lineas l
  join public.frisa_surtidos s on s.id = l.surtido_id
  where l.producto_id = p_producto and s.estado = 'surtida' and (p_excepto is null or s.id <> p_excepto);
$$;
revoke execute on function public.frisa_apartado_clave(uuid, uuid) from public, anon, authenticated;

create or replace function public.frisa_texto_alias_niveles(p_texto text, p_talla text)
returns text language sql immutable as $$
  select upper(regexp_replace(btrim(coalesce(p_texto, '')), '\s+', ' ', 'g')) || ' | ' || upper(btrim(coalesce(p_talla, '')));
$$;

create or replace function public.frisa_surtido_evento(p_surtido uuid, p_evento text, p_detalle text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.frisa_surtido_eventos (surtido_id, evento, detalle, usuario_id, usuario_nombre)
  values (p_surtido, p_evento, p_detalle, auth.uid(), public.frisa_niveles_nombre_usuario());
$$;
revoke execute on function public.frisa_surtido_evento(uuid, text, text) from public, anon, authenticated;

-- Valida y guarda las líneas de una orden de surtido (reemplaza las que tenga).
-- p_lineas: [{producto_id, cantidad, texto_pdf, talla_pdf}]
create or replace function public.frisa_surtido_guardar_lineas(p_surtido uuid, p_lineas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_l jsonb;
  v_prod public.frisa_productos_niveles;
  v_n integer := 0;
  v_cant integer;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La orden no tiene renglones.';
  end if;
  if (select count(nullif(e->>'producto_id', '')) <> count(distinct nullif(e->>'producto_id', '')) from jsonb_array_elements(p_lineas) e) then
    raise exception 'Hay una clave repetida en la orden: júntala en un solo renglón.';
  end if;
  delete from public.frisa_surtido_lineas where surtido_id = p_surtido;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    select * into v_prod from public.frisa_productos_niveles where id = nullif(v_l->>'producto_id', '')::uuid;
    if not found then
      raise exception 'Hay un renglón sin clave (o con una clave que no existe): elige la clave de cada renglón.';
    end if;
    v_cant := (v_l->>'cantidad')::int;
    if coalesce(v_cant, 0) <= 0 then
      raise exception 'La cantidad de % debe ser mayor que 0.', v_prod.clave;
    end if;
    insert into public.frisa_surtido_lineas (surtido_id, producto_id, clave, cantidad, texto_pdf, talla_pdf)
    values (p_surtido, v_prod.id, v_prod.clave, v_cant, nullif(btrim(v_l->>'texto_pdf'), ''), nullif(btrim(v_l->>'talla_pdf'), ''));
    -- Aprende: esta descripción + talla del PDF es esta clave.
    if nullif(btrim(v_l->>'texto_pdf'), '') is not null then
      insert into public.frisa_niveles_alias (texto, producto_id)
      values (public.frisa_texto_alias_niveles(v_l->>'texto_pdf', v_l->>'talla_pdf'), v_prod.id)
      on conflict (texto) do update set producto_id = excluded.producto_id, actualizado_en = now();
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.frisa_surtido_guardar_lineas(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) Funciones de la app
-- ---------------------------------------------------------------------
-- 7a) Crear la orden de surtido (desde el PDF de la OC).
create or replace function public.frisa_surtido_crear(
  p_numero_oc text, p_planta text, p_fecha_oc date, p_fecha_limite date, p_lineas jsonb,
  p_pdf_path text default null, p_leido_pdf jsonb default null, p_notas text default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_n integer;
begin
  if not public.tiene_permiso('fs.oc') then
    raise exception 'No tienes permiso para subir órdenes de compra de Frisa.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_numero_oc, '')), '') is null then raise exception 'Falta el número de la orden de compra.'; end if;
  if nullif(btrim(coalesce(p_planta, '')), '') is null then raise exception 'Falta la planta.'; end if;
  if exists (select 1 from public.frisa_surtidos where lower(btrim(numero_oc)) = lower(btrim(p_numero_oc)) and estado <> 'cancelada') then
    raise exception 'La orden de compra % ya está registrada.', btrim(p_numero_oc);
  end if;
  insert into public.frisa_surtidos (numero_oc, planta, fecha_oc, fecha_limite, pdf_path, leido_pdf, notas, creado_por, creado_por_nombre)
  values (btrim(p_numero_oc), btrim(p_planta), p_fecha_oc, p_fecha_limite, nullif(btrim(coalesce(p_pdf_path, '')), ''),
          p_leido_pdf, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), public.frisa_niveles_nombre_usuario())
  returning * into v_s;
  v_n := public.frisa_surtido_guardar_lineas(v_s.id, p_lineas);
  perform public.frisa_surtido_evento(v_s.id, 'creada', format('%s renglones', v_n));
  return v_s;
end $$;

-- 7b) Corregir una orden pendiente (datos y renglones).
create or replace function public.frisa_surtido_editar(
  p_id uuid, p_numero_oc text, p_planta text, p_fecha_oc date, p_fecha_limite date, p_lineas jsonb, p_notas text default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
begin
  if not public.tiene_permiso('fs.oc') then
    raise exception 'No tienes permiso para corregir órdenes de surtido.' using errcode = '42501';
  end if;
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Solo se puede corregir una orden pendiente (esta está %).', v_s.estado;
  end if;
  if nullif(btrim(coalesce(p_numero_oc, '')), '') is null or nullif(btrim(coalesce(p_planta, '')), '') is null then
    raise exception 'Faltan el número de la orden de compra o la planta.';
  end if;
  if exists (select 1 from public.frisa_surtidos where id <> p_id and lower(btrim(numero_oc)) = lower(btrim(p_numero_oc)) and estado <> 'cancelada') then
    raise exception 'La orden de compra % ya está registrada.', btrim(p_numero_oc);
  end if;
  update public.frisa_surtidos set numero_oc = btrim(p_numero_oc), planta = btrim(p_planta), fecha_oc = p_fecha_oc,
         fecha_limite = p_fecha_limite, notas = nullif(btrim(coalesce(p_notas, '')), '')
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_guardar_lineas(p_id, p_lineas);
  perform public.frisa_surtido_evento(p_id, 'corregida', null);
  return v_s;
end $$;

-- 7c) Personas que se pueden elegir como "quién surtió" (todo el personal activo).
create or replace function public.frisa_surtido_personas()
returns table (id uuid, nombre text, rol text)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(p.full_name), p.role
  from public.profiles p
  where public.tiene_permiso('fs.surtir')
    and p.suspended_at is null and nullif(btrim(p.full_name), '') is not null
  order by btrim(p.full_name);
$$;

-- 7d) Marcar surtida: aparta las piezas. Todo o nada contra el disponible.
create or replace function public.frisa_surtido_marcar_surtida(p_id uuid, p_persona_id uuid default null, p_persona_nombre text default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_nombre text;
  v_falta text;
begin
  if not public.tiene_permiso('fs.surtir') then
    raise exception 'No tienes permiso para surtir órdenes de Frisa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Esta orden ya no está pendiente (está %).', v_s.estado;
  end if;
  if p_persona_id is not null then
    select nullif(btrim(full_name), '') into v_nombre from public.profiles where id = p_persona_id;
  end if;
  v_nombre := coalesce(v_nombre, nullif(btrim(coalesce(p_persona_nombre, '')), ''));
  if v_nombre is null then
    raise exception 'Elige quién surtió la orden.';
  end if;
  -- Frisa no acepta parciales: tiene que alcanzar el disponible para todo.
  select string_agg(format('%s (faltan %s)', l.clave, l.cantidad - (p.stock_actual - public.frisa_apartado_clave(p.id))), ', ' order by l.clave)
    into v_falta
  from public.frisa_surtido_lineas l
  join public.frisa_productos_niveles p on p.id = l.producto_id
  where l.surtido_id = p_id and l.cantidad > p.stock_actual - public.frisa_apartado_clave(p.id);
  if v_falta is not null then
    raise exception 'No alcanza el inventario para surtir la orden completa: %.', v_falta;
  end if;
  update public.frisa_surtidos set estado = 'surtida', surtido_por_id = p_persona_id, surtido_por_nombre = v_nombre,
         surtido_registrado_por = public.frisa_niveles_nombre_usuario(), surtido_en = now()
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'surtida', 'Surtió: ' || v_nombre);
  return v_s;
end $$;

-- 7e) Regresar una surtida a pendiente (se equivocaron): libera lo apartado.
create or replace function public.frisa_surtido_regresar(p_id uuid, p_motivo text default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
begin
  if not public.tiene_permiso('fs.entregar') then
    raise exception 'No tienes permiso para regresar órdenes surtidas.' using errcode = '42501';
  end if;
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'surtida' then raise exception 'Solo se puede regresar una orden surtida.'; end if;
  update public.frisa_surtidos set estado = 'pendiente', surtido_por_id = null, surtido_por_nombre = null,
         surtido_registrado_por = null, surtido_en = null
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'regresada a pendiente',
    concat_ws(' · ', 'Antes surtida por ' || v_s.surtido_por_nombre, nullif(btrim(coalesce(p_motivo, '')), '')));
  return v_s;
end $$;

-- 7f) Salió el chofer: ahora sí se descuenta del inventario.
create or replace function public.frisa_surtido_entregar(p_id uuid, p_remision text, p_fecha date default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_nombre text := public.frisa_niveles_nombre_usuario();
begin
  if not public.tiene_permiso('fs.entregar') then
    raise exception 'No tienes permiso para marcar entregas de Frisa.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_remision, '')), '') is null then
    raise exception 'Falta el folio de la remisión de Microsip.';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'surtida' then
    raise exception 'Primero hay que surtir la orden (está %).', v_s.estado;
  end if;
  insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, surtido_id, referencia, creado_por, creado_por_nombre)
  select l.producto_id, l.clave, 'entrega', -l.cantidad, p_id,
         format('Rem. %s · OC %s · %s', btrim(p_remision), v_s.numero_oc, v_s.planta), auth.uid(), v_nombre
  from public.frisa_surtido_lineas l where l.surtido_id = p_id;
  update public.frisa_surtidos set estado = 'entregada', remision = btrim(p_remision),
         fecha_entrega = coalesce(p_fecha, (now() at time zone 'America/Monterrey')::date),
         entregado_por_nombre = v_nombre, entregado_en = now()
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'entregada', 'Salió el chofer · Rem. ' || btrim(p_remision));
  return v_s;
end $$;

-- 7g) Cancelar (pendiente o surtida; lo apartado se libera).
create or replace function public.frisa_surtido_cancelar(p_id uuid, p_motivo text)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
begin
  if not public.tiene_permiso('fs.oc') then
    raise exception 'No tienes permiso para cancelar órdenes de surtido.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Escribe el motivo de la cancelación.'; end if;
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado not in ('pendiente', 'surtida') then
    raise exception 'No se puede cancelar una orden %.', v_s.estado;
  end if;
  update public.frisa_surtidos set estado = 'cancelada', cancelado_motivo = btrim(p_motivo),
         cancelado_por_nombre = public.frisa_niveles_nombre_usuario(), cancelado_en = now()
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'cancelada', btrim(p_motivo));
  return v_s;
end $$;

-- ---------------------------------------------------------------------
-- 8) V184 reemplazadas (misma firma): captura e importación dejan movimiento
-- ---------------------------------------------------------------------
create or replace function public.frisa_niveles_capturar_stock(p_clave text, p_stock integer, p_comentario text default null)
returns public.frisa_productos_niveles
language plpgsql security definer set search_path = public as $$
declare
  v_fila public.frisa_productos_niveles;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_coment text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if not public.tiene_permiso('fn.capturar') then
    raise exception 'No tienes permiso para capturar el stock de Frisa.' using errcode = '42501';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception 'El stock debe ser un número entero de 0 o más.';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_fila from public.frisa_productos_niveles
  where lower(btrim(clave)) = lower(btrim(coalesce(p_clave, '')))
  for update;
  if not found then
    raise exception 'No existe la clave %.', p_clave;
  end if;

  insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
  values (v_fila.id, v_fila.clave, v_fila.stock_actual, p_stock, 'captura', auth.uid(), v_nombre, v_coment);
  -- V185: la diferencia queda como movimiento 'ajuste' (el disparador mueve stock_actual).
  if p_stock <> v_fila.stock_actual then
    insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, referencia, notas, creado_por, creado_por_nombre)
    values (v_fila.id, v_fila.clave, 'ajuste', p_stock - v_fila.stock_actual, 'Conteo capturado en la app', v_coment, auth.uid(), v_nombre);
  end if;

  update public.frisa_productos_niveles
     set stock_actualizado_en = now(), stock_actualizado_por = auth.uid(),
         stock_actualizado_por_nombre = v_nombre, actualizado_en = now()
   where id = v_fila.id
  returning * into v_fila;
  return v_fila;
end $$;

create or replace function public.frisa_niveles_importar(p_productos jsonb, p_config jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p jsonb;
  v_clave text;
  v_id uuid;
  v_nuevos integer := 0;
  v_actualizados integer := 0;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_stock integer;
  v_cfg public.frisa_niveles_config;
begin
  if not public.tiene_permiso('fn.supuestos') then
    raise exception 'No tienes permiso para importar los niveles de Frisa.' using errcode = '42501';
  end if;
  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'No hay claves para importar.';
  end if;
  if (select count(*) <> count(distinct lower(btrim(e->>'clave'))) from jsonb_array_elements(p_productos) e) then
    raise exception 'El archivo trae claves repetidas.';
  end if;

  perform pg_advisory_xact_lock(hashtext('frisa_niveles_importar'));

  if p_config is not null then
    select * into v_cfg from public.frisa_niveles_config where id;
    perform public.frisa_niveles_guardar_config(
      coalesce((p_config->>'dias_periodo')::int, v_cfg.dias_periodo),
      coalesce((p_config->>'dias_maximo')::int,  v_cfg.dias_maximo),
      coalesce((p_config->>'dias_reorden')::int, v_cfg.dias_reorden),
      coalesce((p_config->>'dias_minimo')::int,  v_cfg.dias_minimo),
      coalesce((p_config->>'fecha_inicio_consumo')::date, v_cfg.fecha_inicio_consumo),
      coalesce((p_config->>'fecha_corte_consumo')::date,  v_cfg.fecha_corte_consumo));
  end if;

  for v_p in select * from jsonb_array_elements(p_productos) loop
    v_clave := btrim(coalesce(v_p->>'clave', ''));
    if v_clave = '' then
      raise exception 'Hay un renglón sin clave.';
    end if;
    if coalesce((v_p->>'consumo_2025')::int, 0) < 0 or coalesce((v_p->>'consumo_2026')::int, 0) < 0 then
      raise exception 'Consumo negativo en %.', v_clave;
    end if;

    select id into v_id from public.frisa_productos_niveles where lower(btrim(clave)) = lower(v_clave) for update;
    if found then
      update public.frisa_productos_niveles set
        nombre       = coalesce(nullif(btrim(v_p->>'nombre'), ''), nombre),
        tipo         = nullif(btrim(v_p->>'tipo'), ''),
        reflejante   = nullif(btrim(v_p->>'reflejante'), ''),
        manga        = nullif(btrim(v_p->>'manga'), ''),
        color        = nullif(btrim(v_p->>'color'), ''),
        consumo_2025 = coalesce((v_p->>'consumo_2025')::int, 0),
        consumo_2026 = coalesce((v_p->>'consumo_2026')::int, 0),
        clase_abc    = nullif(btrim(v_p->>'clase_abc'), ''),
        tendencia    = nullif(btrim(v_p->>'tendencia'), ''),
        nota         = coalesce(nullif(btrim(v_p->>'nota'), ''), nota),
        activo       = true,
        actualizado_en = now()
      where id = v_id;
      v_actualizados := v_actualizados + 1;
    else
      v_stock := coalesce((v_p->>'stock_actual')::int, 0);
      if v_stock < 0 then
        raise exception 'Stock negativo en %.', v_clave;
      end if;
      -- V185: nace en 0 y el stock entra como movimiento 'inicial'.
      insert into public.frisa_productos_niveles (clave, nombre, tipo, reflejante, manga, color,
        consumo_2025, consumo_2026, clase_abc, tendencia, nota, stock_actual,
        stock_actualizado_en, stock_actualizado_por, stock_actualizado_por_nombre)
      values (v_clave, coalesce(btrim(v_p->>'nombre'), ''), nullif(btrim(v_p->>'tipo'), ''),
        nullif(btrim(v_p->>'reflejante'), ''), nullif(btrim(v_p->>'manga'), ''), nullif(btrim(v_p->>'color'), ''),
        coalesce((v_p->>'consumo_2025')::int, 0), coalesce((v_p->>'consumo_2026')::int, 0),
        nullif(btrim(v_p->>'clase_abc'), ''), nullif(btrim(v_p->>'tendencia'), ''), nullif(btrim(v_p->>'nota'), ''),
        0, now(), auth.uid(), v_nombre)
      returning id into v_id;
      insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, referencia, creado_por, creado_por_nombre)
      values (v_id, v_clave, 'inicial', v_stock, 'Importación del Sheet', auth.uid(), v_nombre);
      insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
      values (v_id, v_clave, null, v_stock, 'importacion', auth.uid(), v_nombre, 'Importación inicial del Sheet');
      v_nuevos := v_nuevos + 1;
    end if;
  end loop;

  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados);
end $$;

-- ---------------------------------------------------------------------
-- 9) Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.frisa_texto_alias_niveles(text, text) from public, anon;
grant execute on function public.frisa_texto_alias_niveles(text, text) to authenticated;
revoke execute on function public.frisa_surtido_crear(text, text, date, date, jsonb, text, jsonb, text) from public, anon;
revoke execute on function public.frisa_surtido_editar(uuid, text, text, date, date, jsonb, text) from public, anon;
revoke execute on function public.frisa_surtido_personas() from public, anon;
revoke execute on function public.frisa_surtido_marcar_surtida(uuid, uuid, text) from public, anon;
revoke execute on function public.frisa_surtido_regresar(uuid, text) from public, anon;
revoke execute on function public.frisa_surtido_entregar(uuid, text, date) from public, anon;
revoke execute on function public.frisa_surtido_cancelar(uuid, text) from public, anon;
grant execute on function public.frisa_surtido_crear(text, text, date, date, jsonb, text, jsonb, text) to authenticated;
grant execute on function public.frisa_surtido_editar(uuid, text, text, date, date, jsonb, text) to authenticated;
grant execute on function public.frisa_surtido_personas() to authenticated;
grant execute on function public.frisa_surtido_marcar_surtida(uuid, uuid, text) to authenticated;
grant execute on function public.frisa_surtido_regresar(uuid, text) to authenticated;
grant execute on function public.frisa_surtido_entregar(uuid, text, date) to authenticated;
grant execute on function public.frisa_surtido_cancelar(uuid, text) to authenticated;
revoke execute on function public.frisa_niveles_capturar_stock(text, integer, text) from public, anon;
revoke execute on function public.frisa_niveles_importar(jsonb, jsonb) from public, anon;
grant execute on function public.frisa_niveles_capturar_stock(text, integer, text) to authenticated;
grant execute on function public.frisa_niveles_importar(jsonb, jsonb) to authenticated;

-- Comprobación: movimientos 'inicial' = claves y su suma = piezas en stock.
select (select count(*) from public.frisa_inv_movimientos where tipo = 'inicial') as iniciales,
       (select coalesce(sum(cantidad), 0) from public.frisa_inv_movimientos) as suma_movimientos,
       (select coalesce(sum(stock_actual), 0) from public.frisa_productos_niveles) as stock_total;

-- ---------------------------------------------------------------------
-- Rollback (NO correr salvo que se quiera quitar todo V185):
--   drop function if exists public.frisa_surtido_cancelar(uuid, text);
--   drop function if exists public.frisa_surtido_entregar(uuid, text, date);
--   drop function if exists public.frisa_surtido_regresar(uuid, text);
--   drop function if exists public.frisa_surtido_marcar_surtida(uuid, uuid, text);
--   drop function if exists public.frisa_surtido_personas();
--   drop function if exists public.frisa_surtido_editar(uuid, text, text, date, date, jsonb, text);
--   drop function if exists public.frisa_surtido_crear(text, text, date, date, jsonb, text, jsonb, text);
--   drop function if exists public.frisa_surtido_guardar_lineas(uuid, jsonb);
--   drop function if exists public.frisa_surtido_evento(uuid, text, text);
--   drop function if exists public.frisa_texto_alias_niveles(text, text);
--   drop function if exists public.frisa_apartado_clave(uuid, uuid);
--   drop table if exists public.frisa_niveles_alias, public.frisa_inv_movimientos,
--     public.frisa_surtido_eventos, public.frisa_surtido_lineas, public.frisa_surtidos;
--   drop function if exists public.frisa_inv_mov_inmutable();
--   drop function if exists public.frisa_inv_mov_aplicar();
--   -- y volver a correr la sección 4 de schema_v184_frisa_niveles.sql (captura/importar de V184)
--   delete from public.rol_permisos where clave like 'fs.%';
--   delete from public.permisos_catalogo where clave like 'fs.%';
-- ---------------------------------------------------------------------
