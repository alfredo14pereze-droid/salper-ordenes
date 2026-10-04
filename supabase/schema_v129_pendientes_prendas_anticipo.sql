-- =====================================================================
-- V129 — Pendientes: varias prendas por pendiente + pago con anticipo
-- =====================================================================
-- 1) Un pendiente puede llevar varias prendas (prenda + talla + cantidad cada
--    una). Se guarda en pf_pendientes.prendas (jsonb). Las columnas de
--    siempre (prenda, talla, cantidad) se siguen llenando: prenda/talla con la
--    PRIMERA línea y cantidad con el TOTAL de piezas, así nada de lo que ya
--    las lee (bandejas, etiquetas, versiones viejas de la app) se rompe.
-- 2) "¿Ya está pagado?" gana una tercera opción: 'anticipo', con el total y lo
--    que se dio de anticipo (lo que resta se calcula: total - anticipo).
--    pagado (boolean) se sigue llenando (true solo si 'pagado').
--
-- Aditivo: 4 columnas nuevas (nullable / con default), 2 funciones auxiliares
-- nuevas, y pf_crear/pf_editar con 4 parámetros opcionales al FINAL. Como agregar
-- parámetros crea una sobrecarga nueva (y dejaría dos funciones con el mismo
-- nombre, ambiguas para la API), se borran las firmas viejas y se recrean con
-- los mismos permisos. Una versión vieja de la app que llame con los 13
-- parámetros de antes sigue funcionando (los nuevos toman su valor por defecto).
-- Los pendientes existentes se rellenan (1 línea de prendas; pago_estado según
-- pagado) sin cambiar nada más.
-- =====================================================================

-- 0) Guarda de deriva: las funciones vivas deben ser las de V84.
do $$
declare v_ok boolean;
begin
  select bool_and(prosrc like '%Indica si el cliente ya pag%' and prosrc like '%pf_validar_cliente%' and prosrc like '%pf_es_tienda%')
    into v_ok from pg_proc where proname = 'pf_crear' and pronamespace = 'public'::regnamespace;
  if v_ok is distinct from true then raise exception 'V129: pf_crear viva ya no es la de V84. No se aplicó nada.'; end if;
  select bool_and(prosrc like '%Ya no se puede editar: f%' and prosrc like '%pf_validar_cliente%' and prosrc like '%pf_es_tienda%')
    into v_ok from pg_proc where proname = 'pf_editar' and pronamespace = 'public'::regnamespace;
  if v_ok is distinct from true then raise exception 'V129: pf_editar viva ya no es la de V84. No se aplicó nada.'; end if;
  if (select count(*) from pg_proc where proname in ('pf_crear', 'pf_editar') and pronamespace = 'public'::regnamespace) <> 2 then
    raise exception 'V129: se esperaba exactamente una pf_crear y una pf_editar.';
  end if;
end $$;

-- 1) Columnas nuevas
alter table public.pf_pendientes
  add column if not exists prendas jsonb not null default '[]'::jsonb,
  add column if not exists pago_estado text,
  add column if not exists pago_total numeric(12,2),
  add column if not exists pago_anticipo numeric(12,2);

alter table public.pf_pendientes drop constraint if exists pf_pendientes_pago_estado_check;
alter table public.pf_pendientes add constraint pf_pendientes_pago_estado_check
  check (pago_estado is null or pago_estado in ('pagado', 'no_pagado', 'anticipo'));

-- Relleno de lo que ya existe
update public.pf_pendientes
set prendas = jsonb_build_array(jsonb_build_object('prenda', coalesce(prenda, ''), 'talla', coalesce(talla, ''), 'cantidad', cantidad))
where prendas = '[]'::jsonb;

update public.pf_pendientes
set pago_estado = case when pagado then 'pagado' else 'no_pagado' end
where es_para_cliente and pagado is not null and pago_estado is null;

