-- V80 — Pendientes: "¿es para un cliente?".
-- Un pendiente puede ser solo un arreglo que se queda en la tienda (sin cliente)
-- o para un cliente: en ese caso pide nombre, teléfono, tipo de prenda y talla.
-- Aditivo: 5 columnas nuevas (los pendientes existentes quedan es_para_cliente=false).
-- pf_crear / pf_editar cambian de firma (V78, aún sin uso real): DROP de las
-- anteriores y versión nueva con los parámetros al final.
alter table public.pf_pendientes
  add column if not exists es_para_cliente boolean not null default false,
  add column if not exists cliente_nombre text,
  add column if not exists cliente_telefono text,
  add column if not exists prenda text,
  add column if not exists talla text;

drop function if exists public.pf_crear(text, uuid, integer, date, uuid, uuid, jsonb);
drop function if exists public.pf_editar(uuid, text, uuid, integer, date, uuid, uuid, jsonb);

create or replace function public.pf_validar_cliente(p_es boolean, p_nombre text, p_tel text, p_prenda text, p_talla text)
returns void
language plpgsql immutable as $$
begin
  if coalesce(p_es, false) and (btrim(coalesce(p_nombre, '')) = '' or btrim(coalesce(p_tel, '')) = ''
      or btrim(coalesce(p_prenda, '')) = '' or btrim(coalesce(p_talla, '')) = '') then
    raise exception 'Si es para un cliente, captura su nombre, teléfono, el tipo de prenda y la talla.';
  end if;
end; $$;

create or replace function public.pf_crear(
  p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid default null, p_order_id uuid default null, p_fotos jsonb default '[]'::jsonb,
  p_es_para_cliente boolean default false, p_cliente_nombre text default null,
  p_cliente_telefono text default null, p_prenda text default null, p_talla text default null
) returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes; v_es boolean := coalesce(p_es_para_cliente, false);
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
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, p_prenda, p_talla);
  insert into public.pf_pendientes
    (descripcion, tipo_id, cantidad, fotos, fecha_requerida, cliente_id, order_id, creado_por, creado_por_nombre,
     es_para_cliente, cliente_nombre, cliente_telefono, prenda, talla)
  values (btrim(p_descripcion), p_tipo_id, p_cantidad, coalesce(p_fotos, '[]'::jsonb), p_fecha_requerida,
          case when v_es then p_cliente_id end, p_order_id, auth.uid(), public.pf_nombre_actual(),
          v_es,
          case when v_es then btrim(p_cliente_nombre) end, case when v_es then btrim(p_cliente_telefono) end,
          case when v_es then btrim(p_prenda) end, case when v_es then btrim(p_talla) end)
  returning * into v;
  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (v.id, null, v.estado, 'Creado y enviado a fábrica', auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;

create or replace function public.pf_editar(
  p_id uuid, p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid, p_order_id uuid, p_fotos jsonb,
  p_es_para_cliente boolean default false, p_cliente_nombre text default null,
  p_cliente_telefono text default null, p_prenda text default null, p_talla text default null
) returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes; v_es boolean := coalesce(p_es_para_cliente, false);
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
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, p_prenda, p_talla);
  update public.pf_pendientes
     set descripcion = btrim(p_descripcion), tipo_id = p_tipo_id, cantidad = p_cantidad,
         fecha_requerida = p_fecha_requerida, order_id = p_order_id, fotos = coalesce(p_fotos, fotos),
         cliente_id = case when v_es then p_cliente_id end, es_para_cliente = v_es,
         cliente_nombre = case when v_es then btrim(p_cliente_nombre) end,
         cliente_telefono = case when v_es then btrim(p_cliente_telefono) end,
         prenda = case when v_es then btrim(p_prenda) end, talla = case when v_es then btrim(p_talla) end,
         updated_at = now()
   where id = p_id returning * into v;
  return v;
end; $$;

revoke execute on function public.pf_validar_cliente(boolean, text, text, text, text) from public;
revoke execute on function public.pf_crear(text, uuid, integer, date, uuid, uuid, jsonb, boolean, text, text, text, text) from public;
revoke execute on function public.pf_editar(uuid, text, uuid, integer, date, uuid, uuid, jsonb, boolean, text, text, text, text) from public;
grant execute on function public.pf_crear(text, uuid, integer, date, uuid, uuid, jsonb, boolean, text, text, text, text) to authenticated;
grant execute on function public.pf_editar(uuid, text, uuid, integer, date, uuid, uuid, jsonb, boolean, text, text, text, text) to authenticated;
