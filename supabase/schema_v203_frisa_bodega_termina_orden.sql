-- =====================================================================
-- V203 — Frisa: la orden de taller termina al subirla a bodega (2026-11-10)
-- =====================================================================
-- Pedido de Alfredo: "en las órdenes de Frisa ya no quiero que diga confirmar
-- entrega al cliente; cuando (Jaqui o Adriana) pongan que se subió a la bodega,
-- ahí se termina la orden".
--   · frisa_restock_ingresar (Subir a bodega), además de sumar a la bodega,
--     deja la orden como 'completado' (pasa a Órdenes pasadas) con una nota en
--     su historial. No pide precio ni factura: Frisa no lleva.
--   · Las órdenes de taller que YA se subieron a bodega y siguen abiertas
--     (FR-009, FR-010…) se cierran igual.
--   · La pantalla ya no muestra "Confirmar entrega al cliente" en órdenes Frisa.
-- Requiere V186. Se puede correr dos veces.
-- =====================================================================

create or replace function public.frisa_restock_cerrar_orden(p_order_id uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'completado', updated_at = now()
   where id = p_order_id and status <> 'completado' and cancelled_at is null and eliminada_en is null;
  if found then
    insert into public.order_status_history (order_id, status, notes, changed_by)
    values (p_order_id, 'completado', p_nota, auth.uid());
  end if;
end $$;
revoke execute on function public.frisa_restock_cerrar_orden(uuid, text) from public, anon, authenticated;

create or replace function public.frisa_restock_ingresar(p_order_id uuid, p_lineas jsonb, p_notas text default null)
returns public.frisa_restock_ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_r public.frisa_restock_ordenes;
  v_o public.orders;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_l jsonb;
  v_cant integer;
  v_clave text;
  v_total integer := 0;
begin
  if not public.tiene_permiso('fr.bodega') then
    raise exception 'No tienes permiso para subir a bodega.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id for update;
  if not found then raise exception 'La orden no está en el restock.'; end if;
  if v_r.ingresado_en is not null then raise exception 'Esa orden ya se subió a bodega.'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not public.frisa_orden_terminada(p_order_id) then
    raise exception 'La orden % todavía no está terminada.', v_o.order_number;
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'Faltan las cantidades.'; end if;
  if (select count(*) <> count(distinct e->>'producto_id') from jsonb_array_elements(p_lineas) e) then
    raise exception 'Hay una clave repetida.';
  end if;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := coalesce((v_l->>'cantidad')::int, 0);
    if v_cant < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
    select n.clave into v_clave
    from public.frisa_clave_producto cp join public.frisa_productos_niveles n on n.id = cp.producto_id
    where cp.producto_id = nullif(v_l->>'producto_id', '')::uuid and cp.producto_frisa_id = v_o.producto_frisa_id;
    if v_clave is null then raise exception 'Una de las claves no es del producto de la orden %.', v_o.order_number; end if;
    if v_cant > 0 then
      insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, order_id, referencia, notas, creado_por, creado_por_nombre)
      values ((v_l->>'producto_id')::uuid, v_clave, 'ingreso_bodega', v_cant, p_order_id,
              format('Orden de taller %s', v_o.order_number), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre);
      v_total := v_total + v_cant;
    end if;
  end loop;
  if v_total = 0 then raise exception 'No hay piezas para subir a bodega.'; end if;
  update public.frisa_restock_ordenes set ingresado_en = now(), ingresado_por_nombre = v_nombre,
         ingreso_notas = nullif(btrim(coalesce(p_notas, '')), '')
   where order_id = p_order_id returning * into v_r;
  -- V203: subir a bodega TERMINA la orden (no hay entrega al cliente).
  perform public.frisa_restock_cerrar_orden(p_order_id, format('Subida a bodega de Frisa: %s pzas', v_total));
  return v_r;
end $$;
revoke execute on function public.frisa_restock_ingresar(uuid, jsonb, text) from public, anon;
grant execute on function public.frisa_restock_ingresar(uuid, jsonb, text) to authenticated;

-- Las que ya se subieron a bodega y siguen abiertas: se terminan.
select public.frisa_restock_cerrar_orden(r.order_id, 'Subida a bodega de Frisa (se cerró al quitar "Confirmar entrega al cliente")')
from public.frisa_restock_ordenes r
join public.orders o on o.id = r.order_id
where r.ingresado_en is not null and o.status <> 'completado' and o.cancelled_at is null and o.eliminada_en is null;

-- Comprobación: órdenes subidas a bodega que siguen abiertas (debe ser 0) y cuántas quedaron terminadas.
select count(*) filter (where o.status <> 'completado' and o.cancelled_at is null and o.eliminada_en is null) as subidas_abiertas,
       count(*) filter (where o.status = 'completado') as subidas_terminadas
from public.frisa_restock_ordenes r join public.orders o on o.id = r.order_id
where r.ingresado_en is not null;
