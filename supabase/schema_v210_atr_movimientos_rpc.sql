-- =====================================================================
-- V210 — Inventario ATR, Parte 2: funciones para escribir movimientos
--
-- Aditivo: 7 funciones nuevas (4 que usa la app + 3 de apoyo). No toca tablas ni funciones existentes.
-- Requiere V209 (atr_movimientos, permisos atr.*).
--
--   atr_crear_producto      → dar de alta una bata de ATR (atr.cargar)
--   atr_cargar_inicial      → carga inicial con fecha de corte (atr.cargar)
--   atr_registrar_entrega   → salida_entrega, negativa (atr.entregar)
--   atr_registrar_ajuste    → ajuste con nota obligatoria (atr.cargar)
--
-- Todas: revoke de public/anon, solo authenticated. Un candado
-- (pg_advisory_xact_lock) evita que dos entregas al mismo tiempo dejen la
-- existencia en negativo sin que nadie lo vea.
-- =====================================================================

-- Cliente ATR (un solo lugar)
create or replace function public.atr_cliente_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clientes where nombre_normalizado = 'atr'
$$;
revoke execute on function public.atr_cliente_id() from public, anon;
grant execute on function public.atr_cliente_id() to authenticated;

-- Nombre de quien registra (para el historial)
create or replace function public.atr_usuario_nombre()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), 'Usuario') from public.profiles where id = auth.uid()
$$;
revoke execute on function public.atr_usuario_nombre() from public, anon, authenticated;

