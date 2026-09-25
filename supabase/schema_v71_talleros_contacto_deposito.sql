-- V71 Talleros: telefono del cliente y dinero que deja (deposito) en cada prestamo.
-- Aditivo: 4 columnas nullable. mt_prestar y mt_devolver ganan parametros opcionales AL FINAL (cambia la firma
-- -> se hace DROP de la anterior). Mismos permisos que antes (ventas, admin_tienda, admin_general).
alter table public.mt_contenedores add column if not exists prestado_telefono text;
alter table public.mt_contenedores add column if not exists prestado_deposito numeric check (prestado_deposito is null or prestado_deposito >= 0);
alter table public.mt_movimientos add column if not exists telefono text;
alter table public.mt_movimientos add column if not exists deposito numeric check (deposito is null or deposito >= 0);

drop function if exists public.mt_prestar(uuid, text, text, uuid, text, text);
drop function if exists public.mt_devolver(uuid, text, text, text, text, text);

create or replace function public.mt_prestar(
  p_contenedor_id uuid, p_persona_equipo text, p_persona_externa text, p_orden_id uuid, p_notas text,
  p_tallas_prestadas text default null, p_telefono text default null, p_deposito numeric default null
) returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare v_row public.mt_contenedores;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para prestar talleros.';
  end if;
  if btrim(coalesce(p_persona_equipo, '')) = '' then raise exception 'Indica quién lo presta.'; end if;
  if btrim(coalesce(p_persona_externa, '')) = '' then raise exception 'Indica quién se lo lleva.'; end if;
  if p_deposito is not null and p_deposito < 0 then raise exception 'El dinero que deja no puede ser negativo.'; end if;

  select * into v_row from public.mt_contenedores where id = p_contenedor_id and eliminada_en is null for update;
  if v_row.id is null then raise exception 'Tallero no encontrado.'; end if;
  if v_row.estado_uso <> 'disponible' then
    raise exception 'Este tallero no está disponible (estado: %).', v_row.estado_uso;
  end if;

  update public.mt_contenedores
     set estado_uso = 'prestado',
         prestado_a = btrim(p_persona_externa),
         prestado_por = btrim(p_persona_equipo),
         prestado_desde = now(),
         tallas_prestadas = nullif(btrim(coalesce(p_tallas_prestadas, '')), ''),
         prestado_telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
         prestado_deposito = nullif(p_deposito, 0),
         actualizado_en = now()
   where id = p_contenedor_id
  returning * into v_row;

  insert into public.mt_movimientos (contenedor_id, tipo, estado_anterior, estado_nuevo, persona_equipo, persona_externa,
                                     orden_id, notas, tallas, telefono, deposito, registrado_por)
  values (p_contenedor_id, 'prestamo', 'disponible', 'prestado', btrim(p_persona_equipo), btrim(p_persona_externa), p_orden_id,
          nullif(btrim(coalesce(p_notas, '')), ''), nullif(btrim(coalesce(p_tallas_prestadas, '')), ''),
          nullif(btrim(coalesce(p_telefono, '')), ''), nullif(p_deposito, 0), auth.uid());
  return v_row;
end; $$;
revoke execute on function public.mt_prestar(uuid, text, text, uuid, text, text, text, numeric) from public;
grant execute on function public.mt_prestar(uuid, text, text, uuid, text, text, text, numeric) to authenticated;

create or replace function public.mt_devolver(
  p_contenedor_id uuid, p_persona_externa text, p_persona_equipo text, p_notas text,
  p_estado_contenido text, p_tallas_faltantes text, p_deposito_devuelto numeric default null
) returns public.mt_contenedores
language plpgsql security definer set search_path = public as $$
declare
  v_row public.mt_contenedores;
  v_tallas text;
  v_tel text;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para registrar devoluciones.';
  end if;
  if btrim(coalesce(p_persona_equipo, '')) = '' then raise exception 'Indica quién lo recibe.'; end if;
  if p_deposito_devuelto is not null and p_deposito_devuelto < 0 then raise exception 'El dinero devuelto no puede ser negativo.'; end if;

  select * into v_row from public.mt_contenedores where id = p_contenedor_id and eliminada_en is null for update;
  if v_row.id is null then raise exception 'Tallero no encontrado.'; end if;
  if v_row.estado_uso <> 'prestado' then
    raise exception 'Este tallero no está prestado.';
  end if;
  v_tallas := v_row.tallas_prestadas;
  v_tel := v_row.prestado_telefono;

  update public.mt_contenedores
     set estado_uso = 'disponible',
         estado_contenido = coalesce(nullif(p_estado_contenido, ''), estado_contenido),
         tallas_faltantes = case when p_estado_contenido is null or p_estado_contenido = '' then tallas_faltantes
                                 else nullif(btrim(coalesce(p_tallas_faltantes, '')), '') end,
         prestado_a = null, prestado_por = null, prestado_desde = null, tallas_prestadas = null,
         prestado_telefono = null, prestado_deposito = null,
         actualizado_en = now()
   where id = p_contenedor_id
  returning * into v_row;

  insert into public.mt_movimientos (contenedor_id, tipo, estado_anterior, estado_nuevo, persona_equipo, persona_externa,
                                     notas, tallas, telefono, deposito, registrado_por)
  values (p_contenedor_id, 'devolucion', 'prestado', 'disponible', btrim(p_persona_equipo),
          nullif(btrim(coalesce(p_persona_externa, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), v_tallas, v_tel,
          nullif(p_deposito_devuelto, 0), auth.uid());
  return v_row;
end; $$;
revoke execute on function public.mt_devolver(uuid, text, text, text, text, text, numeric) from public;
grant execute on function public.mt_devolver(uuid, text, text, text, text, text, numeric) to authenticated;
