-- =====================================================================
-- V78 — Pendientes tienda <-> fábrica  (aplicado 2026-09-26)
-- =====================================================================
-- Reemplaza el módulo de Pendientes viejo. 100% ADITIVO: tablas y funciones
-- nuevas con prefijo pf_. La tabla vieja `pending_items` (hoy con 0 filas) y
-- sus 2 funciones NO se tocan ni se borran (queda como archivo muerto; se
-- puede borrar más adelante). Nada de esto toca órdenes ni producción.
--
-- Flujo (propuesta de estado intermedio: `listo_para_regresar`):
--   enviado_a_fabrica  -> recibido_en_fabrica   (fábrica)   "Por hacer"
--   recibido_en_fabrica-> listo_para_regresar   (fábrica)   "Listo para regresar"
--   listo_para_regresar-> enviado_a_tienda      (fábrica)
--   enviado_a_tienda   -> recibido_en_tienda    (tienda)    cerrado
--   cualquier estado   -> con_problema          (tienda/fábrica, nota obligatoria)
--   con_problema       -> el estado en que estaba (pf_resolver_problema)
-- super_admin (= admin_general) puede hacer cualquier transición.
-- Roles tienda: ventas, contabilidad, admin_tienda, tienda.
-- Roles fábrica: corte, bordado, sublimado, produccion, terminado, admin_fabrica.
-- Consultar: todos los roles con sesión salvo captura_produccion.
-- Folio P-0001...: secuencia de Postgres; no hay borrado, nunca se reutiliza.
-- =====================================================================

create sequence if not exists public.pf_folio_seq;

-- ---------------------------------------------------------------------
-- Helpers de rol (funciones nuevas)
-- ---------------------------------------------------------------------
create or replace function public.pf_es_tienda() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('ventas', 'contabilidad', 'admin_tienda', 'tienda', 'admin_general');
$$;
create or replace function public.pf_es_fabrica() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in
    ('corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica', 'admin_general');
$$;
create or replace function public.pf_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') not in ('', 'captura_produccion');
$$;
revoke execute on function public.pf_es_tienda() from public;
revoke execute on function public.pf_es_fabrica() from public;
revoke execute on function public.pf_puede_ver() from public;
grant execute on function public.pf_es_tienda() to authenticated;
grant execute on function public.pf_es_fabrica() to authenticated;
grant execute on function public.pf_puede_ver() to authenticated;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.pf_tipos_trabajo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text generated always as (lower(btrim(nombre))) stored,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists pf_tipos_nombre_key on public.pf_tipos_trabajo (nombre_normalizado);
insert into public.pf_tipos_trabajo (nombre, orden) values
  ('Arreglo', 1), ('Bordado', 2), ('Ajuste', 3), ('Sublimado', 4), ('Otro', 99)
on conflict do nothing;

create table if not exists public.pf_pendientes (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('P-' || lpad(nextval('public.pf_folio_seq')::text, 4, '0')),
  descripcion text not null,
  tipo_id uuid not null references public.pf_tipos_trabajo(id),
  cantidad integer not null default 1 check (cantidad > 0),
  fotos jsonb not null default '[]'::jsonb,               -- [{"url":...,"path":...}] (bucket order-photos, carpeta pendientes/)
  fecha_requerida date not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  estado text not null default 'enviado_a_fabrica' check (estado in (
    'enviado_a_fabrica', 'recibido_en_fabrica', 'listo_para_regresar',
    'enviado_a_tienda', 'recibido_en_tienda', 'con_problema')),
  estado_previo text,                                     -- solo mientras está con_problema
  estado_desde timestamptz not null default now(),        -- desde cuándo está en el estado actual (alerta de "1 día sin recibir")
  creado_por uuid references public.profiles(id) on delete set null,
  creado_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cerrado_en timestamptz
);
create index if not exists pf_pendientes_estado_idx on public.pf_pendientes (estado);
create index if not exists pf_pendientes_fecha_idx on public.pf_pendientes (fecha_requerida);
create index if not exists pf_pendientes_cliente_idx on public.pf_pendientes (cliente_id);

