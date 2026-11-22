-- =====================================================================
-- Datos 2026-11-22 — Manuales: sección "Administración" (1 manuales)
-- =====================================================================
-- Generado con manuales-sql.mjs solo con 5_procesos.md (carpeta administracion).
-- Fuente: supabase/manuales/administracion/5_procesos.md (no edites este archivo a mano).
-- Requiere V196 (manuales) y V214 (columna clave).
-- Solo agrega: crea la sección si no existe e inserta cada manual si su
-- clave todavía no está. No cambia ni borra ningún manual existente.
-- Se puede correr dos veces sin duplicar.
-- Manuales: procesos
-- =====================================================================
do $$
declare v_sec uuid;
begin
  if to_regclass('public.manuales') is null then
    raise exception 'Falta aplicar V196 (schema_v196_manuales.sql). No se cargó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'manuales' and column_name = 'clave') then
    raise exception 'Falta aplicar V214 (schema_v214_manuales_clave.sql). No se cargó nada.';
  end if;

  select id into v_sec from public.manual_secciones
   where eliminado_en is null and lower(btrim(nombre)) = lower($s$Administración$s$);
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ($s$Administración$s$, $s$Usuarios y permisos, catálogos, cotizador de destajo y cómo usar los manuales.$s$, $s$⚙️$s$,
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, clave, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.clave, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (5, $c$procesos$c$, $t$Manual Procesos$t$,
$man$## Resumen

**Manual Procesos** dice cómo se hace cada proceso del trabajo diario, para que todos lo hagan igual: cuándo aplica, en dónde se hace (Microsip, la página o el papelito de Salper), los pasos en orden, lo que **nunca** se debe hacer y qué hacer si algo sale distinto. Es distinto de **Manuales**: Manuales explica cómo se usa cada pantalla de la página; Manual Procesos explica cómo se hace el trabajo, aunque se haga en Microsip o en papel.

## ¿Quién lo usa?

- **Todos**: lo leen y lo imprimen. Nadie lo edita desde la página.

## Antes de empezar

- Nada en especial. Está en el menú como **📖 Manual Procesos** (en celular, en **Más**).

## Procesos paso a paso

### Cómo encontrar un proceso

1. En el menú, entra a **📖 Manual Procesos**.
2. Escoge la pestaña: **Tienda**, **Fábrica** o **Frisa**.
3. O escribe en **Buscar por nombre…** (ej. "crédito", "pendiente"). Busca en todas las secciones.
4. Dale clic a la tarjeta del proceso.

### Cómo leer un proceso

1. Arriba dice **Cuándo aplica** y **Dónde se hace**. Cada sistema tiene su color: **Microsip** azul, **Página** verde, **Papelito Salper** amarillo.
2. En **Pasos** está todo en orden. Hazlos en ese orden.
3. La caja roja **⛔ Nunca** son las reglas que no se rompen.
4. En **Si pasa esto → haz esto** está qué hacer cuando algo sale distinto.
5. Abajo, **Manuales relacionados** te lleva a otros procesos.

### Cómo ir a la pantalla del proceso

1. Si el proceso se hace en la página, arriba sale **Ir al módulo →**.
2. Dale clic y te lleva a esa pantalla (ej. Inventario, Pendientes, Nueva orden).
3. Si el proceso se hace en Microsip, no sale el botón.

### Cómo imprimir un proceso para pegarlo en tienda

1. Abre el proceso y dale **🖨 Imprimir**.
2. Elige tu impresora o "Guardar como PDF".
3. Sale una hoja limpia, sin menú ni botones.

## Qué significa cada estado o color

- **Microsip** (azul): se hace en Microsip.
- **Página** (verde): se hace en la página de Salper.
- **Papelito Salper** (amarillo): se anota en el papelito de Salper.
- Caja **roja**: lo que nunca se debe hacer.
- Tarjeta **amarilla**: "Si pasa esto → haz esto".
- **Próximamente**: esa sección todavía no tiene procesos.

## Si eres de…

- **Tienda (ventas, mostrador)**: revisa la pestaña **Tienda**: ventas, remisiones, pendientes, salidas de almacén, entregas y pedidos nuevos.
- **Fábrica o Frisa**: sus procesos van a salir en sus pestañas cuando estén listos.
- **Administración general**: si un proceso cambia, pide que se actualice (se cambia en el código de la página, no desde la pantalla).

## Problemas comunes

- **"No hay ningún manual con ese nombre"** → Busca con otra palabra, o quita lo que escribiste y revisa la pestaña.
- **La pestaña dice "Próximamente"** → Todavía no hay procesos en esa sección.
- **El proceso dice algo distinto a como se hace** → Avísale a Administración general para corregirlo.
- **No sale "Ir al módulo"** → Ese proceso se hace en Microsip o en papel, no en la página.

## Se conecta con

- [Cómo usar los manuales](manual:manuales): manuales de cada pantalla de la página.
- [Inventario](manual:inventario): donde se descuentan las ventas por fuera.
- [Pendientes](manual:pendientes): donde se sube un pendiente nuevo.
- [Nueva orden](manual:nueva-orden): donde se toma un pedido nuevo.
$man$)
    ) as x(orden, clave, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.clave = x.clave and m.eliminado_en is null);
end $$;

-- Verificación: debe regresar 1 filas.
-- select clave, titulo, length(contenido) from public.manuales
--  where clave in ('procesos') and eliminado_en is null order by orden;
