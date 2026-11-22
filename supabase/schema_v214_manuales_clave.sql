-- =====================================================================
-- V214 — Manuales: columna `clave` para ligarlos con "¿Cómo se usa?" (2026-11-21)
-- =====================================================================
-- Cada manual puede llevar una `clave` igual al `id` del módulo en
-- src/config/ayudaModulos.js (ej. 'nueva-orden'). El panel "¿Cómo se usa?"
-- busca el manual por esa clave y muestra "Ver manual completo →".
--
-- Aditivo: 1 columna opcional + 1 índice único parcial. No cambia
-- funciones: man_guardar_manual (V196) no toca `clave`, así que editar un
-- manual en la app la conserva. La clave no se edita desde la app; se pone
-- por SQL.
-- Los manuales que ya existen quedan con clave vacía; su texto no cambia.
-- Se puede correr dos veces.
-- =====================================================================

alter table public.manuales add column if not exists clave text;

-- Una clave solo puede estar en un manual vivo (los eliminados no cuentan).
create unique index if not exists manuales_clave_uq
  on public.manuales (clave) where clave is not null and eliminado_en is null;

-- man_guardar_manual (V196) no toca `clave`: el UPDATE solo cambia título,
-- contenido, sección y orden, así que la clave se conserva sola. No hace
-- falta reemplazar la función.

-- Verificación (debe regresar 1 fila con data_type = text):
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'manuales' and column_name = 'clave';
