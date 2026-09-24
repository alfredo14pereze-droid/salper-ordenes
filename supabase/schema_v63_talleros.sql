-- =====================================================================
-- V63 — Módulo "Talleros" (muestrarios físicos que se prestan a clientes)
-- =====================================================================
-- Reemplaza la hoja TALLEROS del Excel Control_Salper. Un tallero es una
-- caja/perchero con prendas de ejemplo (folio TAL-001…) que se presta a un
-- colegio o cliente para que vea los modelos. Se registra quién lo tiene
-- mientras está fuera y qué tallas trae / le faltan.
--
-- Módulo NUEVO y AISLADO: 3 tablas con prefijo `mt_` que no tocan `orders`
-- (solo un vínculo OPCIONAL de cada movimiento a una orden).
--
-- Decisiones (confirmadas con el usuario):
--   - Se agregan `tallas` (rango que trae la caja, ej. "0-3XL") y
--     `tallas_faltantes` (ej. "2XL, 3XL, 4XL"), que el Excel controla.
--   - Estado de USO (disponible / prestado / en_reparacion) separado del
--     estado de CONTENIDO (completo / incompleto), como en el Excel.
--   - "Quién recibe" es TEXTO LIBRE (colegio/cliente) — sin catálogo.
--   - `ubicacion` = tienda | fabrica (como en el Excel; nullable: el Excel
--     las traía vacías y no se inventa).
--   - Nombres de columna de movimientos: `persona_equipo` (quien de SALPER
--     presta/recibe) y `persona_externa` (colegio/cliente que lo lleva o
--     devuelve) — sirven igual para préstamo y devolución.
--   - El código TAL-### sale de una SECUENCIA: nunca se recicla, ni
--     aunque se dé de baja un tallero.
--   - `orden_id` es uuid REAL (FK a orders), no texto.
--
-- Permisos:
--   Ver (SELECT):   TODOS los roles con sesión excepto `tienda` (rol
--                   básico) — incluye a los 6 roles de fábrica, que a
--                   veces son quienes piden los talleros. anon: nada.
--   Prestar/devolver: ventas, admin_tienda, admin_general.
--   Alta/edición/baja de talleros y catálogo de prendas: admin_tienda,
--                   admin_general.
--   Escritura SIEMPRE por RPC SECURITY DEFINER (patrón de siempre).
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase, una sola
-- vez. Todas las funciones son NUEVAS (sin overloads que limpiar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.mt_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  categoria text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists mt_productos_nombre_key on public.mt_productos (lower(btrim(nombre)));

create sequence if not exists public.mt_contenedores_codigo_seq;

create table if not exists public.mt_contenedores (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  producto_id uuid not null references public.mt_productos(id),
  tallas text,
  tallas_faltantes text,
  color text,
  tela text,
  foto_path text,
  foto_url text,
  estado_uso text not null default 'disponible' check (estado_uso in ('disponible', 'prestado', 'en_reparacion')),
  estado_contenido text not null default 'completo' check (estado_contenido in ('completo', 'incompleto')),
  ubicacion text check (ubicacion in ('tienda', 'fabrica')),
  estanteria text,
  observaciones text,
  -- Préstamo vigente (se limpia al devolver). El historial vive en mt_movimientos.
  prestado_a text,
  prestado_por text,
  prestado_desde timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminada_en timestamptz
);
create index if not exists mt_contenedores_producto_idx on public.mt_contenedores (producto_id);

create table if not exists public.mt_movimientos (
  id uuid primary key default gen_random_uuid(),
  contenedor_id uuid not null references public.mt_contenedores(id),
  tipo text not null check (tipo in ('prestamo', 'devolucion', 'ajuste')),
  estado_anterior text,
  estado_nuevo text,
  persona_equipo text,
  persona_externa text,
  orden_id uuid references public.orders(id) on delete set null,
  notas text,
  fecha timestamptz not null default now(),
  registrado_por uuid references public.profiles(id) on delete set null
);
create index if not exists mt_movimientos_contenedor_idx on public.mt_movimientos (contenedor_id, fecha desc);

-- ---------------------------------------------------------------------
-- 2) Acceso: RLS + lectura para todo rol con sesión salvo `tienda`
-- ---------------------------------------------------------------------
alter table public.mt_productos enable row level security;
alter table public.mt_contenedores enable row level security;
alter table public.mt_movimientos enable row level security;

