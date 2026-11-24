-- =====================================================================
-- V220 — ATR: surtir APARTA; contabilidad confirma la entrega al facturar
--
-- Requiere V209–V219. Se puede correr dos veces. Aditivo: 2 tablas nuevas,
-- 1 permiso nuevo y funciones de ATR nuevas o rehechas (mismo nombre).
--
-- Decisiones de Alfredo (2026-11-24):
--   * Surte Terminado (o admin): las batas quedan APARTADAS para esa OC. No
--     salen del inventario todavía; sale la hoja de surtido.
--   * Contabilidad confirma la entrega POR SURTIDO, con el número de factura.
--     Ahí sí se descuenta del inventario (movimientos salida_surtido).
--   * La existencia sigue siendo la real (la que cuadra con Microsip). Lo que
--     se puede surtir usa lo DISPONIBLE = existencia − apartado.
--
-- Qué hace:
--   1) atr_surtidos: un renglón por surtido (estado apartado | entregado |
--      cancelado, factura, quién surtió, quién confirmó).
--      atr_apartados: las líneas de cada surtido (bata, talla, cantidad).
--   2) Los surtidos que ya existían (antes de V220 ya descontaban) se pasan
--      como "entregado" (o "cancelado" si se deshicieron). No cambia ningún
--      movimiento ni ninguna existencia.
--   3) Permiso atr.facturar (confirmar entrega): contabilidad y
--      administración general.
--   4) atr_surtir_oc ahora aparta; atr_confirmar_entrega descuenta;
--      atr_deshacer_surtido libera un apartado o revierte una entrega;
--      atr_oc_cancelar libera los apartados de la OC.
--   5) Lecturas: lo surtido de una OC = entregado + apartado; atr_oc_detalle
--      y atr_faltantes traen apartado y disponible; atr_apartados_bt (por
--      bata y talla) para el inventario; atr_por_facturar y
--      atr_surtidos_oc para las pantallas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.atr_talla(text)') is null
     or to_regprocedure('public.atr_surtir_oc(bigint, jsonb, text, boolean)') is null then
    raise exception 'V220: falta V215/V217. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.atr_surtidos (
  id                    uuid primary key,
  oc_id                 bigint not null references public.atr_ordenes_compra(id) on delete restrict,
  estado                text not null default 'apartado' check (estado in ('apartado', 'entregado', 'cancelado')),
  nota                  text,
  surtido_por           uuid,
  surtido_por_nombre    text,
  creado_en             timestamptz not null default now(),
  factura               text,
  confirmado_por        uuid,
  confirmado_por_nombre text,
  confirmado_en         timestamptz,
  cancelado_por_nombre  text,
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  antes_de_v220         boolean not null default false,
  constraint atr_surtido_factura_ck check (estado <> 'entregado' or antes_de_v220 or coalesce(btrim(factura), '') <> '')
);
create index if not exists atr_surtidos_oc_idx on public.atr_surtidos (oc_id, creado_en);
create index if not exists atr_surtidos_estado_idx on public.atr_surtidos (estado) where estado = 'apartado';

create table if not exists public.atr_apartados (
  id           bigint generated always as identity primary key,
  surtido_id   uuid not null references public.atr_surtidos(id) on delete restrict,
  oc_linea_id  bigint not null references public.atr_oc_lineas(id) on delete restrict,
  producto_id  uuid not null references public.productos(id) on delete restrict,
  talla        text not null,
  cantidad     integer not null check (cantidad > 0)
);
create index if not exists atr_apartados_linea_idx on public.atr_apartados (oc_linea_id);
create index if not exists atr_apartados_bt_idx on public.atr_apartados (producto_id, talla);

alter table public.atr_surtidos enable row level security;
alter table public.atr_apartados enable row level security;
drop policy if exists "atr lee surtidos" on public.atr_surtidos;
create policy "atr lee surtidos" on public.atr_surtidos for select to authenticated using (public.tiene_permiso('atr.ver'));
drop policy if exists "atr lee apartados" on public.atr_apartados;
create policy "atr lee apartados" on public.atr_apartados for select to authenticated using (public.tiene_permiso('atr.ver'));
revoke all on public.atr_surtidos, public.atr_apartados from public, anon, authenticated;
grant select on public.atr_surtidos, public.atr_apartados to authenticated;

