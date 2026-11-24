// Textos del botón "¿Cómo se usa?" de cada módulo (componente
// src/components/common/AyudaModulo.jsx). UN solo archivo para editarlos sin
// tocar componentes.
//
// Cómo editar: cambia el texto entre comillas y guarda. Cada entrada:
//   id           — el que se usa en <AyudaModulo id="..." /> (no lo cambies)
//   titulo       — nombre del módulo, como sale en el menú
//   queEs        — 1 o 2 líneas
//   paraQueSirve — 1 o 2 líneas
//   pasos        — de 3 a 6 pasos, cada uno en una línea
//   tips         — de 0 a 3 (opcional)
//   roles        — quién lo usa, con los nombres de R (abajo)
//   manual       — (opcional) clave del manual completo en Manuales, si no es
//                  igual al id. El botón muestra "Ver manual completo →" solo
//                  si existe un manual con esa clave (columna clave, V214).
//
// Módulo nuevo: agrega aquí su entrada y pon <AyudaModulo id="..." /> dentro
// del título de su pantalla. Si un id no tiene entrada, el botón no aparece.
// Regla: todo módulo nuevo lleva su entrada aquí Y su manual en Manuales
// (supabase/manuales/<seccion>/N_<clave>.md, con clave = este id).
//
// Ojo: "roles" son los de fábrica por defecto. Si en "Roles y permisos" le
// das o quitas un módulo a un rol, actualiza aquí la lista.

// Nombres entendibles de cada rol (no el nombre técnico).
const R = {
  admin_general: 'Administración general',
  admin_tienda: 'Admin tienda',
  ventas: 'Ventas tienda',
  contabilidad: 'Contabilidad',
  tienda: 'Tienda (mostrador)',
  consulta_tienda: 'Consulta tienda',
  lectura: 'Solo consulta',
  admin_fabrica: 'Admin fábrica',
  admin_fabrica_lectura: 'Consulta fábrica',
  corte: 'Corte',
  bordado: 'Bordado',
  sublimado: 'Sublimado',
  costura: 'Costura',
  terminado: 'Terminado',
  captura_produccion: 'Captura de costura',
  chofer: 'Chofer',
}

const TIENDA = [R.ventas, R.contabilidad, R.tienda, R.admin_tienda, R.admin_general, R.consulta_tienda, R.lectura]
const ADMINS = [R.admin_general, R.admin_tienda, R.admin_fabrica]
const OFICINA = [R.admin_general, R.admin_tienda, R.ventas, R.contabilidad, R.admin_fabrica, R.admin_fabrica_lectura, R.consulta_tienda, R.lectura]

