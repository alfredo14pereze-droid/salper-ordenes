-- =====================================================================
-- V222 — ATR: surtir como Frisa (apartar renglón por renglón, parcial)
--
-- Requiere V221. Se puede correr dos veces. Aditivo: 2 columnas nuevas,
-- 3 funciones nuevas y 5 funciones de ATR rehechas (mismo nombre).
--
-- Pedido de Alfredo (2026-11-25): el surtido de ATR igual que el de Frisa.
--   * Al abrir la OC, Terminado escribe en cada renglón cuántas batas aparta
--     (o palomea para apartar todo lo pendiente). Se guarda al momento y esas
--     batas ya no están disponibles para otra OC.
--   * Cuando termina, "Surtir lo apartado": elige quién surtió y sale la hoja
--     de surtido. Ese surtido pasa a contabilidad (Por facturar).
--   * Se puede surtir parcial y seguir surtiendo después: cada vez que hay
--     más batas se aparta otra vez y se hace otro surtido.
--
-- Cómo queda:
--   atr_surtidos.listo_en: null = Terminado lo está apartando (borrador, uno
--   por OC); con fecha = ya se surtió y va a Por facturar. Contabilidad solo
--   confirma surtidos listos. registrado_por_nombre = quién lo capturó (si
--   surtió otra persona).
-- =====================================================================

do $$
begin
  if to_regclass('public.atr_surtidos') is null
     or to_regprocedure('public.atr_confirmar_entrega(uuid, text)') is null then
    raise exception 'V222: falta V221. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Columnas. Los surtidos que ya existían quedan como listos (solo la
--    primera vez, cuando la columna es nueva).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'atr_surtidos' and column_name = 'listo_en') then
    alter table public.atr_surtidos add column listo_en timestamptz;
    update public.atr_surtidos set listo_en = creado_en;
  end if;
end $$;
alter table public.atr_surtidos add column if not exists registrado_por_nombre text;

-- Un solo borrador por OC; un renglón por línea de OC en cada surtido.
create unique index if not exists atr_surtidos_borrador_uq on public.atr_surtidos (oc_id)
  where estado = 'apartado' and listo_en is null;
create unique index if not exists atr_apartados_surtido_linea_uq on public.atr_apartados (surtido_id, oc_linea_id);

