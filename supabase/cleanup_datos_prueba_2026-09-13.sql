-- =====================================================================
-- SALPER · Limpieza de datos de prueba antes de cargar órdenes reales
-- (2026-09-13) — pedido explícito del usuario, siguiendo la secuencia
-- que él mismo planteó desde la Parte 1 de Fase 2: validar todo con
-- datos de prueba (ya hecho, V21-V31) → hard-delete de esas órdenes →
-- reiniciar folios a 1 por tipo → cargar órdenes reales desde folio 1.
--
-- Esto NO es un cambio de esquema (no es un schema_vNN) — es una
-- operación de datos, de una sola vez. Se documenta aquí igual, por si
-- hace falta repetir el patrón en el futuro (ej. antes de una demo).
--
-- Verificado en vivo antes de escribir esto (no se asumió nada):
--   - Las 11 órdenes que existían eran TODAS de prueba (nombres como
--     "asaa"/"ssss", folios inconsistentes tipo "20202020"/"3021" que no
--     siguen ningún patrón real de negocio).
--   - order_status_history, anticipos, orden_etapas, orden_bordados
--     tienen FK a orders con ON DELETE CASCADE — se limpian solas al
--     borrar la orden, no hace falta tocarlas aparte.
--   - Ninguna de las 11 tenía cotización/orden de compra/factura subida.
--   - 5 de las 11 sí tenían una foto de referencia en el bucket
--     `order-photos` — esas SÍ hay que borrarlas aparte (Storage no se
--     limpia solo con el DELETE de la fila).
--   - 4 tipos de orden existían: sublimacion, escolar, industrial,
--     basquetbol. El usuario confirmó que "basquetbol" fue una prueba —
--     se desactiva (no se borra el tipo, solo deja de aparecer en el
--     selector de "Nueva orden").
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- 1) Hard-delete de las 11 órdenes de prueba (lista explícita, no un
--    DELETE FROM orders a secas, para que quede claro exactamente qué
--    se borró y no depender de que nada nuevo haya entrado mientras
--    tanto).
delete from public.orders
where order_number in (
  '2026-0001', '3021', '3032', '2026-0200', '20202020',
  'SUB-003', 'ESC-001', 'ESC-002', 'ESC-003', 'ESC-004', 'SUB-004'
);

-- 2) Limpieza de las 5 fotos de referencia huérfanas en Storage.
--    OJO — esto NO se puede hacer con un DELETE de SQL: Supabase lo
--    bloquea a propósito (storage.protect_delete(): "Direct deletion
--    from storage tables is not allowed. Use the Storage API instead" —
--    se descubrió al intentarlo en vivo). Se hizo a mano desde el
--    Dashboard → Storage → order-photos, borrando estas 5 carpetas
--    (cada una es el UUID de una de las órdenes ya borradas, no
--    contienen nada más):
--    fcfcf780-a158-44f7-8b3c-0cb86efbe0d0/
--    979a7bc2-cbf2-4157-98e1-ae046b0c8e7b/
--    d909be8c-039e-4052-8986-8f68159715d8/
--    258ab8b5-9b86-423d-a235-77fd6034ff81/
--    240587e0-a40e-4922-8496-ac66bd49d3a2/

-- 3) Reinicio de folios: cada tipo de orden vuelve a empezar en 1 — la
--    próxima orden real de sublimación será SUB-001, la próxima escolar
--    ESC-001, la próxima industrial IND-001.
alter sequence public.folio_seq_sublimacion restart with 1;
alter sequence public.folio_seq_escolar restart with 1;
alter sequence public.folio_seq_industrial restart with 1;
alter sequence public.folio_seq_basquetbol restart with 1;

-- 4) "Basquetbol" era de prueba — se desactiva (fetchOrderTypes() ya
--    filtra por active=true, así que esto lo saca del selector de
--    "Nueva orden" sin necesidad de tocar el frontend).
update public.order_types set active = false where key = 'basquetbol';

-- Verificación sugerida después de aplicar (deben regresar 0 filas):
-- select * from public.orders;
-- select * from storage.objects where bucket_id = 'order-photos';
-- select key, active from public.order_types where key = 'basquetbol';
