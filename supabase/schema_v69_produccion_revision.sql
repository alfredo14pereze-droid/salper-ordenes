-- V69 Produccion - FASE 4: cierre semanal, revision, aprobacion y reapertura.
--
-- CIERRE AUTOMATICO SIN cron: una semana (miercoles a martes) ya NO se puede capturar por quien solo
-- captura (captura_produccion) en cuanto termina el martes, a las 00:00 hora de Torreon
-- (equivale a "martes 23:59"). El estado 'en_revision' se materializa al abrir la pantalla de
-- revision (prod_cerrar_vencidas) o con el boton manual (prod_cerrar_semana).
-- Los admins (admin_general/admin_fabrica) pueden corregir registros mientras la semana NO este aprobada.
-- Aprobar exige estado 'en_revision'; reabrir una aprobada: solo admin_general, con motivo (queda en notas).
-- Reglas de captura: se re-crean prod_capturar/editar/borrar_registro (misma firma) con la regla nueva.

create or replace function public.prod_puede_editar_semana(p_estado text, p_fin date)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_estado = 'aprobada' then false
    when public.prod_puede_ver_montos() then true
    else p_estado = 'abierta' and p_fin >= (now() at time zone 'America/Monterrey')::date
  end
$$;
revoke execute on function public.prod_puede_editar_semana(text, date) from public;
grant execute on function public.prod_puede_editar_semana(text, date) to authenticated;

