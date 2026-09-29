-- =====================================================================
-- V95 — Inventario: se abre por rol de verdad (ya no es "modo prueba")
-- =====================================================================
-- V89 dejó el módulo oculto salvo para una cuenta (inv_acceso_beta +
-- inv_tiene_acceso()) mientras se probaba. Pedido explícito del usuario:
-- ya abrirlo de verdad —
--   Ver:    admin_general, admin_tienda, admin_fabrica, ventas, tienda.
--   Mover (movimientos, traspasos, conteos): admin_tienda, admin_general,
--     tienda (el rol básico de tienda ya puede "cambiar" el inventario).
--     admin_fabrica y ventas se quedan en solo lectura.
--   Editar (catálogos en Administración): admin_tienda, admin_general —
--     ya NO es un alias de "mover" (antes coincidían); `tienda` puede
--     mover existencias pero no tocar catálogos.
--
-- inv_acceso_beta / inv_tiene_acceso() se quedan en la base sin uso (no se
-- borran) — mismo criterio que con_problema en Pendientes (V86): dormido,
-- no eliminado, por si se necesita algo similar más adelante.
-- =====================================================================

create or replace function public.inv_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in
    ('admin_general', 'admin_tienda', 'admin_fabrica', 'ventas', 'tienda')
$$;

create or replace function public.inv_puede_mover() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('admin_tienda', 'admin_general', 'tienda')
$$;

create or replace function public.inv_puede_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('admin_tienda', 'admin_general')
$$;
