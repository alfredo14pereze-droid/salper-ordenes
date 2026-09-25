-- V70 Produccion - FASE 5: datos para dashboard/imprimibles y administracion de catalogos.
-- Todo SOLO admin_general / admin_fabrica (prod_puede_ver_montos). Funciones NUEVAS.
-- Los folios de operacion NUNCA se borran ni se reutilizan (no hay funcion de borrado; solo se desactivan).
-- Cambiar un tiempo o precio NO modifica semanas ya capturadas (los registros guardan su snapshot).

create or replace function public.prod_historial_valores(p_semanas integer default 16)
returns table (
  semana_id uuid, fecha_inicio date, fecha_fin date, estado text, importada boolean,
  operadora_id uuid, valor numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  return query
  with sem as (
    select s.* from public.prod_semanas s order by s.fecha_inicio desc limit greatest(p_semanas, 1)
  )
  select s.id, s.fecha_inicio, s.fecha_fin, s.estado, s.importada, v.opid, v.opval
  from sem s
  join lateral (
    select pv.operadora_id as opid, pv.valor_generado as opval
      from public.prod_valor_semana pv
     where (s.importada or s.estado = 'aprobada') and pv.semana_id = s.id
    union all
    select r.operadora_id, sum(r.valor)
      from public.prod_registros r
     where not (s.importada or s.estado = 'aprobada') and r.semana_id = s.id
     group by r.operadora_id
  ) v on true;
end; $$;
revoke execute on function public.prod_historial_valores(integer) from public;
grant execute on function public.prod_historial_valores(integer) to authenticated;

create or replace function public.prod_guardar_operacion(
  p_folio integer, p_prenda text, p_parte text, p_operacion text, p_segundos numeric,
  p_activa boolean, p_nuevo boolean
) returns public.prod_operaciones
language plpgsql security definer set search_path = public as $$
declare v_row public.prod_operaciones;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para editar el catálogo de operaciones.';
  end if;
  if p_folio is null or p_folio < 0 then raise exception 'El folio no es válido.'; end if;
  if btrim(coalesce(p_prenda, '')) = '' or btrim(coalesce(p_parte, '')) = ''
     or btrim(coalesce(p_operacion, '')) = '' then
    raise exception 'Prenda, parte y operación son obligatorias.';
  end if;
  if p_segundos is null or p_segundos <= 0 then raise exception 'El tiempo en segundos debe ser mayor a cero.'; end if;

  if coalesce(p_nuevo, false) then
    if exists (select 1 from public.prod_operaciones o where o.folio = p_folio) then
      raise exception 'El folio % ya existe (un folio nunca se reutiliza).', p_folio;
    end if;
    insert into public.prod_operaciones (folio, prenda, parte, operacion, segundos, activa)
    values (p_folio, btrim(p_prenda), btrim(p_parte), btrim(p_operacion), p_segundos, coalesce(p_activa, true))
    returning * into v_row;
  else
    update public.prod_operaciones
       set prenda = btrim(p_prenda), parte = btrim(p_parte), operacion = btrim(p_operacion),
           segundos = p_segundos, activa = coalesce(p_activa, activa), updated_at = now()
     where folio = p_folio
    returning * into v_row;
    if v_row.folio is null then raise exception 'La operación % no existe.', p_folio; end if;
  end if;
  return v_row;
end; $$;
revoke execute on function public.prod_guardar_operacion(integer, text, text, text, numeric, boolean, boolean) from public;
grant execute on function public.prod_guardar_operacion(integer, text, text, text, numeric, boolean, boolean) to authenticated;

create or replace function public.prod_guardar_operadora(
  p_id uuid, p_folio_empleado text, p_numero integer, p_nombre text, p_puesto text,
  p_participa boolean, p_activo boolean
) returns public.prod_operadoras
language plpgsql security definer set search_path = public as $$
declare v_row public.prod_operadoras;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para editar operadoras.';
  end if;
  if btrim(coalesce(p_folio_empleado, '')) = '' or btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El folio de empleado y el nombre son obligatorios.';
  end if;
  if exists (select 1 from public.prod_operadoras o
             where o.folio_empleado = btrim(p_folio_empleado) and o.id is distinct from p_id) then
    raise exception 'Ya existe una persona con el folio de empleado %.', btrim(p_folio_empleado);
  end if;
  if p_numero is not null and exists (select 1 from public.prod_operadoras o
                                      where o.numero_operadora = p_numero and o.id is distinct from p_id) then
    raise exception 'El número de operadora % ya está asignado.', p_numero;
  end if;

  if p_id is null then
    insert into public.prod_operadoras (folio_empleado, numero_operadora, nombre, puesto, participa_bonos, activo)
    values (btrim(p_folio_empleado), p_numero, btrim(p_nombre), nullif(btrim(coalesce(p_puesto, '')), ''),
            coalesce(p_participa, false), coalesce(p_activo, true))
    returning * into v_row;
  else
    update public.prod_operadoras
       set folio_empleado = btrim(p_folio_empleado), numero_operadora = p_numero, nombre = btrim(p_nombre),
           puesto = nullif(btrim(coalesce(p_puesto, '')), ''), participa_bonos = coalesce(p_participa, participa_bonos),
           activo = coalesce(p_activo, activo), updated_at = now()
     where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'La operadora no existe.'; end if;
  end if;
  return v_row;
end; $$;
revoke execute on function public.prod_guardar_operadora(uuid, text, integer, text, text, boolean, boolean) from public;
grant execute on function public.prod_guardar_operadora(uuid, text, integer, text, text, boolean, boolean) to authenticated;

create or replace function public.prod_guardar_regla(
  p_id uuid, p_tipo text, p_desde numeric, p_bono numeric, p_activa boolean
) returns public.prod_reglas_premios
language plpgsql security definer set search_path = public as $$
declare v_row public.prod_reglas_premios;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para editar las reglas de premios.';
  end if;
  if p_tipo not in ('meta', 'lugar', 'mejora') then raise exception 'Tipo de regla no válido.'; end if;
  if p_desde is null or p_bono is null or p_bono < 0 then raise exception 'Revisa "desde" y el bono (no puede ser negativo).'; end if;
  if exists (select 1 from public.prod_reglas_premios r
             where r.tipo = p_tipo and r.desde = p_desde and r.id is distinct from p_id) then
    raise exception 'Ya existe una regla % con desde %.', p_tipo, p_desde;
  end if;
  if p_id is null then
    insert into public.prod_reglas_premios (tipo, desde, bono, activa)
    values (p_tipo, p_desde, p_bono, coalesce(p_activa, true)) returning * into v_row;
  else
    update public.prod_reglas_premios
       set tipo = p_tipo, desde = p_desde, bono = p_bono, activa = coalesce(p_activa, activa)
     where id = p_id returning * into v_row;
    if v_row.id is null then raise exception 'La regla no existe.'; end if;
  end if;
  return v_row;
end; $$;
revoke execute on function public.prod_guardar_regla(uuid, text, numeric, numeric, boolean) from public;
grant execute on function public.prod_guardar_regla(uuid, text, numeric, numeric, boolean) to authenticated;

create or replace function public.prod_guardar_config(p_precio numeric, p_segundos numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para editar la configuración.';
  end if;
  if p_precio is null or p_precio <= 0 or p_segundos is null or p_segundos <= 0 then
    raise exception 'El precio por segundo y los segundos de jornada deben ser mayores a cero.';
  end if;
  insert into public.prod_config (clave, valor) values ('precio_por_segundo', p_precio), ('segundos_jornada', p_segundos)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  return jsonb_build_object('precio_por_segundo', p_precio, 'segundos_jornada', p_segundos);
end; $$;
revoke execute on function public.prod_guardar_config(numeric, numeric) from public;
grant execute on function public.prod_guardar_config(numeric, numeric) to authenticated;
