-- =====================================================================
-- V116 — Parte 1B: rol de consulta de tienda (solo lectura, tío de Alfredo)
-- =====================================================================
-- Aditivo: solo amplía el constraint de roles, 4 políticas SELECT de
-- Pedidos Colegio, y la función inv_puede_ver(). Ningún otro módulo
-- necesita cambio (Talleros, Catálogos y PDFs ya estaban abiertos a
-- cualquier rol autenticado). Esta app no tiene políticas de escritura
-- por cliente en ninguna tabla — todo pasa por RPCs security definer que
-- validan el rol internamente — así que consulta_tienda queda en solo
-- lectura automáticamente, sin necesidad de revocar nada.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas','contabilidad','admin_tienda','corte','bordado','sublimado','produccion',
  'terminado','admin_fabrica','admin_general','lectura','tienda','captura_produccion',
  'admin_fabrica_lectura','costura','consulta_tienda'
));

-- Pedidos Colegio: ampliar lectura a consulta_tienda (además de admin_general)
drop policy if exists "Solo admin_general lee colegios" on public.colegios;
create policy "Lectura colegios" on public.colegios
  for select to authenticated using (coalesce(public.current_user_role(), '') in ('admin_general', 'consulta_tienda'));

drop policy if exists "Solo admin_general lee colegio_pedidos" on public.colegio_pedidos;
create policy "Lectura colegio_pedidos" on public.colegio_pedidos
  for select to authenticated using (coalesce(public.current_user_role(), '') in ('admin_general', 'consulta_tienda'));

drop policy if exists "Solo admin_general lee colegio_pedido_articulos" on public.colegio_pedido_articulos;
create policy "Lectura colegio_pedido_articulos" on public.colegio_pedido_articulos
  for select to authenticated using (coalesce(public.current_user_role(), '') in ('admin_general', 'consulta_tienda'));

drop policy if exists "Solo admin_general lee colegio_pedido_abonos" on public.colegio_pedido_abonos;
create policy "Lectura colegio_pedido_abonos" on public.colegio_pedido_abonos
  for select to authenticated using (coalesce(public.current_user_role(), '') in ('admin_general', 'consulta_tienda'));

-- Inventario de tienda: consulta_tienda entra en modo ver (nunca mover/editar)
create or replace function public.inv_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in
    ('admin_general', 'admin_tienda', 'admin_fabrica', 'ventas', 'tienda', 'consulta_tienda')
$$;
-- inv_puede_mover() e inv_puede_editar() NO cambian — consulta_tienda nunca entra ahí.
