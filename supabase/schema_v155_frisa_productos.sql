-- =====================================================================
-- V155 — Frisa: catálogo de productos con secuencia de procesos propia
-- =====================================================================
-- Cada producto de Frisa define sus procesos EN ORDEN (p. ej. descosido →
-- reflejante → impresión → terminado). Al crear una orden Frisa la
-- secuencia se copia a la orden (sus filas de orden_etapas, numeradas
-- 1..n, y una copia en orders.frisa_producto); cambiar el producto después
-- no afecta órdenes ya creadas.
--
-- Decisiones de Alfredo (2026-10-16):
--   * Tablas aparte: productos_frisa + producto_frisa_procesos (no el
--     catálogo `productos` por cliente). Las órdenes Frisa no llevan
--     cliente_id: el cliente es "Frisa" implícito.
--   * Descosido y Reflejante son etapas nuevas. Descosido lo reporta
--     terminado; Reflejante, costura (roles produccion / costura).
--     "Impresión" es la impresión por prenda que ya existe (etapa
--     impresion_prenda, también la reporta terminado). Sin roles nuevos.
--   * La regla estricta (una etapa se trabaja cuando la anterior de la
--     secuencia está completada) es SOLO para órdenes Frisa. Los demás
--     tipos siguen con la regla de V140.
--   * Tipo de orden "frisa", folio FR-001…, sin precio.
--   * Número de corte: pendiente, no se implementa.
--
-- Todo es aditivo. Se parchean con replace (y guarda) dos funciones vivas
-- para aceptar las etapas nuevas: update_orden_etapa y pausar_orden_etapa.
-- No se redefine create_order, set_order_items ni recompute_order_status
-- (descosido y reflejante no cambian orders.status; impresión sí, como
-- siempre).
--
-- Rollback (solo si no hay órdenes Frisa):
--   drop function public.create_order_frisa(uuid, date, jsonb, text, text[], boolean);
--   drop function public.guardar_producto_frisa(uuid, text, text, text, text, text, text, text, text, boolean, jsonb);
--   drop trigger orders_frisa_ins on public.orders;
--   drop trigger orders_frisa_upd on public.orders;
--   drop function public.orders_frisa_guard();
--   drop trigger orden_etapas_frisa_secuencia on public.orden_etapas;
--   drop trigger orden_etapas_frisa_protege on public.orden_etapas;
--   drop function public.orden_etapas_frisa_secuencia();
--   drop function public.orden_etapas_frisa_protege();
--   update public.order_types set active = false where key = 'frisa';
--   (las tablas y columnas nuevas pueden quedarse: no estorban.)
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_nombre text;
begin
  foreach v_nombre in array array['create_order', 'update_orden_etapa', 'pausar_orden_etapa', 'current_user_role'] loop
    select count(*) into n from pg_proc
    where proname = v_nombre and pronamespace = 'public'::regnamespace;
    if n <> 1 then
      raise exception 'V155: se esperaba una sola copia de %, hay %. No se aplicó nada.', v_nombre, n;
    end if;
  end loop;

  if not exists (
    select 1 from pg_proc where proname = 'update_orden_etapa' and pronamespace = 'public'::regnamespace
      and (position('descosido' in prosrc) > 0 or (
        position($q$if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado') then$q$ in prosrc) > 0
        and position($q$when 'produccion' then v_role in ('produccion', 'costura')$q$ in prosrc) > 0))
  ) then
    raise exception 'V155: update_orden_etapa viva no tiene el texto esperado. No se aplicó nada.';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'pausar_orden_etapa' and pronamespace = 'public'::regnamespace
      and (position('descosido' in prosrc) > 0
           or position($q$when 'produccion' then v_role in ('produccion', 'costura')$q$ in prosrc) > 0)
  ) then
    raise exception 'V155: pausar_orden_etapa viva no tiene el texto esperado. No se aplicó nada.';
  end if;

  if exists (select 1 from public.order_types where key <> 'frisa' and upper(folio_prefix) = 'FR') then
    raise exception 'V155: ya hay otro tipo de orden con el prefijo FR. No se aplicó nada.';
  end if;
  if exists (select 1 from public.order_types where key = 'frisa' and upper(coalesce(folio_prefix, '')) <> 'FR') then
    raise exception 'V155: ya existe un tipo "frisa" con otro prefijo de folio. Revisar antes de aplicar.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Etapas nuevas: descosido y reflejante
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tabla, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.orden_etapas'::regclass, 'public.plantillas_etapas'::regclass)
      and pg_get_constraintdef(oid) ilike '%etapa%'
      and pg_get_constraintdef(oid) ilike '%corte%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;