-- ---------------------------------------------------------------------
-- 2) Surtidos que ya existían → entregado / cancelado (no mueve nada)
-- ---------------------------------------------------------------------
insert into public.atr_surtidos (id, oc_id, estado, nota, surtido_por, surtido_por_nombre, creado_en,
                                 cancelado_en, cancelado_por_nombre, motivo_cancelacion, antes_de_v220)
select m.surtido_id, min(l.oc_id),
       case when bool_and(m.revertido_en is not null) then 'cancelado' else 'entregado' end,
       min(m.nota), (array_agg(m.usuario_id order by m.creado_en))[1], min(m.usuario_nombre), min(m.creado_en),
       max(r.creado_en), max(r.usuario_nombre), max(r.nota), true
from public.atr_movimientos m
join public.atr_oc_lineas l on l.id = m.oc_linea_id
left join public.atr_movimientos r on r.revierte_id = m.id and r.tipo = 'reversa_surtido'
where m.tipo = 'salida_surtido'
group by m.surtido_id
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3) Permiso
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('atr.facturar', 'Inventario ATR', 'Confirmar entregas de ATR (factura)',
   'Confirmar con el número de factura la entrega de un surtido de ATR; ahí se descuenta del inventario.', 'editar', 85)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, clave) values
  ('contabilidad', 'atr.facturar'), ('admin_general', 'atr.facturar')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4) Cuentas de apoyo
-- ---------------------------------------------------------------------
-- Entregado de una línea de OC (salidas − reversas)
create or replace function public.atr_linea_entregado(p_linea bigint)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, -coalesce(sum(cantidad), 0))::integer from public.atr_movimientos where oc_linea_id = p_linea
$$;
-- Apartado vigente de una línea de OC
create or replace function public.atr_linea_apartado(p_linea bigint)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.cantidad), 0)::integer
  from public.atr_apartados a join public.atr_surtidos s on s.id = a.surtido_id
  where a.oc_linea_id = p_linea and s.estado = 'apartado'
$$;
-- Apartado vigente por bata y talla (todas las OC)
create or replace function public.atr_apartado_bt(p_producto uuid, p_talla text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.cantidad), 0)::integer
  from public.atr_apartados a join public.atr_surtidos s on s.id = a.surtido_id
  where a.producto_id = p_producto and a.talla = p_talla and s.estado = 'apartado'
$$;
revoke execute on function public.atr_linea_entregado(bigint) from public, anon, authenticated;
revoke execute on function public.atr_linea_apartado(bigint) from public, anon, authenticated;
revoke execute on function public.atr_apartado_bt(uuid, text) from public, anon, authenticated;

-- Estado de la OC: surtido = entregado + apartado
create or replace function public.atr_oc_recalcular(p_oc_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pedido integer;
  v_surtido integer;
begin
  select coalesce(sum(l.cantidad_pedida), 0),
         coalesce(sum(least(l.cantidad_pedida, public.atr_linea_entregado(l.id) + public.atr_linea_apartado(l.id))), 0)
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
-- 5) Surtir = APARTAR (Terminado / admin). Regresa el surtido_id.
--    p_lineas: [{oc_linea_id, cantidad}]. No más que lo pendiente
--    (pedido − entregado − apartado); si alguna talla quedaría con
--    disponible negativo y no viene p_permitir_negativo → NEGATIVO:.
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

  insert into public.atr_surtidos (id, oc_id, estado, nota, surtido_por, surtido_por_nombre)
  values (v_surtido, p_oc_id, 'apartado', nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.atr_usuario_nombre());
  insert into public.atr_apartados (surtido_id, oc_linea_id, producto_id, talla, cantidad)
  select v_surtido, oc_linea_id, producto_id, talla, cantidad from atr_tmp_surtir;

  perform public.atr_oc_recalcular(p_oc_id);
  return v_surtido;
