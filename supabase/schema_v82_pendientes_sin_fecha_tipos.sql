-- V82 — Pendientes: sin fecha de regreso y solo dos tipos de trabajo.
--  * fecha_requerida deja de ser obligatoria (queda opcional/nula; ya no se pide en
--    el formulario). pf_crear / pf_editar: mismas firmas, sin ese chequeo.
--  * Tipos de trabajo: solo Arreglo y Bordado quedan activos. Ajuste, Sublimado y
--    Otro se DESACTIVAN (no se borran; un administrador puede reactivarlos desde
--    "Tipos de trabajo").
alter table public.pf_pendientes alter column fecha_requerida drop not null;
update public.pf_tipos_trabajo set activo = false where nombre in ('Ajuste', 'Sublimado', 'Otro');
update public.pf_tipos_trabajo set activo = true, orden = 1 where nombre = 'Arreglo';
update public.pf_tipos_trabajo set activo = true, orden = 2 where nombre = 'Bordado';

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
          btrim(p_prenda), btrim(p_talla))
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
  if btrim(coalesce(p_descripcion, '')) = '' or coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Revisa descripción y cantidad.';
  end if;
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, p_prenda, p_talla);
  update public.pf_pendientes
     set descripcion = btrim(p_descripcion), tipo_id = p_tipo_id, cantidad = p_cantidad,
         fecha_requerida = p_fecha_requerida, order_id = p_order_id, fotos = coalesce(p_fotos, fotos),
         cliente_id = case when v_es then p_cliente_id end, es_para_cliente = v_es,
         cliente_nombre = case when v_es then btrim(p_cliente_nombre) end,
         cliente_telefono = case when v_es then btrim(p_cliente_telefono) end,
         prenda = btrim(p_prenda), talla = btrim(p_talla),
         updated_at = now()
   where id = p_id returning * into v;
  return v;
end; $$;