-- 2) Auxiliares de validación (puras, sin acceso a datos)
create or replace function public.pf_normalizar_prendas(p_prendas jsonb, p_prenda text, p_talla text, p_cantidad integer)
returns jsonb
language plpgsql immutable as $$
declare v jsonb; e jsonb; n integer := 0;
begin
  if p_prendas is not null and jsonb_typeof(p_prendas) = 'array' and jsonb_array_length(p_prendas) > 0 then
    v := '[]'::jsonb;
    for e in select * from jsonb_array_elements(p_prendas) loop
      n := n + 1;
      if btrim(coalesce(e->>'prenda', '')) = '' or btrim(coalesce(e->>'talla', '')) = '' then
        raise exception 'Indica el tipo de prenda y la talla (prenda %).', n;
      end if;
      if coalesce((e->>'cantidad')::integer, 0) <= 0 then
        raise exception 'La cantidad de la prenda % debe ser mayor a cero.', n;
      end if;
      v := v || jsonb_build_array(jsonb_build_object(
        'prenda', btrim(e->>'prenda'), 'talla', btrim(e->>'talla'), 'cantidad', (e->>'cantidad')::integer));
    end loop;
    return v;
  end if;
  -- Llamada de una versión vieja de la app: una sola prenda con los parámetros de siempre.
  if btrim(coalesce(p_prenda, '')) = '' or btrim(coalesce(p_talla, '')) = '' then
    raise exception 'Indica el tipo de prenda y la talla.';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  return jsonb_build_array(jsonb_build_object('prenda', btrim(p_prenda), 'talla', btrim(p_talla), 'cantidad', p_cantidad));
end; $$;

create or replace function public.pf_normalizar_pago(p_pagado boolean, p_estado text, p_total numeric, p_anticipo numeric)
returns text
language plpgsql immutable as $$
declare v_estado text := coalesce(p_estado, case when p_pagado is true then 'pagado' when p_pagado is false then 'no_pagado' end);
begin
  if v_estado is null then raise exception 'Indica si el cliente ya pagó o no.'; end if;
  if v_estado not in ('pagado', 'no_pagado', 'anticipo') then raise exception 'Estado de pago inválido: %', v_estado; end if;
  if v_estado = 'anticipo' then
    if coalesce(p_total, 0) <= 0 then raise exception 'Captura el total del trabajo.'; end if;
    if coalesce(p_anticipo, 0) <= 0 then raise exception 'Captura cuánto fue el anticipo.'; end if;
    if p_anticipo >= p_total then raise exception 'El anticipo debe ser menor al total; si ya pagó todo, elige Pagado.'; end if;
  end if;
  return v_estado;
end; $$;

revoke execute on function public.pf_normalizar_prendas(jsonb, text, text, integer) from public;
revoke execute on function public.pf_normalizar_pago(boolean, text, numeric, numeric) from public;
grant execute on function public.pf_normalizar_prendas(jsonb, text, text, integer) to authenticated;
grant execute on function public.pf_normalizar_pago(boolean, text, numeric, numeric) to authenticated;

-- 3) pf_crear / pf_editar: firmas viejas fuera, nuevas con 4 parámetros al final
drop function if exists public.pf_crear(text, uuid, integer, date, uuid, jsonb, boolean, text, text, text, text, boolean, boolean);
drop function if exists public.pf_editar(uuid, text, uuid, integer, date, uuid, jsonb, boolean, text, text, text, text, boolean, boolean);

create or replace function public.pf_crear(
  p_descripcion text, p_tipo_id uuid, p_cantidad integer, p_fecha_requerida date,
  p_cliente_id uuid default null, p_fotos jsonb default '[]'::jsonb,
  p_es_para_cliente boolean default false, p_cliente_nombre text default null,
  p_cliente_telefono text default null, p_prenda text default null, p_talla text default null,
  p_inventariado boolean default null, p_pagado boolean default null,
  p_prendas jsonb default null, p_pago_estado text default null,
  p_pago_total numeric default null, p_pago_anticipo numeric default null
) returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare
  v public.pf_pendientes; v_es boolean := coalesce(p_es_para_cliente, false);
  v_prendas jsonb; v_cant integer; v_estado text;