end;
$$;
revoke execute on function public.atr_surtir_oc(bigint, jsonb, text, boolean) from public, anon;
grant execute on function public.atr_surtir_oc(bigint, jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Contabilidad confirma la entrega con la factura → se descuenta
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
-- 7) Deshacer un surtido (admin): apartado → se libera; entregado → se
--    revierte con movimientos de signo contrario. Nada se borra.
-- ---------------------------------------------------------------------
create or replace function public.atr_deshacer_surtido(p_surtido_id uuid, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_s public.atr_surtidos;
  v_mov record;
  v_n integer := 0;
  v_quien text := public.atr_usuario_nombre();
begin
  if not public.tiene_permiso('atr.cargar') then
    raise exception 'No tienes permiso para deshacer surtidos de ATR.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe por qué se deshace el surtido.'; end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));
  select * into v_s from public.atr_surtidos where id = p_surtido_id for update;
  if not found then raise exception 'Ese surtido no existe.'; end if;
  if v_s.estado = 'cancelado' then raise exception 'Ese surtido ya se deshizo.'; end if;
  if exists (select 1 from public.atr_ordenes_compra where id = v_s.oc_id and estado = 'cancelada') then
    raise exception 'La OC de ese surtido está cancelada.';
  end if;

  if v_s.estado = 'entregado' then
    for v_mov in
      select * from public.atr_movimientos
      where surtido_id = p_surtido_id and tipo = 'salida_surtido' and revertido_en is null
      for update
    loop
      update public.atr_movimientos set revertido_en = now() where id = v_mov.id;
      insert into public.atr_movimientos
        (producto_id, talla, tipo, cantidad, oc_linea_id, surtido_id, revierte_id, nota, usuario_id, usuario_nombre)
      values
        (v_mov.producto_id, v_mov.talla, 'reversa_surtido', -v_mov.cantidad, v_mov.oc_linea_id,
         v_mov.surtido_id, v_mov.id, btrim(p_motivo), auth.uid(), v_quien);
      v_n := v_n + 1;
    end loop;
  else
    select count(*) into v_n from public.atr_apartados where surtido_id = p_surtido_id;
  end if;

  update public.atr_surtidos
     set estado = 'cancelado', cancelado_en = now(), cancelado_por_nombre = v_quien, motivo_cancelacion = btrim(p_motivo)
   where id = p_surtido_id;
  perform public.atr_oc_recalcular(v_s.oc_id);
  return v_n;
