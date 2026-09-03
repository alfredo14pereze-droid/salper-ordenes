-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V15: documento de Factura por orden
--
-- Mismo patrón que cotización/orden de compra (schema_v11_documentos.sql):
-- una columna nullable más, mismo bucket privado 'orden-documentos' (ya
-- existe, mismas policies — no hace falta tocar Storage), mismo RPC
-- set_order_document con un tercer p_kind.
--
-- Única diferencia a propósito: cotización/orden de compra solo se pueden
-- editar (para el rol tienda) mientras la orden sigue "en_confirmacion" —
-- son documentos de ANTES de producción. La factura, en cambio, casi
-- siempre se sube DESPUÉS (cuando ya se entregó o está por entregarse), así
-- que para 'factura' esa restricción de estado no aplica: tienda puede
-- subir/reemplazar la factura sin importar en qué estado esté la orden.
-- Admin sigue sin restricción en los tres casos, como ya era.
--
-- Aditivo: columna nullable, no rompe ninguna orden existente. Misma firma
-- de set_order_document (uuid, text, text) — no hace falta DROP FUNCTION,
-- solo CREATE OR REPLACE (ver gotcha de firmas de RPC en SALPER_Contexto.md).
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders
  add column if not exists factura_pdf_path text;

create or replace function public.set_order_document(
  p_order_id uuid,
  p_kind text,
  p_path text
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'No tienes permiso para editar los documentos de esta orden.';
  end if;
  if p_kind not in ('cotizacion', 'orden_compra', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  -- La factura se sube después de producción a propósito, así que no
  -- entra en esta restricción (solo cotización/orden de compra).
  if v_role = 'tienda' and p_kind <> 'factura' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus documentos.';
  end if;

  if p_kind = 'cotizacion' then
    update public.orders set cotizacion_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  elsif p_kind = 'orden_compra' then
    update public.orders set orden_compra_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  else
    update public.orders set factura_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  end if;

  return v_order;
end;
$$;

-- Misma firma que antes (uuid, text, text) — CREATE OR REPLACE conserva el
-- ACL ya existente (revoke de PUBLIC + grant a authenticated de
-- schema_v11_documentos.sql), pero se repite aquí explícito por si acaso,
-- sin costo.
revoke execute on function public.set_order_document(uuid, text, text) from public;
grant execute on function public.set_order_document(uuid, text, text) to authenticated;
