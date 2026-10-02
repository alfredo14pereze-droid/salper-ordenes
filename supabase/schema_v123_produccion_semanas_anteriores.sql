-- =====================================================================
-- V123 — Producción: captura/edición en semanas ya cerradas (en_revision),
-- con un interruptor para que Juanis (captura_produccion) pueda usarlo
-- solo mientras haga falta.
-- =====================================================================
-- Pedido del usuario: tuvieron un problema capturando y la semana cerró;
-- necesitan volver a la semana anterior y editar/borrar/capturar ahí,
-- incluida Juanis, pero solo de forma temporal ("cuando terminemos esta
-- semana, le quitamos el acceso").
--
-- Reglas que NO cambian:
--   * Una semana 'aprobada' sigue congelada para todos (para tocarla hay
--     que reabrirla en Revisión producción, solo admin_general).
--   * admin_general / admin_fabrica ya podían editar semanas en_revision
--     (prod_puede_ver_montos); ahora además el frontend les deja llegar
--     a ellas con el selector de semana.
--
-- Lo nuevo:
--   * prod_config 'captura_semanas_anteriores' (1 = activo, 0 = apagado).
--     Se siembra en 1 (el usuario lo pidió "ahorita"). Se apaga desde
--     Admin producción > Configuración, sin tocar SQL.
--   * prod_captura_semanas_anteriores(): true solo para captura_produccion
--     con el interruptor prendido.
--   * prod_puede_editar_semana(): captura_produccion con el interruptor
--     prendido puede editar/borrar en semanas abierta o en_revision
--     (nunca aprobada). Con el interruptor apagado, todo queda exactamente
--     como estaba (misma regla de V69).
--   * prod_capturar_registro(): misma regla para crear registros nuevos
--     en una semana en_revision (resto del cuerpo = V107, sin cambios).
--   * prod_set_captura_semanas_anteriores(boolean): prender/apagar el
--     interruptor, solo admin_general / admin_fabrica.
-- Todo con las mismas firmas ya existentes (create or replace, sin
-- duplicar funciones) salvo las dos nuevas.
-- =====================================================================

insert into public.prod_config (clave, valor)
values ('captura_semanas_anteriores', 1)
on conflict (clave) do nothing;

create or replace function public.prod_captura_semanas_anteriores()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') = 'captura_produccion'
     and coalesce((select c.valor from public.prod_config c where c.clave = 'captura_semanas_anteriores'), 0) = 1
$$;
revoke execute on function public.prod_captura_semanas_anteriores() from public;
grant execute on function public.prod_captura_semanas_anteriores() to authenticated;

create or replace function public.prod_puede_editar_semana(p_estado text, p_fin date)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_estado = 'aprobada' then false
    when public.prod_puede_ver_montos() then true
    when public.prod_captura_semanas_anteriores() and p_estado in ('abierta', 'en_revision') then true
    else p_estado = 'abierta' and p_fin >= (now() at time zone 'America/Monterrey')::date
  end
$$;
revoke execute on function public.prod_puede_editar_semana(text, date) from public;
grant execute on function public.prod_puede_editar_semana(text, date) to authenticated;

create or replace function public.prod_set_captura_semanas_anteriores(p_activo boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'Solo administración puede cambiar este permiso.';
  end if;
  insert into public.prod_config (clave, valor)
  values ('captura_semanas_anteriores', case when coalesce(p_activo, false) then 1 else 0 end)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  return coalesce(p_activo, false);
end; $$;
revoke execute on function public.prod_set_captura_semanas_anteriores(boolean) from public;
grant execute on function public.prod_set_captura_semanas_anteriores(boolean) to authenticated;

-- prod_capturar_registro: idéntica a V107 salvo el candado de semana en_revision.
create or replace function public.prod_capturar_registro(
  p_fecha date, p_operadora_id uuid, p_folio integer, p_piezas integer, p_confirmado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_op public.prod_operaciones;
  v_sem_id uuid;
  v_sem_ini date;
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

  v_sem_ini := p_fecha - ((extract(dow from p_fecha)::int - 3 + 7) % 7);

  if (v_sem_ini + 1)::timestamp + interval '13 hours' > (now() at time zone 'America/Monterrey')
     and not public.prod_puede_ver_montos() then
    raise exception 'La captura de esa semana todavía no está abierta — se abre el % a la 1:00 PM, después de revisar la semana anterior.',
      to_char(v_sem_ini + 1, 'DD/MM');
  end if;

  select s.estado into v_estado from public.prod_semanas s where s.fecha_inicio = v_sem_ini;
  if v_estado is not null and v_estado <> 'abierta'
     and not (v_estado = 'en_revision' and (public.prod_puede_ver_montos() or public.prod_captura_semanas_anteriores())) then
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