end;
$$;
revoke execute on function public.atr_deshacer_surtido(uuid, text) from public, anon;
grant execute on function public.atr_deshacer_surtido(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8) Cancelar OC: lo entregado NO se revierte (como antes); lo apartado
--    se libera. Regresa las batas ya entregadas.
-- ---------------------------------------------------------------------
create or replace function public.atr_oc_cancelar(p_oc_id bigint, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
  v_entregado integer;
begin
  if not public.tiene_permiso('atr.oc') then
    raise exception 'No tienes permiso para cancelar órdenes de compra de ATR.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe por qué se cancela.'; end if;

  select estado into v_estado from public.atr_ordenes_compra where id = p_oc_id for update;
  if not found then raise exception 'No existe esa OC.'; end if;
  if v_estado = 'cancelada' then raise exception 'La OC ya está cancelada.'; end if;

  select coalesce(sum(public.atr_linea_entregado(l.id)), 0)::integer into v_entregado
  from public.atr_oc_lineas l where l.oc_id = p_oc_id;

  update public.atr_surtidos
     set estado = 'cancelado', cancelado_en = now(), cancelado_por_nombre = public.atr_usuario_nombre(),
         motivo_cancelacion = 'Se canceló la OC: ' || btrim(p_motivo)
   where oc_id = p_oc_id and estado = 'apartado';

  update public.atr_ordenes_compra
     set estado = 'cancelada', cancelada_en = now(), cancelada_por = auth.uid(),
         cancelada_por_nombre = public.atr_usuario_nombre(), motivo_cancelacion = btrim(p_motivo)
   where id = p_oc_id;
  return v_entregado;
end;
$$;
revoke execute on function public.atr_oc_cancelar(bigint, text) from public, anon;
grant execute on function public.atr_oc_cancelar(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9) Lecturas
-- ---------------------------------------------------------------------
drop function if exists public.atr_oc_lista();
create function public.atr_oc_lista()
returns table (
  id bigint, numero_oc text, fecha_oc date, fecha_entrega date, estado text, pdf_url text,
  notas text, creado_por_nombre text, creado_en timestamptz, cancelada_en timestamptz,
  motivo_cancelacion text, lineas integer, pedido integer, surtido integer, entregado integer, apartado integer
)
language sql stable security definer set search_path = public as $$
  select o.id, o.numero_oc, o.fecha_oc, o.fecha_entrega, o.estado, o.pdf_url, o.notas,
         o.creado_por_nombre, o.creado_en, o.cancelada_en, o.motivo_cancelacion,
         count(l.id)::integer,
         coalesce(sum(l.cantidad_pedida), 0)::integer,
         coalesce(sum(least(l.cantidad_pedida, x.ent + x.apa)), 0)::integer,
         coalesce(sum(x.ent), 0)::integer,
         coalesce(sum(x.apa), 0)::integer
  from public.atr_ordenes_compra o
  left join public.atr_oc_lineas l on l.oc_id = o.id
  left join lateral (select public.atr_linea_entregado(l.id) as ent, public.atr_linea_apartado(l.id) as apa) x on l.id is not null
  where public.tiene_permiso('atr.ver')
  group by o.id
$$;
revoke execute on function public.atr_oc_lista() from public, anon;
grant execute on function public.atr_oc_lista() to authenticated;

drop function if exists public.atr_oc_detalle(bigint);
create function public.atr_oc_detalle(p_oc_id bigint)
returns table (
  oc_linea_id bigint, producto_id uuid, producto text, color text, con_bolsa boolean,
  talla text, texto_pdf text, pedido integer, surtido integer, pendiente integer, existencia integer,
  entregado integer, apartado integer, disponible integer
)
language sql stable security definer set search_path = public as $$
  select l.id, l.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         l.talla, l.texto_pdf, l.cantidad_pedida,
         x.ent + x.apa,
         greatest(0, l.cantidad_pedida - x.ent - x.apa),
         x.exi,
         x.ent, x.apa,
         x.exi - public.atr_apartado_bt(l.producto_id, l.talla)
  from public.atr_oc_lineas l
  join public.productos p on p.id = l.producto_id
  cross join lateral (
    select public.atr_linea_entregado(l.id) as ent,
           public.atr_linea_apartado(l.id) as apa,
           coalesce((select sum(m.cantidad) from public.atr_movimientos m
                     where m.producto_id = l.producto_id and m.talla = l.talla), 0)::integer as exi
  ) x
  where l.oc_id = p_oc_id and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], l.talla), l.talla
$$;
revoke execute on function public.atr_oc_detalle(bigint) from public, anon;
grant execute on function public.atr_oc_detalle(bigint) to authenticated;

-- Qué nos falta: pendiente sin lo apartado; el faltante usa lo disponible.
drop function if exists public.atr_faltantes();
create function public.atr_faltantes()
returns table (
  producto_id uuid, producto text, color text, con_bolsa boolean, talla text,
  pendiente integer, existencia integer, en_taller integer, faltante integer,
  en_taller_ordenes jsonb, apartado integer, disponible integer
)
language sql stable security definer set search_path = public as $$
  with pend as (
    select l.producto_id, l.talla,
           sum(greatest(0, l.cantidad_pedida - public.atr_linea_entregado(l.id) - public.atr_linea_apartado(l.id)))::integer as pendiente
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
         greatest(0, pd.pendiente - greatest(0, coalesce(e.existencia, 0) - x.apa) - coalesce(t.en_taller, 0)),
         coalesce(t.ordenes, '[]'::jsonb),
         x.apa,
         coalesce(e.existencia, 0) - x.apa
  from pend pd
  join public.productos p on p.id = pd.producto_id
  left join exist e on e.producto_id = pd.producto_id and e.talla = pd.talla
  left join taller t on t.producto_id = pd.producto_id and t.talla = pd.talla
  cross join lateral (select public.atr_apartado_bt(pd.producto_id, pd.talla) as apa) x
  where pd.pendiente > 0 and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], pd.talla), pd.talla