alter table public.orden_etapas add constraint orden_etapas_etapa_check
  check (etapa in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado', 'descosido', 'reflejante'));
alter table public.plantillas_etapas add constraint plantillas_etapas_etapa_check
  check (etapa in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado', 'descosido', 'reflejante'));

-- update_orden_etapa y pausar_orden_etapa: aceptan las dos etapas nuevas.
-- Descosido lo reporta terminado; reflejante, costura (mismos roles que la
-- etapa 'produccion').
do $$
declare
  v_lista_vieja constant text := $q$if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado') then$q$;
  v_lista_nueva constant text := $q$if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado', 'descosido', 'reflejante') then$q$;
  v_caso_viejo constant text := $q$when 'produccion' then v_role in ('produccion', 'costura')$q$;
  v_caso_nuevo constant text := $q$when 'produccion' then v_role in ('produccion', 'costura')
         when 'descosido' then v_role = 'terminado'
         when 'reflejante' then v_role in ('produccion', 'costura')$q$;
  r record;
  d text;
  nuevo text;
begin
  for r in
    select p.oid, p.proname, p.prosrc from pg_proc p
    where p.proname in ('update_orden_etapa', 'pausar_orden_etapa') and p.pronamespace = 'public'::regnamespace
  loop
    continue when position('descosido' in r.prosrc) > 0;  -- ya parcheada
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, v_caso_viejo, v_caso_nuevo);
    if r.proname = 'update_orden_etapa' then
      nuevo := replace(nuevo, v_lista_vieja, v_lista_nueva);
      if position(v_lista_nueva in nuevo) = 0 then
        raise exception 'V155: no pude parchear la lista de etapas de update_orden_etapa.';
      end if;
    end if;
    if position(v_caso_nuevo in nuevo) = 0 then
      raise exception 'V155: no pude parchear %.', r.proname;
    end if;
    execute nuevo;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Catálogo de procesos (qué etapa de fábrica es cada uno)
-- ---------------------------------------------------------------------
create table if not exists public.procesos_catalogo (
  codigo text primary key,
  nombre text not null,
  etapa text not null unique
    check (etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado', 'descosido', 'reflejante')),
  orden_sugerido int not null default 0,
  activo boolean not null default true
);

insert into public.procesos_catalogo (codigo, nombre, etapa, orden_sugerido) values
  ('descosido', 'Descosido', 'descosido', 10),
  ('corte', 'Corte', 'corte', 20),
  ('sublimado', 'Sublimado', 'sublimado', 30),
  ('costura', 'Costura', 'produccion', 40),
  ('reflejante', 'Reflejante', 'reflejante', 50),
  ('bordado', 'Bordado', 'bordado', 60),
  ('impresion', 'Impresión', 'impresion_prenda', 70),
  ('terminado', 'Terminado', 'terminado', 80)
on conflict (codigo) do nothing;

alter table public.procesos_catalogo enable row level security;
drop policy if exists "Lectura pública procesos_catalogo" on public.procesos_catalogo;
create policy "Lectura pública procesos_catalogo" on public.procesos_catalogo for select to anon, authenticated using (true);
revoke all on public.procesos_catalogo from public, anon, authenticated;
grant select on public.procesos_catalogo to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Productos de Frisa y su secuencia de procesos
-- ---------------------------------------------------------------------
create table if not exists public.productos_frisa (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null,
  origen text not null check (origen in ('confeccionada', 'comprada')),
  tallas_rango text,
  color text,
  tela text,
  proveedor text,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists productos_frisa_codigo_uq on public.productos_frisa (codigo);
create unique index if not exists productos_frisa_codigo_upper_uq on public.productos_frisa (upper(btrim(codigo)));

create table if not exists public.producto_frisa_procesos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos_frisa(id) on delete cascade,
  proceso_codigo text not null references public.procesos_catalogo(codigo),
  orden int not null check (orden > 0),
  impresiones int check (impresiones is null or impresiones > 0),
  notas text,
  unique (producto_id, orden),
  -- Una etapa solo puede ir una vez en una orden (orden_etapas es única
  -- por orden + etapa).
  unique (producto_id, proceso_codigo)
);
create index if not exists producto_frisa_procesos_producto_idx on public.producto_frisa_procesos (producto_id);

alter table public.productos_frisa enable row level security;
drop policy if exists "Lectura pública productos_frisa" on public.productos_frisa;
create policy "Lectura pública productos_frisa" on public.productos_frisa for select to anon, authenticated using (true);
revoke all on public.productos_frisa from public, anon, authenticated;
grant select on public.productos_frisa to anon, authenticated;

alter table public.producto_frisa_procesos enable row level security;
drop policy if exists "Lectura pública producto_frisa_procesos" on public.producto_frisa_procesos;
create policy "Lectura pública producto_frisa_procesos" on public.producto_frisa_procesos for select to anon, authenticated using (true);
revoke all on public.producto_frisa_procesos from public, anon, authenticated;
grant select on public.producto_frisa_procesos to anon, authenticated;

-- Alta y edición: datos + secuencia completa en una sola llamada.
-- p_procesos = [{"proceso": "corte", "impresiones": null, "notas": "…"}, …]
-- en el orden de la secuencia (orden = posición, 1..n).
create or replace function public.guardar_producto_frisa(
  p_id uuid,
  p_codigo text,
  p_nombre text,
  p_origen text,
  p_tallas_rango text default null,
  p_color text default null,
  p_tela text default null,
  p_proveedor text default null,
  p_descripcion text default null,
  p_activo boolean default true,
  p_procesos jsonb default '[]'::jsonb
) returns public.productos_frisa
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos_frisa;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_procesos jsonb := case when jsonb_typeof(p_procesos) = 'array' then p_procesos else '[]'::jsonb end;
  v_malo text;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo ventas o administradores pueden guardar productos de Frisa.';
  end if;
  if v_codigo = '' then raise exception 'Falta el código del producto.'; end if;
  if v_nombre = '' then raise exception 'Falta el nombre del producto.'; end if;
  if coalesce(p_origen, '') not in ('confeccionada', 'comprada') then
    raise exception 'El origen debe ser "confeccionada" o "comprada".';
  end if;
  if jsonb_array_length(v_procesos) = 0 then
    raise exception 'El producto necesita al menos un proceso.';
  end if;

  select pr->>'proceso' into v_malo
  from jsonb_array_elements(v_procesos) pr
  where not exists (select 1 from public.procesos_catalogo c where c.codigo = pr->>'proceso' and c.activo)
  limit 1;
  if found then raise exception 'Proceso desconocido: %.', coalesce(v_malo, '(vacío)'); end if;

  select pr->>'proceso' into v_malo
  from jsonb_array_elements(v_procesos) pr
  group by pr->>'proceso' having count(*) > 1
  limit 1;
  if found then raise exception 'El proceso "%" está repetido en la secuencia.', v_malo; end if;

  select pr->>'proceso' into v_malo
  from jsonb_array_elements(v_procesos) pr
  where nullif(pr->>'impresiones', '') is not null
    and (pr->>'proceso' <> 'impresion' or (pr->>'impresiones')::int < 1)
  limit 1;
  if found then raise exception 'Solo el proceso de impresión lleva número de impresiones (1 o más).'; end if;

  if exists (select 1 from public.productos_frisa where upper(btrim(codigo)) = v_codigo and id is distinct from p_id) then
    raise exception 'Ya hay un producto con el código %.', v_codigo;
  end if;

  if p_id is null then
    insert into public.productos_frisa (codigo, nombre, origen, tallas_rango, color, tela, proveedor, descripcion, activo)
    values (v_codigo, v_nombre, p_origen, nullif(btrim(coalesce(p_tallas_rango, '')), ''), nullif(btrim(coalesce(p_color, '')), ''),
            nullif(btrim(coalesce(p_tela, '')), ''), nullif(btrim(coalesce(p_proveedor, '')), ''),
            nullif(btrim(coalesce(p_descripcion, '')), ''), coalesce(p_activo, true))
    returning * into v_producto;
  else
    update public.productos_frisa set
      codigo = v_codigo, nombre = v_nombre, origen = p_origen,
      tallas_rango = nullif(btrim(coalesce(p_tallas_rango, '')), ''),
      color = nullif(btrim(coalesce(p_color, '')), ''),
      tela = nullif(btrim(coalesce(p_tela, '')), ''),
      proveedor = nullif(btrim(coalesce(p_proveedor, '')), ''),
      descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
      activo = coalesce(p_activo, true)
    where id = p_id
    returning * into v_producto;
    if v_producto.id is null then raise exception 'Producto no encontrado.'; end if;
  end if;

  delete from public.producto_frisa_procesos where producto_id = v_producto.id;
  insert into public.producto_frisa_procesos (producto_id, proceso_codigo, orden, impresiones, notas)
  select v_producto.id, pr->>'proceso', n::int,
         nullif(pr->>'impresiones', '')::int,
         nullif(btrim(coalesce(pr->>'notas', '')), '')
  from jsonb_array_elements(v_procesos) with ordinality as t(pr, n);

  return v_producto;
end;
$$;
revoke execute on function public.guardar_producto_frisa(uuid, text, text, text, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.guardar_producto_frisa(uuid, text, text, text, text, text, text, text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Seed: 8 productos de Frisa (idempotente por código; si el producto
--    ya existe no se toca, para no pisar lo editado en la app)
-- ---------------------------------------------------------------------
do $$
declare
  p record;
  v_id uuid;
begin
  for p in
    select * from (values
      ('FR-CAM-BAS', 'Camisa Frisa', 'confeccionada', 'S-3XL', 'Azul mezclilla', 'Mezclilla indiana (Galaxia Biz)', null::text,
       'Cinta reflejante: Cyprus.',
       '[{"proceso":"corte"},{"proceso":"costura","notas":"Incluye cinta reflejante (Cyprus)"},{"proceso":"bordado"},{"proceso":"terminado"}]'),
      ('FR-CAM-NI', 'Camisa Nuevo Ingreso', 'confeccionada', 'S-3XL', 'Azul mezclilla', null, null,
       null,
       '[{"proceso":"corte"},{"proceso":"costura"},{"proceso":"bordado"},{"proceso":"impresion","impresiones":1},{"proceso":"terminado"}]'),
      ('FR-PLA-AM-MC', 'Playera C/REF A. Marino M/C', 'comprada', 'S-3XL', 'Azul marino', null, 'Vlank',
       null,
       '[{"proceso":"descosido"},{"proceso":"reflejante"},{"proceso":"impresion","impresiones":1},{"proceso":"terminado"}]'),
      ('FR-PLA-AM-ML', 'Playera C/REF A. Marino M/L', 'comprada', 'S-3XL', 'Azul marino', null, 'Mi Playera / Máxima',
       null,
       '[{"proceso":"descosido"},{"proceso":"reflejante"},{"proceso":"impresion","impresiones":1},{"proceso":"terminado"}]'),
      ('FR-PLA-OM-MC', 'Playera C/REF Oro Mango M/C', 'comprada', 'S-3XL', 'Amarillo mango', null, null,
       null,
       '[{"proceso":"descosido"},{"proceso":"reflejante"},{"proceso":"impresion","impresiones":1},{"proceso":"terminado"}]'),
      ('FR-PLA-VE-MC', 'Playera C/REF Verde M/C', 'comprada', 'S-3XL', 'Verde', null, null,
       null,
       '[{"proceso":"descosido"},{"proceso":"reflejante"},{"proceso":"impresion","impresiones":2},{"proceso":"terminado"}]'),
      ('FR-PLA-RO-MC', 'Playera S/REF Roja M/C', 'comprada', 'S-3XL', 'Rojo cereza', null, 'Vlank',
       'Por confirmar que es la de Frisa.',
       '[{"proceso":"impresion","impresiones":2},{"proceso":"terminado"}]'),
      ('FR-PLA-AM-SR-ML', 'Playera S/REF A. Marino M/L', 'comprada', 'S-3XL', 'Azul marino', null, 'Mi Playera / Máxima',
       null,
       '[{"proceso":"impresion","impresiones":1},{"proceso":"terminado"}]')
    ) as t(codigo, nombre, origen, tallas, color, tela, proveedor, descripcion, procesos)
  loop
    continue when exists (select 1 from public.productos_frisa where upper(btrim(codigo)) = p.codigo);
    insert into public.productos_frisa (codigo, nombre, origen, tallas_rango, color, tela, proveedor, descripcion)
    values (p.codigo, p.nombre, p.origen, p.tallas, p.color, p.tela, p.proveedor, p.descripcion)
    returning id into v_id;
    insert into public.producto_frisa_procesos (producto_id, proceso_codigo, orden, impresiones, notas)
    select v_id, pr->>'proceso', n::int, nullif(pr->>'impresiones', '')::int, pr->>'notas'
    from jsonb_array_elements(p.procesos::jsonb) with ordinality as t(pr, n);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) Tipo de orden "Frisa", folio FR-001…, y columnas de la orden
-- ---------------------------------------------------------------------
-- La plantilla (solo terminado) existe porque un tipo activo debe tener
-- etapas (V136) y así no pide tela (V154 solo aplica si hay corte). Las
-- órdenes Frisa NO la usan: sus etapas salen del producto.
do $$
begin
  if not exists (select 1 from public.order_types where key = 'frisa') then
    insert into public.order_types (key, label, color, sort_order, folio_prefix, active)
    values ('frisa', 'Frisa', '#64748b', (select coalesce(max(sort_order), 0) + 1 from public.order_types), 'FR', false);
  end if;
  insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia) values ('frisa', 'terminado', 4)
  on conflict (order_type_key, etapa) do nothing;
  update public.order_types set active = true where key = 'frisa' and not active;
end $$;

create sequence if not exists public.folio_seq_frisa start 1;

alter table public.orders add column if not exists producto_frisa_id uuid references public.productos_frisa(id) on delete set null;
-- Copia del producto al crear la orden: {id, codigo, nombre, origen,
-- tallas_rango, color, tela, proveedor, bordado_por_orden,
-- procesos: [{orden, proceso, nombre, etapa, impresiones, notas}]}.
alter table public.orders add column if not exists frisa_producto jsonb;

-- ---------------------------------------------------------------------
-- 6) Candado de las órdenes Frisa (orders)
-- ---------------------------------------------------------------------
-- BEFORE INSERT corre antes de trg_assign_order_folio (orden alfabético):
-- un rechazo no gasta folio. create_order_frisa pasa el producto por una
-- variable de la transacción; una orden Frisa creada por otro camino se
-- rechaza. Siempre: sin cliente del catálogo, nombre "Frisa", sin precio.
create or replace function public.orders_frisa_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_producto uuid;
begin
  if tg_op = 'INSERT' then
    if new.order_type_key <> 'frisa' then
      return new;
    end if;
    v_producto := nullif(coalesce(current_setting('salper.frisa_producto_id', true), ''), '')::uuid;
    if v_producto is null then
      raise exception 'Las órdenes de Frisa se crean eligiendo un producto del catálogo Frisa.';
    end if;
    new.producto_frisa_id := v_producto;
  else
    if (old.order_type_key = 'frisa') <> (new.order_type_key = 'frisa') then
      raise exception 'El tipo Frisa no se puede poner ni quitar en una orden ya creada: cancélala y captúrala de nuevo.';
    end if;
    if new.order_type_key <> 'frisa' then
      return new;
    end if;
  end if;
  new.client_id := null;
  new.client_name := 'Frisa';
  new.total_orden := null;
  return new;
end;
$$;

drop trigger if exists orders_frisa_ins on public.orders;
create trigger orders_frisa_ins
  before insert on public.orders
  for each row execute function public.orders_frisa_guard();

drop trigger if exists orders_frisa_upd on public.orders;
create trigger orders_frisa_upd
  before update of order_type_key, client_id, client_name, total_orden on public.orders
  for each row execute function public.orders_frisa_guard();

-- ---------------------------------------------------------------------
-- 7) La secuencia copiada manda (orden_etapas)
-- ---------------------------------------------------------------------
-- set_order_items (bordado) y sync_etapa_impresion_prenda (impresión)
-- agregan o quitan etapas según las prendas. En una orden Frisa ya
-- copiada (frisa_producto no nulo) la secuencia es fija: se ignora
-- cualquier etapa que no esté en ella y no se borra ninguna que sí esté.
create or replace function public.orden_etapas_frisa_protege()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_procesos jsonb;
  v_fila public.orden_etapas := case when tg_op = 'DELETE' then old else new end;
  v_en_secuencia boolean;
