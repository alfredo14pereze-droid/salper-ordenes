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
--   * recompute_order_status: parche sobre la función viva; mismas reglas
--     (no toca órdenes canceladas, por confirmar ni entregadas; mismo
--     vocabulario de estados; el rol captura_produccion sigue sin poder
--     ejecutarla), solo cambia qué etapa elige. Las etapas sin estado propio
--     (impresión de sublimación, impresión por prenda) siguen sin cambiar
--     el resumen.
--   * Se recalcula el resumen de las órdenes activas con la regla nueva.
--
-- Rollback: volver a correr el bloque del parche cambiando viejo por nuevo
-- en los dos pares (y, si se quiere, recalcular); el trigger y la columna
-- pueden quedarse.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

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
-- Parche sobre la función VIVA (técnica de V131/V141), no una redefinición:
-- la viva es la de V23 más la línea de seguridad que le agregó V66b (el rol
-- captura_produccion no la puede ejecutar), y esa línea se conserva. Solo
-- cambian dos trozos: qué etapa se elige, y qué pasa cuando no hay ninguna
-- con estado propio. Si algo no cuadra, no se aplica nada.
do $$
declare
  v_viejo_a constant text := $q$    where order_id = p_order_id and estado in ('en_proceso', 'completado')
    order by orden_secuencia desc
    limit 1$q$;
  v_nuevo_a constant text := $q$    where order_id = p_order_id and estado in ('en_proceso', 'completado')
      -- V147: gana la etapa cuyo estado cambió más recientemente (antes: la de
      -- mayor secuencia). Solo cuentan las etapas con estado propio en
      -- orders.status; la secuencia desempata.
      and etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado')
    order by estado_cambiado_en desc nulls last, orden_secuencia desc
    limit 1$q$;
  v_viejo_b constant text := $q$  if v_best_etapa is null then
    v_new_status := 'confirmado';
  else$q$;
  v_nuevo_b constant text := $q$  if v_best_etapa is null then
    -- V147: si solo hay impresión en marcha (sin estado propio), el resumen se
    -- queda como está, igual que antes.
    if exists (select 1 from public.orden_etapas where order_id = p_order_id and estado in ('en_proceso', 'completado')) then
      v_new_status := v_current_status;
    else
      v_new_status := 'confirmado';
    end if;
  else$q$;
  r record;
  d text;
  nuevo text;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V147: se esperaba una sola copia de recompute_order_status, hay %. No se aplicó nada.', n;
  end if;
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'recompute_order_status' and p.pronamespace = 'public'::regnamespace;
  if position('V147' in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  if position(v_viejo_a in r.prosrc) = 0 or position(v_viejo_b in r.prosrc) = 0 then
    raise exception 'V147: recompute_order_status viva no tiene el texto esperado (md5 %). No se aplicó nada.', md5(r.prosrc);
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(replace(d, v_viejo_a, v_nuevo_a), v_viejo_b, v_nuevo_b);
  if position(v_viejo_a in nuevo) > 0 or position(v_viejo_b in nuevo) > 0
     or position(v_nuevo_a in nuevo) = 0 or position(v_nuevo_b in nuevo) = 0 then
    raise exception 'V147: no pude parchear recompute_order_status. No se aplicó nada.';
  end if;
  execute nuevo;
end $$;

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
