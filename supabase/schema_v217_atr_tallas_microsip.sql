-- =====================================================================
-- V217 — ATR: tallas como en Microsip (S en vez de CH; se agregan XS y 5XL)
--
-- Requiere V209–V216. Se puede correr dos veces.
-- Decisión de Alfredo (2026-11-23): "así los manejamos nosotros realmente"
-- (reporte de existencias de Microsip: XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL).
--
-- Qué hace:
--   1) atr_talla(texto): pone cualquier talla en la forma de Microsip
--      (CH/CHICA → S, XXL → 2XL, …). La usan todas las funciones de ATR, así
--      que una orden que diga "CH" cuenta como "S" (no se tocan las órdenes).
--   2) Catálogo: las 23 batas de ATR (y las que se den de alta) quedan con
--      tallas XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL.
--   3) Datos: en la bitácora (atr_movimientos) y en las líneas de OC, la talla
--      CH pasa a S. Solo cambia el nombre de la talla; cantidades, fechas y
--      quién hizo cada movimiento quedan igual. Nada se borra.
--   4) Se vuelven a crear 7 funciones de ATR (V210, V211, V215) iguales, solo
--      que usan atr_talla y el orden de tallas nuevo.
--   5) Re-sincroniza las órdenes de ATR con Terminado completado (no debe
--      cambiar nada: la comprobación lo confirma).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.atr_sincronizar_orden(uuid, text)') is null
     or to_regprocedure('public.atr_faltantes()') is null
     or to_regprocedure('public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz)') is null then
    raise exception 'V217: falta V211/V215/V216. No se aplicó nada.';
  end if;
  -- Si ya hubiera líneas de OC en S y en CH para la misma bata, el cambio
  -- chocaría con la regla de una línea por bata y talla.
  if exists (select 1 from public.atr_oc_lineas a join public.atr_oc_lineas b
               on a.oc_id = b.oc_id and a.producto_id = b.producto_id
             where upper(btrim(a.talla)) = 'CH' and upper(btrim(b.talla)) = 'S') then
    raise exception 'V217: hay una OC con la misma bata en CH y en S. Revísala antes. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Talla en la forma de Microsip
-- ---------------------------------------------------------------------
create or replace function public.atr_talla(p_talla text)
returns text language sql immutable set search_path = public as $$
  select case regexp_replace(upper(btrim(coalesce(p_talla, ''))), '[\s.-]', '', 'g')
    when 'CH' then 'S' when 'CHICA' then 'S' when 'CHICO' then 'S'
    when 'XCH' then 'XS' when 'EXTRACHICA' then 'XS'
    when 'MEDIANA' then 'M' when 'MEDIANO' then 'M'
    when 'GRANDE' then 'L' when 'G' then 'L'
    when 'EXTRAGRANDE' then 'XL' when 'XG' then 'XL'
    when 'XXL' then '2XL' when 'XXXL' then '3XL' when 'XXXXL' then '4XL' when 'XXXXXL' then '5XL'
    else upper(btrim(coalesce(p_talla, '')))
  end
$$;
revoke execute on function public.atr_talla(text) from public, anon;
grant execute on function public.atr_talla(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Catálogo de batas de ATR
-- ---------------------------------------------------------------------
update public.productos
   set tallas = array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
 where cliente_id = public.atr_cliente_id()
   and tallas is distinct from array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

-- ---------------------------------------------------------------------
-- 3) Datos: CH → S (solo el nombre de la talla)
-- ---------------------------------------------------------------------
update public.atr_movimientos set talla = public.atr_talla(talla)
 where talla is distinct from public.atr_talla(talla);
update public.atr_oc_lineas set talla = public.atr_talla(talla)
 where talla is distinct from public.atr_talla(talla);

-- ---------------------------------------------------------------------
-- 4) Funciones de ATR con atr_talla y el orden nuevo
-- ---------------------------------------------------------------------
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
    select (l->>'producto_id')::uuid, public.atr_talla(l->>'talla'), sum((l->>'cantidad')::integer)::integer
    from jsonb_array_elements(p_lineas) l
    group by 1, 2;
end;
$$;
revoke execute on function public.atr_lineas_validas(jsonb) from public, anon, authenticated;

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
  values (p_producto_id, public.atr_talla(p_talla), 'ajuste', p_cantidad, btrim(p_nota), auth.uid(), public.atr_usuario_nombre())
  returning * into v_mov;
  return v_mov;
end;
$$;
revoke execute on function public.atr_registrar_ajuste(uuid, text, integer, text) from public, anon;
grant execute on function public.atr_registrar_ajuste(uuid, text, integer, text) to authenticated;

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
          array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
          jsonb_build_object('bolsa', p_con_bolsa), false)
  returning * into v_prod;
  return v_prod;