begin
  select o.frisa_producto->'procesos' into v_procesos
  from public.orders o
  where o.id = v_fila.order_id and o.order_type_key = 'frisa';
  if v_procesos is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select exists (select 1 from jsonb_array_elements(v_procesos) pr where pr->>'etapa' = v_fila.etapa) into v_en_secuencia;
  if tg_op = 'INSERT' and not v_en_secuencia then
    return null;  -- no es de la secuencia: se ignora
  end if;
  if tg_op = 'DELETE' and v_en_secuencia then
    return null;  -- es de la secuencia: no se quita
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.orden_etapas_frisa_protege() from public, anon, authenticated;

drop trigger if exists orden_etapas_frisa_protege on public.orden_etapas;
create trigger orden_etapas_frisa_protege
  before insert or delete on public.orden_etapas
  for each row execute function public.orden_etapas_frisa_protege();

-- Regla estricta (solo Frisa): una etapa no puede arrancar mientras la
-- anterior de la secuencia no esté completada. Los administradores de
-- fábrica / general sí pueden (correcciones).
create or replace function public.orden_etapas_frisa_secuencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior public.orden_etapas;
begin
  if old.estado <> 'pendiente' or new.estado = 'pendiente' then
    return new;
  end if;
  if not exists (select 1 from public.orders where id = new.order_id and order_type_key = 'frisa') then
    return new;
  end if;
  if coalesce(public.current_user_role(), '') in ('admin_fabrica', 'admin_general') then
    return new;
  end if;

  select * into v_anterior from public.orden_etapas
  where order_id = new.order_id and orden_secuencia < new.orden_secuencia
  order by orden_secuencia desc
  limit 1;
  if v_anterior.id is not null and v_anterior.estado <> 'completado' then
    raise exception 'Todavía no le toca: primero se tiene que completar %.',
      coalesce((select nombre from public.procesos_catalogo where etapa = v_anterior.etapa), v_anterior.etapa);
  end if;
  return new;