export const AYUDA_MODULOS = [
  // ─────────────────────────── Tienda / oficina ───────────────────────────
  {
    id: 'dashboard',
    titulo: 'Dashboard',
    queEs: 'La pantalla de inicio con todas las órdenes que siguen abiertas.',
    paraQueSirve: 'Ver de un vistazo qué hay en proceso, qué urge y qué ya está lista para entregar.',
    pasos: [
      'Arriba ves "Próximas a surtir": las órdenes ordenadas por fecha de entrega.',
      'Baja a "Todas las órdenes" para ver la lista completa.',
      'Filtra por Tipo o por Estado, o escribe en Buscar el número de orden, folio o cliente.',
      'Dale clic a una orden para abrir su detalle.',
      'Usa los botones Resumen, Órdenes pasadas y Control rápido para otras vistas.',
    ],
    tips: [
      'Si buscas una orden ya entregada, también aparece abajo como resultado de la búsqueda.',
      '"✎ Se modificó después de confirmarse" quiere decir que fábrica tiene que revisarla otra vez.',
      'Admin fábrica ve además "Por confirmar": las órdenes nuevas que fábrica todavía no acepta.',
    ],
    roles: OFICINA.concat(R.captura_produccion),
  },
  {
    id: 'resumen',
    manual: 'dashboard',
    titulo: 'Resumen',
    queEs: 'Todo lo que sigue pendiente, agrupado por cliente.',
    paraQueSirve: 'Saber qué tiene en proceso cada cliente aunque sean órdenes de distintos tipos.',
    pasos: [
      'Entra desde el Dashboard con el botón Resumen.',
      'Cada bloque es un cliente con sus órdenes abiertas.',
      'Revisa las prendas y el total de cada orden.',
      'Dale clic a una orden para ver su detalle.',
    ],
    tips: ['Solo muestra órdenes abiertas; las entregadas están en Órdenes pasadas.'],
    roles: OFICINA,
  },
  {
    id: 'ordenes-pasadas',
    manual: 'dashboard',
    titulo: 'Órdenes pasadas',
    queEs: 'El archivo de las órdenes que ya se entregaron.',
    paraQueSirve: 'Consultar una orden vieja: qué se hizo, para quién y cuándo.',
    pasos: [
      'Entra desde el Dashboard con el botón Órdenes pasadas.',
      'Filtra por Tipo si quieres.',
      'Escribe en Buscar el número de orden, folio externo o cliente.',
      'Dale clic a la orden para ver su detalle.',
    ],
    tips: ['Las órdenes entregadas nunca se borran: siempre las encuentras aquí.'],
    roles: OFICINA,
  },
  {
    id: 'nueva-orden',
    titulo: 'Nueva orden',
    queEs: 'El formulario para dar de alta una orden de producción.',
    paraQueSirve: 'Que fábrica reciba todo lo que necesita: cliente, prendas, tallas, fecha y fotos.',
    pasos: [
      'Elige el Tipo de orden y el Cliente.',
      'Captura cada prenda con su tela, color, detalles y Tallas y cantidades. Usa "+ Agregar otra prenda a esta orden" si lleva más.',
      'Pon la Fecha de entrega y, si aplica, el Número de corte o el Equipo.',
      'Agrega Notas y fotos de referencia (opcional).',
      'En Precios y pago pon el precio de cada prenda y, si dejan anticipo, quién lo recibió.',
      'Dale clic en Crear orden. Se abre la orden con la vista previa de su PDF; de ahí lo descargas.',
    ],
    tips: [
      'Si es venta de mostrador, prende "Venta de mostrador": no lleva anticipo ni factura.',
      'Puedes meter la orden en un Pedido para juntar varias órdenes con un solo anticipo.',
      'Escribe y presiona Enter para pasar al siguiente campo.',
    ],
    roles: [R.ventas, R.admin_tienda, R.admin_general],
  },
  {
    id: 'detalle-orden',
    titulo: 'Detalle de orden',
    queEs: 'La ficha completa de una orden: datos, prendas, etapas, pagos y documentos.',
    paraQueSirve: 'Ver cómo va la orden y hacer los cambios que te tocan según tu área.',
    pasos: [
      'Arriba ves el folio, el estado y las etapas de producción.',
      'En Detalles y Prendas dale clic en Editar para corregir datos (solo tienda).',
      'Fábrica acepta la orden con Confirmar pedido.',
      'En Precios y facturación y Pagos se capturan precios, factura y anticipos.',
      'Cuando el cliente recoja, dale clic en Confirmar entrega al cliente.',
      'Usa Notas internas para avisar algo entre áreas; el cliente no las ve.',
    ],
    tips: [
      'Cada quien ve y cambia solo lo de su área: fábrica no toca cliente, fechas ni precios.',
      'Para entregar, los precios y datos de factura tienen que estar completos.',
      'Varias etapas pueden ir en proceso al mismo tiempo; cada una avanza por su cuenta.',
    ],
    roles: OFICINA.concat(R.captura_produccion, R.tienda),
  },
  {
    id: 'calendario',
    titulo: 'Calendario de producción',
    queEs: 'Un calendario del mes con la producción programada de cada orden.',
    paraQueSirve: 'Ver qué días se junta mucho trabajo y planear entregas.',
    pasos: [
      'Muévete con "← Mes anterior", Hoy y "Mes siguiente →".',
      'Cada día muestra las órdenes que están en producción.',
      'Prende "Incluir completadas" si quieres ver también las ya terminadas.',
      'Dale clic a una orden para abrir su detalle.',
    ],
    tips: ['Cada orden ocupa los días antes de su fecha de entrega, según el tiempo estimado de producción que pone fábrica.'],
    roles: [R.admin_general, R.admin_tienda, R.ventas, R.contabilidad, R.admin_fabrica, R.admin_fabrica_lectura, R.lectura],
  },
  {
    id: 'pendientes',
    titulo: 'Pendientes tienda ↔ fábrica',
    queEs: 'Los trabajos chicos que la tienda manda a la fábrica: arreglos, bordados, planchado, etc.',
    paraQueSirve: 'Que nada se pierda en el camino: cada lado confirma cuando envía y cuando recibe.',
    pasos: [
      'Tienda: dale clic en "+ Nuevo pendiente", di qué hay que hacer, las prendas y si es de un cliente.',
      'Fábrica: en "Por recibir" dale Confirmar recibido; al terminar, Marcar listo.',
      'Fábrica: cuando lo mandes de regreso, Confirmar envío a tienda.',
      'Tienda: al llegar, Confirmar recibido. Si es de un cliente, Marcar como entregado cuando lo recoja.',
      'Cambia entre Vista tienda y Vista fábrica para ver cada lado.',
    ],
    tips: [
      'Las tarjetas en rojo llevan más de un día enviadas sin que fábrica las reciba.',
      'Usa Imprimir etiqueta para pegarla en la bolsa del trabajo.',
      'Bordado y Costura solo ven los pendientes de su tipo de trabajo.',
    ],
    roles: [...TIENDA, R.admin_fabrica, R.admin_fabrica_lectura, R.bordado, R.costura, R.terminado, R.chofer],
  },
  {
    id: 'notas-tienda',
    titulo: 'Notas de tienda',
    queEs: 'Un tablero de notas del personal de tienda y para el personal.',
    paraQueSirve: 'Avisar faltantes, notas del día o errores sin que se olviden.',
    pasos: [
      'En "Del personal", elige el Tipo de nota: Producto faltante, Nota del día, Error u Otro.',
      'Escribe la nota y, si ayuda, agrega una foto o PDF.',
      'Dale clic en Guardar nota.',
      'Cuando se atienda, dale ✓ Marcar resuelta; pasa a Resueltas.',
      'En "Para el personal" ves los avisos que te deja la administración.',
    ],
    tips: ['Si una nota se resolvió por error, ábrela en Resueltas y dale Volver a abrir.'],
    roles: TIENDA,
  },
  {
    id: 'tareas',
    titulo: 'Tareas',
    queEs: 'La lista de tareas que te asignan y las que tú te anotas.',
    paraQueSirve: 'Saber qué te toca hacer y que el administrador vea qué ya se hizo.',
    pasos: [
      'Revisa tus Pendientes y las Vencidas.',
      'Cuando termines una, dale ✓ Marcar como hecha.',
      'Para anotarte algo, dale "+ Anotarme una tarea" y pon la fecha límite si quieres.',
      'Administración: en Asignadas, elige Para (una persona, un rol o todo el personal) y dale Asignar tarea.',
    ],
    tips: [
      'Las tareas que te anotas tú solo las ven tú y el administrador.',
      'Si te equivocaste al marcarla, usa Deshacer.',
      'En tareas para varios, "Basta con que uno la haga" la cierra para todos.',
    ],
    roles: [...TIENDA, R.chofer],
  },
  {
    id: 'crm',
    titulo: 'CRM · Prospectos',
    queEs: 'La lista de empresas a las que les queremos vender, con su seguimiento.',
    paraQueSirve: 'No dejar enfriar a un prospecto: saber a quién llamar hoy y en qué va cada uno.',
    pasos: [
      'Dale clic en "+ Nuevo prospecto" y llena la Empresa y su contacto.',
      'En Seguimientos ves a quién te toca buscar esta semana.',
      'Después de llamar o visitar, dale "📞 Registrar contacto": qué pasó y cuándo volver a contactar.',
      'En Tablero arrastra la tarjeta para cambiar su estatus.',
      'En Estadísticas ves el embudo, la tasa de cierre y por qué se pierden.',
    ],
    tips: [
      'El número junto a "CRM" en el menú son tus seguimientos vencidos y de hoy.',
      'Si lo marcas perdido, pon el motivo y una fecha para volver a buscarlos.',
      'Administración general puede subir prospectos desde Excel con Importar Excel.',
    ],
    roles: [R.ventas, R.admin_tienda, R.admin_general],
  },
  {
    id: 'cotizaciones-web',
    titulo: 'Cotizaciones web',
    queEs: 'Las solicitudes que llegan del formulario de cotización de salperdeportes.com.',
    paraQueSirve: 'Atender rápido a cada cliente que pidió precio en la página.',
    pasos: [
      'Las nuevas salen marcadas y con su número en el menú.',
      'Dale clic a un renglón para ver todo lo que pidió y sus datos de contacto.',
      'Contáctalo y cambia el Estado: Contactado, Cotizado, Ganado o Perdido.',
      'Filtra por estado arriba; usa Actualizar para ver las que acaban de llegar.',
    ],
    roles: [R.admin_tienda, R.admin_general],
  },
  {
    id: 'pedidos',
    titulo: 'Pedidos',
    queEs: 'Un pedido junta varias órdenes de un cliente con un solo anticipo, abonos y factura.',
    paraQueSirve: 'Llevar la cuenta del cliente completa aunque su trabajo vaya en varias órdenes.',
    pasos: [
      'Se crea desde Nueva orden → Pedido, o aquí con "+ Pedido vacío".',
      'Abre el pedido para ver su Cuenta del pedido: total, anticipo, abonos y saldo.',
      'Agrega órdenes con "+ Nueva orden" o "+ Orden existente".',
      'Cuando el cliente pague, dale "+ Registrar abono".',
      'En Datos del pedido pon si requiere factura y la razón social.',
    ],
    tips: [
      'Si una orden tiene tallas sin precio, el total del pedido todavía no la incluye.',
      'Un pedido de venta de mostrador no lleva precios ni factura.',
    ],
    roles: [R.admin_general, R.admin_tienda, R.ventas, R.contabilidad, R.admin_fabrica, R.admin_fabrica_lectura],
  },
  {
    id: 'entrega-masiva',
    titulo: 'Entrega masiva',
    queEs: 'Marcar varias órdenes como entregadas al mismo tiempo.',
    paraQueSirve: 'Ahorrar tiempo cuando se entregan muchas órdenes juntas.',
    pasos: [
      'Elige "Listas para entregar" o "Todas sin entregar".',
      'Busca por folio, cliente o equipo, y palomea las que ya se entregaron.',
      'Dale "Marcar … como entregadas". Pasan a Órdenes pasadas.',
      'Si alguna no se pudo, revisa sus precios en su detalle y vuelve a intentar.',
    ],
    tips: ['Si ya se entregaron aunque falten precios, entrégalas de todos modos escribiendo el motivo; queda registrado con tu nombre.'],
    roles: ADMINS,
  },
  {
    id: 'control-rapido',
    manual: 'dashboard',
    titulo: 'Control rápido de órdenes',
    queEs: 'Una tabla sencilla con folio, cliente y estado de todas las órdenes.',
    paraQueSirve: 'Encontrar rápido en qué va una orden, incluso las eliminadas.',
    pasos: [
      'Busca la orden en la tabla por su folio o cliente.',
      'Revisa su Estado.',
      'Dale clic al folio para abrir el detalle.',
    ],
    tips: ['Usa Ctrl + F (o Buscar en la página en el celular) para encontrar un folio rápido.'],
    roles: OFICINA.concat(R.captura_produccion),
  },
  {
    id: 'anuncios',
    titulo: 'Anuncios internos',
    queEs: 'Los avisos generales para todo el personal.',
    paraQueSirve: 'Que todos se enteren de cambios de horario, fechas importantes, etc.',
    pasos: [
      'Lee los anuncios; los fijados salen hasta arriba.',
      'Para publicar uno, dale "+ Nuevo anuncio" y pon Título y Mensaje.',
      'Palomea "Fijar arriba de los demás" si es importante.',
      'Si ya no aplica, dale Eliminar.',
    ],
    tips: ['Consulta fábrica, Solo consulta y Captura de costura solo pueden leerlos.'],
    roles: [R.admin_general, R.admin_tienda, R.ventas, R.contabilidad, R.admin_fabrica, R.admin_fabrica_lectura, R.lectura, R.captura_produccion],
  },
  {
    id: 'pedidos-colegio',
    titulo: 'Pedidos Colegio',
    queEs: 'Los pedidos de uniformes que hacen los papás de cada colegio.',
    paraQueSirve: 'Llevar el folio, los artículos, el anticipo y los abonos de cada alumno.',
    pasos: [
      'Si el colegio no existe, dale "+ Agregar colegio" con su código de folio (ej. IT).',
      'Dale "+ Nuevo pedido" en el colegio.',
      'Pon quién hace el pedido, la referencia (grado o grupo) y los Artículos con talla, cantidad y precio.',
      'Pon el Anticipo en porcentaje o monto directo y dale "Crear pedido y generar recibo".',
      'Cuando paguen más, abre el pedido y dale "+ Registrar abono".',
    ],
    tips: ['El folio es el código del colegio más un consecutivo: IT1, IT2…'],
    roles: [R.admin_general, R.consulta_tienda],
  },
  {
    id: 'talleros',
    titulo: 'Talleros',
    queEs: 'Los muestrarios de tallas que se prestan a colegios y clientes.',
    paraQueSirve: 'Saber dónde está cada tallero, quién lo tiene y cuánto dinero dejó.',
    pasos: [
      'Busca el tallero por código o por quién lo tiene, o filtra por prenda, color o estado.',
      'Para prestarlo, dale Prestar (o Prestar parcial si solo se llevan algunas tallas).',
      'Llena quién lo presta, quién se lo lleva, su teléfono y el dinero que deja.',
      'Cuando regrese, dale Devolver y marca si regresó completo.',
      'En Historial ves todos sus préstamos.',
    ],
    tips: ['Admin tienda da de alta talleros nuevos con "+ Nuevo tallero" o los da de baja.'],
    roles: [R.ventas, R.admin_tienda, R.admin_general, R.contabilidad, R.consulta_tienda, R.lectura, R.admin_fabrica, R.admin_fabrica_lectura],
  },
  {
    id: 'inventario',
    titulo: 'Inventario',
    queEs: 'La existencia de prendas de la tienda, por sección, modelo y talla.',
    paraQueSirve: 'Saber cuántas piezas hay de cada cosa y registrar lo que entra y sale.',
    pasos: [
      'Elige la sección o escribe en el buscador (ej. "po tri 12").',
      'Cuando llegue mercancía, dale Dar entrada, elige el modelo y pon la cantidad por talla.',
      'Para una entrada o salida de una sola talla, usa los botones + y − de esa talla y elige el motivo.',
      'Toca la talla para ver su historial.',
      'Usa Reporte para sacar el PDF de existencias.',
    ],
    tips: [
      'Ventas y Consulta tienda solo ven; Tienda y Admin tienda mueven el inventario.',
      'De aquí entras a Movimientos, Traspasos, Conteo físico y Administración.',
    ],
    roles: [R.admin_general, R.admin_tienda, R.admin_fabrica, R.ventas, R.tienda, R.consulta_tienda],
  },
  {
    id: 'inventario-traspasos',
    manual: 'inventario',
    titulo: 'Traspasos de inventario',
    queEs: 'El paso de prendas de una ubicación a otra.',
    paraQueSirve: 'Que la existencia de cada lugar siempre cuadre cuando se mueve mercancía.',
    pasos: [
      'Dale clic en "+ Nuevo traspaso".',
      'Elige Origen y Destino.',
      'Dale "Agregar prenda" y pon las cantidades.',
      'Dale Crear traspaso y luego Confirmar traspaso: se genera un folio (ej. T-0001) y su PDF.',
    ],
    tips: ['Si sale "no alcanza", no hay suficiente existencia en el origen.'],
    roles: [R.tienda, R.admin_tienda, R.admin_general],
  },
  {
    id: 'inventario-conteos',
    manual: 'inventario',
    titulo: 'Conteos físicos de inventario',
    queEs: 'El conteo a mano de una sección y ubicación, comparado con lo que dice el sistema.',
    paraQueSirve: 'Encontrar diferencias y dejar el inventario igual a lo que hay de verdad.',
    pasos: [
      'Dale clic en "+ Nuevo conteo" y elige Sección y Ubicación.',
      'Se abre el PDF: imprímelo y cuenta las prendas.',
      'Dale Capturar conteo y escribe lo que contaste en la columna Conteo.',
      'Dale Confirmar conteo: las diferencias se ajustan solas.',
    ],
    tips: ['El conteo toma la existencia del momento en que lo creas; no muevas mercancía mientras cuentas.'],
    roles: [R.tienda, R.admin_tienda, R.admin_general],
  },
  {
    id: 'inventario-movimientos',
    manual: 'inventario',
    titulo: 'Movimientos de inventario',
    queEs: 'La lista de entradas, salidas, ajustes y conteos en un rango de fechas.',
    paraQueSirve: 'Saber quién movió qué, cuándo y por qué.',
    pasos: [
      'Elige el Rango de fechas.',
      'Filtra por Tipo, Sección o Ubicación.',
      'Revisa la prenda, cantidad, motivo y usuario de cada movimiento.',
    ],
    roles: [R.admin_general, R.admin_tienda, R.admin_fabrica, R.ventas, R.tienda, R.consulta_tienda],
  },
  {
    id: 'inventario-admin',
    manual: 'inventario',
    titulo: 'Administración de inventario',
    queEs: 'Los catálogos del inventario: secciones, tipos de prenda, tallas, ubicaciones y motivos.',
    paraQueSirve: 'Dejar todo ordenado para que dar de alta modelos y buscar sea fácil.',
    pasos: [
      'Elige el catálogo que quieras cambiar: Secciones, Tipos de prenda, Juegos de tallas, Ubicaciones, Motivos…',
      'Dale "+ Nuevo" para agregar o Editar para corregir.',
      'En Artículos sin clasificar, palomea los artículos viejos, elige su tipo de prenda y dale Aplicar.',
    ],
    tips: ['Cambiar un juego de tallas no cambia los modelos que ya se crearon con él.'],
    roles: [R.admin_tienda, R.admin_general],
  },
  {
    id: 'catalogos',
    titulo: 'Catálogos',
    queEs: 'Las listas base del sistema: proveedores, clientes, telas, tipos de orden y productos de Frisa.',
    paraQueSirve: 'Que al crear una orden ya estén el cliente, sus prendas y las telas listos para elegir.',
    pasos: [
      'Busca por nombre en el catálogo que necesites.',
      'Dale "+ Cliente nuevo" o "+ Tela nueva" para dar de alta.',
      'En un cliente, abre su catálogo de prendas para agregar productos con fotos y bordados.',
      'En Tipos de orden se definen las etapas que lleva cada tipo.',
    ],
    tips: [
      'Clientes y productos: Ventas y Administración general. Telas: también Admin fábrica.',
      'Eliminar es definitivo y solo lo hace Administración general.',
      'Los cambios de etapas aplican a las órdenes nuevas, no a las que ya existen.',
    ],
    roles: [R.ventas, R.admin_tienda, R.admin_fabrica, R.admin_general, R.admin_fabrica_lectura, R.consulta_tienda],
  },
  {
    id: 'estadisticas',
    manual: 'calendario',
    titulo: 'Estadísticas',
    queEs: 'Números de cómo vamos con los tiempos de entrega.',
    paraQueSirve: 'Ver qué tan a tiempo entregamos y qué etapas tardan más.',
    pasos: [
      'Revisa los cuadros de arriba: entregadas, a tiempo y tiempo promedio.',
      'Baja a "Tiempo promedio por etapa" y "Desglose por tipo de orden".',
      'En "Órdenes atrasadas ahora mismo" ves las que urgen.',
      'Dale Actualizar para recalcular.',
    ],
    tips: ['Solo es consulta: aquí no se cambia nada.'],
    roles: [R.admin_general, R.admin_tienda, R.admin_fabrica, R.admin_fabrica_lectura],
  },

  // ─────────────────────────────── Fábrica ────────────────────────────────
  {
    id: 'estacion',
    titulo: 'Órdenes de tu estación',
    queEs: 'Tu lista de órdenes por hacer en tu etapa.',
    paraQueSirve: 'Saber qué sigue y avisar cuándo empiezas y cuándo terminas cada orden.',
    pasos: [
      'En "Siguientes órdenes" ves lo que te toca, en orden.',
      'Dale clic a la orden para ver prendas, tallas y fotos.',
      'Al empezar, dale Iniciar.',
      'Al acabar tu parte, dale Terminar.',
      'Si una orden dice "Todavía no le toca", espera a que termine la etapa anterior.',
    ],
    tips: [
      'Corte: registra la tela y el número de hojas con "Registrar el corte".',
      'Bordado y Terminado: usa ⏸ Pausar si te cambias a otra orden y ▶ Reanudar al regresar.',
      'Terminado: captura la Cantidad real por talla y dale "Confirmar y generar reporte".',
    ],
    roles: [R.corte, R.bordado, R.costura, R.terminado],
  },
  {
    id: 'sublimado',
    titulo: 'Órdenes de sublimado',
    queEs: 'Tus órdenes de sublimación, de diseño a sublimado.',
    paraQueSirve: 'Llevar cada orden por sus pasos: diseño, impresión y sublimado.',
    pasos: [
      'En "Pendientes de diseño", sube el diseño final; Ventas lo autoriza.',
      'En "Pendientes de impresión", palomea las órdenes de un mismo lote.',
      'Dale "Marcar … impresas" y captura el largo del trazo y la tinta del lote.',
      'En "Pendientes de sublimado", abre la orden y dale Sublimada al terminar.',
      'En Lotes ves los lotes ya impresos e imprimes su reporte.',
    ],
    tips: ['Si un número del lote quedó mal, usa Corregir números en Lotes.'],
    roles: [R.sublimado],
  },
  {
    id: 'hojas-impresas',
    manual: 'produccion-captura',
    titulo: 'Hojas impresas',
    queEs: 'Las hojas de operaciones que ya se imprimieron para fábrica.',
    paraQueSirve: 'Volver a imprimir una hoja sin armarla otra vez.',
    pasos: [
      'Busca la hoja por título o prenda.',
      'Ábrela para ver sus operaciones y tiempos.',
      'Dale Volver a imprimir.',
    ],
    tips: ['Costura solo consulta; para cambiar una hoja, avisa a un administrador.'],
    roles: [R.costura, R.captura_produccion, R.admin_fabrica, R.admin_fabrica_lectura, R.admin_general],
  },
  {
    id: 'produccion-captura',
    titulo: 'Captura de producción',
    queEs: 'Donde se captura lo que hizo cada operadora: folio de la operación y piezas.',
    paraQueSirve: 'Que cada operadora tenga su valor generado y sus premios de la semana.',
    pasos: [
      'Elige la Operadora (o presiona F2 para cambiar).',
      'Escribe el Folio de la operación y presiona Enter.',
      'Escribe las Piezas y presiona Enter para guardar.',
      'Revisa abajo lo capturado; usa Editar o Borrar si te equivocaste.',
    ],
    tips: [
      'La semana va de miércoles a martes.',
      'Una semana aprobada ya no se puede cambiar; para corregirla, Administración general la reabre.',
    ],
    roles: [R.captura_produccion, R.admin_fabrica, R.admin_general],
  },
  {
    id: 'produccion-revision',
    titulo: 'Revisión de producción',
    queEs: 'La revisión semanal del valor generado y los premios de cada operadora.',
    paraQueSirve: 'Revisar y aprobar la semana para que los premios queden fijos.',
    pasos: [
      'Elige la Semana.',
      'Revisa valor generado, mejora y bonos de cada operadora.',
      'Abre una operadora para ver su detalle por folio.',
      'Dale "Pasar a revisión" y luego "Aprobar semana".',
    ],
    tips: [
      'Valor generado es lo que produjo cada quien, no su sueldo.',
      'Al aprobar, los premios se congelan. "Reabrir…" la deja otra vez editable.',
    ],
    roles: [R.admin_general, R.admin_fabrica, R.admin_fabrica_lectura],
  },
  {
    id: 'produccion-dashboard',
    manual: 'produccion-revision',
    titulo: 'Producción por operadora',
    queEs: 'El ranking de cada operadora: semana actual, anterior y promedio.',
    paraQueSirve: 'Ver quién va mejorando y sacar el ranking impreso.',
    pasos: [
      'Elige la Semana.',
      'Revisa el cambio contra la semana anterior y su mejor semana.',
      'Dale Imprimir ranking para pegarlo en la fábrica.',
    ],
    tips: ['Si la semana no está aprobada, las cifras son provisionales.'],
    roles: [R.admin_general, R.admin_fabrica, R.admin_fabrica_lectura, R.captura_produccion],
  },
  {
    id: 'produccion-admin',
    titulo: 'Administración de producción',
    queEs: 'Los catálogos de producción: operaciones, operadoras, reglas de premios y configuración.',
    paraQueSirve: 'Tener al día los tiempos, las operadoras y cómo se calculan los premios.',
    pasos: [
      'En Operaciones, dale "+ Nueva operación" o Editar para cambiar su tiempo en segundos.',
      'Para una hoja para fábrica, marca las operaciones y dale Imprimir operaciones.',
      'En Operadoras, dale "+ Nueva operadora".',
      'En Reglas de premios y Configuración ajusta bonos y precio por segundo.',
    ],
    tips: [
      'Cambiar un tiempo o precio no cambia semanas ya capturadas.',
      'Las operaciones no se borran: se desactivan. Un folio nunca se repite.',
    ],
    roles: [R.admin_general, R.admin_fabrica, R.admin_fabrica_lectura],
  },
  {
    id: 'produccion-operaciones',
    manual: 'produccion-captura',
    titulo: 'Operaciones de producción',
    queEs: 'El catálogo de operaciones con su folio, parte y tiempo.',
    paraQueSirve: 'Consultar el folio correcto de cada operación para capturar e imprimir hojas.',
    pasos: [
      'Elige la Prenda o busca por folio u operación.',
      'Revisa folio, parte y segundos de cada operación.',
      'Marca las que necesites y dale Imprimir operaciones.',
    ],
    tips: ['Solo consulta; para cambiar una operación, avisa a un administrador.'],
    roles: [R.captura_produccion],
  },
  {
    id: 'cotizador',
    titulo: 'Cotizador',
    queEs: 'Calcula cuánto cuesta el destajo de una prenda con base en sus operaciones.',
    paraQueSirve: 'Saber el costo de mano de obra por pieza y por lote antes de cotizar.',
    pasos: [
      'En Cotizar, elige "Por prenda" o "Subir hoja de operaciones".',
      'Elige la prenda y marca sus operaciones (o sube la foto o PDF de la hoja).',
      'Pon piezas y operadoras para ver el costo y los días.',
      'Guárdala; la encuentras en Guardadas.',
    ],
    tips: ['Solo es costo de destajo: no incluye sueldo base, indirectos ni margen.'],
    roles: [R.admin_general, R.admin_fabrica],
  },
  {
    id: 'estadisticas-produccion',
    manual: 'produccion-revision',
    titulo: 'Estadísticas de producción',
    queEs: 'Valor generado y premios por semana, por operadora y por operación.',
    paraQueSirve: 'Ver tendencias, quién mejora y quién lleva varias semanas abajo.',
    pasos: [
      'Elige Desde y Hasta, o "Últimas 12 semanas".',
      'Filtra por Operadora si quieres.',
      'Revisa los Top 5 y la lista de abajo de su promedio.',
      'Baja a "Tiempos reales por etapa" para ver cuánto tardan las estaciones; puedes Imprimir o Descargar CSV.',
    ],
    tips: ['Solo consulta: todo se calcula solo.'],
    roles: [R.admin_general, R.admin_fabrica, R.admin_fabrica_lectura],
  },
  {
    id: 'inventario-tela',
    titulo: 'Inventario de tela',
    queEs: 'La existencia de cada tela, con lo comprometido en órdenes y lo disponible.',
    paraQueSirve: 'Saber si alcanza la tela y registrar la que llega.',
    pasos: [
      'Cuando llegue tela, en "Entrada de tela" elige la tela, pon la cantidad y una nota (ej. factura).',
      'Revisa abajo el Inventario actual: Comprometido y Disponible.',
      'Si un conteo físico no cuadra, usa "Ajuste de inventario" con su motivo.',
    ],
    tips: [
      'Si una tela no tiene unidad, primero ponla en Catálogos.',
      'Captura de costura solo registra entradas.',
    ],
    roles: [R.admin_fabrica, R.admin_general, R.captura_produccion],
  },
  {
    id: 'consumos-prenda',
    manual: 'inventario-tela',
    titulo: 'Consumos por prenda',
    queEs: 'Cuánta tela usa cada prenda, por talla o en promedio.',
    paraQueSirve: 'Calcular cuánta tela necesita cada orden y lo comprometido de cada tela.',
    pasos: [
      'Dale "+ Nuevo consumo": prenda, tallas, consumo y unidad.',
      'Para muchos, usa "Importar desde CSV".',
      'Revisa "Precisión de consumos" para comparar lo estimado con lo que reportó corte.',
    ],
    tips: ['Si dejas las tallas vacías, cuenta como promedio general de la prenda.'],
    roles: [R.admin_fabrica, R.admin_general],
  },
  {
    id: 'atr',
    titulo: 'Inventario ATR',
    queEs: 'Todo lo de ATR: inventario de batas, sus órdenes de compra, el surtido y qué nos falta producir.',
    paraQueSirve: 'Surtir las OC de ATR con lo que hay y mandar a producir solo lo que falta.',
    pasos: [
      'En "Órdenes de compra" dale "+ Nueva OC", sube el PDF, revisa los renglones en rojo y guarda.',
      'En "Qué nos falta" ves por bata y talla lo pendiente, la existencia, lo que está en taller y el faltante.',
      'Dale "Crear orden de taller" para producir lo que falta (va sin precio, cliente ATR).',
      'Abre la OC y dale "Surtir": se descuenta del inventario y sale la hoja de surtido en PDF.',
      'En Inventario cada bata sale con su color y "● Con bolsa" u "○ Sin bolsa"; las tallas son columnas. Filtra por con/sin bolsa y elige el color en la lista.',
      'Toca un número del inventario para ver su historial.',
    ],
    tips: [
      'Lo producido en las órdenes de ATR entra solo al completar Terminado.',
      'En Órdenes de compra cada OC dice en verde "Se puede surtir" o en rojo "Faltan piezas"; arriba sale el resumen de lo que falta.',
      'Se puede surtir parcial; la OC queda "Parcial" hasta completar.',
      'Deshacer un surtido, cancelar una OC, Ajuste y Carga inicial: solo Admin fábrica y Administración general.',
    ],
    roles: [R.admin_general, R.admin_fabrica, R.admin_tienda, R.terminado, R.admin_fabrica_lectura, R.contabilidad],
  },

  // ──────────────────────────── Frisa (por pestaña) ────────────────────────
  {
    id: 'frisa-niveles',
    titulo: 'Frisa · Niveles de inventario',
    queEs: 'El inventario de cada clave de Frisa con su mínimo, reorden y máximo.',
    paraQueSirve: 'Saber qué claves hay que pedir antes de que se acaben.',
    pasos: [
      'Busca por clave o nombre, o filtra por tipo y color.',
      'Revisa Real, Apartado y Disponible de cada clave.',
      'El Estado "A PEDIR" marca las que llegaron al reorden.',
      'Dale "Exportar A PEDIR" para sacar la lista.',
    ],
    tips: ['Solo Administración general captura stock y cambia los Supuestos.'],
    roles: ADMINS,
  },
  {
    id: 'frisa-surtido',
    titulo: 'Frisa · Órdenes de surtido',
    queEs: 'Las órdenes de compra de Frisa y su surtido.',
    paraQueSirve: 'Surtir cada orden completa y llevar control de lo apartado y lo entregado.',
    pasos: [
      'Dale "+ Subir orden de compra" con su PDF; revisa claves y cantidades.',
      'Abre la orden: si alcanza, dale "Surtida toda"; si no, "Apartar lo que hay".',
      'Cuando el chofer la entregue, dale "Ya entregó el chofer".',
      'Usa "Confirmar entregas de Leo" para confirmar varias de una vez.',
    ],
    tips: [
      'Frisa no acepta parciales: una orden solo está lista si alcanza para toda.',
      'Lo apartado ya no se usa para otras órdenes.',
    ],
    roles: [...ADMINS, R.ventas, R.chofer],
  },
  {
    id: 'frisa-restock',
    titulo: 'Frisa · Restock',
    queEs: 'Qué hay que fabricar o comprar para que no falte ninguna clave de Frisa.',
    paraQueSirve: 'Pedir a tiempo al taller (órdenes FR) y a proveedores.',
    pasos: [
      'Revisa "Por pedir al taller": lo que llega al reorden.',
      'Las órdenes de taller FR las crea ventas; aquí se ligan con "Ligar".',
      'Cuando una orden FR se termine, dale "Subir a bodega".',
      'Para lo que se compra hecho, arma el Pedido de compra; al llegar, dale Recibir y pon lo que llegó de verdad.',
    ],
    tips: [
      'Proyectado = disponible + en proceso + por entrar.',
      'Folio externo (opcional) = el folio de nuestro control interno; se captura al crear la orden de taller o después en el detalle de la orden.',
      'Arriba, "Buscar orden de taller" encuentra una orden por su folio FR o por su folio externo.',
    ],
    roles: [...ADMINS, R.terminado],
  },
  {
    id: 'frisa-movimientos',
    manual: 'frisa-niveles',
    titulo: 'Frisa · Movimientos',
    queEs: 'Cada entrada y salida del inventario de Frisa con su motivo.',
    paraQueSirve: 'Saber de dónde salió una diferencia: entregas, órdenes de taller, compras o ajustes.',
    pasos: [
      'Elige Desde y Hasta.',
      'Elige Bodega (prendas terminadas) o Playera lisa (anaquel).',
      'Busca por producto, OC, orden de taller o persona.',
    ],
    tips: ['Para PDF o Excel ve a Reportes → Movimientos del inventario.'],
    roles: [R.admin_general],
  },
  {
    id: 'frisa-microsip',
    titulo: 'Frisa · Revisión Microsip',
    queEs: 'La comparación del inventario de Frisa contra el reporte de Microsip.',
    paraQueSirve: 'Encontrar y corregir diferencias cada 10 días.',
    pasos: [
      'Exporta de Microsip "Existencia y valor del inventario" (línea FRISA).',
      'Súbelo tal cual (Excel o CSV).',
      'Revisa las diferencias; liga los productos que no reconozca.',
      'Marca las que quieras corregir y dale Ajustar.',
    ],
    tips: ['Si algo se entregó o subió a bodega después de sacar el reporte, puede salir como diferencia: no lo ajustes.'],
    roles: ADMINS,
  },
  {
    id: 'frisa-plantas',
    titulo: 'Frisa · Plantas',
    queEs: 'Cuánto tiene cada planta de Frisa: lo remitido menos lo facturado.',
    paraQueSirve: 'Saber cuánto inventario nuestro hay en cada planta.',
    pasos: [
      'Elige la planta o busca por clave o prenda.',
      'Cada quincena, saca de Microsip "Diarios del inventario" (Concepto: Venta) y dale "Subir facturas".',
      'Revisa las facturas nuevas y confirma.',
      'Usa "Descargar CSV" o "PDF por planta".',
    ],
    tips: ['Las facturas que ya se subieron se saltan solas.'],
    roles: ADMINS,
  },
  {
    id: 'frisa-reportes',
    titulo: 'Frisa · Reportes',
    queEs: 'Los reportes de Frisa para exportar.',
    paraQueSirve: 'Sacar en CSV (Excel) o PDF las órdenes de surtido y los movimientos.',
    pasos: [
      'Elige el reporte.',
      'Pon Desde y Hasta, y el estado si aplica.',
      'Descarga en CSV o ve la vista previa del PDF.',
    ],
    roles: ADMINS,
  },

  // ───────────────────────── Chofer y administración ──────────────────────
  {
    id: 'chofer',
    titulo: 'Inicio del chofer',
    queEs: 'Tu pantalla de trabajo: tareas, órdenes listas para entregar y pendientes.',
    paraQueSirve: 'Saber qué te toca llevar y anotarte lo que tienes que hacer.',
    pasos: [
      'En "Mis tareas" revisa lo que te asignaron y dale ✓ Hecha cuando lo hagas.',
      'Para anotarte algo, escribe la Tarea y dale "+ Agregar".',
      'En "Listas para entregar" ves las órdenes que ya puedes llevar.',
      'En "Pendientes tienda ↔ fábrica" ves lo que va y viene.',
    ],
    tips: ['Si te asignaron Frisa, en Surtido Frisa ves las órdenes por entregar.'],
    roles: [R.chofer],
  },
  {
    id: 'usuarios',
    titulo: 'Usuarios',
    queEs: 'La lista de cuentas de las personas que usan el sistema.',
    paraQueSirve: 'Dar de alta a alguien nuevo, cambiarle el rol o quitarle el acceso.',
    pasos: [
      'Dale "+ Nuevo usuario": nombre, correo, contraseña inicial y Rol.',
      'Para cambiar el nombre o el rol, dale editar.',
      'Si alguien olvidó su contraseña, dale "Cambiar contraseña" y ponle una nueva.',
      'Si alguien ya no trabaja aquí, suspéndelo.',
    ],
    tips: ['El rol decide qué ve cada quien; revisa "Roles y permisos" para el detalle.'],
    roles: [R.admin_general],
  },
  {
    id: 'roles-permisos',
    manual: 'usuarios',
    titulo: 'Roles y permisos',
    queEs: 'Lo que puede hacer cada rol en el sistema.',
    paraQueSirve: 'Dar o quitar acceso a un módulo sin pedir un cambio al sistema.',
    pasos: [
      'Elige el Rol.',
      'Palomea o despalomea lo que puede hacer.',
      'Se guarda al instante; la persona lo ve al recargar la app.',
      'Abajo, en Últimos cambios, ves quién cambió qué.',
    ],
    tips: ['Administración general siempre tiene todo; no se puede quitar.'],
    roles: [R.admin_general],
  },
  {
    id: 'manuales',
    titulo: 'Manuales',
    queEs: 'Cómo se hace cada proceso, paso a paso.',
    paraQueSirve: 'Consultar cómo se hace algo sin tener que preguntar.',
    pasos: [
      'Escribe en "Buscar en todos los manuales", o entra a una sección.',
      'Dale clic al manual para leerlo.',
      'Administración general crea secciones y manuales con "+ Nueva sección" y "+ Nuevo manual".',
    ],
    roles: ['Todos'],
  },
  {
    id: 'procesos',
    titulo: 'Manual Procesos',
    queEs: 'Cómo se hace cada proceso de tienda, fábrica y Frisa, para que todos lo hagan igual.',
    paraQueSirve: 'Saber cuándo aplica, en dónde se hace (Microsip, la página o el papelito) y qué nunca hacer.',
    pasos: [
      'Escoge la pestaña: Tienda, Fábrica o Frisa. O busca por nombre.',
      'Dale clic al proceso para ver los pasos.',
      'Lee la caja roja "Nunca" y los "Si pasa esto → haz esto".',
      'Con "Imprimir" sale una hoja limpia para pegarla en tienda.',
    ],
    roles: ['Todos'],
  },
]

const POR_ID = Object.fromEntries(AYUDA_MODULOS.map((a) => [a.id, a]))

// Clave del manual completo de un módulo (la suya o la de `manual`).
export function claveManualDe(id) {
  const a = POR_ID[id]
  return a ? a.manual || a.id : null
}

// Regresa la ayuda de un módulo, o null si no tiene (el botón no se muestra).
export function ayudaDeModulo(id) {
  const a = POR_ID[id]
  if (!a || !a.titulo || !Array.isArray(a.pasos) || a.pasos.length === 0) return null
  return a
}
