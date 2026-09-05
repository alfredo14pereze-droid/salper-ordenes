-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V27: corrige "Database error deleting user" al borrar un
-- usuario desde el panel de Usuarios (admin_general).
--
-- Causa confirmada en vivo (no asumida — se consultó pg_constraint
-- filtrando por confrelid = 'auth.users'::regclass antes de escribir
-- este fix): de las 3 tablas de public que le apuntan a auth.users(id)
-- para "quién hizo esto", solo 2 (orden_bordados.creado_por,
-- orden_etapas.responsable_id) ya tenían ON DELETE SET NULL. Las otras 3
-- se crearon sin especificar acción de borrado, lo que en Postgres
-- equivale a NO ACTION: en cuanto ese usuario hubiera creado una orden,
-- cambiado un estado, o registrado un anticipo (o sea, básicamente
-- cualquier usuario real que haya usado el sistema), borrarlo desde
-- auth.admin.deleteUser() truena con una violación de foreign key, que
-- Supabase Auth reporta genérico como "Database error deleting user":
--   - orders_created_by_fkey                (orders.created_by)
--   - order_status_history_changed_by_fkey   (order_status_history.changed_by)
--   - anticipos_created_by_fkey              (anticipos.created_by)
--
-- Fix: mismo criterio que ya se usó en V23/V25 para este tipo de
-- columna ("quién hizo esto", no dueño del registro) — ON DELETE SET
-- NULL. La orden/el historial/el anticipo NO se borran ni se rompen al
-- borrar al usuario que los creó; solo pierden la referencia a "quién".
-- Las 3 columnas ya eran nullable desde que se crearon (nunca tuvieron
-- NOT NULL), así que este cambio no requiere backfill.
--
-- Aditivo/seguro: no borra ni modifica ninguna fila existente, solo
-- cambia la regla de qué pasa cuando se borra el usuario referenciado.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders
  drop constraint if exists orders_created_by_fkey,
  add constraint orders_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.order_status_history
  drop constraint if exists order_status_history_changed_by_fkey,
  add constraint order_status_history_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table public.anticipos
  drop constraint if exists anticipos_created_by_fkey,
  add constraint anticipos_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

-- Verificación: las 3 deben salir con "ON DELETE SET NULL" ahora.
-- select conname, conrelid::regclass, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname in (
--   'orders_created_by_fkey',
--   'order_status_history_changed_by_fkey',
--   'anticipos_created_by_fkey'
-- );
