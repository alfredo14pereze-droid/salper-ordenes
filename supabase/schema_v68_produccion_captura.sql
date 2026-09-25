-- V68 Produccion - FASE 3: RPCs de captura (sin montos en pesos).
-- Quien captura (admin_general, admin_fabrica, captura_produccion) las usa; NINGUNA devuelve valor ni precios.
-- La semana (miercoles a martes) se asigna sola segun la fecha. Solo se captura en semanas 'abierta'
-- (los admins tambien en 'en_revision', para corregir). Funciones NUEVAS.

create or replace function public.prod_semana_de(p_fecha date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ini date; v_id uuid;
begin
  v_ini := p_fecha - ((extract(dow from p_fecha)::int - 3 + 7) % 7);
  insert into public.prod_semanas (fecha_inicio, fecha_fin) values (v_ini, v_ini + 6)
  on conflict (fecha_inicio) do nothing;
  select id into v_id from public.prod_semanas where fecha_inicio = v_ini;
  return v_id;
end; $$;
revoke execute on function public.prod_semana_de(date) from public;

create or replace function public.prod_capturar_registro(
  p_fecha date, p_operadora_id uuid, p_folio integer, p_piezas integer, p_confirmado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_op public.prod_operaciones;
  v_sem_id uuid;
  v_estado text;
  v_precio numeric;
  v_jornada numeric;
  v_adv text[] := '{}';
  v_reg public.prod_registros;
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  if p_fecha is null or p_operadora_id is null or p_folio is null or p_piezas is null then
    raise exception 'Faltan datos: fecha, operadora, folio y piezas.';
  end if;
  if p_piezas <= 0 then raise exception 'Las piezas deben ser mayores a cero.'; end if;
  if p_fecha > (now() at time zone 'America/Monterrey')::date then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if not exists (select 1 from public.prod_operadoras o where o.id = p_operadora_id and o.activo) then
    raise exception 'La operadora no existe o está inactiva.';
  end if;
  select * into v_op from public.prod_operaciones o where o.folio = p_folio;
  if v_op.folio is null then
    raise exception 'El folio % no existe.', p_folio;
  end if;

  select s.estado into v_estado from public.prod_semanas s
   where s.fecha_inicio = p_fecha - ((extract(dow from p_fecha)::int - 3 + 7) % 7);
  if v_estado is not null and v_estado <> 'abierta'
     and not (v_estado = 'en_revision' and public.prod_puede_ver_montos()) then
    raise exception 'La semana de esa fecha ya no está abierta para captura.';
  end if;

  select c.valor into v_jornada from public.prod_config c where c.clave = 'segundos_jornada';
  select c.valor into v_precio from public.prod_config c where c.clave = 'precio_por_segundo';
  if not v_op.activa then
    v_adv := v_adv || format('El folio %s está inactivo.', p_folio);
  end if;
  if p_piezas > 1.5 * (v_jornada / v_op.segundos) then
    v_adv := v_adv || format('%s piezas es mucho: lo esperado por día es unas %s.', p_piezas, round(v_jornada / v_op.segundos));
  end if;
  if array_length(v_adv, 1) > 0 and not coalesce(p_confirmado, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'advertencias', to_jsonb(v_adv));
  end if;

  v_sem_id := public.prod_semana_de(p_fecha);
  insert into public.prod_registros (semana_id, operadora_id, fecha, folio_operacion, piezas,
                                     segundos_snapshot, precio_segundo_snapshot, valor, capturado_por)
  values (v_sem_id, p_operadora_id, p_fecha, p_folio, p_piezas, v_op.segundos, v_precio,
          p_piezas * v_op.segundos * v_precio, auth.uid())
  returning * into v_reg;

  return jsonb_build_object('ok', true, 'id', v_reg.id, 'folio', p_folio, 'piezas', p_piezas,
                            'prenda', v_op.prenda, 'parte', v_op.parte, 'operacion', v_op.operacion);
end; $$;
revoke execute on function public.prod_capturar_registro(date, uuid, integer, integer, boolean) from public;
grant execute on function public.prod_capturar_registro(date, uuid, integer, integer, boolean) to authenticated;

create or replace function public.prod_editar_registro(
  p_id uuid, p_folio integer, p_piezas integer, p_confirmado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reg public.prod_registros;
  v_estado text;
  v_op public.prod_operaciones;
  v_jornada numeric;
  v_precio numeric;
  v_adv text[] := '{}';
  v_seg numeric;
  v_prec numeric;
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  if p_piezas is null or p_piezas <= 0 then raise exception 'Las piezas deben ser mayores a cero.'; end if;
  select * into v_reg from public.prod_registros r where r.id = p_id for update;
  if v_reg.id is null then raise exception 'Registro no encontrado.'; end if;
  select s.estado into v_estado from public.prod_semanas s where s.id = v_reg.semana_id;
  if v_estado <> 'abierta' and not (v_estado = 'en_revision' and public.prod_puede_ver_montos()) then
    raise exception 'Esta semana ya no está abierta para captura.';
  end if;
  select * into v_op from public.prod_operaciones o where o.folio = p_folio;
  if v_op.folio is null then raise exception 'El folio % no existe.', p_folio; end if;

  select c.valor into v_jornada from public.prod_config c where c.clave = 'segundos_jornada';
  select c.valor into v_precio from public.prod_config c where c.clave = 'precio_por_segundo';
  if not v_op.activa then v_adv := v_adv || format('El folio %s está inactivo.', p_folio); end if;
  if p_piezas > 1.5 * (v_jornada / v_op.segundos) then
    v_adv := v_adv || format('%s piezas es mucho: lo esperado por día es unas %s.', p_piezas, round(v_jornada / v_op.segundos));
  end if;
  if array_length(v_adv, 1) > 0 and not coalesce(p_confirmado, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'advertencias', to_jsonb(v_adv));
  end if;

  -- Si cambia el folio se vuelve a tomar el snapshot; si no, se conserva el original.
  if p_folio <> v_reg.folio_operacion then
    v_seg := v_op.segundos; v_prec := v_precio;
  else
    v_seg := v_reg.segundos_snapshot; v_prec := v_reg.precio_segundo_snapshot;
  end if;
  update public.prod_registros
     set folio_operacion = p_folio, piezas = p_piezas, segundos_snapshot = v_seg,
         precio_segundo_snapshot = v_prec, valor = p_piezas * v_seg * v_prec, updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end; $$;
revoke execute on function public.prod_editar_registro(uuid, integer, integer, boolean) from public;
grant execute on function public.prod_editar_registro(uuid, integer, integer, boolean) to authenticated;

create or replace function public.prod_borrar_registro(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_reg public.prod_registros; v_estado text;
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  select * into v_reg from public.prod_registros r where r.id = p_id for update;
  if v_reg.id is null then raise exception 'Registro no encontrado.'; end if;
  select s.estado into v_estado from public.prod_semanas s where s.id = v_reg.semana_id;
  if v_estado <> 'abierta' and not (v_estado = 'en_revision' and public.prod_puede_ver_montos()) then
    raise exception 'Esta semana ya no está abierta para captura.';
  end if;
  delete from public.prod_registros where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.prod_borrar_registro(uuid) from public;
grant execute on function public.prod_borrar_registro(uuid) to authenticated;

create or replace function public.prod_listar_registros(p_fecha date, p_operadora_id uuid)
returns table (id uuid, folio integer, prenda text, parte text, operacion text, piezas integer,
               fecha date, semana_estado text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  return query
  select r.id, r.folio_operacion, o.prenda, o.parte, o.operacion, r.piezas, r.fecha, s.estado, r.created_at
  from public.prod_registros r
  join public.prod_operaciones o on o.folio = r.folio_operacion
  join public.prod_semanas s on s.id = r.semana_id
  where r.fecha = p_fecha and r.operadora_id = p_operadora_id
  order by r.created_at;
end; $$;
revoke execute on function public.prod_listar_registros(date, uuid) from public;
grant execute on function public.prod_listar_registros(date, uuid) to authenticated;

create or replace function public.prod_resumen_captura(p_fecha date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_total integer; v_cap integer; v_pend jsonb;
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  select count(*) into v_total from public.prod_operadoras o where o.activo;
  select count(distinct r.operadora_id) into v_cap
    from public.prod_registros r join public.prod_operadoras o on o.id = r.operadora_id
   where r.fecha = p_fecha and o.activo;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'numero', o.numero_operadora, 'nombre', o.nombre)
                            order by o.numero_operadora nulls last, o.nombre), '[]'::jsonb)
    into v_pend
    from public.prod_operadoras o
   where o.activo and not exists (select 1 from public.prod_registros r where r.operadora_id = o.id and r.fecha = p_fecha);
  return jsonb_build_object('capturadas', v_cap, 'total', v_total, 'pendientes', v_pend);
end; $$;
revoke execute on function public.prod_resumen_captura(date) from public;
grant execute on function public.prod_resumen_captura(date) to authenticated;