begin
  if not public.pf_es_tienda() then
    raise exception 'Solo tienda puede crear pendientes para fábrica.';
  end if;
  if btrim(coalesce(p_descripcion, '')) = '' then raise exception 'Escribe la descripción del trabajo.'; end if;
  if not exists (select 1 from public.pf_tipos_trabajo t where t.id = p_tipo_id and t.activo) then
    raise exception 'El tipo de trabajo no existe o está inactivo.';
  end if;
  if not v_es and p_inventariado is null then raise exception 'Indica si ya quedó inventariado o no.'; end if;
  v_prendas := public.pf_normalizar_prendas(p_prendas, p_prenda, p_talla, p_cantidad);
  v_cant := (select sum((e->>'cantidad')::integer) from jsonb_array_elements(v_prendas) e);
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, v_prendas->0->>'prenda', v_prendas->0->>'talla');
  if v_es then v_estado := public.pf_normalizar_pago(p_pagado, p_pago_estado, p_pago_total, p_pago_anticipo); end if;
  insert into public.pf_pendientes
    (descripcion, tipo_id, cantidad, fotos, fecha_requerida, cliente_id, creado_por, creado_por_nombre,
     es_para_cliente, cliente_nombre, cliente_telefono, prenda, talla, prendas, inventariado,
     pagado, pago_estado, pago_total, pago_anticipo)
  values (btrim(p_descripcion), p_tipo_id, v_cant, coalesce(p_fotos, '[]'::jsonb), p_fecha_requerida,
          case when v_es then p_cliente_id end, auth.uid(), public.pf_nombre_actual(),
          v_es,
          case when v_es then btrim(p_cliente_nombre) end, case when v_es then btrim(p_cliente_telefono) end,
          v_prendas->0->>'prenda', v_prendas->0->>'talla', v_prendas,
          case when not v_es then p_inventariado end,
          case when v_es then v_estado = 'pagado' end,
          case when v_es then v_estado end,
          case when v_es and v_estado = 'anticipo' then p_pago_total end,
          case when v_es and v_estado = 'anticipo' then p_pago_anticipo end)
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
  p_inventariado boolean default null, p_pagado boolean default null,
  p_prendas jsonb default null, p_pago_estado text default null,
  p_pago_total numeric default null, p_pago_anticipo numeric default null
) returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare
  v public.pf_pendientes; v_es boolean := coalesce(p_es_para_cliente, false);
  v_prendas jsonb; v_cant integer; v_estado text;
begin
  if not public.pf_es_tienda() then raise exception 'Solo tienda puede editar un pendiente.'; end if;
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if v.estado <> 'enviado_a_fabrica' and coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Ya no se puede editar: fábrica ya lo recibió.';
  end if;
  if btrim(coalesce(p_descripcion, '')) = '' then raise exception 'Revisa la descripción.'; end if;
  if not v_es and p_inventariado is null then raise exception 'Indica si ya quedó inventariado o no.'; end if;
  v_prendas := public.pf_normalizar_prendas(p_prendas, p_prenda, p_talla, p_cantidad);
  v_cant := (select sum((e->>'cantidad')::integer) from jsonb_array_elements(v_prendas) e);
  perform public.pf_validar_cliente(v_es, p_cliente_nombre, p_cliente_telefono, v_prendas->0->>'prenda', v_prendas->0->>'talla');
  if v_es then v_estado := public.pf_normalizar_pago(p_pagado, p_pago_estado, p_pago_total, p_pago_anticipo); end if;
  update public.pf_pendientes
     set descripcion = btrim(p_descripcion), tipo_id = p_tipo_id, cantidad = v_cant,
         fecha_requerida = p_fecha_requerida, fotos = coalesce(p_fotos, fotos),
         cliente_id = case when v_es then p_cliente_id end, es_para_cliente = v_es,
         cliente_nombre = case when v_es then btrim(p_cliente_nombre) end,
         cliente_telefono = case when v_es then btrim(p_cliente_telefono) end,
         prenda = v_prendas->0->>'prenda', talla = v_prendas->0->>'talla', prendas = v_prendas,
         inventariado = case when not v_es then p_inventariado end,
         pagado = case when v_es then v_estado = 'pagado' end,
         pago_estado = case when v_es then v_estado end,
         pago_total = case when v_es and v_estado = 'anticipo' then p_pago_total end,
         pago_anticipo = case when v_es and v_estado = 'anticipo' then p_pago_anticipo end,
         updated_at = now()
   where id = p_id returning * into v;
  return v;
end; $$;

revoke execute on function
  public.pf_crear(text, uuid, integer, date, uuid, jsonb, boolean, text, text, text, text, boolean, boolean, jsonb, text, numeric, numeric),
  public.pf_editar(uuid, text, uuid, integer, date, uuid, jsonb, boolean, text, text, text, text, boolean, boolean, jsonb, text, numeric, numeric)
from public;
grant execute on function
  public.pf_crear(text, uuid, integer, date, uuid, jsonb, boolean, text, text, text, text, boolean, boolean, jsonb, text, numeric, numeric),
  public.pf_editar(uuid, text, uuid, integer, date, uuid, jsonb, boolean, text, text, text, text, boolean, boolean, jsonb, text, numeric, numeric)
to authenticated;

-- Verificación (después de correr):
--   select count(*) from pg_proc where proname in ('pf_crear','pf_editar');                    -- esperado: 2
--   select count(*) from public.pf_pendientes where jsonb_array_length(prendas) = 0;            -- esperado: 0
--   select has_function_privilege('anon', 'public.pf_normalizar_pago(boolean,text,numeric,numeric)', 'EXECUTE');  -- esperado: false
