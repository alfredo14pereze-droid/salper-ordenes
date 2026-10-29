-- =====================================================================
-- V167 — Sublimación: impresión por lote (2026-10-29)
-- =====================================================================
-- Fase 2 de la pantalla de Samuel. En "Pendientes de impresión" se eligen
-- varias órdenes y se marcan impresas juntas. El programa de impresión da
-- UN solo total para el trazo completo, así que el largo (m) y la tinta
-- (mL por color) se capturan una vez y se guardan en el lote, no en cada
-- orden.
--
-- Qué agrega:
--   · Tabla lotes_impresion: fecha, quién, órdenes incluidas (ids y folios),
--     largo total, tinta por color y total (lo suma la base), notas.
--   · orden_etapas.imp_lote_id: en la fila 'impresion' de cada orden, a qué
--     lote perteneció.
--   · imprimir_lote(...): valida las órdenes, guarda el lote y termina la
--     etapa 'impresion' de cada una por update_orden_etapa (el camino de
--     siempre: permisos, horas, operario y estado de la orden igual que hoy).
--   · corregir_lote_impresion(...): corrige los números de un lote ya
--     guardado (no cambia las órdenes).
--
-- Aditivo. NO redefine update_orden_etapa, reportar_impresion (V146) ni
-- autorizar_diseno (V165). El reporte por orden de V146 sigue funcionando
-- para las órdenes que se impriman solas.
--
-- Quién puede: los mismos roles que reportan impresión en V146 (sublimado,
-- admin_fabrica, admin_general).
--
-- Rollback (solo si no se han guardado lotes que importen):
--   drop function public.imprimir_lote(uuid[], numeric, numeric, numeric, numeric, numeric, text);
--   drop function public.corregir_lote_impresion(uuid, numeric, numeric, numeric, numeric, numeric, text);
--   alter table public.orden_etapas drop column imp_lote_id;
--   drop table public.lotes_impresion;
--   (las etapas que se marcaron impresas por lote siguen impresas)
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regprocedure('public.update_orden_etapa(uuid, text, text)') is null then
    raise exception 'V167: no encuentro update_orden_etapa(uuid, text, text). No se aplicó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'orders' and column_name = 'diseno_autorizado_en') then
    raise exception 'V167: falta V165 (orders.diseno_autorizado_en). No se aplicó nada.';
  end if;
end $$;

-- 1) Tabla del lote
create table if not exists public.lotes_impresion (
  id                uuid primary key default gen_random_uuid(),
  creado_en         timestamptz not null default now(),
  creado_por        uuid default auth.uid(),
  creado_por_nombre text,
  order_ids         uuid[] not null,
  folios            text[] not null,
  largo_m           numeric(10,3) not null check (largo_m > 0),
  tinta_azul_ml     numeric(10,3) not null check (tinta_azul_ml >= 0),
  tinta_magenta_ml  numeric(10,3) not null check (tinta_magenta_ml >= 0),
  tinta_amarillo_ml numeric(10,3) not null check (tinta_amarillo_ml >= 0),
  tinta_negro_ml    numeric(10,3) not null check (tinta_negro_ml >= 0),
  tinta_total_ml    numeric(12,3) generated always as (
    tinta_azul_ml + tinta_magenta_ml + tinta_amarillo_ml + tinta_negro_ml
  ) stored,
  notas             text,
  corregido_en      timestamptz,
  corregido_por_nombre text,
  check (cardinality(order_ids) >= 1 and cardinality(order_ids) = cardinality(folios))
);
create index if not exists lotes_impresion_creado_idx on public.lotes_impresion (creado_en desc);

alter table public.lotes_impresion enable row level security;
drop policy if exists "Lectura con sesión lotes_impresion" on public.lotes_impresion;
create policy "Lectura con sesión lotes_impresion" on public.lotes_impresion
  for select to authenticated using (true);
-- Sin políticas de escritura: todo pasa por las funciones de abajo.
revoke all on public.lotes_impresion from public, anon, authenticated;
grant select on public.lotes_impresion to authenticated;

-- 2) A qué lote perteneció la impresión de cada orden
alter table public.orden_etapas
  add column if not exists imp_lote_id uuid references public.lotes_impresion(id) on delete set null;
create index if not exists orden_etapas_imp_lote_idx on public.orden_etapas (imp_lote_id) where imp_lote_id is not null;

-- 3) Validación de los números (la misma que V146)
create or replace function public.lote_impresion_validar(
  p_largo_m numeric, p_azul_ml numeric, p_magenta_ml numeric, p_amarillo_ml numeric, p_negro_ml numeric
) returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_largo_m is null or p_largo_m <= 0 then
    raise exception 'Escribe el largo del trazo en metros.';
  end if;
  if p_azul_ml is null or p_magenta_ml is null or p_amarillo_ml is null or p_negro_ml is null then
    raise exception 'Escribe la tinta de los cuatro colores (pon 0 si un color no se usó).';
  end if;
  if p_azul_ml < 0 or p_magenta_ml < 0 or p_amarillo_ml < 0 or p_negro_ml < 0 then
    raise exception 'La tinta no puede ser negativa.';
  end if;
