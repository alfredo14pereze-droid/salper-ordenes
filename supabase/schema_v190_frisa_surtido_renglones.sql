-- =====================================================================
-- V190 — Frisa: surtir renglón por renglón (2026-11-06)
-- =====================================================================
-- Pedido de Alfredo: al surtir, poder marcar "surtida toda" de una vez o ir
-- palomeando cada renglón conforme se embolsa (hay órdenes de un renglón y
-- otras de muchos). El avance se guarda, así se puede seguir en otro momento
-- o desde otro celular. Palomear un renglón NO aparta piezas: se apartan al
-- marcar la orden como surtida (completa), como hasta ahora.
--
-- Aditivo: 3 columnas en frisa_surtido_lineas (V185), 1 función nueva y
-- frisa_surtido_marcar_surtida reemplazada con la misma firma (ahora deja
-- todos los renglones embolsados). Se puede correr dos veces. Requiere V185.
-- =====================================================================

alter table public.frisa_surtido_lineas add column if not exists embolsada boolean not null default false;
alter table public.frisa_surtido_lineas add column if not exists embolsada_por_nombre text;
alter table public.frisa_surtido_lineas add column if not exists embolsada_en timestamptz;

-- Palomear / despalomear un renglón (solo en órdenes pendientes).
create or replace function public.frisa_surtido_marcar_renglon(p_linea_id uuid, p_embolsada boolean)
returns public.frisa_surtido_lineas
language plpgsql security definer set search_path = public as $$
declare
  v_l public.frisa_surtido_lineas;
  v_estado text;
begin
  if not public.tiene_permiso('fs.surtir') then
    raise exception 'No tienes permiso para surtir órdenes de Frisa.' using errcode = '42501';
  end if;
  select l.* into v_l from public.frisa_surtido_lineas l where l.id = p_linea_id for update;
  if not found then raise exception 'No existe ese renglón.'; end if;
  select estado into v_estado from public.frisa_surtidos where id = v_l.surtido_id;
  if v_estado <> 'pendiente' then raise exception 'La orden ya no está pendiente (está %).', v_estado; end if;
  update public.frisa_surtido_lineas
     set embolsada = coalesce(p_embolsada, false),
         embolsada_por_nombre = case when coalesce(p_embolsada, false) then public.frisa_niveles_nombre_usuario() end,
         embolsada_en = case when coalesce(p_embolsada, false) then now() end
   where id = p_linea_id returning * into v_l;
  return v_l;
end $$;

-- Marcar surtida (completa): igual que V185 y además deja todos los renglones embolsados.
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
  -- Frisa no acepta parciales: tiene que alcanzar el disponible para todo.
  select string_agg(format('%s (faltan %s)', l.clave, l.cantidad - (p.stock_actual - public.frisa_apartado_clave(p.id))), ', ' order by l.clave)
    into v_falta
  from public.frisa_surtido_lineas l
  join public.frisa_productos_niveles p on p.id = l.producto_id
  where l.surtido_id = p_id and l.cantidad > p.stock_actual - public.frisa_apartado_clave(p.id);
  if v_falta is not null then
    raise exception 'No alcanza el inventario para surtir la orden completa: %.', v_falta;
  end if;
  update public.frisa_surtido_lineas
     set embolsada = true, embolsada_por_nombre = coalesce(embolsada_por_nombre, v_nombre), embolsada_en = coalesce(embolsada_en, now())
   where surtido_id = p_id and not embolsada;
  update public.frisa_surtidos set estado = 'surtida', surtido_por_id = p_persona_id, surtido_por_nombre = v_nombre,
         surtido_registrado_por = public.frisa_niveles_nombre_usuario(), surtido_en = now()
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'surtida', 'Surtió: ' || v_nombre);
  return v_s;
end $$;

revoke execute on function public.frisa_surtido_marcar_renglon(uuid, boolean) from public, anon;
grant execute on function public.frisa_surtido_marcar_renglon(uuid, boolean) to authenticated;
revoke execute on function public.frisa_surtido_marcar_surtida(uuid, uuid, text) from public, anon;
grant execute on function public.frisa_surtido_marcar_surtida(uuid, uuid, text) to authenticated;

-- Comprobación: las 3 columnas y la función nueva.
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'frisa_surtido_lineas'
          and column_name in ('embolsada', 'embolsada_por_nombre', 'embolsada_en')) as columnas,
       (select count(*) from pg_proc where proname = 'frisa_surtido_marcar_renglon') as funcion_renglon;

-- Rollback: drop function public.frisa_surtido_marcar_renglon(uuid, boolean); volver a correr la 7d de V185;
--   alter table public.frisa_surtido_lineas drop column embolsada, drop column embolsada_por_nombre, drop column embolsada_en;
