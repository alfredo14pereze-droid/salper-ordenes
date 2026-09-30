-- =====================================================================
-- V107 — Producción: la semana nueva no se puede capturar hasta el
-- jueves 1:00 PM (después de la revisión de la semana anterior)
-- =====================================================================
-- Confirmado con el usuario: aunque la semana real (miércoles a martes)
-- ya empezó, no se debe poder capturar producción de esa semana nueva
-- sino hasta el jueves 1:00 PM — dos horas después del cierre de las
-- 11 AM (V106), dando tiempo a que se revisen los premios de la semana
-- anterior a mediodía.
--
-- Esto es un candado DISTINTO al de "la semana ya cerró" (V104/V106,
-- basado en el estado de prod_semanas) — aquí se bloquea la APERTURA de
-- la semana nueva, sin importar su estado (que de hecho siempre nace
-- 'abierta'). admin_general/admin_fabrica pueden capturar de todos
-- modos, por si hace falta una excepción — mismo criterio que ya se usa
-- para semanas en_revision.
--
-- Solo se toca prod_capturar_registro (crear un registro nuevo) — editar
-- un registro que YA existe (prod_editar_registro) no necesita este
-- candado, ya pasó la apertura cuando se creó.
-- =====================================================================

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