end;
$$;
revoke execute on function public.atr_crear_producto(boolean, text) from public, anon;
grant execute on function public.atr_crear_producto(boolean, text) to authenticated;

create or replace function public.atr_lineas_orden(p_order_id uuid)
returns table (item_index integer, size_index integer, producto_id uuid, talla text, cantidad integer)
language sql stable security definer set search_path = public as $$
  select (it.n - 1)::integer, (sz.m - 1)::integer, p.id, public.atr_talla(sz.s->>'talla'),
         floor((sz.s->>'cantidad_surtida')::numeric)::integer
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality it(i, n)
  join public.productos p
    on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
  cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) with ordinality sz(s, m)
  where o.id = p_order_id
    and o.client_id = public.atr_cliente_id()
    and o.eliminada_en is null
    and exists (select 1 from public.orden_etapas e
                where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado')
    and coalesce(btrim(sz.s->>'talla'), '') <> ''
    and jsonb_typeof(sz.s->'cantidad_surtida') = 'number'
    and floor((sz.s->>'cantidad_surtida')::numeric) > 0
$$;
revoke execute on function public.atr_lineas_orden(uuid) from public, anon, authenticated;

create or replace function public.atr_oc_guardar(
  p_numero_oc text,
  p_fecha_oc date,
  p_fecha_entrega date,
  p_pdf_url text,
  p_leido_pdf jsonb,
  p_notas text,
  p_lineas jsonb
)
returns public.atr_ordenes_compra
language plpgsql security definer set search_path = public as $$
declare
  v_oc public.atr_ordenes_compra;
  v_num text := btrim(coalesce(p_numero_oc, ''));
begin
  if not public.tiene_permiso('atr.oc') then
    raise exception 'No tienes permiso para subir órdenes de compra de ATR.';
  end if;
  if v_num = '' then raise exception 'Captura el número de OC.'; end if;
  if p_fecha_oc is null then raise exception 'Captura la fecha de la OC.'; end if;

  perform pg_advisory_xact_lock(hashtext('atr_ordenes_compra'));

  if exists (select 1 from public.atr_ordenes_compra
             where lower(btrim(numero_oc)) = lower(v_num) and estado <> 'cancelada') then
    raise exception 'OC_REPETIDA: ya existe la OC % de ATR.', v_num;
  end if;

  -- Valida (producto de ATR, talla, cantidad entera > 0); lanza error si no
  perform 1 from public.atr_lineas_validas(p_lineas);

  insert into public.atr_ordenes_compra
    (numero_oc, fecha_oc, fecha_entrega, pdf_url, leido_pdf, notas, creado_por, creado_por_nombre)
  values
    (v_num, p_fecha_oc, p_fecha_entrega, nullif(btrim(coalesce(p_pdf_url, '')), ''), p_leido_pdf,
     nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), public.atr_usuario_nombre())
  returning * into v_oc;

  insert into public.atr_oc_lineas (oc_id, producto_id, talla, cantidad_pedida, texto_pdf)
  select v_oc.id, (l->>'producto_id')::uuid, public.atr_talla(l->>'talla'),
         sum((l->>'cantidad')::integer)::integer,
         string_agg(distinct nullif(btrim(l->>'texto_pdf'), ''), ' / ')
  from jsonb_array_elements(p_lineas) l
  group by 2, 3;

  -- Aprender: descripción del PDF → bata
  insert into public.atr_oc_alias (texto_norm, producto_id)
  select distinct on (public.atr_texto_norm(l->>'texto_pdf'))
         public.atr_texto_norm(l->>'texto_pdf'), (l->>'producto_id')::uuid
  from jsonb_array_elements(p_lineas) l
  where public.atr_texto_norm(l->>'texto_pdf') is not null
  on conflict (texto_norm) do update
    set producto_id = excluded.producto_id, actualizado_en = now();

  return v_oc;
end;
$$;
revoke execute on function public.atr_oc_guardar(text, date, date, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.atr_oc_guardar(text, date, date, text, jsonb, text, jsonb) to authenticated;

create or replace function public.atr_oc_detalle(p_oc_id bigint)
returns table (
  oc_linea_id bigint, producto_id uuid, producto text, color text, con_bolsa boolean,
  talla text, texto_pdf text, pedido integer, surtido integer, pendiente integer, existencia integer
)
language sql stable security definer set search_path = public as $$
  select l.id, l.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         l.talla, l.texto_pdf, l.cantidad_pedida,
         s.surtido, greatest(0, l.cantidad_pedida - s.surtido),
         coalesce((select sum(m.cantidad) from public.atr_movimientos m
                   where m.producto_id = l.producto_id and m.talla = l.talla), 0)::integer
  from public.atr_oc_lineas l
  join public.productos p on p.id = l.producto_id
  cross join lateral (
    select greatest(0, -coalesce(sum(m.cantidad), 0))::integer as surtido
    from public.atr_movimientos m where m.oc_linea_id = l.id
  ) s
  where l.oc_id = p_oc_id and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], l.talla), l.talla