$$;
revoke execute on function public.atr_faltantes() from public, anon;
grant execute on function public.atr_faltantes() to authenticated;

-- Apartado vigente por bata y talla (para la matriz de inventario)
create or replace function public.atr_apartados_bt()
returns table (producto_id uuid, talla text, apartado integer)
language sql stable security definer set search_path = public as $$
  select a.producto_id, a.talla, sum(a.cantidad)::integer
  from public.atr_apartados a join public.atr_surtidos s on s.id = a.surtido_id
  where s.estado = 'apartado' and public.tiene_permiso('atr.ver')
  group by 1, 2
$$;
revoke execute on function public.atr_apartados_bt() from public, anon;
grant execute on function public.atr_apartados_bt() to authenticated;

-- Surtidos de una OC (con sus líneas)
create or replace function public.atr_surtidos_oc(p_oc_id bigint)
returns table (
  surtido_id uuid, estado text, creado_en timestamptz, surtido_por_nombre text, nota text,
  factura text, confirmado_por_nombre text, confirmado_en timestamptz,
  cancelado_por_nombre text, cancelado_en timestamptz, motivo_cancelacion text,
  antes_de_v220 boolean, piezas integer, lineas jsonb
)
language sql stable security definer set search_path = public as $$
  select s.id, s.estado, s.creado_en, s.surtido_por_nombre, s.nota,
         s.factura, s.confirmado_por_nombre, s.confirmado_en,
         s.cancelado_por_nombre, s.cancelado_en, s.motivo_cancelacion, s.antes_de_v220,
         coalesce(sum(q.cantidad), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object('producto', p.nombre, 'color', p.color,
                    'con_bolsa', coalesce((p.especificaciones->>'bolsa')::boolean, false),
                    'talla', q.talla, 'cantidad', q.cantidad)
                  order by p.nombre, array_position(array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'], q.talla))
                  filter (where q.cantidad is not null), '[]'::jsonb)
  from public.atr_surtidos s
  left join lateral (
    -- Surtidos de V220: sus apartados. Los de antes: sus salidas.
    select a.producto_id, a.talla, a.cantidad from public.atr_apartados a where a.surtido_id = s.id
    union all
    select m.producto_id, m.talla, -m.cantidad from public.atr_movimientos m
    where m.surtido_id = s.id and m.tipo = 'salida_surtido' and s.antes_de_v220
  ) q on true
  left join public.productos p on p.id = q.producto_id
  where s.oc_id = p_oc_id and public.tiene_permiso('atr.ver')
  group by s.id
  order by s.creado_en desc
$$;
revoke execute on function public.atr_surtidos_oc(bigint) from public, anon;
grant execute on function public.atr_surtidos_oc(bigint) to authenticated;

-- Por facturar (contabilidad): surtidos apartados de todas las OC
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
  where s.estado = 'apartado' and public.tiene_permiso('atr.ver')
  group by s.id, o.numero_oc, o.notas
  order by s.creado_en
$$;
revoke execute on function public.atr_por_facturar() from public, anon;
grant execute on function public.atr_por_facturar() to authenticated;

-- ---------------------------------------------------------------------
-- 10) Manual de ATR (apartar, Por facturar, Revisión Microsip). Solo si nadie
--     lo editó en la app.
-- ---------------------------------------------------------------------
update public.manuales
   set contenido = $man$## Resumen

**Inventario ATR** lleva todo lo de ATR, cliente al que solo le hacemos batas: el **inventario** por bata y talla, las **órdenes de compra (OC)** que nos manda, el **surtido** de cada OC y **qué nos falta** producir. Lo que se surte se descuenta del inventario; lo que se produce en las órdenes de taller de ATR **entra solo** al completar Terminado.

