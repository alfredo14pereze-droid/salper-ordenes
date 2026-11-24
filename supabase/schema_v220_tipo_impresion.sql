-- =====================================================================
-- V220 — Tipo de orden "Impresión" (folio IMP-001…)
-- =====================================================================
-- Igual que el tipo "Bordado" (prenda + tallas + foto y lugar de cada
-- impresión), pero sus etapas son:
--   impresión ('impresion_prenda', la hace terminado) 1 → terminado 2
-- Sin bordado, sin corte ni costura.
--
-- Cómo se crean las etapas de una orden de este tipo (sin cambiar
-- create_order): create_order copia la plantilla del tipo (impresion_prenda
-- y terminado), y el trigger de V134 (sync_etapa_impresion_prenda) ve que
-- las prendas llevan impresión (el frontend marca lleva_impresion en todas)
-- y no hace nada más (la etapa ya existe).
--
-- Además: order_type_guardar_plantilla (V136, "Editar etapas" en Catálogos)
-- ya no borra la fila 'impresion_prenda' de una plantilla, igual que no
-- borra 'bordado' (esas etapas no se eligen en esa pantalla).
--
-- Aditivo: 1 tipo de orden + su secuencia de folio + 2 filas de plantilla +
-- 1 cambio de una línea en una función interna. Se puede correr dos veces.
-- Rollback: update order_types set active = false where key = 'impresion';
-- =====================================================================
begin;

do $$
begin
  if exists (select 1 from public.order_types where key <> 'impresion' and upper(folio_prefix) = 'IMP') then
    raise exception 'V220: otro tipo de orden ya usa el prefijo de folio IMP. No se aplicó nada.';
  end if;
  if to_regprocedure('public.order_type_guardar_plantilla(text,text[])') is null then
    raise exception 'V220: no encontré order_type_guardar_plantilla (V136). No se aplicó nada.';
  end if;
  if to_regprocedure('public.sync_etapa_impresion_prenda()') is null then
    raise exception 'V220: no encontré sync_etapa_impresion_prenda (V134). No se aplicó nada.';
  end if;
end $$;

-- 1) El tipo (inactivo hasta tener plantilla: lo exige el trigger de V136).
insert into public.order_types (key, label, color, sort_order, folio_prefix, active)
select 'impresion', 'Impresión', '#db2777',
       (select coalesce(max(sort_order), 0) + 1 from public.order_types), 'IMP', false
where not exists (select 1 from public.order_types where key = 'impresion');

-- 2) Su secuencia de folio (assign_order_folio, security definer, usa
--    folio_seq_<key>; igual que maquila y frisa, sin permisos extra).
create sequence if not exists public.folio_seq_impresion start 1;

-- 3) Plantilla: impresión → terminado.
insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia) values
  ('impresion', 'impresion_prenda', 1),
  ('impresion', 'terminado', 2)
on conflict (order_type_key, etapa) do nothing;

update public.order_types set active = true where key = 'impresion' and not active;

-- 4) "Editar etapas" no debe borrar 'impresion_prenda' de una plantilla.
--    Se parchea la función viva (una línea) en lugar de reescribirla.
do $$
declare
  v_def text;
  v_old text := $q$where order_type_key = p_key and etapa <> 'bordado' and etapa <> all (v_etapas);$q$;
  v_new text := $q$where order_type_key = p_key and etapa <> 'bordado' and etapa <> 'impresion_prenda' and etapa <> all (v_etapas);$q$;
begin
  v_def := pg_get_functiondef('public.order_type_guardar_plantilla(text,text[])'::regprocedure);
  if position(v_new in v_def) > 0 then
    return; -- ya estaba parcheada
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'V220: order_type_guardar_plantilla no es la esperada (no encontré la línea a cambiar). No se aplicó nada.';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
revoke execute on function public.order_type_guardar_plantilla(text, text[]) from public, anon, authenticated;

commit;

-- Verificación (solo lectura):
--   select key, label, folio_prefix, active from public.order_types where key = 'impresion';
--     -- esperado: impresion | Impresión | IMP | true
--   select etapa, orden_secuencia from public.plantillas_etapas where order_type_key = 'impresion' order by orden_secuencia;
--     -- esperado: impresion_prenda 1, terminado 2