-- Estado de la OC: cuenta lo entregado + lo surtido listo. Lo que Terminado
-- está apartando todavía no la cambia (así no se sale de "activas" a medias).
create or replace function public.atr_oc_recalcular(p_oc_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pedido integer;
  v_surtido integer;
begin
  select coalesce(sum(l.cantidad_pedida), 0),
         coalesce(sum(least(l.cantidad_pedida, public.atr_linea_entregado(l.id)
           + coalesce((select sum(a.cantidad) from public.atr_apartados a join public.atr_surtidos s on s.id = a.surtido_id
                       where a.oc_linea_id = l.id and s.estado = 'apartado' and s.listo_en is not null), 0))), 0)
    into v_pedido, v_surtido
  from public.atr_oc_lineas l where l.oc_id = p_oc_id;

  update public.atr_ordenes_compra
     set estado = case when v_surtido <= 0 then 'abierta'
                       when v_surtido >= v_pedido then 'surtida'
                       else 'parcial' end
   where id = p_oc_id and estado <> 'cancelada';
end;
$$;
revoke execute on function public.atr_oc_recalcular(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Apartar un renglón (Terminado / admin). p_cantidad = lo que queda
--    apartado de esa línea en el surtido que se está armando (0 = quitarlo).
--    No más que lo pendiente ni más que lo disponible.
-- ---------------------------------------------------------------------
create or replace function public.atr_apartar_renglon(p_oc_linea_id bigint, p_cantidad integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_l public.atr_oc_lineas;
  v_estado text;
  v_borrador uuid;
  v_actual integer := 0;
  v_pend integer;
  v_disp integer;
  v_nombre text;
begin
  if not public.tiene_permiso('atr.entregar') then
    raise exception 'No tienes permiso para surtir órdenes de compra de ATR.';
  end if;
  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  select * into v_l from public.atr_oc_lineas where id = p_oc_linea_id;
  if not found then raise exception 'No existe ese renglón.'; end if;
  select estado into v_estado from public.atr_ordenes_compra where id = v_l.oc_id for update;
  if v_estado = 'cancelada' then raise exception 'La OC está cancelada.'; end if;

  select id into v_borrador from public.atr_surtidos
   where oc_id = v_l.oc_id and estado = 'apartado' and listo_en is null;
  if v_borrador is not null then
    select coalesce(sum(cantidad), 0) into v_actual from public.atr_apartados
     where surtido_id = v_borrador and oc_linea_id = v_l.id;
  end if;

  v_pend := v_l.cantidad_pedida - public.atr_linea_entregado(v_l.id) - public.atr_linea_apartado(v_l.id) + v_actual;
  if p_cantidad is null or p_cantidad < 0 or p_cantidad > greatest(v_pend, 0) then
    raise exception 'Escribe de 0 a % batas.', greatest(v_pend, 0);
  end if;

  if p_cantidad > v_actual then
    v_disp := coalesce((select sum(m.cantidad) from public.atr_movimientos m
                        where m.producto_id = v_l.producto_id and m.talla = v_l.talla), 0)
              - public.atr_apartado_bt(v_l.producto_id, v_l.talla) + v_actual;
    if p_cantidad > greatest(v_disp, 0) then
      select nombre into v_nombre from public.productos where id = v_l.producto_id;
      raise exception 'Solo hay % disponibles de % %.', greatest(v_disp, 0), v_nombre, v_l.talla;
    end if;
  end if;

  if p_cantidad > 0 and v_borrador is null then
    v_borrador := gen_random_uuid();
    insert into public.atr_surtidos (id, oc_id, estado, surtido_por, surtido_por_nombre)
    values (v_borrador, v_l.oc_id, 'apartado', auth.uid(), public.atr_usuario_nombre());
  end if;

  if v_borrador is not null then
    if p_cantidad = 0 then
      delete from public.atr_apartados where surtido_id = v_borrador and oc_linea_id = v_l.id;
      -- Borrador vacío: se quita (nunca tocó el inventario).
      if not exists (select 1 from public.atr_apartados where surtido_id = v_borrador) then
        delete from public.atr_surtidos where id = v_borrador;
      end if;
    elsif v_actual > 0 then
      update public.atr_apartados set cantidad = p_cantidad where surtido_id = v_borrador and oc_linea_id = v_l.id;
    else
      insert into public.atr_apartados (surtido_id, oc_linea_id, producto_id, talla, cantidad)
      values (v_borrador, v_l.id, v_l.producto_id, v_l.talla, p_cantidad);
    end if;
  end if;

  perform public.atr_oc_recalcular(v_l.oc_id);
  return p_cantidad;
end;
$$;
revoke execute on function public.atr_apartar_renglon(bigint, integer) from public, anon;
grant execute on function public.atr_apartar_renglon(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Surtir lo apartado: el borrador pasa a Por facturar. Se elige quién
--    surtió (como en Frisa). Regresa el surtido_id.
-- ---------------------------------------------------------------------
create or replace function public.atr_surtido_personas()
returns table (id uuid, nombre text, rol text)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(p.full_name), p.role
  from public.profiles p
  where public.tiene_permiso('atr.entregar')
    and p.suspended_at is null and nullif(btrim(p.full_name), '') is not null
  order by btrim(p.full_name);
$$;
revoke execute on function public.atr_surtido_personas() from public, anon;
grant execute on function public.atr_surtido_personas() to authenticated;

create or replace function public.atr_surtido_terminar(
  p_oc_id bigint, p_persona_id uuid default null, p_persona_nombre text default null, p_nota text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_nombre text;
begin
  if not public.tiene_permiso('atr.entregar') then
    raise exception 'No tienes permiso para surtir órdenes de compra de ATR.';
  end if;
  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));
  select id into v_id from public.atr_surtidos
   where oc_id = p_oc_id and estado = 'apartado' and listo_en is null for update;
  if v_id is null then raise exception 'No hay nada apartado en esta OC.'; end if;

  if p_persona_id is not null then
    select btrim(full_name) into v_nombre from public.profiles where id = p_persona_id;
  end if;
  v_nombre := coalesce(nullif(v_nombre, ''), nullif(btrim(coalesce(p_persona_nombre, '')), ''));
  if v_nombre is null then raise exception 'Elige quién surtió.'; end if;

  update public.atr_surtidos
     set listo_en = now(), creado_en = now(),
         surtido_por = p_persona_id, surtido_por_nombre = v_nombre,
         registrado_por_nombre = public.atr_usuario_nombre(),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = v_id;
  perform public.atr_oc_recalcular(p_oc_id);
  return v_id;
end;
$$;
revoke execute on function public.atr_surtido_terminar(bigint, uuid, text, text) from public, anon;
grant execute on function public.atr_surtido_terminar(bigint, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) atr_surtir_oc (de golpe, V221) sigue funcionando: crea el surtido ya
--    listo. Solo cambia el insert (listo_en).
-- ---------------------------------------------------------------------
create or replace function public.atr_surtir_oc(
  p_oc_id bigint,
  p_lineas jsonb,
  p_nota text default null,
  p_permitir_negativo boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
  v_surtido uuid := gen_random_uuid();
  v_malo text;
  v_faltan text;
begin
  if not public.tiene_permiso('atr.entregar') then
    raise exception 'No tienes permiso para surtir órdenes de compra de ATR.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'No hay líneas que surtir.';
  end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  select estado into v_estado from public.atr_ordenes_compra where id = p_oc_id for update;
  if not found then raise exception 'No existe esa OC.'; end if;
  if v_estado = 'cancelada' then raise exception 'La OC está cancelada.'; end if;
  if v_estado = 'surtida' then raise exception 'La OC ya está surtida completa.'; end if;

  select string_agg(coalesce(l->>'oc_linea_id', '—') || ' = ' || coalesce(l->>'cantidad', '—'), ', ')
    into v_malo
  from jsonb_array_elements(p_lineas) l
  where coalesce(l->>'cantidad', '') <> '' and not (l->>'cantidad') ~ '^\s*[0-9]{1,7}\s*$';
  if v_malo is not null then raise exception 'Cantidad inválida (línea %).', v_malo; end if;

  drop table if exists pg_temp.atr_tmp_surtir;
  create temp table atr_tmp_surtir (
    oc_linea_id bigint, producto_id uuid, talla text, nombre text,
    cantidad integer, pendiente integer, disponible integer
  );
  insert into atr_tmp_surtir (oc_linea_id, cantidad)
  select (l->>'oc_linea_id')::bigint, sum(nullif(btrim(coalesce(l->>'cantidad', '')), '')::integer)
  from jsonb_array_elements(p_lineas) l
  group by 1;
  delete from atr_tmp_surtir where coalesce(cantidad, 0) = 0;

  if not exists (select 1 from atr_tmp_surtir) then
    raise exception 'Captura al menos una cantidad a surtir.';
  end if;
  if exists (select 1 from atr_tmp_surtir t
             where not exists (select 1 from public.atr_oc_lineas l where l.id = t.oc_linea_id and l.oc_id = p_oc_id)) then
    raise exception 'Hay líneas que no son de esta OC.';
  end if;

  update atr_tmp_surtir t
     set producto_id = l.producto_id, talla = l.talla, nombre = p.nombre,
         pendiente = l.cantidad_pedida - public.atr_linea_entregado(l.id) - public.atr_linea_apartado(l.id),
         disponible = coalesce((select sum(m.cantidad) from public.atr_movimientos m
                                where m.producto_id = l.producto_id and m.talla = l.talla), 0)
                      - public.atr_apartado_bt(l.producto_id, l.talla)
    from public.atr_oc_lineas l join public.productos p on p.id = l.producto_id
   where l.id = t.oc_linea_id;

  select string_agg(nombre || ' ' || talla || ' (pendiente ' || pendiente || ', capturaste ' || cantidad || ')', '; ')
    into v_malo from atr_tmp_surtir where cantidad > pendiente;
  if v_malo is not null then
    raise exception 'No se puede surtir más de lo pendiente: %', v_malo;
  end if;

  select string_agg(nombre || ' ' || talla || ' (hay ' || disponible || ' disponibles, salen ' || sale || ')', '; ')
    into v_faltan
  from (select nombre, talla, max(disponible) as disponible, sum(cantidad) as sale
        from atr_tmp_surtir group by nombre, talla) x
  where disponible - sale < 0;
  if v_faltan is not null and not coalesce(p_permitir_negativo, false) then
    raise exception 'NEGATIVO: %', v_faltan;
  end if;

  insert into public.atr_surtidos (id, oc_id, estado, nota, surtido_por, surtido_por_nombre, listo_en)
  values (v_surtido, p_oc_id, 'apartado', nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.atr_usuario_nombre(), now());
  insert into public.atr_apartados (surtido_id, oc_linea_id, producto_id, talla, cantidad)
  select v_surtido, oc_linea_id, producto_id, talla, cantidad from atr_tmp_surtir;

  perform public.atr_oc_recalcular(p_oc_id);
  return v_surtido;
end;
$$;
revoke execute on function public.atr_surtir_oc(bigint, jsonb, text, boolean) from public, anon;
grant execute on function public.atr_surtir_oc(bigint, jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Contabilidad solo confirma surtidos que Terminado ya terminó.
-- ---------------------------------------------------------------------
create or replace function public.atr_confirmar_entrega(p_surtido_id uuid, p_factura text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_s public.atr_surtidos;
  v_quien text := public.atr_usuario_nombre();
  v_n integer;
begin
  if not public.tiene_permiso('atr.facturar') then
    raise exception 'No tienes permiso para confirmar entregas de ATR.';
  end if;
  if coalesce(btrim(p_factura), '') = '' then raise exception 'Escribe el número de factura.'; end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));
  select * into v_s from public.atr_surtidos where id = p_surtido_id for update;
  if not found then raise exception 'No existe ese surtido.'; end if;
  if v_s.estado <> 'apartado' then raise exception 'Ese surtido ya está %.', v_s.estado; end if;
  if v_s.listo_en is null then raise exception 'Terminado todavía está apartando ese surtido.'; end if;

  insert into public.atr_movimientos
    (producto_id, talla, tipo, cantidad, oc_linea_id, surtido_id, nota, usuario_id, usuario_nombre)
  select a.producto_id, a.talla, 'salida_surtido', -a.cantidad, a.oc_linea_id, a.surtido_id,
         'Factura ' || btrim(p_factura), auth.uid(), v_quien
  from public.atr_apartados a where a.surtido_id = p_surtido_id;
  get diagnostics v_n = row_count;

  update public.atr_surtidos
     set estado = 'entregado', factura = btrim(p_factura),
         confirmado_por = auth.uid(), confirmado_por_nombre = v_quien, confirmado_en = now()
   where id = p_surtido_id;
  perform public.atr_oc_recalcular(v_s.oc_id);
  return v_n;
end;
$$;
revoke execute on function public.atr_confirmar_entrega(uuid, text) from public, anon;
grant execute on function public.atr_confirmar_entrega(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Lecturas
-- ---------------------------------------------------------------------
-- Por facturar: solo surtidos listos (no los que Terminado está apartando).
create or replace function public.atr_por_facturar()
returns table (
  surtido_id uuid, oc_id bigint, numero_oc text, notas_oc text, creado_en timestamptz,
  surtido_por_nombre text, nota text, piezas integer, lineas jsonb
)
language sql stable security definer set search_path = public as $$
  select s.id, s.oc_id, o.numero_oc, o.notas, s.creado_en, s.surtido_por_nombre, s.nota,
         sum(a.cantidad)::integer,
         jsonb_agg(jsonb_build_object('producto', p.nombre, 'color', p.color,
                    'con_bolsa', coalesce((p.especificaciones->>'bolsa')::boolean, false),
                    'talla', a.talla, 'cantidad', a.cantidad)
                   order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], a.talla))
  from public.atr_surtidos s
  join public.atr_ordenes_compra o on o.id = s.oc_id
  join public.atr_apartados a on a.surtido_id = s.id
  join public.productos p on p.id = a.producto_id
  where s.estado = 'apartado' and s.listo_en is not null and public.tiene_permiso('atr.ver')
  group by s.id, o.numero_oc, o.notas
  order by s.creado_en
$$;
revoke execute on function public.atr_por_facturar() from public, anon;
grant execute on function public.atr_por_facturar() to authenticated;

-- Surtidos de una OC: + listo_en y registrado_por_nombre.
drop function if exists public.atr_surtidos_oc(bigint);
create function public.atr_surtidos_oc(p_oc_id bigint)
returns table (
  surtido_id uuid, estado text, creado_en timestamptz, surtido_por_nombre text, nota text,
  factura text, confirmado_por_nombre text, confirmado_en timestamptz,
  cancelado_por_nombre text, cancelado_en timestamptz, motivo_cancelacion text,
  antes_de_v221 boolean, piezas integer, lineas jsonb,
  listo_en timestamptz, registrado_por_nombre text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.estado, s.creado_en, s.surtido_por_nombre, s.nota,
         s.factura, s.confirmado_por_nombre, s.confirmado_en,
         s.cancelado_por_nombre, s.cancelado_en, s.motivo_cancelacion, s.antes_de_v221,
         coalesce(sum(q.cantidad), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object('producto', p.nombre, 'color', p.color,
                    'con_bolsa', coalesce((p.especificaciones->>'bolsa')::boolean, false),
                    'talla', q.talla, 'cantidad', q.cantidad)
                  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], q.talla))
                  filter (where q.cantidad is not null), '[]'::jsonb),
         s.listo_en, s.registrado_por_nombre
  from public.atr_surtidos s
  left join lateral (
    select a.producto_id, a.talla, a.cantidad from public.atr_apartados a where a.surtido_id = s.id
    union all
    select m.producto_id, m.talla, -m.cantidad from public.atr_movimientos m
    where m.surtido_id = s.id and m.tipo = 'salida_surtido' and s.antes_de_v221
  ) q on true
  left join public.productos p on p.id = q.producto_id
  where s.oc_id = p_oc_id and public.tiene_permiso('atr.ver')
  group by s.id
  order by s.creado_en desc
$$;
revoke execute on function public.atr_surtidos_oc(bigint) from public, anon;
grant execute on function public.atr_surtidos_oc(bigint) to authenticated;

-- Detalle de OC: + apartando (lo que Terminado está apartando ahora en esa línea).
drop function if exists public.atr_oc_detalle(bigint);
create function public.atr_oc_detalle(p_oc_id bigint)
returns table (
  oc_linea_id bigint, producto_id uuid, producto text, color text, con_bolsa boolean,
  talla text, texto_pdf text, pedido integer, surtido integer, pendiente integer, existencia integer,
  entregado integer, apartado integer, disponible integer, apartando integer
)
language sql stable security definer set search_path = public as $$
  select l.id, l.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         l.talla, l.texto_pdf, l.cantidad_pedida,
         x.ent + x.apa,
         greatest(0, l.cantidad_pedida - x.ent - x.apa),
         x.exi,
         x.ent, x.apa,
         x.exi - public.atr_apartado_bt(l.producto_id, l.talla),
         x.bor
  from public.atr_oc_lineas l
  join public.productos p on p.id = l.producto_id
  cross join lateral (
    select public.atr_linea_entregado(l.id) as ent,
           public.atr_linea_apartado(l.id) as apa,
           coalesce((select sum(m.cantidad) from public.atr_movimientos m
                     where m.producto_id = l.producto_id and m.talla = l.talla), 0)::integer as exi,
           coalesce((select sum(a.cantidad) from public.atr_apartados a
                     join public.atr_surtidos s on s.id = a.surtido_id
                     where a.oc_linea_id = l.id and s.estado = 'apartado' and s.listo_en is null), 0)::integer as bor
  ) x
  where l.oc_id = p_oc_id and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], l.talla), l.talla
