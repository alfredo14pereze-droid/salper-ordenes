-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V10: modo invitado — lectura pública, sin poder modificar nada.
--
-- Quien entra al link SIN iniciar sesión ahora puede VER todo (órdenes,
-- calendario, anuncios, pendientes, fotos) tal como lo ve alguien
-- autenticado. Ningún dato de escritura cambia: las 17 funciones RPC de
-- schema_v9_security_fix.sql siguen exigiendo authenticated, así que un
-- invitado no puede crear, editar, cancelar ni borrar nada — solo mirar.
--
-- Requiere haber corrido los esquemas anteriores (schema.sql...v9).
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GRANT SELECT a anon (las tablas creadas por SQL Editor no lo traen
-- automático — mismo gotcha de siempre en este proyecto).
-- ---------------------------------------------------------------------
grant usage on schema public to anon;
grant select on public.orders to anon;
grant select on public.order_status_history to anon;
grant select on public.order_types to anon;
grant select on public.announcements to anon;
grant select on public.pending_items to anon;

-- ---------------------------------------------------------------------
-- Políticas de lectura: se reemplazan las de "to authenticated" por
-- "to anon, authenticated" (mismo using(true) de siempre — la lectura
-- nunca tuvo reglas por fila, solo por si hay sesión o no).
-- ---------------------------------------------------------------------
drop policy if exists "Usuarios con sesión ven las órdenes" on public.orders;
create policy "Lectura pública de órdenes" on public.orders
  for select to anon, authenticated using (true);

drop policy if exists "Usuarios con sesión ven el historial" on public.order_status_history;
create policy "Lectura pública del historial" on public.order_status_history
  for select to anon, authenticated using (true);

drop policy if exists "Usuarios con sesión ven los tipos de orden" on public.order_types;
create policy "Lectura pública de tipos de orden" on public.order_types
  for select to anon, authenticated using (true);

drop policy if exists "Usuarios con sesión ven los anuncios" on public.announcements;
create policy "Lectura pública de anuncios" on public.announcements
  for select to anon, authenticated using (true);

drop policy if exists "Usuarios con sesión ven los pendientes" on public.pending_items;
create policy "Lectura pública de pendientes" on public.pending_items
  for select to anon, authenticated using (true);

-- order_templates y profiles NO se abren: las plantillas solo sirven
-- para crear órdenes (acción que ya requiere sesión) y profiles no hace
-- falta para nada de lo que ve un invitado.
