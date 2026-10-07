-- =====================================================================
-- V139 — Tiempos reales por etapa: operario fijo, candado al terminar y
--        corrección con registro
-- =====================================================================
-- Los tiempos de cada etapa YA se guardan en orden_etapas desde V23
-- (iniciado_en, completado_en, responsable_id): los llenan los botones de
-- cada estación a través de update_orden_etapa. Aquí NO se agregan columnas
-- de tiempo; solo se cuida que esos datos sirvan para medir:
--
-- 1) Trigger BEFORE UPDATE en orden_etapas (cubre a cualquier función que
--    escriba la tabla, sin tocar update_orden_etapa):
--    - Una etapa terminada ya no la puede reabrir su estación; solo
--      admin_fabrica / admin_general (como hoy desde el detalle de la orden).
--    - Volver a marcar "terminada" una etapa terminada ya no le cambia la
--      hora de fin (hoy la pisaba con la hora del segundo toque).
--    - El operario queda fijo: es la cuenta que INICIÓ la etapa. Si otra
--      cuenta la termina, responsable_id no cambia.
--    - Si un administrador regresa la etapa a "pendiente", se limpian inicio,
--      fin y operario: se vuelve a medir desde cero.
-- 2) orden_etapas_correcciones: registro de cada corrección manual de horas.
-- 3) corregir_tiempos_etapa(orden, etapa, inicio, fin, motivo): solo
--    admin_general, solo en etapas terminadas, siempre deja registro.
--
-- Aditivo: una tabla nueva, dos funciones nuevas y un trigger nuevo. No se
-- modifica ninguna fila existente ni ninguna función existente.
--
-- Rollback:
--   drop trigger if exists orden_etapas_tiempos_guard_trg on public.orden_etapas;
--   drop function if exists public.orden_etapas_tiempos_guard();
--   drop function if exists public.corregir_tiempos_etapa(uuid, text, timestamptz, timestamptz, text);
--   drop table if exists public.orden_etapas_correcciones;
-- =====================================================================

-- 0) Guarda de deriva: las columnas y el helper de rol que se usan abajo.
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'orden_etapas'
        and column_name in ('estado', 'iniciado_en', 'completado_en', 'responsable_id')) <> 4 then
    raise exception 'V139: orden_etapas no tiene las columnas esperadas. No se aplicó nada.';
  end if;
  if to_regprocedure('public.current_user_role()') is null then
    raise exception 'V139: falta current_user_role(). No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Trigger de tiempos
-- ---------------------------------------------------------------------
create or replace function public.orden_etapas_tiempos_guard() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
begin
  -- corregir_tiempos_etapa ya validó todo y deja su propio registro.
  if coalesce(current_setting('salper.corrigiendo_tiempos', true), '') = '1' then
    return new;
  end if;

  if old.estado = 'completado' then
    if new.estado = 'completado' then
      -- Segundo toque de "terminada": las horas y el operario no se mueven.
      new.iniciado_en := old.iniciado_en;
      new.completado_en := old.completado_en;
      new.responsable_id := old.responsable_id;
      return new;
    end if;
    -- Reabrir: solo administradores. Sin sesión (SQL Editor) se permite.
    if auth.uid() is not null then
      v_role := coalesce(public.current_user_role(), '');
      if v_role not in ('admin_fabrica', 'admin_general') then
        raise exception 'Esta etapa ya se terminó y sus tiempos quedaron guardados. Si hay un error, pídele a un administrador que la corrija.';
      end if;
    end if;
  end if;

  if new.estado = 'pendiente' then
    new.iniciado_en := null;
    new.completado_en := null;
    new.responsable_id := null;
  elsif old.iniciado_en is not null and old.responsable_id is not null then
    new.responsable_id := old.responsable_id;
  end if;

  return new;
end;
$function$;
revoke execute on function public.orden_etapas_tiempos_guard() from public, anon, authenticated;