end;
$$;
revoke execute on function public.orden_etapas_frisa_secuencia() from public, anon, authenticated;

drop trigger if exists orden_etapas_frisa_secuencia on public.orden_etapas;
create trigger orden_etapas_frisa_secuencia
  before update of estado on public.orden_etapas
  for each row execute function public.orden_etapas_frisa_secuencia();

-- ---------------------------------------------------------------------
-- 8) Crear una orden Frisa
-- ---------------------------------------------------------------------
-- Envuelve a create_order (mismos permisos, historial, folio y triggers),
-- cambia las etapas de la plantilla por la secuencia del producto (1..n) y
-- guarda la copia en orders.frisa_producto.
-- p_lleva_bordado: bordado por orden, solo si el producto es confeccionada
-- y su secuencia no lo trae; va justo antes de terminado.
create or replace function public.create_order_frisa(
  p_producto_id uuid,
  p_requested_delivery_date date,
  p_items jsonb default '[]'::jsonb,
  p_description text default null,
  p_folios_externos text[] default '{}'::text[],
  p_lleva_bordado boolean default false
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_producto public.productos_frisa;
  v_items jsonb := case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end;
  v_procesos jsonb;
  v_borda boolean;
  v_bordado_extra boolean := coalesce(p_lleva_bordado, false);
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;

  select * into v_producto from public.productos_frisa where id = p_producto_id;
  if v_producto.id is null then
    raise exception 'Elige un producto del catálogo Frisa.';
  end if;
  if not v_producto.activo then
    raise exception 'El producto % está dado de baja.', v_producto.codigo;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_items) it,
      jsonb_array_elements(case when jsonb_typeof(it->'sizes') = 'array' then it->'sizes' else '[]'::jsonb end) sz
    where btrim(coalesce(sz->>'talla', '')) <> '' and coalesce(nullif(sz->>'cantidad', '')::numeric, 0) > 0
  ) then
    raise exception 'Captura al menos una talla con su cantidad.';
  end if;

  -- Secuencia del producto, con el nombre y la etapa de cada proceso.
  select coalesce(jsonb_agg(jsonb_build_object(
           'proceso', pp.proceso_codigo, 'nombre', c.nombre, 'etapa', c.etapa,
           'impresiones', pp.impresiones, 'notas', pp.notas
         ) order by pp.orden), '[]'::jsonb)
    into v_procesos
  from public.producto_frisa_procesos pp
  join public.procesos_catalogo c on c.codigo = pp.proceso_codigo
  where pp.producto_id = v_producto.id;
  if jsonb_array_length(v_procesos) = 0 then
    raise exception 'El producto % no tiene procesos. Agrégalos en Catálogos → Frisa.', v_producto.codigo;
  end if;

  v_borda := exists (select 1 from jsonb_array_elements(v_procesos) pr where pr->>'etapa' = 'bordado');
  if v_bordado_extra and (v_borda or v_producto.origen <> 'confeccionada') then
    v_bordado_extra := false;  -- ya lo trae, o es comprada: no se duplica
  end if;
  if v_bordado_extra then
    -- Justo antes de terminado (o al final si la secuencia no termina ahí).
    select coalesce(jsonb_agg(e order by pos), '[]'::jsonb) into v_procesos
    from (
      select pr as e, n * 2 as pos from jsonb_array_elements(v_procesos) with ordinality as t(pr, n)
      union all
      select jsonb_build_object('proceso', 'bordado', 'nombre', 'Bordado', 'etapa', 'bordado', 'impresiones', null, 'notas', 'Bordado por orden'),
             coalesce((select n * 2 - 1 from jsonb_array_elements(v_procesos) with ordinality as t(pr, n) where pr->>'etapa' = 'terminado'),
                      jsonb_array_length(v_procesos) * 2 + 1)
    ) s;
  end if;
  -- Número de paso 1..n.
  select jsonb_agg(pr || jsonb_build_object('orden', n) order by n) into v_procesos
  from jsonb_array_elements(v_procesos) with ordinality as t(pr, n);

  -- Las prendas dicen si llevan bordado (así lo muestra la app).
  select coalesce(jsonb_agg(it || jsonb_build_object(
           'lleva_bordado', v_borda or v_bordado_extra,
           'producto_frisa_id', v_producto.id,
           'garment', coalesce(nullif(btrim(it->>'garment'), ''), v_producto.nombre))), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(v_items) it;

  perform set_config('salper.frisa_producto_id', v_producto.id::text, true);
  v_order := public.create_order(
    p_client_name => 'Frisa',
    p_order_type_key => 'frisa',
    p_description => p_description,
    p_requested_delivery_date => p_requested_delivery_date,
    p_items => v_items,
    p_client_id => null,
    p_folios_externos => p_folios_externos,
    p_total_orden => null
  );
  perform set_config('salper.frisa_producto_id', '', true);

  -- Etapas = la secuencia del producto (todavía sin copia: el candado de
  -- orden_etapas no interviene).
  delete from public.orden_etapas where order_id = v_order.id;
  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select v_order.id, pr->>'etapa', 'pendiente', (pr->>'orden')::int
  from jsonb_array_elements(v_procesos) pr;

  update public.orders set frisa_producto = jsonb_build_object(
      'id', v_producto.id, 'codigo', v_producto.codigo, 'nombre', v_producto.nombre,
      'origen', v_producto.origen, 'tallas_rango', v_producto.tallas_rango, 'color', v_producto.color,
      'tela', v_producto.tela, 'proveedor', v_producto.proveedor,
      'bordado_por_orden', v_bordado_extra, 'procesos', v_procesos)
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.create_order_frisa(uuid, date, jsonb, text, text[], boolean) from public, anon;
grant execute on function public.create_order_frisa(uuid, date, jsonb, text, text[], boolean) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--
--   select key, label, folio_prefix, active from public.order_types where key = 'frisa';
--   -- frisa | Frisa | FR | true
--   select last_value, is_called from public.folio_seq_frisa;   -- 1 | false
--   select codigo, etapa from public.procesos_catalogo order by orden_sugerido;   -- 8 filas
--   select p.codigo, string_agg(pp.proceso_codigo || coalesce(' x' || pp.impresiones, ''), ' → ' order by pp.orden)
--   from public.productos_frisa p join public.producto_frisa_procesos pp on pp.producto_id = p.id
--   group by p.codigo order by p.codigo;   -- 8 productos
--   select proname, position('descosido' in prosrc) > 0 as acepta_descosido
--   from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('update_orden_etapa', 'pausar_orden_etapa');   -- 2 filas: true
--   select proname, has_function_privilege('anon', oid, 'execute') as anon_puede,
--          has_function_privilege('authenticated', oid, 'execute') as sesion_puede
--   from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('create_order_frisa', 'guardar_producto_frisa');   -- anon false, sesión true
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--   -- orders_frisa_ins / orders_frisa_upd van antes de trg_assign_order_folio
--
-- NO probar create_order_frisa "a ver si funciona": gasta folios FR.
-- =====================================================================