El flujo es: llega la OC → se sube → se revisa qué falta → **Terminado surte** lo que hay (las batas quedan **apartadas**) → **contabilidad confirma la entrega con la factura** (ahí se descuentan del inventario) → se hace la orden de taller por lo que falta → al terminarla entra al inventario → se surte el resto. Con **Revisión Microsip** se compara el inventario contra Microsip.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: suben y cancelan OC, surten, hacen órdenes de taller, ajustes, carga inicial y deshacen surtidos.
- **Terminado**: surte las OC (aparta las batas) y registra entregas.
- **Contabilidad**: confirma las entregas con la factura (pestaña **Por facturar**), consulta y hace órdenes de taller de ATR (solo de ATR).
- **Admin tienda** y **Consulta fábrica**: solo consultan.

## Antes de empezar

- Para subir una OC: el PDF que mandó ATR.
- Para surtir: tener las batas físicamente listas.
- Para una orden de taller: la fecha de entrega y la tela de cada bata.

## Procesos paso a paso

### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR** (pestaña **Inventario**).
2. Cada renglón es una bata: su **color** (la etiqueta viene del mismo color) y si es **● Con bolsa** (negra) u **○ Sin bolsa** (punteada). Salen todas las batas del catálogo, aunque estén en 0.
3. Las **tallas son columnas** (S, M, L, XL, 2XL, 3XL; XS, 4XL y 5XL salen si tienen algo) y al final el **Total**. Abajo, el total por talla.
4. Filtra con **Todas / ● Con bolsa / ○ Sin bolsa** y eligiendo el **color** en la lista (**Todos los colores**); también puedes buscar o marcar **Solo con existencia**.
5. Toca un número para ver el historial de esa bata y talla (con la orden o la OC de cada movimiento).

### Cómo subir una orden de compra

1. Entra a la pestaña **Órdenes de compra** y dale **+ Nueva OC**.
2. En **PDF de la orden de compra** elige el archivo. El sistema lo lee y llena el **Número de OC**, las fechas y los renglones. El PDF se ve a un lado.
3. Revisa cada renglón contra el PDF: **bata**, **talla** y **cantidad**. Los que salen en rojo no ligaron con el catálogo: elige la bata en **Elige la bata…** o dale **Dar de alta bata nueva** (con o sin bolsa + color).
4. Marca **Revisé cada renglón contra el PDF (bata, talla y cantidad)**.
5. Dale **Guardar OC**.

> Si el número de OC ya existe, sale "Esta OC ya está subida" con la liga para verla.

### Cómo ver las órdenes de compra

1. En **Órdenes de compra** salen primero las **abiertas y parciales**, por fecha de entrega.
2. Arriba ves el resumen: cuántas OC están **pendientes**, cuántas **sí se pueden surtir** y cuántas **no se pueden surtir** (con las batas que faltan en total), y la tabla **Lo que falta por bata y talla**.
3. Cada OC dice en **verde "Se puede surtir"**, en **naranja "Alcanza, pero la ocupa OC…"** (otra que vence antes se lleva esas batas) o en **rojo "Faltan piezas"** con lo que falta y cuántas hay para surtir parcial.
4. Filtra por estado o busca el folio.
5. Toca una OC para ver su detalle: por bata y talla, **Pedido**, **Surtido**, **Pendiente** y **Existencia**. Dale **Ver PDF** para verla junto.

> El inventario se reparte **estrictamente por fecha de entrega**: la OC que vence primero toma lo que haya (aunque no se complete) y la siguiente se queda con lo que sobra. Si dos vencen el mismo día, va primero la orden más vieja.

### Cómo saber qué nos falta

1. Entra a la pestaña **Qué nos falta**.
2. Por bata y talla ves: **Pendiente** (lo que falta surtir de las OC abiertas), **Existencia**, **En taller** (órdenes de ATR que todavía no terminan, con su folio) y **Faltante**.
3. Marca **Solo con faltante** para ver solo lo que hay que producir.
4. Dale **CSV** o **PDF** para bajar la lista.