end;
$$;
revoke execute on function public.lote_impresion_validar(numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.lote_impresion_validar(numeric, numeric, numeric, numeric, numeric) to authenticated;

-- 4) Marcar un lote de órdenes como impresas
create or replace function public.imprimir_lote(
  p_order_ids uuid[],
  p_largo_m numeric,
  p_azul_ml numeric,
  p_magenta_ml numeric,
  p_amarillo_ml numeric,
  p_negro_ml numeric,
  p_notas text default null
) returns public.lotes_impresion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_folios text[] := '{}';
  v_orden public.orders;
  v_imp public.orden_etapas;
  v_lote public.lotes_impresion;
  v_id uuid;
begin
  if coalesce(public.current_user_role(), '') not in ('sublimado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo sublimado o un administrador de fábrica pueden reportar la impresión.';
  end if;

  -- Sin repetidos ni vacíos, en orden fijo (así dos lotes al mismo tiempo no se traban).
  select array_agg(distinct x order by x) into v_ids
    from unnest(coalesce(p_order_ids, '{}')) as x where x is not null;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Elige al menos una orden.';
  end if;

  perform public.lote_impresion_validar(p_largo_m, p_azul_ml, p_magenta_ml, p_amarillo_ml, p_negro_ml);

  foreach v_id in array v_ids loop
    select * into v_orden from public.orders where id = v_id for update;
    if v_orden.id is null then
      raise exception 'No encuentro una de las órdenes elegidas.';
    end if;
    if v_orden.order_type_key <> 'sublimacion' then
      raise exception 'La orden % no es de sublimación.', v_orden.order_number;
    end if;
    if v_orden.cancelled_at is not null or v_orden.eliminada_en is not null then
      raise exception 'La orden % está cancelada.', v_orden.order_number;
    end if;
    if v_orden.diseno_autorizado_en is null then
      raise exception 'La orden % todavía no tiene el diseño autorizado.', v_orden.order_number;
    end if;
    select * into v_imp from public.orden_etapas
      where order_id = v_id and etapa = 'impresion' for update;
    if v_imp.id is null then
      raise exception 'La orden % no tiene etapa de impresión.', v_orden.order_number;
    end if;
    if v_imp.estado = 'completado' then
      raise exception 'La orden % ya está impresa.', v_orden.order_number;
    end if;
    v_folios := v_folios || v_orden.order_number;
  end loop;

  insert into public.lotes_impresion (
    creado_por, creado_por_nombre, order_ids, folios,
    largo_m, tinta_azul_ml, tinta_magenta_ml, tinta_amarillo_ml, tinta_negro_ml, notas
  ) values (
    auth.uid(),
    (select nullif(trim(full_name), '') from public.profiles where id = auth.uid()),
    v_ids, v_folios,
    p_largo_m, p_azul_ml, p_magenta_ml, p_amarillo_ml, p_negro_ml,
    nullif(trim(coalesce(p_notas, '')), '')
  ) returning * into v_lote;

  foreach v_id in array v_ids loop
    update public.orden_etapas set imp_lote_id = v_lote.id
      where order_id = v_id and etapa = 'impresion';
    perform public.update_orden_etapa(v_id, 'impresion', 'completado');
  end loop;

  return v_lote;
end;
$$;
revoke execute on function public.imprimir_lote(uuid[], numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.imprimir_lote(uuid[], numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- 5) Corregir los números de un lote ya guardado
create or replace function public.corregir_lote_impresion(
  p_lote_id uuid,
  p_largo_m numeric,
  p_azul_ml numeric,
  p_magenta_ml numeric,
  p_amarillo_ml numeric,
  p_negro_ml numeric,
  p_notas text default null
) returns public.lotes_impresion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote public.lotes_impresion;
begin
  if coalesce(public.current_user_role(), '') not in ('sublimado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo sublimado o un administrador de fábrica pueden corregir un lote.';
  end if;
  perform public.lote_impresion_validar(p_largo_m, p_azul_ml, p_magenta_ml, p_amarillo_ml, p_negro_ml);

  update public.lotes_impresion set
    largo_m = p_largo_m,
    tinta_azul_ml = p_azul_ml,
    tinta_magenta_ml = p_magenta_ml,
    tinta_amarillo_ml = p_amarillo_ml,
    tinta_negro_ml = p_negro_ml,
    notas = nullif(trim(coalesce(p_notas, '')), ''),
    corregido_en = now(),
    corregido_por_nombre = (select nullif(trim(full_name), '') from public.profiles where id = auth.uid())
  where id = p_lote_id
  returning * into v_lote;
  if v_lote.id is null then
    raise exception 'No encuentro el lote.';
  end if;
  return v_lote;
end;
$$;
revoke execute on function public.corregir_lote_impresion(uuid, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.corregir_lote_impresion(uuid, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select count(*) from public.lotes_impresion;                       -- 0
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'orden_etapas' and column_name = 'imp_lote_id';  -- 1 fila
--   select has_function_privilege('anon', 'public.imprimir_lote(uuid[],numeric,numeric,numeric,numeric,numeric,text)', 'execute') as anon_puede,
--          has_function_privilege('authenticated', 'public.imprimir_lote(uuid[],numeric,numeric,numeric,numeric,numeric,text)', 'execute') as sesion_puede;
--   -- false | true
-- =====================================================================
