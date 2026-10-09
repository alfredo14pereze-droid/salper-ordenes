-- =====================================================================
-- V147 — El estado de la orden muestra el cambio de etapa MÁS RECIENTE
-- =====================================================================
-- orders.status es el resumen de un vistazo de las etapas (V23). Hasta hoy
-- mostraba la etapa de mayor secuencia que estuviera en proceso o
-- completada: si una orden se bordaba ANTES de coserse, al empezar la
-- costura el Dashboard seguía diciendo "Bordado", porque bordado va después
-- en la secuencia. Las órdenes no siempre son lineales.
--
-- Ahora el resumen toma la etapa cuyo estado cambió más recientemente
-- (la secuencia solo desempata).
--
-- Cambios:
--   * orden_etapas.estado_cambiado_en: cuándo cambió el estado de la etapa
--     por última vez. Lo llena un trigger; pausar, corregir horas o
--     capturar el reporte de impresión NO lo mueven (no cambian el estado).
--     En las filas existentes se rellena con la hora de fin (etapas
--     completadas) o de inicio (en proceso).
--   * recompute_order_status: misma función y mismas reglas (no toca
--     órdenes canceladas, por confirmar ni entregadas; mismo vocabulario de
--     estados), solo cambia qué etapa elige. Las etapas sin estado propio
--     (impresión de sublimación, impresión por prenda) siguen sin cambiar
--     el resumen.
--   * Se recalcula el resumen de las órdenes activas con la regla nueva.
--
-- Rollback: volver a correr la definición de recompute_order_status de
-- schema_v23_etapas_paralelas.sql (y, si se quiere, recalcular); el
-- trigger y la columna pueden quedarse.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guarda: la función viva es la de V23 (o ya es la de V147)
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_src text;
begin
  select count(*) into n from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V147: se esperaba una sola copia de recompute_order_status, hay %. No se aplicó nada.', n;
  end if;
  select prosrc into v_src from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if position('V147' in v_src) = 0 and md5(v_src) <> '2b14cc32df83c65d263646e8f91065dd' then
    raise exception 'V147: recompute_order_status viva no es la de V23 (md5 %, largo %). Revisar antes de aplicar. No se aplicó nada.', md5(v_src), length(v_src);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Cuándo cambió de estado cada etapa
-- ---------------------------------------------------------------------
alter table public.orden_etapas add column if not exists estado_cambiado_en timestamptz;

update public.orden_etapas
set estado_cambiado_en = case estado
  when 'completado' then coalesce(completado_en, updated_at)
  when 'en_proceso' then coalesce(iniciado_en, updated_at)
end
where estado_cambiado_en is null and estado in ('completado', 'en_proceso');

create or replace function public.orden_etapas_estado_cambiado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    new.estado_cambiado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists orden_etapas_estado_cambiado_trg on public.orden_etapas;
create trigger orden_etapas_estado_cambiado_trg
  before update of estado on public.orden_etapas
  for each row execute function public.orden_etapas_estado_cambiado();

-- ---------------------------------------------------------------------
-- 2) El resumen toma el cambio más reciente
-- ---------------------------------------------------------------------
create or replace function public.recompute_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_status text;
  v_cancelled_at timestamptz;
  v_best_etapa text;
  v_best_estado text;
  v_new_status text;
  r record;
begin
  select status, cancelled_at into v_current_status, v_cancelled_at
  from public.orders where id = p_order_id;

  if v_current_status is null then
    return;
  end if;
  if v_cancelled_at is not null or v_current_status in ('en_confirmacion', 'completado') then
    return;
  end if;

  -- V147: gana la etapa cuyo estado cambió más recientemente (antes: la de
  -- mayor secuencia). Solo cuentan las etapas con estado propio en
  -- orders.status; la secuencia desempata.
  v_best_etapa := null;
  for r in
    select etapa, estado
    from public.orden_etapas
    where order_id = p_order_id and estado in ('en_proceso', 'completado')
      and etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado')
    order by estado_cambiado_en desc nulls last, orden_secuencia desc
    limit 1
  loop
    v_best_etapa := r.etapa;
    v_best_estado := r.estado;
  end loop;

  if v_best_etapa is null then
    -- Nada con estado propio en marcha: si solo hay impresión (sin estado
    -- propio) el resumen se queda como está, igual que antes.
    if exists (select 1 from public.orden_etapas where order_id = p_order_id and estado in ('en_proceso', 'completado')) then
      v_new_status := v_current_status;
    else
      v_new_status := 'confirmado';
    end if;
  else
    v_new_status := case v_best_etapa
      when 'corte' then case when v_best_estado = 'completado' then 'cortado' else 'en_corte' end
      when 'sublimado' then case when v_best_estado = 'completado' then 'sublimado' else 'en_sublimado' end
      when 'produccion' then case when v_best_estado = 'completado' then 'produccion' else 'en_produccion' end
      when 'bordado' then case when v_best_estado = 'completado' then 'bordado' else 'en_bordado' end
      when 'terminado' then case when v_best_estado = 'completado' then 'terminado' else 'en_terminado' end
      else v_current_status
    end;
  end if;

  if v_new_status is distinct from v_current_status then
    update public.orders set status = v_new_status, updated_at = now() where id = p_order_id;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3) Recalcular las órdenes activas con la regla nueva
-- ---------------------------------------------------------------------
-- Solo cambian las que avanzaron fuera de secuencia. recompute_order_status
-- no toca canceladas, por confirmar ni entregadas; las eliminadas se saltan.
do $$
declare
  r record;
begin
  for r in select id from public.orders where eliminada_en is null and cancelled_at is null and status not in ('en_confirmacion', 'completado') loop
    perform public.recompute_order_status(r.id);
  end loop;
end $$;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select position('V147' in prosrc) > 0 from pg_proc
--   where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;   -- true
--   select count(*) from public.orden_etapas where estado in ('completado','en_proceso') and estado_cambiado_en is null;  -- 0
-- =====================================================================
