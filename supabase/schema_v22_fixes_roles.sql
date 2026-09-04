-- ============================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V22: dos ajustes sobre V21 (roles), pedidos por el usuario
-- después de revisar el comportamiento real en producción.
--
-- 1) Bug encontrado: la policy RLS "Admin ve todos los perfiles" sobre
--    public.profiles seguía comparando contra el rol viejo ('admin'), que
--    ya no existe desde V21 — se me pasó al escribir esa migración porque
--    solo revisé los cuerpos de las 15 funciones RPC, no las policies de
--    tabla. Efecto: admin_general dejó de poder ver la lista completa de
--    usuarios en /usuarios (solo veía su propio perfil, vía la otra
--    policy "Ver el propio perfil"). Corregido para comparar contra
--    'admin_general'.
--
-- 2) Ajuste de permisos pedido por el usuario: ventas SÍ debe poder subir
--    cotización y orden de compra (antes solo contabilidad/admin_tienda/
--    admin_general) — la factura se queda exclusiva de contabilidad. Se
--    reescribe set_order_document con el mismo cuerpo de V21 más esta
--    excepción.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Fix de la policy RLS de profiles (rol viejo -> admin_general)
-- --------------------------------------------------------------------------
drop policy if exists "Admin ve todos los perfiles" on public.profiles;
create policy "Admin ve todos los perfiles" on public.profiles
  for select using (current_user_role() = 'admin_general'::text);

-- --------------------------------------------------------------------------
-- 2) set_order_document: ventas gana cotización/orden de compra (nunca
--    factura), mismo tope de en_confirmacion que ya tenía contabilidad
--    para esos dos tipos.
-- --------------------------------------------------------------------------
create or replace function public.set_order_document(p_order_id uuid, p_kind text, p_path text)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
begin
  if coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar los documentos de esta orden.';
  end if;
  if p_kind not in ('cotizacion', 'orden_compra', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;
  -- ventas solo puede subir cotización/orden de compra, nunca factura
  -- (dominio de contabilidad) — ver SALPER_Contexto.md, sección Roles y permisos.
  if v_role = 'ventas' and p_kind = 'factura' then
    raise exception 'Solo contabilidad o administrador pueden subir la factura.';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_role in ('ventas', 'contabilidad') and p_kind <> 'factura' and v_current_status <> 'en_confirmacion' then
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
$function$;

-- --------------------------------------------------------------------------
-- 3) Gestión completa de usuarios para admin_general: columna espejo
--    suspended_at (la suspensión real vive en Supabase Auth vía
--    ban_duration, aplicada desde la Edge Function admin-create-user con
--    la service role — esta columna es solo para mostrar "Suspendido" en
--    /usuarios sin tener que consultar auth.users desde el cliente).
-- --------------------------------------------------------------------------
alter table public.profiles add column if not exists suspended_at timestamptz;
