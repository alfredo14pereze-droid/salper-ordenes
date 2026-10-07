-- =====================================================================
-- V140 — Pausa del cronómetro por etapa
-- =====================================================================
-- Una estación (hoy bordado y terminado, desde su pantalla) puede PAUSAR
-- una etapa que está "en proceso" y reanudarla después. La pausa NO es un
-- estado nuevo: la etapa sigue en 'en_proceso'; solo deja de contar tiempo.
--
-- 1) Tres columnas nuevas en orden_etapas:
--    - pausada_en        momento en que se pausó (null = no está en pausa)
--    - tiempo_pausado_ms total de milisegundos en pausa (pausas ya cerradas)
--    - pausas            las pausas ya cerradas, [{"inicio": ..., "fin": ...}]
--      (hacen falta para descontar bien el tiempo HÁBIL: una pausa de toda
--      la noche no debe restar 16 horas).
-- 2) pausar_orden_etapa(orden, etapa, pausar): mismo permiso que
--    update_orden_etapa (el rol dueño de la etapa, o administradores).
-- 3) Trigger BEFORE UPDATE: si una etapa en pausa se termina, la pausa se
--    cierra sola; si un administrador la regresa a "pendiente", las pausas
--    se borran (se vuelve a medir desde cero). Cubre a cualquier función
--    que escriba la tabla, sin tocar update_orden_etapa.
--
-- Aditivo: tres columnas con default, una función nueva y un trigger nuevo.
-- No se modifica ninguna función existente ni el valor de ninguna columna
-- existente. No depende de V139 (tiempos) ni choca con él.
--
-- Rollback:
--   drop trigger if exists orden_etapas_pausa_guard_trg on public.orden_etapas;
--   drop function if exists public.orden_etapas_pausa_guard();
--   drop function if exists public.pausar_orden_etapa(uuid, text, boolean);
--   alter table public.orden_etapas
--     drop column if exists pausada_en,
--     drop column if exists tiempo_pausado_ms,
--     drop column if exists pausas;
-- =====================================================================

-- 0) Guarda de deriva.
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'orden_etapas'
        and column_name in ('id', 'order_id', 'etapa', 'estado', 'iniciado_en', 'completado_en', 'updated_at')) <> 7 then
    raise exception 'V140: orden_etapas no tiene las columnas esperadas. No se aplicó nada.';
  end if;
  if to_regprocedure('public.current_user_role()') is null then
    raise exception 'V140: falta current_user_role(). No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Columnas
-- ---------------------------------------------------------------------
alter table public.orden_etapas
  add column if not exists pausada_en timestamptz,
  add column if not exists tiempo_pausado_ms bigint not null default 0,
  add column if not exists pausas jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 2) Trigger: terminar cierra la pausa; volver a pendiente la borra
-- ---------------------------------------------------------------------
create or replace function public.orden_etapas_pausa_guard() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.estado = 'pendiente' then
    new.pausada_en := null;
    new.tiempo_pausado_ms := 0;
    new.pausas := '[]'::jsonb;
  elsif new.estado = 'completado' and new.pausada_en is not null then
    new.pausas := coalesce(new.pausas, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('inicio', new.pausada_en, 'fin', now()));
    new.tiempo_pausado_ms := coalesce(new.tiempo_pausado_ms, 0)
      + greatest(0, round(extract(epoch from (now() - new.pausada_en)) * 1000))::bigint;
    new.pausada_en := null;
  end if;
  return new;
end;
$function$;
revoke execute on function public.orden_etapas_pausa_guard() from public, anon, authenticated;

drop trigger if exists orden_etapas_pausa_guard_trg on public.orden_etapas;
create trigger orden_etapas_pausa_guard_trg
  before update on public.orden_etapas
  for each row execute function public.orden_etapas_pausa_guard();

-- ---------------------------------------------------------------------
-- 3) Pausar / reanudar
-- ---------------------------------------------------------------------
create or replace function public.pausar_orden_etapa(
  p_order_id uuid, p_etapa text, p_pausar boolean
) returns public.orden_etapas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.current_user_role(), '');
  v_row public.orden_etapas;
  v_permitido boolean;
begin
  if p_pausar is null then
    raise exception 'Falta indicar si se pausa o se reanuda.';
  end if;

  -- Misma regla de dueño que update_orden_etapa (V120/V131/V134).
  v_permitido := v_role in ('admin_fabrica', 'admin_general')
    or case p_etapa
         when 'impresion' then v_role = 'sublimado'
         when 'impresion_prenda' then v_role = 'terminado'
         when 'produccion' then v_role in ('produccion', 'costura')
         else v_role = p_etapa
       end;
  if not v_permitido then
    raise exception 'No tienes permiso para modificar la etapa %.', p_etapa;
  end if;

  select * into v_row from public.orden_etapas
  where order_id = p_order_id and etapa = p_etapa
  for update;
  if v_row.id is null then
    raise exception 'La orden % no tiene la etapa % en su flujo.', p_order_id, p_etapa;
  end if;
  if v_row.estado <> 'en_proceso' then
    raise exception 'Solo se puede pausar o reanudar una etapa que está en proceso.';
  end if;

  -- Pausar lo ya pausado, o reanudar lo que no está en pausa: no cambia nada.
  if p_pausar = (v_row.pausada_en is not null) then
    return v_row;
  end if;

  if p_pausar then
    update public.orden_etapas
    set pausada_en = now(), updated_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    update public.orden_etapas
    set pausas = coalesce(pausas, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('inicio', pausada_en, 'fin', now())),
        tiempo_pausado_ms = coalesce(tiempo_pausado_ms, 0)
          + greatest(0, round(extract(epoch from (now() - pausada_en)) * 1000))::bigint,
        pausada_en = null,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$function$;
revoke execute on function public.pausar_orden_etapa(uuid, text, boolean) from public, anon;
grant execute on function public.pausar_orden_etapa(uuid, text, boolean) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select count(*) from information_schema.columns where table_name = 'orden_etapas'
--     and column_name in ('pausada_en', 'tiempo_pausado_ms', 'pausas');                    -- 3
--   select tgname, tgenabled from pg_trigger where tgname = 'orden_etapas_pausa_guard_trg';  -- 1 fila, 'O'
--   select has_function_privilege('anon', 'public.pausar_orden_etapa(uuid, text, boolean)', 'execute');           -- false
--   select has_function_privilege('authenticated', 'public.pausar_orden_etapa(uuid, text, boolean)', 'execute');  -- true
--   select count(*) from public.orden_etapas where pausada_en is not null or tiempo_pausado_ms <> 0 or pausas <> '[]';  -- 0
-- =====================================================================
