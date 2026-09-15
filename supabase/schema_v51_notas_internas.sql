-- =====================================================================
-- V51 — Notas internas de una orden (no visibles para el cliente)
-- =====================================================================
-- Pedido del usuario: "quiero que se puedan agregar notas a las
-- órdenes, pero que eso solo sea algo interno, que no se vea reflejado
-- en la orden del cliente".
--
-- orders.notas_internas: columna nueva, nullable, sin relación con
-- `description` (esa SÍ sale en ambos PDFs, ver OrderConfirmationPdf.jsx
-- — "Descripción / especificaciones" es del pedido en sí). Esta es
-- pura bitácora interna: nunca se referencia desde generateOrderPdf.jsx
-- ni desde OrderConfirmationPdf.jsx, así que no puede aparecer en el PDF
-- de cliente ni en el interno aunque alguien lo intente por accidente —
-- para que apareciera ahí, alguien tendría que agregarlo a mano en ese
-- componente.
--
-- Permiso amplio a propósito (canManageOrderNotes en permissions.js):
-- cualquier rol con sesión menos 'lectura' puede escribir una nota —
-- es comunicación interna entre áreas (ej. "cliente pidió que se
-- apure", "cuidado, cliente conflictivo"), no un dato de la orden que
-- necesite el mismo candado que editar cliente/tipo/fecha
-- (canEditOrder). 'lectura' sigue viendo las notas (ve todo el
-- sistema), solo no puede escribir.
--
-- Nota de seguridad ya existente en este proyecto (no es nueva de esta
-- migración): `anon` tiene SELECT de tabla completa sobre `orders`
-- desde schema_v10_guest_read.sql (modo invitado) — igual que
-- `total_orden` hoy, esta columna nueva técnicamente viaja en la
-- respuesta cruda de la API para un invitado, aunque la UI nunca la
-- muestre sin sesión (mismo patrón de protección que Documentos/Pagos
-- en OrderDetailPage.jsx: gateado por `{user && ...}`, nunca por rol de
-- base de datos). Si más adelante se necesita blindar esto a nivel de
-- columna, es un cambio aparte.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez.
-- =====================================================================

alter table public.orders
  add column if not exists notas_internas text;

create or replace function public.set_order_notas_internas(p_order_id uuid, p_notas text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') = '' or v_role = 'lectura' then
    raise exception 'No tienes permiso para editar las notas internas de esta orden.';
  end if;

  select eliminada_en into v_eliminada_en from public.orders where id = p_order_id;
  if not found then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;

  update public.orders
  set notas_internas = nullif(trim(coalesce(p_notas, '')), ''), updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.set_order_notas_internas(uuid, text) from public;
grant execute on function public.set_order_notas_internas(uuid, text) to authenticated;

-- Verificación (correr después y confirmar el resultado esperado):
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'set_order_notas_internas';
--   -- esperado: exactamente 1 fila.
--   select has_function_privilege('anon', 'public.set_order_notas_internas(uuid,text)', 'EXECUTE');
--   -- esperado: false
--   select has_function_privilege('authenticated', 'public.set_order_notas_internas(uuid,text)', 'EXECUTE');
--   -- esperado: true