drop policy if exists "Lectura talleros productos" on public.mt_productos;
create policy "Lectura talleros productos" on public.mt_productos
  for select to authenticated using (coalesce(public.current_user_role(), '') not in ('', 'tienda'));

drop policy if exists "Lectura talleros contenedores" on public.mt_contenedores;
create policy "Lectura talleros contenedores" on public.mt_contenedores
  for select to authenticated using (coalesce(public.current_user_role(), '') not in ('', 'tienda'));

drop policy if exists "Lectura talleros movimientos" on public.mt_movimientos;
create policy "Lectura talleros movimientos" on public.mt_movimientos
  for select to authenticated using (coalesce(public.current_user_role(), '') not in ('', 'tienda'));

revoke all on public.mt_productos, public.mt_contenedores, public.mt_movimientos from public, anon, authenticated;
grant select on public.mt_productos, public.mt_contenedores, public.mt_movimientos to authenticated;
revoke all on sequence public.mt_contenedores_codigo_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Bucket de fotos (lectura pública como order-photos; subir/borrar
--    solo admin_tienda / admin_general)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mt-fotos', 'mt-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Lectura pública mt-fotos" on storage.objects;
create policy "Lectura pública mt-fotos" on storage.objects
  for select using (bucket_id = 'mt-fotos');

drop policy if exists "Subida admin mt-fotos" on storage.objects;
create policy "Subida admin mt-fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mt-fotos' and coalesce(public.current_user_role(), '') in ('admin_tienda', 'admin_general'));

drop policy if exists "Borrado admin mt-fotos" on storage.objects;
create policy "Borrado admin mt-fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mt-fotos' and coalesce(public.current_user_role(), '') in ('admin_tienda', 'admin_general'));

-- ---------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------

-- Catálogo de prendas: crear (sin id) o editar (con id). Admin.
create or replace function public.mt_guardar_producto(
  p_id uuid, p_nombre text, p_categoria text, p_activo boolean
) returns public.mt_productos
language plpgsql security definer set search_path = public as $$
declare v_row public.mt_productos;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar el catálogo de prendas.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El nombre de la prenda es obligatorio.';
  end if;

  if p_id is null then
    insert into public.mt_productos (nombre, categoria, activo)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_categoria, '')), ''), coalesce(p_activo, true))
    returning * into v_row;
  else
    update public.mt_productos
       set nombre = btrim(p_nombre),
           categoria = nullif(btrim(coalesce(p_categoria, '')), ''),
           activo = coalesce(p_activo, activo)
     where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Prenda no encontrada.'; end if;
  end if;
  return v_row;
end; $$;
revoke execute on function public.mt_guardar_producto(uuid, text, text, boolean) from public;
grant execute on function public.mt_guardar_producto(uuid, text, text, boolean) to authenticated;