create table if not exists public.pf_historial (
  id uuid primary key default gen_random_uuid(),
  pendiente_id uuid not null references public.pf_pendientes(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  nota text,
  cambiado_por uuid references public.profiles(id) on delete set null,
  cambiado_por_nombre text,
  rol text,
  created_at timestamptz not null default now()
);
create index if not exists pf_historial_pendiente_idx on public.pf_historial (pendiente_id, created_at);

alter table public.pf_tipos_trabajo enable row level security;
alter table public.pf_pendientes enable row level security;
alter table public.pf_historial enable row level security;

drop policy if exists "pf lee tipos" on public.pf_tipos_trabajo;
create policy "pf lee tipos" on public.pf_tipos_trabajo for select to authenticated using (public.pf_puede_ver());
drop policy if exists "pf lee pendientes" on public.pf_pendientes;
create policy "pf lee pendientes" on public.pf_pendientes for select to authenticated using (public.pf_puede_ver());
drop policy if exists "pf lee historial" on public.pf_historial;
create policy "pf lee historial" on public.pf_historial for select to authenticated using (public.pf_puede_ver());

revoke all on public.pf_tipos_trabajo, public.pf_pendientes, public.pf_historial from public, anon, authenticated;
grant select on public.pf_tipos_trabajo, public.pf_pendientes, public.pf_historial to authenticated;

-- Tiempo real para las bandejas (el celular se actualiza solo)
do $$ begin
  alter publication supabase_realtime add table public.pf_pendientes;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- RPCs (SECURITY DEFINER; anon sin acceso)
-- ---------------------------------------------------------------------
create or replace function public.pf_nombre_actual() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.profiles where id = auth.uid()), '');
$$;
revoke execute on function public.pf_nombre_actual() from public;
grant execute on function public.pf_nombre_actual() to authenticated;

create or replace function public.pf_crear(
  p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid default null, p_order_id uuid default null, p_fotos jsonb default '[]'::jsonb
) returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes;
begin
  if not public.pf_es_tienda() then
    raise exception 'Solo tienda puede crear pendientes para fábrica.';
  end if;
  if btrim(coalesce(p_descripcion, '')) = '' then raise exception 'Escribe la descripción del trabajo.'; end if;
  if p_fecha_requerida is null then raise exception 'Indica para cuándo se necesita de regreso.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if not exists (select 1 from public.pf_tipos_trabajo t where t.id = p_tipo_id and t.activo) then
    raise exception 'El tipo de trabajo no existe o está inactivo.';
  end if;
  insert into public.pf_pendientes
    (descripcion, tipo_id, cantidad, fotos, fecha_requerida, cliente_id, order_id, creado_por, creado_por_nombre)
  values (btrim(p_descripcion), p_tipo_id, p_cantidad, coalesce(p_fotos, '[]'::jsonb), p_fecha_requerida,
          p_cliente_id, p_order_id, auth.uid(), public.pf_nombre_actual())
  returning * into v;
  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (v.id, null, v.estado, 'Creado y enviado a fábrica', auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;

-- Editar (typos, fecha, etc.): solo tienda y solo mientras aún no lo recibe fábrica.
create or replace function public.pf_editar(
  p_id uuid, p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid, p_order_id uuid, p_fotos jsonb
) returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes;
begin
  if not public.pf_es_tienda() then raise exception 'Solo tienda puede editar un pendiente.'; end if;
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if v.estado <> 'enviado_a_fabrica' and coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Ya no se puede editar: fábrica ya lo recibió.';
  end if;
  if btrim(coalesce(p_descripcion, '')) = '' or p_fecha_requerida is null or coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Revisa descripción, cantidad y fecha.';
  end if;
  update public.pf_pendientes
     set descripcion = btrim(p_descripcion), tipo_id = p_tipo_id, cantidad = p_cantidad,
         fecha_requerida = p_fecha_requerida, cliente_id = p_cliente_id, order_id = p_order_id,
         fotos = coalesce(p_fotos, fotos), updated_at = now()
   where id = p_id returning * into v;
  return v;
end; $$;

-- Núcleo de una transición (lo usan el cambio individual y el de lote).
create or replace function public.pf_aplicar(p_id uuid, p_nuevo text, p_nota text)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes; v_rol text := coalesce(public.current_user_role(), ''); ok boolean := false; v_ant text;
begin
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  v_ant := v.estado;

  if p_nuevo = 'con_problema' then
    if not (public.pf_es_tienda() or public.pf_es_fabrica()) then raise exception 'No tienes permiso.'; end if;
    if v.estado = 'con_problema' then raise exception 'Ya está marcado con problema.'; end if;
    if btrim(coalesce(p_nota, '')) = '' then raise exception 'Escribe una nota explicando el problema.'; end if;
    update public.pf_pendientes set estado = 'con_problema', estado_previo = v.estado, estado_desde = now(), updated_at = now()
     where id = p_id returning * into v;
  else
    if v.estado = 'con_problema' then raise exception 'Está con problema: primero resuélvelo.'; end if;
    ok := case
      when v.estado = 'enviado_a_fabrica'   and p_nuevo = 'recibido_en_fabrica' then public.pf_es_fabrica()
      when v.estado = 'recibido_en_fabrica' and p_nuevo = 'listo_para_regresar' then public.pf_es_fabrica()
      when v.estado = 'listo_para_regresar' and p_nuevo = 'enviado_a_tienda'    then public.pf_es_fabrica()
      when v.estado = 'enviado_a_tienda'    and p_nuevo = 'recibido_en_tienda'  then public.pf_es_tienda()
      else false end;
    if not ok then
      raise exception 'No puedes pasar este pendiente de "%" a "%" con tu rol.', v.estado, p_nuevo;
    end if;
    update public.pf_pendientes
       set estado = p_nuevo, estado_previo = null, estado_desde = now(), updated_at = now(),
           cerrado_en = case when p_nuevo = 'recibido_en_tienda' then now() end
     where id = p_id returning * into v;
  end if;

  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, v_ant, p_nuevo, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.pf_nombre_actual(), v_rol);
  return v;