### Cómo surtir una OC

1. Abre la OC y dale **Surtir**.
2. En cada línea ya viene lo que alcanza con la existencia. Cámbialo si hace falta, o usa **Lo que alcanza**, **Todo lo pendiente** o **Borrar**.
3. Si quieres, pon una **Nota (opcional)**.
4. Dale **Apartar y ver hoja**. Se abre la **hoja de surtido** en PDF: dale **Descargar** para imprimirla.
5. Las batas quedan **apartadas** ("Apartado · por facturar"): siguen en la existencia, pero ya no están **disponibles** para otra OC. Se descuentan cuando contabilidad confirma la entrega con la factura.

> Se puede surtir parcial: la OC queda **Parcial** hasta completar. No deja surtir más de lo pendiente ni más de lo disponible sin confirmar ("Sí, sí salen").

### Cómo confirmar una entrega con la factura (contabilidad)

1. Entra a la pestaña **Por facturar**. Salen los surtidos apartados de todas las OC, con sus batas y quién surtió.
2. Cuando ya se hizo la factura, escribe el **Número de factura** y dale **Confirmar entrega**.
3. Ahí esas batas **salen del inventario** y el surtido queda "Entregado · Factura …". También se puede confirmar desde el detalle de la OC.

### Cómo revisar el inventario contra Microsip

1. En Microsip saca el reporte **Existencia y valor del inventario** (línea ATR) en Excel.
2. Entra a la pestaña **Revisión Microsip** y súbelo.
3. Ves por bata y talla **Microsip**, **Página** y **Diferencia** (página − Microsip). Arriba: cuántas cuadran y cuántas tienen diferencia. Marca o quita **Solo con diferencia**.
4. Si el Excel trae varias hojas, se toma la de "Existencia y valor"; puedes cambiarla en **Hoja**.

> Solo revisa: no cambia nada. Lo apartado por facturar cuenta en la existencia (igual que en Microsip, que lo descuenta al facturar).

### Cómo hacer la orden de taller de lo que falta

1. En **Qué nos falta**, ya vienen marcadas las líneas con faltante. Marca o desmarca las que quieras (puedes marcar otras para producir de más).
2. Dale **Crear orden de taller (N batas)**.
3. Se abre **Nueva orden** ya llena: tipo **Industrial**, cliente **ATR**, cada bata con cantidad = faltante. Cambia cantidades si hace falta (redondear o producir de más).
4. Pon la **Fecha de entrega** y la **Tela** de cada bata.
5. Dale **Crear orden**.

> Va **sin precio**: es para inventario, lo que se cobra es la OC. No se liga a una OC; mientras no termine, cuenta en **En taller** para no pedir doble. Sigue las etapas normales.

### Cómo entra al inventario lo que se produce

1. Terminado cierra la orden de ATR con sus cantidades reales.
2. Al completar Terminado, lo surtido se suma solo. En la orden sale **Sumado al inventario ATR ✓**.
3. Si se reabre Terminado o se elimina la orden, se resta solo (sale como **Reversa**).

### Cómo deshacer un surtido (administradores)

1. Abre la OC. Abajo, en **Surtidos de esta OC**, busca el surtido.
2. Dale **Deshacer**, escribe el motivo y dale **Sí, deshacer surtido**.
3. Si estaba **apartado**, las batas se liberan. Si ya estaba **entregado** (con factura), regresan al inventario. La OC vuelve a **Parcial** o **Abierta** y el surtido queda como deshecho, con quién y por qué.

### Cómo cancelar una OC (administradores)

1. Abre la OC y dale **Cancelar OC**.
2. Escribe el motivo y dale **Sí, cancelar OC**.

> Lo **apartado** se libera solo. Lo ya **entregado** (con factura) **no** regresa al inventario: si debe regresar, deshaz ese surtido antes de cancelar.

### Otros (administradores)

