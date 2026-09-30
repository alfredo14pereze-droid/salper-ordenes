-- =====================================================================
-- V113 — Pendientes: el rol básico 'tienda' también puede marcar la
-- entrega a cliente (antes solo ventas/admin_tienda/admin_general).
-- =====================================================================
-- Pedido explícito del usuario, revierte la exclusión deliberada de V94.
-- Aditivo: solo ensancha pf_puede_entregar(), ninguna tabla/estado nuevo.
-- =====================================================================

create or replace function public.pf_puede_entregar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('ventas', 'admin_tienda', 'admin_general', 'tienda');
$$;
