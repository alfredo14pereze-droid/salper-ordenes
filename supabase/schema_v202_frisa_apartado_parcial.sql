-- =====================================================================
-- V202 — Frisa: apartar mercancía de una orden aunque no esté completa (2026-11-09)
-- =====================================================================
-- Pedido de Alfredo: "que se pueda ir apartando mercancía para ciertas órdenes
-- con lo que se podía, aunque la orden no esté completa".
--   · Cada renglón de una orden PENDIENTE tiene "apartada" (0 … lo que pide).
--     Esas piezas ya no están disponibles para otras órdenes.
--   · Palomear un renglón = apartarlo completo; quitar la palomita = liberarlo.
--   · "Surtida toda" sigue igual: solo cuando alcanza para todo (ahora cuenta
--     lo que esa misma orden ya tenía apartado). Al surtirla queda todo apartado.
--   · "Regresar a pendiente" libera lo apartado, como antes.
--   · La bodega (real) no se mueve hasta "Ya entregó el chofer", como siempre.
-- Requiere V185, V190. Aditivo; se puede correr dos veces.
-- =====================================================================

alter table public.frisa_surtido_lineas add column if not exists apartada integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'frisa_surtido_lineas_apartada_ck') then
    alter table public.frisa_surtido_lineas add constraint frisa_surtido_lineas_apartada_ck check (apartada >= 0 and apartada <= cantidad);
  end if;
end $$;

-- Lo que ya estaba: las surtidas tienen todo apartado; los renglones palomeados de pendientes, también.
update public.frisa_surtido_lineas l set apartada = l.cantidad
  from public.frisa_surtidos s
 where s.id = l.surtido_id and l.apartada <> l.cantidad
   and (s.estado = 'surtida' or (s.estado = 'pendiente' and l.embolsada));

-- Apartado de una clave: surtidas (todo) + pendientes (lo apartado), opcionalmente sin contar una orden.
create or replace function public.frisa_apartado_clave(p_producto uuid, p_excepto uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when s.estado = 'surtida' then l.cantidad else l.apartada end), 0)::int
  from public.frisa_surtido_lineas l
  join public.frisa_surtidos s on s.id = l.surtido_id
  where l.producto_id = p_producto and s.estado in ('surtida', 'pendiente')
    and (p_excepto is null or s.id <> p_excepto);
$$;
revoke execute on function public.frisa_apartado_clave(uuid, uuid) from public, anon, authenticated;

-- Apartar N piezas de un renglón (0 = liberar). Solo órdenes pendientes.
create or replace function public.frisa_surtido_apartar(p_linea_id uuid, p_cantidad integer)
returns public.frisa_surtido_lineas
language plpgsql security definer set search_path = public as $$
declare
  v_l public.frisa_surtido_lineas;
  v_estado text;
  v_disp integer;
  v_nombre text := public.frisa_niveles_nombre_usuario();
begin
  if not public.tiene_permiso('fs.surtir') then
    raise exception 'No tienes permiso para surtir órdenes de Frisa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select l.* into v_l from public.frisa_surtido_lineas l where l.id = p_linea_id for update;
  if not found then raise exception 'No existe ese renglón.'; end if;
  select estado into v_estado from public.frisa_surtidos where id = v_l.surtido_id;
  if v_estado <> 'pendiente' then raise exception 'La orden ya no está pendiente (está %).', v_estado; end if;
  if p_cantidad is null or p_cantidad < 0 or p_cantidad > v_l.cantidad then
    raise exception 'Escribe de 0 a % piezas.', v_l.cantidad;
  end if;
  -- Lo que hay libre para este renglón: real − lo apartado por todo lo demás.
  select p.stock_actual - public.frisa_apartado_clave(p.id, v_l.surtido_id)
         - coalesce((select sum(x.apartada) from public.frisa_surtido_lineas x
                      where x.surtido_id = v_l.surtido_id and x.producto_id = v_l.producto_id and x.id <> v_l.id), 0)
    into v_disp
  from public.frisa_productos_niveles p where p.id = v_l.producto_id;
  if p_cantidad > v_l.apartada and p_cantidad > greatest(coalesce(v_disp, 0), 0) then
    raise exception 'Solo hay % disponibles de esa clave para apartar.', greatest(coalesce(v_disp, 0), 0);
  end if;
  update public.frisa_surtido_lineas
     set apartada = p_cantidad,
         embolsada = (p_cantidad = cantidad),
         embolsada_por_nombre = case when p_cantidad > 0 then v_nombre end,
         embolsada_en = case when p_cantidad > 0 then now() end
   where id = p_linea_id returning * into v_l;
  perform public.frisa_surtido_evento(v_l.surtido_id, 'apartado',
    format('%s: %s de %s apartadas', v_l.clave, v_l.apartada, v_l.cantidad));
  return v_l;
