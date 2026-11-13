-- =====================================================================
-- Datos 2026-11-13 — Manuales: sección "CRM" con 8 manuales (cómo se usa)
-- =====================================================================
-- Requiere V196 (manuales) y V207/V208 (CRM). Solo agrega texto al módulo
-- Manuales; no toca nada del CRM. Se puede correr dos veces: no duplica la
-- sección ni los manuales (por título).
-- =====================================================================
do $$
declare v_sec uuid;
begin
  if to_regclass('public.manuales') is null then
    raise exception 'Falta aplicar V196 (schema_v196_manuales.sql). No se cargó nada.';
  end if;

  select id into v_sec from public.manual_secciones
   where eliminado_en is null and lower(btrim(nombre)) = 'crm';
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ('CRM', 'Prospectos de venta: a quién contactar, cómo registrar cada llamada y cómo van las ventas.', '🤝',
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (1, $t$Qué es el CRM y quién lo usa$t$, $man$El **CRM** es donde llevamos a las empresas a las que les ofrecemos uniformes (los **prospectos**): con quién hablamos, qué nos dijeron y cuándo hay que volver a buscarlas. Reemplaza al Excel "Formato reporte prospectos".

**Quién lo ve:** ventas, administración de tienda y el administrador general. Fábrica no lo ve.

Para entrar: en el menú de la izquierda toca **CRM**. Si junto a "CRM" sale un **número rojo**, son tus seguimientos vencidos o de hoy: los que te toca atender ya.

## Las cuatro pestañas

| Pestaña | Para qué sirve |
|---|---|
| **Seguimientos** | A quién te toca contactar hoy y esta semana. Es donde trabajas todos los días. |
| **Tablero** | Todas las empresas acomodadas por estatus, como tarjetas. |
| **Lista** | Las mismas empresas en tabla, para buscar y filtrar. |
| **Estadísticas** | Cómo van las ventas: embudo, contactos por semana, por qué se pierden. |

Arriba de las pestañas siempre están las **cifras** (cuánto hay en proceso, cuánto se ganó, tasas). Ver el manual "Las cifras de arriba".

## El día a día, en corto

1. Abre **CRM → Seguimientos**.
2. Atiende primero los **Vencidos**, luego los de **Hoy**.
3. Llama, escribe o manda WhatsApp desde la misma tarjeta.
4. Toca **Registrar contacto**, escribe qué pasó y **Guardar**. Listo: queda en la bitácora y se programa el siguiente seguimiento.

> Regla de oro: ningún prospecto abierto se queda sin fecha para volver a contactarlo. Los que no tienen fecha salen en "Sin seguimiento" y son los que se enfrían.$man$),

      (2, $t$Dar de alta un prospecto$t$, $man$1. Entra a **CRM** y toca **+ Nuevo prospecto** (arriba a la derecha).
2. Escribe el nombre de la **empresa**.
   Mientras escribes, el sistema revisa si ya existe una parecida (no importan mayúsculas, acentos ni "S.A. de C.V.").
3. Llena lo que sepas: ubicación, segmento, cómo llegó (LinkedIn, referido, visita…) y responsable.
4. Si ya tienes un contacto, escribe su nombre, puesto, teléfono y correo. La primera persona que agregas queda como **contacto principal**.
5. Toca **Guardar prospecto**. Se abre la ficha de la empresa.

## Si dice "Ya hay una empresa parecida"

Antes de crear otra, revisa la que te enseña:

- Si **es la misma empresa**, toca **Agregarle este contacto** (o **Abrir esta**). No se crea otra; el contacto se le agrega a la que ya existe.
- Si **es otra empresa** con nombre parecido, toca **Guardar prospecto** y luego **Sí, es otra empresa**.

> Evita duplicados: una empresa repetida divide su historial en dos y nadie sabe cuál es la buena.$man$),

      (3, $t$Seguimientos: a quién le toca hoy$t$, $man$La pestaña **Seguimientos** te dice a quién hay que contactar, sin depender de acordarse.

## Las secciones

| Sección | Qué hay |
|---|---|
| **Vencidos** (rojo) | Seguimientos cuya fecha ya pasó. Dice "hace N días". Atiéndelos primero. |
| **Hoy** | Los que tocan hoy. |
| **Esta semana** | Los de los próximos 7 días. |
| **Sin seguimiento** | Prospectos abiertos que no tienen fecha para volver a contactar. Hay que ponerles una. |

"Hoy" se cuenta con la hora de Monterrey.

## Cada tarjeta trae

- La empresa y su estatus (toca el nombre para abrir su ficha).
- La fecha y la nota del seguimiento.
- El contacto principal con botones: **📞 teléfono** (llama desde el celular), **💬 WhatsApp** y **✉️ correo**.
- El **último contacto** que se registró, para que sepas en qué se quedó.
- El botón **Registrar contacto**.

## Míos, Sin asignar y Todos

- **Míos**: los seguimientos que están a tu nombre (y las empresas donde tú eres el responsable).
- **Sin asignar**: los que no son de nadie todavía (por ejemplo, lo que vino del Excel). Si atiendes uno, el siguiente seguimiento queda a tu nombre.
- **Todos**: solo el administrador general lo ve.

El número entre paréntesis dice cuántos hay en cada uno. El **número rojo del menú** cuenta solo tus vencidos y los de hoy.$man$),

      (4, $t$Registrar un contacto (llamada, correo, visita)$t$, $man$Cada vez que hables con un prospecto (o lo intentes), regístralo. Se hace en un solo paso y toma unos segundos.

**Dónde:** en la tarjeta de **Seguimientos**, o en la ficha de la empresa (botón **📞 Registrar contacto**).

1. Toca **Registrar contacto**.
   Ya viene listo: **Llamada**, fecha de **hoy**, el **contacto principal** y el siguiente seguimiento en **1 semana**.
2. Si no fue llamada, toca el tipo: Correo, WhatsApp, Visita, Reunión, Videollamada o Nota.
3. En **¿Qué pasó?** escribe una línea. Ej. "No contestó" o "Pide cotización de 50 playeras".
4. Revisa el **siguiente seguimiento**: 1 semana, 2 semanas, 1 mes, 3 meses o **Elegir fecha**.
5. Toca **Guardar**.

Al guardar, el sistema:
- Anota el contacto en la **bitácora** de la empresa.
- Marca como **hecho** el seguimiento que estabas atendiendo (la casilla "Marcar como hecho…").
- Programa el **siguiente** seguimiento.
- Cambia el **estatus**, si lo cambiaste abajo.

## Cerrar un prospecto

Si ya no hay que volver a buscarlo, elige **Sin seguimiento (cerrar)**. Te va a preguntar cómo terminó:

- **Se ganó** → queda en *Ganado*.
- **Se perdió** → queda en *Perdido* y te pide **por qué** (precio, ya tienen proveedor, no les interesa…). Ese motivo sale en Estadísticas.

> Si el prospecto sigue abierto, no lo dejes sin fecha: elige cuándo volver a buscarlo aunque sea en 3 meses.$man$),

      (5, $t$Estatus del prospecto y el tablero$t$, $man$Cada empresa tiene un **estatus** que dice en qué va:

| Estatus | Quiere decir |
|---|---|
| **Nuevo** | Recién dado de alta, todavía no se le ha escrito. |
| **Catálogo enviado** | Ya se le mandó catálogo o presentación; no ha contestado. |
| **En conversación** | Ya contestó y estamos platicando. |
| **Visita / reunión** | Hay o hubo visita, reunión o videollamada. |
| **Cotizado** | Ya se le mandó cotización. |
| **Ganado** | Compró. |
| **Perdido** | No compró. Siempre lleva el motivo. |
| **En pausa** | Por ahora no; hay que volver a buscarlo en una fecha. |

## Cómo se cambia

- **En el tablero** (con mouse): arrastra la tarjeta a la columna del nuevo estatus.
- **En la ficha** de la empresa: toca el estatus en el recuadro "Estatus".
- **Al registrar un contacto**: en el campo "Estatus" del mismo cuadro.

Dos estatus piden algo más:
- **Perdido**: hay que escribir por qué se perdió.
- **En pausa**: hay que elegir la fecha para volver a contactar (se crea el seguimiento solo).

> En celular o tablet las tarjetas no se arrastran: cambia el estatus desde la ficha o al registrar el contacto.

## El tablero

Cada columna es un estatus, con cuántas empresas tiene y la suma de lo cotizado. Cada tarjeta muestra la empresa, el contacto, el segmento, el monto y el próximo seguimiento (en **rojo** si está vencido) o "Sin seguimiento". Las iniciales de la esquina son del responsable. Toca una tarjeta para abrir la ficha.$man$),

      (6, $t$La ficha de la empresa$t$, $man$Toca el nombre de cualquier empresa (en Seguimientos, Tablero o Lista) para abrir su **ficha**. Ahí está todo:

## Datos generales
Ubicación, segmento, cómo llegó, **mes en que compran** (si se sabe), **monto cotizado**, **monto vendido** y **responsable**. Toca **Editar** para cambiarlos.

> Captura siempre el **monto cotizado** cuando mandes cotización y el **monto vendido** cuando se gane: con eso salen las cifras de arriba.

## Responsable
Es la persona de ventas que lleva el prospecto: a quien le toca darle seguimiento. Se elige en **Datos generales → Editar → Responsable**. Lo importado del Excel quedó **sin responsable**; asígnalo conforme se trabaje cada empresa.

## Contactos
Una empresa puede tener varios. La ⭐ marca al **principal** (el que sale en las tarjetas). Toca **+ Agregar**, **Editar**, **Hacer principal** o **Borrar**. Si borras un contacto, lo que ya está en la bitácora se queda.

## Volver a contactar
Los seguimientos pendientes (con su casilla para marcarlos como hechos) y, abajo, los **Completados**. Con **+ Programar seguimiento** agregas uno a mano.

## Bitácora
Todo lo que ha pasado con la empresa, de lo más nuevo a lo más viejo: tipo, fecha, con quién y quién lo registró. Para agregar, toca **Registrar contacto**.

## Eliminar
Abajo de todo: **Eliminar esta empresa del CRM**. Úsalo solo si se dio de alta por error o está repetida.$man$),

      (7, $t$Las cifras de arriba y las estadísticas$t$, $man$Arriba del CRM están las cifras. Con **Cifras de** eliges **Todo** o un **mes** (cuenta las empresas que tuvieron algún contacto registrado en ese mes). Los filtros de búsqueda, segmento y responsable también las cambian.

| Cifra | Cómo se calcula |
|---|---|
| **En proceso** | Suma del monto cotizado de los prospectos abiertos (todo menos Ganado y Perdido). |
| **Ganado** | Suma del monto vendido de los ganados. |
| **Tasa de cierre** | De los que ya se cerraron, cuántos ganamos: ganados ÷ (ganados + perdidos). |
| **Ganados de cotizados** | De los que se cotizaron, cuántos ganamos: ganados ÷ cotizados. Cuenta como cotizado si está en Cotizado o Ganado, o si tiene **monto cotizado** capturado (aunque después se haya perdido). |
| **Ganados de contactados** | De los que contestaron, cuántos ganamos: ganados ÷ los que contestaron. |
| **Tasa de respuesta** | Cuántos contestaron de todos. Cuenta como "contestó" si está en En conversación, Visita / reunión, Cotizado o Ganado. |
| **Sin seguimiento** | Prospectos abiertos sin fecha para volver a contactar, y cuántos seguimientos están vencidos. |

Debajo de cada cifra viene el número completo (ej. "2 ganados de 6 cotizados"). Pasa el mouse sobre la ⓘ para ver la regla.

> Las cifras en pesos solo salen bien si se capturan los montos en la ficha de cada empresa.

## Pestaña Estadísticas
- **Embudo**: cuántas empresas hay en cada estatus.
- **Contactos registrados por semana**: llamadas, correos, visitas y notas de la bitácora.
- **Contactos por persona**: cuántos registró cada quien.
- **Por qué se pierden**: los motivos de los perdidos, del más común al menos.$man$),

      (8, $t$Importar prospectos desde Excel (solo administrador general)$t$, $man$Herramienta para subir de golpe una lista de prospectos. Solo la ve el **administrador general**: botón **Importar Excel** en el CRM.

> El Excel "Formato reporte prospectos" de octubre **ya se importó** el 13-nov-2026. No hace falta volver a hacerlo.

1. En Excel: **Archivo → Guardar como → CSV UTF-8 (delimitado por comas)**.
2. La primera fila debe tener estos encabezados: `empresa, ubicacion, segmento, estatus, contacto_nombre, contacto_puesto, telefono, correo, actividad_fecha, actividad_tipo, actividad_nota, seguimiento_fecha, seguimiento_nota`
3. Una empresa puede repetirse en varias filas (una por contacto, llamada o seguimiento): se juntan en una sola.
4. Las fechas van como AAAA-MM-DD (ej. 2026-11-13).
5. Sube el archivo y **revisa la vista previa**: cuántas empresas, contactos, registros de bitácora y seguimientos se van a crear.
6. Si los números están bien, toca **Confirmar importación**.

Si una empresa ya estaba en el CRM, solo se le agrega lo nuevo. Subir el mismo archivo dos veces no repite nada. Lo importado queda **sin responsable**.$man$)
    ) as x(orden, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.seccion_id = v_sec and m.eliminado_en is null and m.titulo = x.titulo);
end $$;

select s.nombre as seccion, count(m.id) as manuales
  from public.manual_secciones s
  left join public.manuales m on m.seccion_id = s.id and m.eliminado_en is null
 where s.eliminado_en is null
 group by s.nombre, s.orden order by s.orden;
