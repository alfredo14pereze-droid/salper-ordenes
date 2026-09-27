-- V84 — "Inventariado" solo aplica cuando el pendiente se queda en la tienda
-- (no es para un cliente). Mismo patrón que cliente_nombre/pagado: se exige
-- explícito solo cuando corresponde, y se guarda en null cuando no aplica.
-- pf_crear/pf_editar: mismas firmas (create or replace, sin DROP).

create or replace function public.pf_crear(
  p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid default null, p_fotos jsonb default '[]'::jsonb,
  p_es_para_cliente boolean default false, p_cliente_nombre text default null,
  p_cliente_telefono text default null, p_prenda text default null, p_talla text default null,
  p_inventariado boolean default null, p_pagado boolean default null
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
  if not v_es and p_inventariado is null then raise exception 'Indica si ya quedó inventariado o no.'; end if;
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, p_prenda, p_talla);
  if v_es and p_pagado is null then raise exception 'Indica si el cliente ya pagó o no.'; end if;
  insert into public.pf_pendientes
    (descripcion, tipo_id, cantidad, fotos, fecha_requerida, cliente_id, creado_por, creado_por_nombre,
     es_para_cliente, cliente_nombre, cliente_telefono, prenda, talla, inventariado, pagado)
  values (btrim(p_descripcion), p_tipo_id, p_cantidad, coalesce(p_fotos, '[]'::jsonb), p_fecha_requerida,
          case when v_es then p_cliente_id end, auth.uid(), public.pf_nombre_actual(),
          v_es,
          case when v_es then btrim(p_cliente_nombre) end, case when v_es then btrim(p_cliente_telefono) end,
          btrim(p_prenda), btrim(p_talla), case when not v_es then p_inventariado end, case when v_es then p_pagado end)
  returning * into v;
  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (v.id, null, v.estado, 'Creado y enviado a fábrica', auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;

create or replace function public.pf_editar(
  p_id uuid, p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid, p_fotos jsonb,
  p_es_para_cliente boolean default false, p_cliente_nombre text default null,
  p_cliente_telefono text default null, p_prenda text default null, p_talla text default null,
  p_inventariado boolean default null, p_pagado boolean default null
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
  if not v_es and p_inventariado is null then raise exception 'Indica si ya quedó inventariado o no.'; end if;
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, p_prenda, p_talla);
  if v_es and p_pagado is null then raise exception 'Indica si el cliente ya pagó o no.'; end if;
  update public.pf_pendientes
     set descripcion = btrim(p_descripcion), tipo_id = p_tipo_id, cantidad = p_cantidad,
         fecha_requerida = p_fecha_requerida, fotos = coalesce(p_fotos, fotos),
         cliente_id = case when v_es then p_cliente_id end, es_para_cliente = v_es,
         cliente_nombre = case when v_es then btrim(p_cliente_nombre) end,
         cliente_telefono = case when v_es then btrim(p_cliente_telefono) end,
         prenda = btrim(p_prenda), talla = btrim(p_talla),
         inventariado = case when not v_es then p_inventariado end, pagado = case when v_es then p_pagado end,
         updated_at = now()
   where id = p_id returning * into v;
  return v;
end; $$;

-- P-0002 es para un cliente (Claudia Puentes): "inventariado" ya no le aplica, se limpia.
update public.pf_pendientes set inventariado = null where folio = 'P-0002';