create or replace function public.prod_capturar_registro(
  p_fecha date, p_operadora_id uuid, p_folio integer, p_piezas integer, p_confirmado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_op public.prod_operaciones;
  v_sem_id uuid;
  v_estado text;
  v_ini date;
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

  v_ini := p_fecha - ((extract(dow from p_fecha)::int - 3 + 7) % 7);
  select s.estado into v_estado from public.prod_semanas s where s.fecha_inicio = v_ini;
  if not public.prod_puede_editar_semana(coalesce(v_estado, 'abierta'), v_ini + 6) then
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

create or replace function public.prod_editar_registro(
  p_id uuid, p_folio integer, p_piezas integer, p_confirmado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reg public.prod_registros;
  v_sem public.prod_semanas;
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
  select * into v_sem from public.prod_semanas s where s.id = v_reg.semana_id;
  if not public.prod_puede_editar_semana(v_sem.estado, v_sem.fecha_fin) then
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

create or replace function public.prod_borrar_registro(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_reg public.prod_registros; v_sem public.prod_semanas;
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  select * into v_reg from public.prod_registros r where r.id = p_id for update;
  if v_reg.id is null then raise exception 'Registro no encontrado.'; end if;
  select * into v_sem from public.prod_semanas s where s.id = v_reg.semana_id;
  if not public.prod_puede_editar_semana(v_sem.estado, v_sem.fecha_fin) then
    raise exception 'Esta semana ya no está abierta para captura.';
  end if;
  delete from public.prod_registros where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Interna (sin grant): pasa a 'en_revision' las semanas abiertas cuyo martes ya termino.
create or replace function public.prod_cerrar_vencidas()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.prod_semanas
     set estado = 'en_revision'
   where estado = 'abierta' and fecha_fin < (now() at time zone 'America/Monterrey')::date;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.prod_cerrar_vencidas() from public;

create or replace function public.prod_cerrar_semana(p_semana_id uuid)
returns public.prod_semanas
language plpgsql security definer set search_path = public as $$
declare v_sem public.prod_semanas;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para cerrar semanas de producción.';
  end if;
  update public.prod_semanas set estado = 'en_revision'
   where id = p_semana_id and estado = 'abierta'
  returning * into v_sem;
  if v_sem.id is null then
    raise exception 'La semana no existe o no está abierta.';
  end if;
  return v_sem;
end; $$;
revoke execute on function public.prod_cerrar_semana(uuid) from public;
grant execute on function public.prod_cerrar_semana(uuid) to authenticated;

create or replace function public.prod_listar_semanas(p_limit integer default 30)
returns table (
  id uuid, fecha_inicio date, fecha_fin date, estado text, importada boolean, notas text,
  aprobada_en timestamptz, total_valor numeric, total_premios numeric, personas integer
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  perform public.prod_cerrar_vencidas();
  return query
  select s.id, s.fecha_inicio, s.fecha_fin, s.estado, s.importada, s.notas, s.aprobada_en,
    case when s.importada or s.estado = 'aprobada'
         then (select coalesce(sum(v.valor_generado), 0) from public.prod_valor_semana v where v.semana_id = s.id)
         else (select coalesce(sum(r.valor), 0) from public.prod_registros r where r.semana_id = s.id) end,
    (select sum(p.total_premio) from public.prod_premios_semana p where p.semana_id = s.id),
    case when s.importada or s.estado = 'aprobada'
         then (select count(*)::integer from public.prod_valor_semana v where v.semana_id = s.id)
         else (select count(distinct r.operadora_id)::integer from public.prod_registros r where r.semana_id = s.id) end
  from public.prod_semanas s
  order by s.fecha_inicio desc
  limit greatest(p_limit, 1);
end; $$;
revoke execute on function public.prod_listar_semanas(integer) from public;
grant execute on function public.prod_listar_semanas(integer) to authenticated;

-- Detalle de revision: si la semana ya tiene snapshot (aprobada) se regresa el CONGELADO; si no, se calcula.
create or replace function public.prod_revision_semana(p_semana_id uuid)
returns table (
  operadora_id uuid, folio_empleado text, numero_operadora integer, nombre text,
  valor_generado numeric, valor_anterior numeric, lugar integer, mejora_pct numeric,
  bono_meta numeric, bono_lugar numeric, bono_mejora numeric, total_premio numeric,
  semana_anterior_id uuid, congelada boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  if exists (select 1 from public.prod_premios_semana p where p.semana_id = p_semana_id) then
    return query
    select p.operadora_id, o.folio_empleado, o.numero_operadora, o.nombre, p.valor_generado, p.valor_anterior,
           p.lugar, p.mejora_pct, p.bono_meta, p.bono_lugar, p.bono_mejora, p.total_premio, null::uuid, true
    from public.prod_premios_semana p
    join public.prod_operadoras o on o.id = p.operadora_id
    where p.semana_id = p_semana_id
    order by p.lugar, o.nombre;
  else
    return query
    select c.operadora_id, c.folio_empleado, c.numero_operadora, c.nombre, c.valor_generado, c.valor_anterior,
           c.lugar, c.mejora_pct, c.bono_meta, c.bono_lugar, c.bono_mejora, c.total_premio, c.semana_anterior_id, false
    from public.prod_calcular_premios(p_semana_id) c;
  end if;
end; $$;
revoke execute on function public.prod_revision_semana(uuid) from public;
grant execute on function public.prod_revision_semana(uuid) to authenticated;

-- Aprobar: ahora exige 'en_revision' (misma firma que V67; el resto igual).
create or replace function public.prod_aprobar_semana(p_semana_id uuid)
returns public.prod_semanas
language plpgsql security definer set search_path = public as $$
declare
  v_sem public.prod_semanas;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para aprobar semanas de producción.';
  end if;
  select * into v_sem from public.prod_semanas s where s.id = p_semana_id for update;
  if v_sem.id is null then
    raise exception 'Semana no encontrada.';
  end if;
  if v_sem.estado = 'aprobada' then
    raise exception 'Esta semana ya está aprobada.';
  end if;
  if v_sem.estado <> 'en_revision' then
    raise exception 'Primero pasa la semana a revisión (todavía está abierta).';
  end if;

  if not v_sem.importada then
    insert into public.prod_valor_semana (semana_id, operadora_id, valor_generado)
    select v_sem.id, o.id, coalesce(t.total, 0)
    from public.prod_operadoras o
    left join (
      select r.operadora_id, sum(r.valor) as total
      from public.prod_registros r where r.semana_id = v_sem.id group by r.operadora_id
    ) t on t.operadora_id = o.id
    where o.activo or t.total is not null
    on conflict (semana_id, operadora_id) do update set valor_generado = excluded.valor_generado;
  end if;

  delete from public.prod_premios_semana where semana_id = v_sem.id;
  insert into public.prod_premios_semana (
    semana_id, operadora_id, valor_generado, valor_anterior, lugar, mejora_pct,
    bono_meta, bono_lugar, bono_mejora, total_premio
  )
  select v_sem.id, c.operadora_id, c.valor_generado, c.valor_anterior, c.lugar, c.mejora_pct,
         c.bono_meta, c.bono_lugar, c.bono_mejora, c.total_premio
  from public.prod_calcular_premios(v_sem.id) c;

  update public.prod_semanas
     set estado = 'aprobada', aprobada_por = auth.uid(), aprobada_en = now()
   where id = v_sem.id
  returning * into v_sem;
  return v_sem;
end; $$;

-- Reabrir una semana aprobada: SOLO admin_general, con motivo (queda en notas). Vuelve a 'en_revision'.
create or replace function public.prod_reabrir_semana(p_semana_id uuid, p_motivo text)
returns public.prod_semanas
language plpgsql security definer set search_path = public as $$
declare v_sem public.prod_semanas; v_quien text;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede reabrir una semana aprobada.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo para reabrir la semana.';
  end if;
  select * into v_sem from public.prod_semanas s where s.id = p_semana_id for update;
  if v_sem.id is null then raise exception 'Semana no encontrada.'; end if;
  if v_sem.estado <> 'aprobada' then raise exception 'Esta semana no está aprobada.'; end if;
  if v_sem.importada then
    raise exception 'Las semanas importadas del Excel no se pueden reabrir (no tienen registros por operación).';
  end if;
  select coalesce(p.full_name, 'admin') into v_quien from public.profiles p where p.id = auth.uid();
  delete from public.prod_premios_semana where semana_id = v_sem.id;
  update public.prod_semanas
     set estado = 'en_revision', aprobada_por = null, aprobada_en = null,
         notas = coalesce(notas || E'\n', '') ||
                 format('Reabierta el %s por %s: %s', to_char(now() at time zone 'America/Monterrey', 'YYYY-MM-DD HH24:MI'), v_quien, btrim(p_motivo))
   where id = v_sem.id
  returning * into v_sem;
  return v_sem;
end; $$;
revoke execute on function public.prod_reabrir_semana(uuid, text) from public;
grant execute on function public.prod_reabrir_semana(uuid, text) to authenticated;