$$;
revoke execute on function public.atr_oc_detalle(bigint) from public, anon;
grant execute on function public.atr_oc_detalle(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Manual: la sección "Cómo surtir una OC" (solo si nadie lo editó en la app)
-- ---------------------------------------------------------------------
update public.manuales
   set contenido = replace(contenido,
$old$1. Abre la OC y dale **Surtir**.
2. En cada línea ya viene lo que alcanza con la existencia. Cámbialo si hace falta, o usa **Lo que alcanza**, **Todo lo pendiente** o **Borrar**.
3. Si quieres, pon una **Nota (opcional)**.
4. Dale **Apartar y ver hoja**. Se abre la **hoja de surtido** en PDF: dale **Descargar** para imprimirla.
5. Las batas quedan **apartadas** ("Apartado · por facturar"): siguen en la existencia, pero ya no están **disponibles** para otra OC. Se descuentan cuando contabilidad confirma la entrega con la factura.

> Se puede surtir parcial: la OC queda **Parcial** hasta completar. No deja surtir más de lo pendiente ni más de lo disponible sin confirmar ("Sí, sí salen").$old$,
$new$1. En **Órdenes de compra** salen todas las OC activas con su aviso (**Se puede surtir** / **Faltan piezas**). Abre la que vas a surtir.
2. En la tabla **Surtir**, por cada bata y talla escribe en **Apartar** cuántas batas estás juntando (o palomea ✓ para apartar todo lo pendiente). Se guarda al salir del campo. Abajo de cada renglón dice cuántas **hay** o cuántas **faltan**.
3. **Apartar lo que hay** llena todos los renglones con lo disponible.
4. Cuando termines, dale **Surtir lo apartado (N batas)**, elige **¿Quién surtió?** y confirma. Se abre la **hoja de surtido** en PDF: dale **Descargar** para imprimirla.
5. Ese surtido queda "Apartado · por facturar": siguen en la existencia, pero ya no están **disponibles** para otra OC. Se descuentan cuando contabilidad confirma la entrega con la factura.

> Se puede surtir **parcial**: la OC queda **Parcial** y cuando salgan más batas se abre otra vez, se aparta lo nuevo y se hace otro surtido, las veces que haga falta. No deja apartar más de lo pendiente ni más de lo disponible.$new$),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null and actualizado_por_nombre = 'Carga inicial';

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: true · 0 · 4 · true)
--   columnas nuevas · borradores (recién aplicado: 0) · funciones nuevas o
--   rehechas que se usan · el manual ya explica "Surtir lo apartado"
-- ---------------------------------------------------------------------
select
  (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'atr_surtidos'
     and column_name in ('listo_en', 'registrado_por_nombre'))                                           as columnas,
  (select count(*) from public.atr_surtidos where estado = 'apartado' and listo_en is null)            as borradores,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('atr_apartar_renglon', 'atr_surtido_terminar', 'atr_surtido_personas', 'atr_oc_detalle')) as funciones,
  (select bool_and(position('Surtir lo apartado' in contenido) > 0) from public.manuales
     where clave = 'atr' and eliminado_en is null)                                                      as manual_ok;