end; $$;
revoke execute on function public.pf_aplicar(uuid, text, text) from public;   -- interna: sin grant

create or replace function public.pf_cambiar_estado(p_id uuid, p_nuevo text, p_nota text default null)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
begin
  if not public.pf_puede_ver() then raise exception 'No tienes permiso.'; end if;
  return public.pf_aplicar(p_id, p_nuevo, p_nota);
end; $$;

-- Resolver un problema: regresa al estado en que estaba.
create or replace function public.pf_resolver_problema(p_id uuid, p_nota text default null)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes;
begin
  if not (public.pf_es_tienda() or public.pf_es_fabrica()) then raise exception 'No tienes permiso.'; end if;
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if v.estado <> 'con_problema' then raise exception 'Este pendiente no está marcado con problema.'; end if;
  update public.pf_pendientes
     set estado = v.estado_previo, estado_previo = null, estado_desde = now(), updated_at = now(),
         cerrado_en = case when v.estado_previo = 'recibido_en_tienda' then now() end
   where id = p_id returning * into v;
  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, 'con_problema', v.estado, coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Problema resuelto'),
          auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;

-- Confirmación en bloque: aplica a los que sí se pueden y reporta los omitidos.
create or replace function public.pf_cambiar_estado_lote(p_ids uuid[], p_nuevo text, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare i uuid; n integer := 0; omit jsonb := '[]'::jsonb; f text;
begin
  if not public.pf_puede_ver() then raise exception 'No tienes permiso.'; end if;
  foreach i in array coalesce(p_ids, '{}'::uuid[]) loop
    begin
      perform public.pf_aplicar(i, p_nuevo, p_nota);
      n := n + 1;
    exception when others then
      select folio into f from public.pf_pendientes where id = i;
      omit := omit || jsonb_build_array(jsonb_build_object('folio', f, 'motivo', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('cambiados', n, 'omitidos', omit);
end; $$;

-- Catálogo editable de tipos de trabajo
create or replace function public.pf_guardar_tipo(p_id uuid, p_nombre text, p_activo boolean, p_orden integer)
returns public.pf_tipos_trabajo
language plpgsql security definer set search_path = public as $$
declare v public.pf_tipos_trabajo;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_general', 'admin_tienda', 'admin_fabrica') then
    raise exception 'Solo un administrador puede editar los tipos de trabajo.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre del tipo.'; end if;
  if exists (select 1 from public.pf_tipos_trabajo t where t.nombre_normalizado = lower(btrim(p_nombre)) and t.id is distinct from p_id) then
    raise exception 'Ya existe un tipo con ese nombre.';
  end if;
  if p_id is null then
    insert into public.pf_tipos_trabajo (nombre, activo, orden) values (btrim(p_nombre), coalesce(p_activo, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.pf_tipos_trabajo set nombre = btrim(p_nombre), activo = coalesce(p_activo, activo), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'El tipo no existe.'; end if;
  end if;
  return v;
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'pf_crear(text, uuid, integer, date, uuid, uuid, jsonb)',
    'pf_editar(uuid, text, uuid, integer, date, uuid, uuid, jsonb)',
    'pf_cambiar_estado(uuid, text, text)', 'pf_resolver_problema(uuid, text)',
    'pf_cambiar_estado_lote(uuid[], text, text)', 'pf_guardar_tipo(uuid, text, boolean, integer)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
