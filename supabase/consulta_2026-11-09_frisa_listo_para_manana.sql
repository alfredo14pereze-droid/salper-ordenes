-- Revisión antes de la primera entrega real (solo lee, no cambia nada).
select orden, revision, resultado from (
  select 1 as orden, 'Órdenes de surtido' as revision,
         string_agg(estado || ': ' || n, ' · ' order by estado) as resultado
  from (select estado, count(*) n from public.frisa_surtidos where estado <> 'cancelada' group by estado) x
union all
  select 2, 'Surtidas: claves donde la bodega NO alcanza para entregar',
         coalesce(string_agg(p.clave || ' (hay ' || p.stock_actual || ', piden ' || d.q || ')', ' · ' order by p.clave), 'ninguna, todo alcanza')
  from (select l.producto_id, sum(l.cantidad) q from public.frisa_surtido_lineas l
        join public.frisa_surtidos s on s.id = l.surtido_id where s.estado = 'surtida' group by 1) d
  join public.frisa_productos_niveles p on p.id = d.producto_id where d.q > p.stock_actual
union all
  select 3, 'Pendientes + surtidas: piezas que faltan en bodega',
         coalesce(sum(d.q - p.stock_actual)::text || ' pzas en ' || count(*) || ' claves', '0, todo alcanza')
  from (select l.producto_id, sum(l.cantidad) q from public.frisa_surtido_lineas l
        join public.frisa_surtidos s on s.id = l.surtido_id where s.estado in ('pendiente', 'surtida') group by 1) d
  join public.frisa_productos_niveles p on p.id = d.producto_id where d.q > p.stock_actual
union all
  select 4, 'Órdenes sin entregar con planta que no se reconoce',
         coalesce(string_agg(distinct s.planta, ' · '), 'ninguna')
  from public.frisa_surtidos s where s.estado in ('pendiente', 'surtida') and public.frisa_planta_de(s.planta) is null
union all
  select 5, 'Inventario bodega (piezas)', sum(stock_actual)::text from public.frisa_productos_niveles where activo
union all
  select 6, 'Inventario en plantas (piezas)', sum(cantidad)::text from public.frisa_pl_movimientos
union all
  select 7, 'Última remisión / factura en plantas',
         (select max(fecha)::text from public.frisa_pl_folios where tipo = 'remision') || ' / ' ||
         coalesce((select max(fecha)::text from public.frisa_pl_folios where tipo = 'factura'), 'ninguna')
union all
  select 8, 'Pedidos de compra por recibir',
         coalesce(string_agg('#' || folio || ' ' || proveedor, ' · ' order by folio), 'ninguno')
  from public.frisa_compras where estado = 'pedida'
union all
  select 9, 'Playera lisa: tallas que nunca se han contado',
         count(*) filter (where stock_actualizado_en is null) || ' de ' || count(*) from public.frisa_lisas
union all
  select 10, 'Personas por puesto (' || r.rol || ')',
         coalesce((select string_agg(coalesce(nullif(btrim(full_name), ''), '(sin nombre)'), ', ')
                   from public.profiles where role = r.rol and suspended_at is null), 'NADIE')
  from unnest(array['ventas', 'chofer', 'terminado', 'contabilidad', 'admin_fabrica', 'admin_tienda']) r(rol)
) t order by orden, revision;
