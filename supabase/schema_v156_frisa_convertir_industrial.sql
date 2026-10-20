-- =====================================================================
-- V156 — Las playeras de Frisa capturadas como Industrial pasan a Frisa
-- =====================================================================
-- Las playeras de Frisa se capturaban como "Industrial" antes de que
-- existiera el tipo Frisa (V155). Por eso nacieron con la plantilla de
-- industrial (corte → costura → terminado) y le aparecían a corte, aunque
-- las playeras no se cortan. Se pasan las 6 que no han empezado ninguna
-- etapa; IND-022/023/024/027 ya avanzaron y se quedan como están.
--
-- El producto se identifica por la prenda: con o sin reflejante, color y
-- manga (y "frente y espalda" coincide con los de 2 impresiones).
--
-- Solo datos, una vez. Cada orden conserva su folio, tallas, fecha,
-- folios anteriores y fotos; se vuelve orden Frisa con la secuencia de
-- su producto (igual que create_order_frisa):
--   IND-025  Playera sin reflejante, rojo, manga corta    → FR-PLA-RO-MC
--   IND-026  Playera con reflejante, marino, manga larga  → FR-PLA-AM-ML
--   IND-030  Playera con reflejante, marino, manga corta  → FR-PLA-AM-MC
--   IND-031  Playera con reflejante, marino, manga larga  → FR-PLA-AM-ML
--   IND-032  Playera sin reflejante, marino, manga larga  → FR-PLA-AM-SR-ML
--   IND-033  Playera con reflejante, verde, manga corta   → FR-PLA-VE-MC
--
-- Guardas: si alguna orden ya avanzó alguna etapa, cambió de tipo, se
-- canceló o se eliminó, no se aplica nada. Si ya son Frisa, no hace nada.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
begin;

do $$
declare
  v_map constant jsonb := '{"IND-025":"FR-PLA-RO-MC","IND-026":"FR-PLA-AM-ML","IND-030":"FR-PLA-AM-MC","IND-031":"FR-PLA-AM-ML","IND-032":"FR-PLA-AM-SR-ML","IND-033":"FR-PLA-VE-MC"}';
  v_folio text;
  v_codigo text;
  v_order public.orders;
  v_producto public.productos_frisa;
  v_procesos jsonb;
begin
  if (select count(*) from public.orders where order_number in (select jsonb_object_keys(v_map)) and order_type_key = 'frisa') = (select count(*) from jsonb_object_keys(v_map)) then
    raise notice 'V156: las órdenes ya son Frisa. No se hizo nada.';
    return;
  end if;

  -- Guardas, antes de tocar nada.
  for v_folio, v_codigo in select key, value from jsonb_each_text(v_map) loop
    select * into v_order from public.orders where order_number = v_folio;
    if v_order.id is null then raise exception 'V156: no encuentro %. No se aplicó nada.', v_folio; end if;
    if v_order.order_type_key <> 'industrial' or upper(btrim(v_order.client_name)) <> 'FRISA' then
      raise exception 'V156: % ya no es una orden industrial de FRISA (tipo %, cliente %). No se aplicó nada.', v_folio, v_order.order_type_key, v_order.client_name;
    end if;
    if v_order.cancelled_at is not null or v_order.eliminada_en is not null then
      raise exception 'V156: % está cancelada o eliminada. No se aplicó nada.', v_folio;
    end if;
    if exists (select 1 from public.orden_etapas where order_id = v_order.id and estado <> 'pendiente') then
      raise exception 'V156: % ya tiene etapas iniciadas. No se aplicó nada.', v_folio;
    end if;
    if not exists (select 1 from public.productos_frisa where codigo = v_codigo and activo) then
      raise exception 'V156: falta el producto % en el catálogo Frisa. No se aplicó nada.', v_codigo;
    end if;
  end loop;

  -- Este cambio de tipo lo hace la migración a propósito; el candado de
  -- V155 (que lo impide desde la app) se apaga solo dentro de esta transacción.
  alter table public.orders disable trigger orders_frisa_upd;

  for v_folio, v_codigo in select key, value from jsonb_each_text(v_map) loop
    select * into v_order from public.orders where order_number = v_folio;
    select * into v_producto from public.productos_frisa where codigo = v_codigo;

    select jsonb_agg(jsonb_build_object(
             'proceso', pp.proceso_codigo, 'nombre', c.nombre, 'etapa', c.etapa,
             'impresiones', pp.impresiones, 'notas', pp.notas, 'orden', pp.orden
           ) order by pp.orden)
      into v_procesos
    from public.producto_frisa_procesos pp
    join public.procesos_catalogo c on c.codigo = pp.proceso_codigo
    where pp.producto_id = v_producto.id;

    -- 1) Fuera las etapas de industrial (todas pendientes).
    delete from public.orden_etapas where order_id = v_order.id;

    -- 2) La orden pasa a Frisa con la copia de su producto.
    update public.orders set
      order_type_key = 'frisa',
      client_id = null,
      client_name = 'Frisa',
      total_orden = null,
      producto_frisa_id = v_producto.id,
      frisa_producto = jsonb_build_object(
        'id', v_producto.id, 'codigo', v_producto.codigo, 'nombre', v_producto.nombre,
        'origen', v_producto.origen, 'tallas_rango', v_producto.tallas_rango, 'color', v_producto.color,
        'tela', v_producto.tela, 'proveedor', v_producto.proveedor,
        'bordado_por_orden', false, 'procesos', v_procesos),
      items = (
        select coalesce(jsonb_agg(it || jsonb_build_object(
                 'garment', v_producto.nombre, 'producto_frisa_id', v_producto.id, 'lleva_bordado', false)
               order by n), '[]'::jsonb)
        from jsonb_array_elements(v_order.items) with ordinality as t(it, n)
      ),
      updated_at = now()
    where id = v_order.id;

    -- 3) Etapas = la secuencia del producto.
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    select v_order.id, pr->>'etapa', 'pendiente', (pr->>'orden')::int
    from jsonb_array_elements(v_procesos) pr;

    insert into public.order_status_history (order_id, status, notes, changed_by, changed_at)
    values (v_order.id, v_order.status, 'Pasó de Industrial a Frisa (' || v_codigo || ')', null, now());
  end loop;

  alter table public.orders enable trigger orders_frisa_upd;
end $$;

commit;

-- =====================================================================
-- Verificación (solo lectura):
--   select o.order_number, o.order_type_key, o.client_name, o.frisa_producto->>'codigo',
--          string_agg(e.etapa, ' > ' order by e.orden_secuencia)
--   from public.orders o join public.orden_etapas e on e.order_id = o.id
--   where o.order_number in ('IND-025','IND-026','IND-030','IND-031','IND-032','IND-033')
--   group by 1, 2, 3, 4 order by 1;
--   -- IND-025 frisa Frisa FR-PLA-RO-MC    impresion_prenda > terminado
--   -- IND-026 frisa Frisa FR-PLA-AM-ML    descosido > reflejante > impresion_prenda > terminado
--   -- IND-030 frisa Frisa FR-PLA-AM-MC    descosido > reflejante > impresion_prenda > terminado
--   -- IND-031 frisa Frisa FR-PLA-AM-ML    descosido > reflejante > impresion_prenda > terminado
--   -- IND-032 frisa Frisa FR-PLA-AM-SR-ML impresion_prenda > terminado
--   -- IND-033 frisa Frisa FR-PLA-VE-MC    descosido > reflejante > impresion_prenda > terminado
--   select tgenabled from pg_trigger where tgname = 'orders_frisa_upd';   -- O (activo)
-- =====================================================================