- **Registrar entrega a ATR**: una salida suelta, sin OC.
- **Ajuste**: corrige una línea tras un conteo (nota obligatoria).
- **Carga inicial**: sube un Excel o CSV con lo que había al empezar.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Abierta** (rojo) | No se ha surtido nada de la OC. |
| **Parcial** (amarillo) | Se surtió una parte. |
| **Surtida** (verde) | Ya se surtió todo. |
| **Cancelada** (tachada) | Se canceló; ya no cuenta en Qué nos falta. |
| **Se puede surtir** (verde) | Hay batas para surtir todo lo pendiente de esa OC. |
| **Alcanza, pero la ocupa OC…** (naranja) | Sola alcanzaría, pero otra OC que vence antes se lleva esas batas. |
| **Faltan piezas** (rojo) | No alcanza: dice qué falta y cuántas hay para surtir parcial. |
| "Entrega en N días" en rojo / ámbar | Igual que en las órdenes: vence en 3 días o menos / en 7 días o menos. |
| Fila **roja** en Qué nos falta | Falta producir. |
| Fila **amarilla** en Qué nos falta | Alcanza, pero solo contando lo que está en taller. |
| **Existencia** en rojo | Hay menos de cero. Revisa con un conteo. |
| **Sumado al inventario ATR ✓** | Lo producido en esa orden ya entró al inventario. |
| **Apartado · por facturar** (amarillo) | Terminado ya surtió; falta que contabilidad confirme con la factura. Sigue en existencia, no está disponible. |
| **Entregado · Factura …** (verde) | Contabilidad confirmó: ya salió del inventario. |
| **ap. N** en el inventario | De esa existencia, N batas están apartadas por facturar. |

## Si eres de…

- **Admin fábrica / Administración general**: subes las OC, revisas qué falta, haces las órdenes de taller y surtes.
- **Terminado**: surtes las OC (apartas) y entregas la hoja de surtido.
- **Contabilidad**: confirmas en **Por facturar** cada entrega con su factura, revisas contra Microsip y haces órdenes de taller de ATR.
- **Admin tienda / Consulta fábrica**: solo consultas.

## Problemas comunes

- **"Esta OC ya está subida"** → Ya existe con ese número. Ábrela desde la liga; si la anterior estaba mal, cancélala y súbela otra vez.
- **Renglón en rojo al subir la OC** → La descripción no ligó con el catálogo: asígnale la bata o dala de alta. La próxima vez se liga sola.
- **"No se puede surtir más de lo pendiente"** → Baja la cantidad a lo que falta de esa línea.
- **"Quedarían en negativo"** → Hay menos batas registradas de las que salen. Revisa; si de verdad salen, marca "Sí, sí salen".
- **No se sumó lo de una orden** → Revisa que Terminado esté completado y que sus batas vengan del catálogo de ATR.

## Se conecta con

- [Nueva orden](manual:nueva-orden): la orden de taller se crea con el formulario normal.
- [Órdenes de tu estación](manual:estacion): Terminado cierra la orden con sus cantidades reales.
- [Catálogos](manual:catalogos): el catálogo de batas de ATR.
$man$,
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null and actualizado_por_nombre = 'Carga inicial';

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: 2 · true · 2 · 0 · 1 · true)
--   tablas nuevas · todos los surtidos de antes quedaron registrados ·
--   roles con atr.facturar · apartados (recién aplicado: 0) · función de confirmar ·
--   el manual ya explica Por facturar
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('atr_surtidos', 'atr_apartados')) as tablas,
  not exists (select 1 from public.atr_movimientos m where m.tipo = 'salida_surtido'
              and not exists (select 1 from public.atr_surtidos s where s.id = m.surtido_id))           as surtidos_de_antes_ok,
  (select count(*) from public.rol_permisos where clave = 'atr.facturar')                               as roles_facturar,
  (select count(*) from public.atr_surtidos where estado = 'apartado')                                  as apartados,
  (select count(*) from pg_proc where proname = 'atr_confirmar_entrega' and pronamespace = 'public'::regnamespace) as confirmar,
  (select bool_and(position('Por facturar' in contenido) > 0) from public.manuales
     where clave = 'atr' and eliminado_en is null)                                                      as manual_ok;