-- Lee y valida un arreglo [{producto_id, talla, cantidad}] y junta repetidos.
-- Lanza error si un producto no es de ATR o la cantidad no es entero > 0.
create or replace function public.atr_lineas_validas(p_lineas jsonb)
returns table (producto_id uuid, talla text, cantidad integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_atr uuid := public.atr_cliente_id();
  v_malo record;
begin
  if v_atr is null then
    raise exception 'No existe el cliente ATR (falta aplicar V209).';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay líneas que guardar.';
  end if;

  for v_malo in
    select l->>'producto_id' as pid, l->>'talla' as talla, l->>'cantidad' as cant
    from jsonb_array_elements(p_lineas) l
    where coalesce(btrim(l->>'talla'), '') = ''
       or case when coalesce(l->>'cantidad', '') ~ '^\s*[0-9]{1,7}\s*$'
               then (l->>'cantidad')::integer <= 0 else true end
       or not exists (
         select 1 from public.productos p
         where p.id::text = l->>'producto_id' and p.cliente_id = v_atr)
  loop
    raise exception 'Línea inválida (producto %, talla %, cantidad %): revisa que el producto sea de ATR y la cantidad un entero mayor a 0.',
      coalesce(v_malo.pid, '—'), coalesce(v_malo.talla, '—'), coalesce(v_malo.cant, '—');
  end loop;

  return query
    select (l->>'producto_id')::uuid, upper(btrim(l->>'talla')), sum((l->>'cantidad')::integer)::integer
    from jsonb_array_elements(p_lineas) l
    group by 1, 2;
end;
$$;
revoke execute on function public.atr_lineas_validas(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) Dar de alta una bata de ATR (desde la vista previa de la carga)
-- ---------------------------------------------------------------------
create or replace function public.atr_crear_producto(p_con_bolsa boolean, p_color text)
returns public.productos
language plpgsql security definer set search_path = public as $$
declare
  v_atr uuid := public.atr_cliente_id();
  v_color text := initcap(btrim(coalesce(p_color, '')));
  v_nombre text;
  v_prod public.productos;
begin
  if not public.tiene_permiso('atr.cargar') then
    raise exception 'No tienes permiso para dar de alta batas de ATR.';
  end if;
  if v_atr is null then raise exception 'No existe el cliente ATR.'; end if;
  if v_color = '' then raise exception 'Escribe el color.'; end if;
  if p_con_bolsa is null then raise exception 'Elige si es con o sin bolsa.'; end if;

  v_nombre := 'Bata ' || case when p_con_bolsa then 'con' else 'sin' end || ' bolsa ' || v_color;

  select * into v_prod from public.productos
  where cliente_id = v_atr and lower(nombre) = lower(v_nombre)
  limit 1;
  if found then return v_prod; end if;

  insert into public.productos (cliente_id, nombre, garment, color, tallas, especificaciones, pendiente_validar)
  values (v_atr, v_nombre, 'Bata', v_color,
          array['CH', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
          jsonb_build_object('bolsa', p_con_bolsa), false)
  returning * into v_prod;
  return v_prod;
end;
$$;
revoke execute on function public.atr_crear_producto(boolean, text) from public, anon;
grant execute on function public.atr_crear_producto(boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Carga inicial
--    Si ya hay una carga inicial, hay que mandar p_otra_carga = true
--    (confirmación explícita); la nueva se SUMA a la anterior.
-- ---------------------------------------------------------------------
create or replace function public.atr_cargar_inicial(
  p_fecha_corte date,
  p_lineas jsonb,
  p_otra_carga boolean default false
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.tiene_permiso('atr.cargar') then
    raise exception 'No tienes permiso para hacer la carga inicial de ATR.';
  end if;
  if p_fecha_corte is null then raise exception 'Captura la fecha de corte.'; end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  if not coalesce(p_otra_carga, false)
     and exists (select 1 from public.atr_movimientos where tipo = 'carga_inicial') then
    raise exception 'YA_HAY_CARGA: ya existe una carga inicial de ATR.';
  end if;

  insert into public.atr_movimientos (producto_id, talla, tipo, cantidad, fecha_corte, usuario_id, usuario_nombre)
  select l.producto_id, l.talla, 'carga_inicial', l.cantidad, p_fecha_corte, auth.uid(), public.atr_usuario_nombre()
  from public.atr_lineas_validas(p_lineas) l;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.atr_cargar_inicial(date, jsonb, boolean) from public, anon;
grant execute on function public.atr_cargar_inicial(date, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Entrega a ATR (salida). Si alguna línea quedaría en negativo y no
--    viene p_permitir_negativo = true, avisa con NEGATIVO: y no guarda.
-- ---------------------------------------------------------------------
create or replace function public.atr_registrar_entrega(
  p_lineas jsonb,
  p_nota text default null,
  p_permitir_negativo boolean default false
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_faltan text;
begin
  if not public.tiene_permiso('atr.entregar') then
    raise exception 'No tienes permiso para registrar entregas a ATR.';
  end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  select string_agg(p.nombre || ' ' || l.talla || ' (hay ' || coalesce(e.existencia, 0) || ', salen ' || l.cantidad || ')', '; ')
    into v_faltan
  from public.atr_lineas_validas(p_lineas) l
  join public.productos p on p.id = l.producto_id
  left join lateral (
    select sum(m.cantidad) as existencia from public.atr_movimientos m
    where m.producto_id = l.producto_id and m.talla = l.talla
  ) e on true
  where coalesce(e.existencia, 0) - l.cantidad < 0;

  if v_faltan is not null and not coalesce(p_permitir_negativo, false) then
    raise exception 'NEGATIVO: %', v_faltan;
  end if;

  insert into public.atr_movimientos (producto_id, talla, tipo, cantidad, nota, usuario_id, usuario_nombre)
  select l.producto_id, l.talla, 'salida_entrega', -l.cantidad,
         nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.atr_usuario_nombre()
  from public.atr_lineas_validas(p_lineas) l;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.atr_registrar_entrega(jsonb, text, boolean) from public, anon;
grant execute on function public.atr_registrar_entrega(jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Ajuste (+ o −) con nota obligatoria
-- ---------------------------------------------------------------------
create or replace function public.atr_registrar_ajuste(
  p_producto_id uuid,
  p_talla text,
  p_cantidad integer,
  p_nota text
)
returns public.atr_movimientos
language plpgsql security definer set search_path = public as $$
declare
  v_mov public.atr_movimientos;
begin
  if not public.tiene_permiso('atr.cargar') then
    raise exception 'No tienes permiso para registrar ajustes de ATR.';
  end if;
  if coalesce(p_cantidad, 0) = 0 then raise exception 'La cantidad del ajuste no puede ser 0.'; end if;
  if coalesce(btrim(p_nota), '') = '' then raise exception 'El ajuste necesita una nota que diga por qué.'; end if;
  if coalesce(btrim(p_talla), '') = '' then raise exception 'Elige la talla.'; end if;
  if not exists (select 1 from public.productos where id = p_producto_id and cliente_id = public.atr_cliente_id()) then
    raise exception 'El producto no es de ATR.';
  end if;

  insert into public.atr_movimientos (producto_id, talla, tipo, cantidad, nota, usuario_id, usuario_nombre)
  values (p_producto_id, upper(btrim(p_talla)), 'ajuste', p_cantidad, btrim(p_nota), auth.uid(), public.atr_usuario_nombre())
  returning * into v_mov;
  return v_mov;
end;
$$;
revoke execute on function public.atr_registrar_ajuste(uuid, text, integer, text) from public, anon;
grant execute on function public.atr_registrar_ajuste(uuid, text, integer, text) to authenticated;

-- Comprobación (debe dar 7 funciones y false = anon no puede ejecutarlas)
select
  (select count(*) from pg_proc where proname in (
     'atr_cliente_id', 'atr_usuario_nombre', 'atr_lineas_validas', 'atr_crear_producto',
     'atr_cargar_inicial', 'atr_registrar_entrega', 'atr_registrar_ajuste')
   and pronamespace = 'public'::regnamespace)                                              as funciones,
  has_function_privilege('anon', 'public.atr_registrar_entrega(jsonb, text, boolean)', 'EXECUTE') as anon_puede;
