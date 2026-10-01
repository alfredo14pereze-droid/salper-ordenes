-- =====================================================================
-- V119 — Inventario: reporte global de movimientos (entradas/salidas/
-- ajustes/conteos), filtrable por fecha, sección, ubicación y tipo.
-- =====================================================================
-- Aditivo: RPC nuevo de solo lectura. inv_movimientos ya es legible por
-- cualquiera que pase inv_puede_ver() (ver schema_v89_inventario.sql) —
-- esto solo junta y filtra, no abre nada nuevo de permisos.
-- =====================================================================

create or replace function public.inv_reporte_movimientos(
  p_desde timestamptz, p_hasta timestamptz,
  p_seccion_id uuid default null, p_ubicacion_id uuid default null, p_tipo text default null
)
returns table (
  id uuid, creado_en timestamptz, tipo text, cantidad integer,
  prenda text, talla text, seccion text, ubicacion text, motivo text,
  nota text, usuario text, traspaso_folio text
)
language sql stable security definer set search_path = public as $$
  select m.id, m.creado_en, m.tipo, m.cantidad,
         a.prenda, t.nombre, s.nombre, u.nombre, mo.nombre,
         m.nota, m.creado_por_nombre, tr.folio
  from public.inv_movimientos m
  join public.inv_articulos a on a.id = m.articulo_id
  join public.inv_tallas t on t.id = a.talla_id
  join public.inv_secciones s on s.id = a.seccion_id
  join public.inv_ubicaciones u on u.id = m.ubicacion_id
  join public.inv_motivos mo on mo.id = m.motivo_id
  left join public.inv_traspasos tr on tr.id = m.traspaso_id
  where public.inv_puede_ver()
    and m.creado_en >= p_desde and m.creado_en < p_hasta
    and (p_seccion_id is null or a.seccion_id = p_seccion_id)
    and (p_ubicacion_id is null or m.ubicacion_id = p_ubicacion_id)
    and (p_tipo is null or m.tipo = p_tipo)
  order by m.creado_en desc
  limit 1000;
$$;
revoke execute on function public.inv_reporte_movimientos(timestamptz, timestamptz, uuid, uuid, text) from public;
grant execute on function public.inv_reporte_movimientos(timestamptz, timestamptz, uuid, uuid, text) to authenticated;
