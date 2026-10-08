-- =====================================================================
-- V146 — Reporte de impresión de sublimación: largo del trazo y tinta
-- =====================================================================
-- Al marcar "Impresa" (etapa 'impresion', rol sublimado — Samuel), se
-- capturan el largo del trazo en metros y la tinta gastada en mL por
-- color (azul, magenta, amarillo y negro), tal como lo reporta el
-- programa de impresión (que la muestra en cc; 1 cc = 1 mL, es el mismo
-- número). El total de tinta lo suma la base.
--
-- Aditivo: columnas nuevas en orden_etapas (solo se llenan en la fila de
-- 'impresion') y una función nueva. NO se redefine update_orden_etapa: la
-- función nueva guarda los datos y la llama para terminar la etapa, así
-- que permisos, horas, operario y estado de la orden siguen igual.
--
-- Rollback: drop function public.reportar_impresion(uuid, numeric, numeric, numeric, numeric, numeric);
--           alter table public.orden_etapas drop column imp_tinta_total_ml, drop column imp_largo_m,
--             drop column imp_tinta_azul_ml, drop column imp_tinta_magenta_ml,
--             drop column imp_tinta_amarillo_ml, drop column imp_tinta_negro_ml;
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regprocedure('public.update_orden_etapa(uuid, text, text)') is null then
    raise exception 'V146: no encuentro update_orden_etapa(uuid, text, text). No se aplicó nada.';
  end if;
end $$;

alter table public.orden_etapas
  add column if not exists imp_largo_m numeric(10,3),
  add column if not exists imp_tinta_azul_ml numeric(10,3),
  add column if not exists imp_tinta_magenta_ml numeric(10,3),
  add column if not exists imp_tinta_amarillo_ml numeric(10,3),
  add column if not exists imp_tinta_negro_ml numeric(10,3);

alter table public.orden_etapas
  add column if not exists imp_tinta_total_ml numeric(12,3) generated always as (
    coalesce(imp_tinta_azul_ml, 0) + coalesce(imp_tinta_magenta_ml, 0)
    + coalesce(imp_tinta_amarillo_ml, 0) + coalesce(imp_tinta_negro_ml, 0)
  ) stored;

create or replace function public.reportar_impresion(
  p_order_id uuid,
  p_largo_m numeric,
  p_azul_ml numeric,
  p_magenta_ml numeric,
  p_amarillo_ml numeric,
  p_negro_ml numeric
) returns public.orden_etapas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa public.orden_etapas;
begin
  if coalesce(public.current_user_role(), '') not in ('sublimado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo sublimado o un administrador de fábrica pueden reportar la impresión.';
  end if;
  select * into v_etapa from public.orden_etapas where order_id = p_order_id and etapa = 'impresion';
  if v_etapa.id is null then
    raise exception 'Esta orden no tiene etapa de impresión.';
  end if;
  if p_largo_m is null or p_largo_m <= 0 then
    raise exception 'Escribe el largo del trazo en metros.';
  end if;
  if p_azul_ml is null or p_magenta_ml is null or p_amarillo_ml is null or p_negro_ml is null then
    raise exception 'Escribe la tinta de los cuatro colores (pon 0 si un color no se usó).';
  end if;
  if p_azul_ml < 0 or p_magenta_ml < 0 or p_amarillo_ml < 0 or p_negro_ml < 0 then
    raise exception 'La tinta no puede ser negativa.';
  end if;

  update public.orden_etapas set
    imp_largo_m = p_largo_m,
    imp_tinta_azul_ml = p_azul_ml,
    imp_tinta_magenta_ml = p_magenta_ml,
    imp_tinta_amarillo_ml = p_amarillo_ml,
    imp_tinta_negro_ml = p_negro_ml
  where id = v_etapa.id;

  -- Termina la etapa por el camino de siempre (si ya estaba terminada, esto
  -- fue solo una corrección de los datos).
  if v_etapa.estado <> 'completado' then
    perform public.update_orden_etapa(p_order_id, 'impresion', 'completado');
  end if;

  select * into v_etapa from public.orden_etapas where id = v_etapa.id;
  return v_etapa;
end;
$$;
revoke execute on function public.reportar_impresion(uuid, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.reportar_impresion(uuid, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'orden_etapas' and column_name like 'imp\_%' order by 1;
--   -- 6 filas
--   select has_function_privilege('anon', 'public.reportar_impresion(uuid,numeric,numeric,numeric,numeric,numeric)', 'execute') as anon_puede,
--          has_function_privilege('authenticated', 'public.reportar_impresion(uuid,numeric,numeric,numeric,numeric,numeric)', 'execute') as sesion_puede;
--   -- false | true
-- =====================================================================