$$;
revoke execute on function public.atr_oc_detalle(bigint) from public, anon;
grant execute on function public.atr_oc_detalle(bigint) to authenticated;

create or replace function public.atr_faltantes()
returns table (
  producto_id uuid, producto text, color text, con_bolsa boolean, talla text,
  pendiente integer, existencia integer, en_taller integer, faltante integer,
  en_taller_ordenes jsonb
)
language sql stable security definer set search_path = public as $$
  with pend as (
    select l.producto_id, l.talla,
           sum(greatest(0, l.cantidad_pedida + coalesce(
             (select sum(m.cantidad) from public.atr_movimientos m where m.oc_linea_id = l.id), 0)))::integer as pendiente
    from public.atr_oc_lineas l
    join public.atr_ordenes_compra o on o.id = l.oc_id
    where o.estado in ('abierta', 'parcial')
    group by 1, 2
  ), exist as (
    select m.producto_id, m.talla, sum(m.cantidad)::integer as existencia
    from public.atr_movimientos m group by 1, 2
  ), taller_lineas as (
    select p.id as producto_id, public.atr_talla(sz.s->>'talla') as talla,
           o.id as order_id, o.order_number,
           floor((sz.s->>'cantidad')::numeric)::integer as cantidad
    from public.orders o
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it(i)
    join public.productos p on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
    cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) sz(s)
    where o.client_id = public.atr_cliente_id()
      and o.eliminada_en is null
      and not exists (select 1 from public.orden_etapas e
                      where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado')
      and coalesce(btrim(sz.s->>'talla'), '') <> ''
      and coalesce(sz.s->>'cantidad', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
      and floor((sz.s->>'cantidad')::numeric) > 0
  ), taller as (
    select producto_id, talla, sum(cantidad)::integer as en_taller,
           jsonb_agg(jsonb_build_object('order_id', order_id, 'order_number', order_number, 'cantidad', cantidad)
                     order by order_number) as ordenes
    from taller_lineas group by 1, 2
  )
  select pd.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         pd.talla, pd.pendiente,
         coalesce(e.existencia, 0),
         coalesce(t.en_taller, 0),
         greatest(0, pd.pendiente - greatest(0, coalesce(e.existencia, 0)) - coalesce(t.en_taller, 0)),
         coalesce(t.ordenes, '[]'::jsonb)
  from pend pd
  join public.productos p on p.id = pd.producto_id
  left join exist e on e.producto_id = pd.producto_id and e.talla = pd.talla
  left join taller t on t.producto_id = pd.producto_id and t.talla = pd.talla
  where pd.pendiente > 0 and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], pd.talla), pd.talla
$$;
revoke execute on function public.atr_faltantes() from public, anon;
grant execute on function public.atr_faltantes() to authenticated;

-- ---------------------------------------------------------------------
-- 5) Re-sincronizar órdenes de ATR (idempotente; no debe mover nada)
-- ---------------------------------------------------------------------
drop table if exists pg_temp.v217_antes;
create temp table v217_antes as
  select count(*) as n from public.atr_movimientos;
select public.atr_sincronizar_orden(o.id, 'V217: tallas como Microsip')
from public.orders o
where o.client_id = public.atr_cliente_id();

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: 0 · 0 · 0 · 0 · 1 · true)
--   movimientos con CH · líneas de OC con CH · batas sin las 9 tallas ·
--   movimientos nuevos por la re-sincronización · existencia que cuadra (1 = sí) ·
--   la función nueva existe
-- ---------------------------------------------------------------------
select
  (select count(*) from public.atr_movimientos where upper(btrim(talla)) = 'CH')               as movs_con_ch,
  (select count(*) from public.atr_oc_lineas where upper(btrim(talla)) = 'CH')                 as oc_con_ch,
  (select count(*) from public.productos where cliente_id = public.atr_cliente_id()
     and tallas is distinct from array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'])  as batas_sin_tallas_nuevas,
  (select count(*) from public.atr_movimientos) - (select n from v217_antes)                   as movs_nuevos_resync,
  (select count(*) from (select 1) x
     where (select coalesce(sum(existencia), 0) from public.atr_existencias)
         = (select coalesce(sum(cantidad), 0) from public.atr_movimientos))                    as existencia_cuadra,
  to_regprocedure('public.atr_talla(text)') is not null                                       as funcion_talla;