-- Alta de tallero. El código TAL-### sale de la secuencia. Admin.
create or replace function public.mt_crear_contenedor(
  p_producto_id uuid, p_tallas text, p_tallas_faltantes text, p_estado_contenido text,
  p_color text, p_tela text, p_ubicacion text, p_estanteria text, p_observaciones text,
  p_estado_uso text, p_foto_path text, p_foto_url text
) returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare v_row public.mt_contenedores;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para dar de alta talleros.';
  end if;
  if p_producto_id is null then raise exception 'Elige la prenda del tallero.'; end if;
  if coalesce(p_estado_uso, 'disponible') not in ('disponible', 'en_reparacion') then
    raise exception 'Un tallero nuevo solo puede iniciar disponible o en reparación.';
  end if;

  insert into public.mt_contenedores (
    codigo, producto_id, tallas, tallas_faltantes, estado_contenido, color, tela,
    ubicacion, estanteria, observaciones, estado_uso, foto_path, foto_url
  ) values (
    'TAL-' || lpad(nextval('public.mt_contenedores_codigo_seq')::text, 3, '0'),
    p_producto_id,
    nullif(btrim(coalesce(p_tallas, '')), ''),
    nullif(btrim(coalesce(p_tallas_faltantes, '')), ''),
    coalesce(nullif(p_estado_contenido, ''), 'completo'),
    nullif(btrim(coalesce(p_color, '')), ''),
    nullif(btrim(coalesce(p_tela, '')), ''),
    nullif(p_ubicacion, ''),
    nullif(btrim(coalesce(p_estanteria, '')), ''),
    nullif(btrim(coalesce(p_observaciones, '')), ''),
    coalesce(nullif(p_estado_uso, ''), 'disponible'),
    nullif(p_foto_path, ''),
    nullif(p_foto_url, '')
  ) returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.mt_crear_contenedor(uuid, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.mt_crear_contenedor(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Edición de tallero. Admin. No toca el préstamo: si está prestado, el
-- estado de uso NO se puede cambiar aquí (hay que devolverlo).
-- p_foto_path/p_foto_url en null = no cambiar la foto.
create or replace function public.mt_actualizar_contenedor(
  p_id uuid, p_producto_id uuid, p_tallas text, p_tallas_faltantes text, p_estado_contenido text,
  p_color text, p_tela text, p_ubicacion text, p_estanteria text, p_observaciones text,
  p_estado_uso text, p_foto_path text, p_foto_url text
) returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare
  v_old public.mt_contenedores;
  v_row public.mt_contenedores;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar talleros.';
  end if;
  select * into v_old from public.mt_contenedores where id = p_id and eliminada_en is null for update;
  if v_old.id is null then raise exception 'Tallero no encontrado.'; end if;

  if v_old.estado_uso = 'prestado' then
    if coalesce(nullif(p_estado_uso, ''), 'prestado') <> 'prestado' then
      raise exception 'Este tallero está prestado — regístralo como devuelto antes de cambiar su estado.';
    end if;
  elsif coalesce(p_estado_uso, v_old.estado_uso) not in ('disponible', 'en_reparacion') then
    raise exception 'Para marcarlo prestado usa "Prestar".';
  end if;

  update public.mt_contenedores set
    producto_id = coalesce(p_producto_id, producto_id),
    tallas = nullif(btrim(coalesce(p_tallas, '')), ''),
    tallas_faltantes = nullif(btrim(coalesce(p_tallas_faltantes, '')), ''),
    estado_contenido = coalesce(nullif(p_estado_contenido, ''), estado_contenido),
    color = nullif(btrim(coalesce(p_color, '')), ''),
    tela = nullif(btrim(coalesce(p_tela, '')), ''),
    ubicacion = nullif(p_ubicacion, ''),
    estanteria = nullif(btrim(coalesce(p_estanteria, '')), ''),
    observaciones = nullif(btrim(coalesce(p_observaciones, '')), ''),
    estado_uso = case when v_old.estado_uso = 'prestado' then 'prestado' else coalesce(nullif(p_estado_uso, ''), estado_uso) end,
    foto_path = coalesce(nullif(p_foto_path, ''), foto_path),
    foto_url = coalesce(nullif(p_foto_url, ''), foto_url),
    actualizado_en = now()
  where id = p_id
  returning * into v_row;

  if v_row.estado_uso is distinct from v_old.estado_uso then
    insert into public.mt_movimientos (contenedor_id, tipo, estado_anterior, estado_nuevo, notas, registrado_por)
    values (p_id, 'ajuste', v_old.estado_uso, v_row.estado_uso, 'Cambio de estado', auth.uid());
  end if;
  return v_row;
end; $$;
revoke execute on function public.mt_actualizar_contenedor(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.mt_actualizar_contenedor(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Dar de baja (baja lógica; el historial se conserva). Admin. No si está prestado.
create or replace function public.mt_dar_de_baja(p_id uuid)
returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare v_row public.mt_contenedores;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para dar de baja talleros.';
  end if;
  select * into v_row from public.mt_contenedores where id = p_id and eliminada_en is null for update;
  if v_row.id is null then raise exception 'Tallero no encontrado.'; end if;
  if v_row.estado_uso = 'prestado' then
    raise exception 'Este tallero está prestado — regístralo como devuelto antes de darlo de baja.';
  end if;
  update public.mt_contenedores set eliminada_en = now(), actualizado_en = now() where id = p_id returning * into v_row;
  insert into public.mt_movimientos (contenedor_id, tipo, estado_anterior, estado_nuevo, notas, registrado_por)
  values (p_id, 'ajuste', v_row.estado_uso, 'baja', 'Dado de baja', auth.uid());
  return v_row;
end; $$;
revoke execute on function public.mt_dar_de_baja(uuid) from public;
grant execute on function public.mt_dar_de_baja(uuid) to authenticated;

-- Prestar. ventas / admin_tienda / admin_general.
create or replace function public.mt_prestar(
  p_contenedor_id uuid, p_persona_equipo text, p_persona_externa text, p_orden_id uuid, p_notas text
) returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare v_row public.mt_contenedores;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para prestar talleros.';
  end if;
  if btrim(coalesce(p_persona_equipo, '')) = '' then raise exception 'Indica quién lo presta.'; end if;
  if btrim(coalesce(p_persona_externa, '')) = '' then raise exception 'Indica quién se lo lleva.'; end if;

  select * into v_row from public.mt_contenedores where id = p_contenedor_id and eliminada_en is null for update;
  if v_row.id is null then raise exception 'Tallero no encontrado.'; end if;
  if v_row.estado_uso <> 'disponible' then
    raise exception 'Este tallero no está disponible (estado: %).', v_row.estado_uso;
  end if;

  update public.mt_contenedores
     set estado_uso = 'prestado',
         prestado_a = btrim(p_persona_externa),
         prestado_por = btrim(p_persona_equipo),
         prestado_desde = now(),
         actualizado_en = now()
   where id = p_contenedor_id
  returning * into v_row;

  insert into public.mt_movimientos (contenedor_id, tipo, estado_anterior, estado_nuevo, persona_equipo, persona_externa, orden_id, notas, registrado_por)
  values (p_contenedor_id, 'prestamo', 'disponible', 'prestado', btrim(p_persona_equipo), btrim(p_persona_externa), p_orden_id, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid());
  return v_row;
end; $$;
revoke execute on function public.mt_prestar(uuid, text, text, uuid, text) from public;
grant execute on function public.mt_prestar(uuid, text, text, uuid, text) to authenticated;

-- Devolver. ventas / admin_tienda / admin_general. Opcionalmente actualiza
-- las tallas faltantes (a veces regresa incompleto).
create or replace function public.mt_devolver(
  p_contenedor_id uuid, p_persona_externa text, p_persona_equipo text, p_notas text,
  p_estado_contenido text, p_tallas_faltantes text
) returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare v_row public.mt_contenedores;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para registrar devoluciones.';
  end if;
  if btrim(coalesce(p_persona_equipo, '')) = '' then raise exception 'Indica quién lo recibe.'; end if;

  select * into v_row from public.mt_contenedores where id = p_contenedor_id and eliminada_en is null for update;
  if v_row.id is null then raise exception 'Tallero no encontrado.'; end if;
  if v_row.estado_uso <> 'prestado' then
    raise exception 'Este tallero no está prestado.';
  end if;

  update public.mt_contenedores
     set estado_uso = 'disponible',
         estado_contenido = coalesce(nullif(p_estado_contenido, ''), estado_contenido),
         tallas_faltantes = case when p_estado_contenido is null or p_estado_contenido = '' then tallas_faltantes
                                 else nullif(btrim(coalesce(p_tallas_faltantes, '')), '') end,
         prestado_a = null,
         prestado_por = null,
         prestado_desde = null,
         actualizado_en = now()
   where id = p_contenedor_id
  returning * into v_row;

  insert into public.mt_movimientos (contenedor_id, tipo, estado_anterior, estado_nuevo, persona_equipo, persona_externa, notas, registrado_por)
  values (p_contenedor_id, 'devolucion', 'prestado', 'disponible', btrim(p_persona_equipo),
          nullif(btrim(coalesce(p_persona_externa, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid());
  return v_row;
end; $$;
revoke execute on function public.mt_devolver(uuid, text, text, text, text, text) from public;
grant execute on function public.mt_devolver(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Datos iniciales — catálogo de prendas y los 18 talleros del Excel
--    (Control_Salper.xlsx, hojas CONFIG y TALLEROS). Idempotente.
--    `ubicacion` queda vacía: en el Excel venía en blanco.
-- ---------------------------------------------------------------------
insert into public.mt_productos (nombre)
select v.nombre from (values
  ('Pantalonera'), ('Pants'), ('Chamarra'), ('Sudadera'), ('Falda Escolar'), ('Pantalón Escolar'),
  ('Playera Deportiva'), ('Playera Deportiva Dama'), ('Short'), ('Falda Short Deportiva'),
  ('Playera Polo Escolar'), ('Playera Polo'), ('Playera Polo Dama'), ('Polo Dry Fit'), ('Polo Dry Fit Dama'),
  ('Playera Algodón'), ('Camisa Caballero'), ('Camisa Dama'), ('Pantalón'), ('Pantalón Mezclilla'),
  ('Quirúrgico Dama'), ('Quirúrgico Caballero'), ('Camisola Mezclilla'), ('Camisa Mezclilla')
) as v(nombre)
on conflict do nothing;

insert into public.mt_contenedores (codigo, producto_id, tallas, tallas_faltantes, color, estado_contenido)
select v.codigo, p.id, v.tallas, nullif(v.faltantes, ''), v.color, v.contenido
from (values
  ('TAL-001', 'Pantalonera', '0-3XL', '', 'Azul', 'completo'),
  ('TAL-002', 'Pantalonera', '0-3XL', '', 'Verde', 'completo'),
  ('TAL-003', 'Sudadera', '0-3XL', '', 'Verde', 'completo'),
  ('TAL-004', 'Sudadera', '12-2XL', '', 'Azul', 'completo'),
  ('TAL-005', 'Chamarra', '0-3XL', '', 'Azul', 'completo'),
  ('TAL-006', 'Chamarra', '0-3XL', '', 'Verde', 'completo'),
  ('TAL-007', 'Playera Deportiva Dama', '12-3XL', '', 'Azul', 'completo'),
  ('TAL-008', 'Playera Deportiva Dama', '12-3XL', '', 'Azul', 'completo'),
  ('TAL-009', 'Camisa Caballero', 'XS-XL', '2XL, 3XL, 4XL', 'Naranja', 'incompleto'),
  ('TAL-010', 'Camisa Caballero', 'XS-XL', '2XL, 3XL, 4XL', 'Cielo', 'incompleto'),
  ('TAL-011', 'Camisa Caballero', 'XS-XL', '2XL, 3XL, 4XL', 'Amarillo', 'incompleto'),
  ('TAL-012', 'Camisa Caballero', 'XS-2XL', '3XL, 4XL', 'Rosa', 'incompleto'),
  ('TAL-013', 'Playera Polo Dama', 'CH-XL', '', 'Azul', 'completo'),
  ('TAL-014', 'Playera Polo Dama', 'CH-L', '', 'Verde', 'incompleto'),
  ('TAL-015', 'Playera Polo', 'CH-2XL', 'XS, 3XL, 4XL', 'Azul', 'incompleto'),
  ('TAL-016', 'Playera Polo', 'CH-2XL', 'XS, 3XL, 4XL', 'Verde', 'incompleto'),
  ('TAL-017', 'Quirúrgico Dama', 'XS-2XL', '', 'Azul', 'completo'),
  ('TAL-018', 'Quirúrgico Caballero', 'XS-2XL', '', 'Azul', 'completo')
) as v(codigo, prenda, tallas, faltantes, color, contenido)
join public.mt_productos p on lower(btrim(p.nombre)) = lower(v.prenda)
on conflict (codigo) do nothing;

-- Los talleros nuevos siguen desde TAL-019 (la secuencia nunca retrocede).
select setval(
  'public.mt_contenedores_codigo_seq',
  greatest(18, (select coalesce(max(substring(codigo from 5)::int), 0) from public.mt_contenedores)),
  true
);