drop trigger if exists orden_etapas_tiempos_guard_trg on public.orden_etapas;
create trigger orden_etapas_tiempos_guard_trg
  before update on public.orden_etapas
  for each row execute function public.orden_etapas_tiempos_guard();

-- ---------------------------------------------------------------------
-- 2) Registro de correcciones
-- ---------------------------------------------------------------------
create table if not exists public.orden_etapas_correcciones (
  id uuid primary key default gen_random_uuid(),
  orden_etapa_id uuid not null references public.orden_etapas(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  etapa text not null,
  iniciado_antes timestamptz,
  completado_antes timestamptz,
  iniciado_despues timestamptz not null,
  completado_despues timestamptz not null,
  motivo text not null check (btrim(motivo) <> ''),
  corregido_por uuid references auth.users(id) on delete set null,
  corregido_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists orden_etapas_correcciones_order_idx on public.orden_etapas_correcciones (order_id);

alter table public.orden_etapas_correcciones enable row level security;
drop policy if exists "Lectura admin orden_etapas_correcciones" on public.orden_etapas_correcciones;
create policy "Lectura admin orden_etapas_correcciones" on public.orden_etapas_correcciones
  for select to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica', 'admin_fabrica_lectura'));
revoke all on public.orden_etapas_correcciones from public, anon, authenticated;
grant select on public.orden_etapas_correcciones to authenticated;

-- ---------------------------------------------------------------------
-- 3) Corrección de horas (solo admin_general)
-- ---------------------------------------------------------------------
create or replace function public.corregir_tiempos_etapa(
  p_order_id uuid, p_etapa text, p_iniciado_en timestamptz, p_completado_en timestamptz, p_motivo text
) returns public.orden_etapas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old public.orden_etapas;
  v_row public.orden_etapas;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede corregir los tiempos de una etapa.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  if p_iniciado_en is null or p_completado_en is null then
    raise exception 'Faltan la hora de inicio y la de fin.';
  end if;
  if p_completado_en <= p_iniciado_en then
    raise exception 'La hora de fin debe ser posterior a la de inicio.';
  end if;
  if p_completado_en > now() + interval '1 minute' then
    raise exception 'La hora de fin no puede estar en el futuro.';
  end if;

  select * into v_old from public.orden_etapas
  where order_id = p_order_id and etapa = p_etapa
  for update;
  if v_old.id is null then
    raise exception 'La orden no tiene la etapa %.', p_etapa;
  end if;
  if v_old.estado <> 'completado' then
    raise exception 'Solo se corrigen los tiempos de una etapa ya terminada.';
  end if;

  perform set_config('salper.corrigiendo_tiempos', '1', true);
  update public.orden_etapas
  set iniciado_en = p_iniciado_en,
      completado_en = p_completado_en,
      updated_at = now()
  where id = v_old.id
  returning * into v_row;
  perform set_config('salper.corrigiendo_tiempos', '', true);

  insert into public.orden_etapas_correcciones (
    orden_etapa_id, order_id, etapa, iniciado_antes, completado_antes,
    iniciado_despues, completado_despues, motivo, corregido_por, corregido_por_nombre
  ) values (
    v_old.id, v_old.order_id, v_old.etapa, v_old.iniciado_en, v_old.completado_en,
    p_iniciado_en, p_completado_en, btrim(p_motivo), auth.uid(),
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid())
  );

  return v_row;
end;
$function$;
revoke execute on function public.corregir_tiempos_etapa(uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.corregir_tiempos_etapa(uuid, text, timestamptz, timestamptz, text) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select tgname, tgenabled from pg_trigger where tgname = 'orden_etapas_tiempos_guard_trg';   -- 1 fila, 'O'
--   select count(*) from pg_proc where proname in ('orden_etapas_tiempos_guard', 'corregir_tiempos_etapa');  -- 2
--   select has_function_privilege('anon', 'public.corregir_tiempos_etapa(uuid, text, timestamptz, timestamptz, text)', 'execute');  -- false
--   select count(*) from public.orden_etapas_correcciones;   -- 0
-- =====================================================================
