-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V29: elimina por completo el acceso sin sesión ("modo
-- invitado"). El usuario pidió explícitamente que nadie externo a
-- SALPER pueda entrar al sistema — antes de este cambio, cualquiera con
-- el link veía todo en modo lectura sin necesidad de cuenta (esto era a
-- propósito desde V10, incluso Control rápido se pidió expresamente
-- visible para invitados en la Parte 1 de Fase 2). Ahora se revierte:
-- solo entra quien tenga una cuenta dada de alta en Usuarios.
--
-- Confirmado en vivo antes de escribir esto (no se asumió nada): se
-- consultó pg_policies y information_schema.role_table_grants
-- filtrando por grantee = 'anon' — 11 tablas tenían SELECT real
-- expuesto a `anon`: announcements, clientes, orden_bordados,
-- orden_etapas, order_status_history, order_types, orders,
-- pending_items, plantillas_etapas, productos, telas. (profiles,
-- proveedores, anticipos, order_templates, chat_rate_limit NO tenían
-- SELECT para anon — solo privilegios de fondo de Supabase que no son
-- explotables vía su API — no se tocan aquí).
--
-- La corrección real, de una sola línea, es la primera de abajo:
-- revocar USAGE del schema public a anon deja a ese rol sin poder
-- resolver NINGÚN objeto de `public` sin importar qué GRANT/policy
-- tenga — es el candado maestro. Lo de después (recrear cada policy
-- como "to authenticated" y revocar el SELECT explícito) es defensa en
-- profundidad, para que si alguien vuelve a dar USAGE por error en el
-- futuro, cada tabla siga cerrada por su cuenta.
--
-- Aditivo/seguro: no borra ninguna fila, solo cierra permisos. El
-- frontend (ver App.jsx) deja de mostrar nada sin sesión de todos
-- modos, así que esto es el refuerzo del lado del servidor de ese mismo
-- cambio — igual que con cualquier otra regla de este proyecto, el
-- cliente nunca es la única línea de defensa.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- El candado maestro.
revoke usage on schema public from anon;

-- Defensa en profundidad: cada tabla que antes era de lectura pública
-- para invitados, ahora solo para "authenticated".
drop policy if exists "Lectura pública de anuncios" on public.announcements;
create policy "Lectura pública de anuncios" on public.announcements
  for select to authenticated using (true);

drop policy if exists "Lectura pública clientes" on public.clientes;
create policy "Lectura pública clientes" on public.clientes
  for select to authenticated using (true);

drop policy if exists "Lectura pública orden_bordados" on public.orden_bordados;
create policy "Lectura pública orden_bordados" on public.orden_bordados
  for select to authenticated using (true);

drop policy if exists "Lectura pública orden_etapas" on public.orden_etapas;
create policy "Lectura pública orden_etapas" on public.orden_etapas
  for select to authenticated using (true);

drop policy if exists "Lectura pública del historial" on public.order_status_history;
create policy "Lectura pública del historial" on public.order_status_history
  for select to authenticated using (true);

drop policy if exists "Lectura pública de tipos de orden" on public.order_types;
create policy "Lectura pública de tipos de orden" on public.order_types
  for select to authenticated using (true);

drop policy if exists "Lectura pública de órdenes" on public.orders;
create policy "Lectura pública de órdenes" on public.orders
  for select to authenticated using (true);

drop policy if exists "Lectura pública de pendientes" on public.pending_items;
create policy "Lectura pública de pendientes" on public.pending_items
  for select to authenticated using (true);

drop policy if exists "Lectura pública plantillas_etapas" on public.plantillas_etapas;
create policy "Lectura pública plantillas_etapas" on public.plantillas_etapas
  for select to authenticated using (true);

drop policy if exists "Lectura pública productos" on public.productos;
create policy "Lectura pública productos" on public.productos
  for select to authenticated using (true);

drop policy if exists "Lectura pública telas" on public.telas;
create policy "Lectura pública telas" on public.telas
  for select to authenticated using (true);

-- Mismo candado a nivel de GRANT (redundante con el revoke de schema de
-- arriba, pero explícito por claridad si algún día se audita esto tabla
-- por tabla).
revoke select on public.announcements, public.clientes, public.orden_bordados,
  public.orden_etapas, public.order_status_history, public.order_types,
  public.orders, public.pending_items, public.plantillas_etapas,
  public.productos, public.telas
from anon;

-- Verificación: debe regresar 0 filas (nadie más con SELECT vía anon).
-- select tablename, policyname from pg_policies
-- where schemaname = 'public' and 'anon' = any(roles);
