-- =====================================================================
-- Datos 2026-11-22 — Manuales: corrige el manual "Manual Procesos" (clave procesos)
-- =====================================================================
-- Fábrica ya tiene sus procesos: cambia SOLO la línea de "Fábrica o Frisa".
-- Si el texto ya se editó en la app y esa línea no está, no cambia nada.
-- Se puede correr dos veces sin problema.
-- Fuente: supabase/manuales/administracion/5_procesos.md
-- =====================================================================
update public.manuales
   set contenido = replace(
         contenido,
         $v$- **Fábrica o Frisa**: sus procesos van a salir en sus pestañas cuando estén listos.$v$,
         $n$- **Fábrica**: revisa la pestaña **Fábrica**: el flujo de una orden, cada etapa (cuándo dar Inicio y Terminado) y la entrega.
- **Frisa**: sus procesos van a salir en su pestaña cuando estén listos.$n$),
       actualizado_en = now()
 where clave = 'procesos'
   and eliminado_en is null
   and contenido like $l$%- **Fábrica o Frisa**: sus procesos van a salir%$l$;

-- Verificación: debe regresar 1 fila con ya_corregido = true.
select clave, titulo, length(contenido),
       contenido like '%- **Fábrica**: revisa la pestaña%' as ya_corregido
  from public.manuales
 where clave = 'procesos' and eliminado_en is null;
