-- =====================================================================
-- V195 — Frisa: la entrega se marca cuando el chofer YA ENTREGÓ (2026-11-08)
-- =====================================================================
-- Pedido de Alfredo: el inventario se descuenta cuando el chofer termina de
-- entregar (no cuando sale). La lógica no cambia (frisa_surtido_entregar
-- descuenta al confirmar); solo cambian los textos: el historial dice
-- "Entregada por el chofer" en lugar de "Salió el chofer", y la descripción
-- del permiso fs.entregar. Se cambia solo ese texto sobre la función que está
-- en la base. Se puede correr dos veces.
-- =====================================================================
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.proname = 'frisa_surtido_entregar' and p.pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'V195: no existe frisa_surtido_entregar.'; end if;
  if position('''Salió el chofer · Rem. ''' in v_def) > 0 then
    execute replace(v_def, '''Salió el chofer · Rem. ''', '''Entregada por el chofer · Rem. ''');
  end if;
end $$;

update public.permisos_catalogo
   set descripcion = 'Marcar que el chofer ya entregó la orden en la planta, con el folio de remisión (descuenta del inventario), o regresar una orden surtida.'
 where clave = 'fs.entregar';

-- Comprobación: 1 = el historial ya dirá "Entregada por el chofer".
select count(*) as texto_nuevo from pg_proc
 where proname = 'frisa_surtido_entregar' and pg_get_functiondef(oid) like '%Entregada por el chofer%';