end $$;
revoke execute on function public.frisa_surtido_apartar(uuid, integer) from public, anon;
grant execute on function public.frisa_surtido_apartar(uuid, integer) to authenticated;

-- Palomear un renglón (V190) = apartarlo completo; quitar la palomita = liberarlo.
create or replace function public.frisa_surtido_marcar_renglon(p_linea_id uuid, p_embolsada boolean)
returns public.frisa_surtido_lineas
language plpgsql security definer set search_path = public as $$
declare
  v_cant integer;
begin
  select cantidad into v_cant from public.frisa_surtido_lineas where id = p_linea_id;
  if not found then raise exception 'No existe ese renglón.'; end if;
  return public.frisa_surtido_apartar(p_linea_id, case when coalesce(p_embolsada, false) then v_cant else 0 end);
end $$;
revoke execute on function public.frisa_surtido_marcar_renglon(uuid, boolean) from public, anon;
grant execute on function public.frisa_surtido_marcar_renglon(uuid, boolean) to authenticated;

-- Surtida toda: lo que esta orden ya apartó cuenta a su favor.
create or replace function public.frisa_surtido_marcar_surtida(p_id uuid, p_persona_id uuid default null, p_persona_nombre text default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_nombre text;
  v_falta text;
begin
  if not public.tiene_permiso('fs.surtir') then
    raise exception 'No tienes permiso para surtir órdenes de Frisa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Esta orden ya no está pendiente (está %).', v_s.estado;
  end if;
  if p_persona_id is not null then
    select nullif(btrim(full_name), '') into v_nombre from public.profiles where id = p_persona_id;
  end if;
  v_nombre := coalesce(v_nombre, nullif(btrim(coalesce(p_persona_nombre, '')), ''));
  if v_nombre is null then
    raise exception 'Elige quién surtió la orden.';
  end if;
  select string_agg(format('%s (faltan %s)', l.clave, l.cantidad - (p.stock_actual - public.frisa_apartado_clave(p.id, p_id))), ', ' order by l.clave)
    into v_falta
  from public.frisa_surtido_lineas l
  join public.frisa_productos_niveles p on p.id = l.producto_id
  where l.surtido_id = p_id and l.cantidad > p.stock_actual - public.frisa_apartado_clave(p.id, p_id);
  if v_falta is not null then
    raise exception 'No alcanza el inventario para surtir la orden completa: %.', v_falta;
  end if;
  update public.frisa_surtido_lineas
     set apartada = cantidad, embolsada = true,
         embolsada_por_nombre = coalesce(embolsada_por_nombre, v_nombre), embolsada_en = coalesce(embolsada_en, now())
   where surtido_id = p_id;
  update public.frisa_surtidos set estado = 'surtida', surtido_por_id = p_persona_id, surtido_por_nombre = v_nombre,
         surtido_registrado_por = public.frisa_niveles_nombre_usuario(), surtido_en = now()
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'surtida', 'Surtió: ' || v_nombre);
  return v_s;
end $$;
revoke execute on function public.frisa_surtido_marcar_surtida(uuid, uuid, text) from public, anon;
grant execute on function public.frisa_surtido_marcar_surtida(uuid, uuid, text) to authenticated;

-- Regresar una surtida a pendiente: libera lo apartado (como antes).
create or replace function public.frisa_surtido_regresar(p_id uuid, p_motivo text default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
begin
  if not public.tiene_permiso('fs.entregar') then
    raise exception 'No tienes permiso para regresar órdenes surtidas.' using errcode = '42501';
  end if;
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'surtida' then raise exception 'Solo se puede regresar una orden surtida.'; end if;
  update public.frisa_surtido_lineas set apartada = 0, embolsada = false, embolsada_por_nombre = null, embolsada_en = null
   where surtido_id = p_id;
  update public.frisa_surtidos set estado = 'pendiente', surtido_por_id = null, surtido_por_nombre = null,
         surtido_registrado_por = null, surtido_en = null
   where id = p_id;
  perform public.frisa_surtido_evento(p_id, 'regresada a pendiente',
    concat_ws(' · ', 'Antes surtida por ' || v_s.surtido_por_nombre, nullif(btrim(coalesce(p_motivo, '')), '')));
  select * into v_s from public.frisa_surtidos where id = p_id;
  return v_s;
end $$;
revoke execute on function public.frisa_surtido_regresar(uuid, text) from public, anon;
grant execute on function public.frisa_surtido_regresar(uuid, text) to authenticated;

-- Comprobación: columna, función nueva y lo apartado hoy (debe ser lo de las surtidas).
select (select count(*) from information_schema.columns where table_schema = 'public'
          and table_name = 'frisa_surtido_lineas' and column_name = 'apartada') as columna,
       (select count(*) from pg_proc where proname = 'frisa_surtido_apartar') as funcion_apartar,
       (select coalesce(sum(public.frisa_apartado_clave(id)), 0) from public.frisa_productos_niveles) as piezas_apartadas;
