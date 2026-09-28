-- =====================================================================
-- V90 — Inventario: RPC de importación inicial (en vez de pegar un SQL de
-- 360KB con 465 bloques repetidos, se manda un solo arreglo JSON compacto).
-- Aditivo: función nueva, mismos candados que el resto del módulo
-- (inv_puede_editar()). Misma lógica idempotente del script Python: crea
-- sección/artículo si no existen; el movimiento de "Conteo inicial" solo se
-- inserta si todavía no hay ninguno con ese motivo (para no duplicar si se
-- corre dos veces).
-- =====================================================================
create or replace function public.inv_importar_inicial(p_filas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_motivo_id uuid; v_ubicacion_id uuid; v_ya_importado boolean;
  fila jsonb; v_seccion_id uuid; v_talla_id uuid; v_articulo_id uuid;
  v_articulos integer := 0; v_movimientos integer := 0; v_secciones integer;
begin
  if not public.inv_puede_editar() then
    raise exception 'No tienes permiso para importar inventario.';
  end if;
  select id into v_motivo_id from public.inv_motivos where nombre = 'Conteo inicial' and sistema;
  select id into v_ubicacion_id from public.inv_ubicaciones where nombre = 'Bodega (tercer piso)';
  select exists (select 1 from public.inv_movimientos where motivo_id = v_motivo_id) into v_ya_importado;

  for fila in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    insert into public.inv_secciones (nombre) values (fila->>'seccion') on conflict do nothing;
    select id into v_seccion_id from public.inv_secciones where lower(btrim(nombre)) = lower(btrim(fila->>'seccion'));

    select id into v_talla_id from public.inv_tallas where lower(btrim(nombre)) = lower(btrim(fila->>'talla'));
    if v_talla_id is null then
      raise exception 'Talla no encontrada en el catálogo: % (prenda "%", sección "%")', fila->>'talla', fila->>'prenda', fila->>'seccion';
    end if;

    insert into public.inv_articulos (seccion_id, prenda, talla_id)
    values (v_seccion_id, fila->>'prenda', v_talla_id)
    on conflict do nothing;
    select id into v_articulo_id from public.inv_articulos
     where seccion_id = v_seccion_id and lower(btrim(prenda)) = lower(btrim(fila->>'prenda')) and talla_id = v_talla_id;

    -- Piezas en 0 (el artículo existe en el Sheet pero hoy no tiene existencia):
    -- se crea el artículo igual, pero sin movimiento — un movimiento de 0 no
    -- pasa el check (cantidad <> 0) y tampoco cambiaría nada la existencia.
    if not v_ya_importado and (fila->>'piezas')::integer <> 0 then
      insert into public.inv_movimientos (articulo_id, ubicacion_id, tipo, cantidad, motivo_id, nota)
      values (v_articulo_id, v_ubicacion_id, 'conteo', (fila->>'piezas')::integer, v_motivo_id, 'Importación inicial desde Google Sheet');
      v_movimientos := v_movimientos + 1;
    end if;
    v_articulos := v_articulos + 1;
  end loop;

  select count(*) into v_secciones from public.inv_secciones;
  return jsonb_build_object(
    'ya_importado_antes', v_ya_importado, 'articulos_procesados', v_articulos,
    'movimientos_creados', v_movimientos, 'secciones_total', v_secciones
  );
end; $$;
revoke execute on function public.inv_importar_inicial(jsonb) from public;
grant execute on function public.inv_importar_inicial(jsonb) to authenticated;
