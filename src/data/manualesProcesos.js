// Manual de Procesos — cómo se hace cada proceso, igual para todos.
// Módulo aparte de "Manuales" (ese vive en la base; este NO toca la base):
// el contenido vive solo en este archivo. Pantallas: src/pages/ManualProcesosPage.jsx
// (rutas /procesos y /procesos/:id).
//
// Cómo editar: cambia el texto entre comillas y guarda. Cada manual:
//   id            — va en la dirección (/procesos/<id>); no lo cambies
//   seccion       — 'Tienda' | 'Fábrica' | 'Frisa'
//   titulo        — nombre del proceso
//   resumen       — una línea para la tarjeta de la lista
//   cuandoAplica  — (opcional) cuándo se usa este manual
//   dondeSeHace   — 'Microsip' | 'Página' | 'Papelito Salper' | 'Calendario' (uno o varios)
//   pasos         — en orden. Un paso con sublista: { texto: '...', sub: ['...', '...'] }
//   nunca         — (opcional) reglas que no se rompen (salen en rojo)
//   bifurcaciones — (opcional) [{ si: 'pasa esto', entonces: 'haz esto' }] (si: sin "Si" y en minúscula,
//                   salvo nombres: 'Microsip dice…')
//                   Con manual: 'id' agrega la liga "Ver manual …" al final del texto.
//   relacionados  — (opcional) ids de otros manuales de este archivo (de cualquier sección)
//   moduloLink    — (opcional) ruta del módulo de la página ("Ir al módulo")
//   inicioYFin    — (opcional) { inicio, fin, etapa?, botonInicio?, botonFin? }: cuándo se da
//                   Inicio y cuándo Terminado a la etapa, y el botón de la página para cada uno.
//                   Sale hasta arriba en dos cajas.
//   reportar      — (opcional) qué se captura al terminar (checklist). Cada renglón es texto o
//                   { texto, porConfirmar: true } (sale "(por confirmar)").
//   reportarTitulo — (opcional) título de esa caja; si no, "Al terminar, reporta:"
//   reportarAntes — (opcional) true: esa caja sale antes de los pasos (ej. "Antes de salir, checa…")
//   manualExterno — (opcional) manual que existe fuera de la página (sale como nota gris)
//   bloques       — (opcional) explicaciones antes de los pasos: [{ titulo, parrafos?: [], items?: [],
//                   tabla?: { columnas: [], filas: [[]] } }]
//   manualesPagina — (opcional) claves de manuales del módulo Manuales (ej. 'frisa-surtido');
//                   salen como ligas "En Manuales" (MANUALES_PAGINA da su título)

export const SECCIONES_PROCESOS = ['Tienda', 'Fábrica', 'Frisa']

export const SISTEMAS = ['Microsip', 'Página', 'Papelito Salper', 'Calendario']

export const MANUALES_PROCESOS = [
  {
    id: 'venta-por-microsip',
    seccion: 'Tienda',
    titulo: 'Venta por Microsip',
    resumen: 'Ventas de tienda que se registran en el sistema.',
    cuandoAplica: 'Cualquier venta de tienda que se registra en el sistema.',
    dondeSeHace: ['Microsip'],
    pasos: [
      'Haz la venta en Microsip.',
      'Verifica que quedó registrada en el sistema.',
    ],
    relacionados: ['venta-credito-remision'],
  },
  {
    id: 'venta-por-fuera',
    seccion: 'Tienda',
    titulo: 'Venta por fuera',
    resumen: 'Ventas que no pasan por Microsip.',
    cuandoAplica: 'Ventas de artículos que no se manejan en Microsip.',
    dondeSeHace: ['Papelito Salper', 'Página'],
    pasos: [
      'Anota la venta en el papelito de Salper.',
      'Descuenta los artículos del inventario en la página.',
      'Cuando ya esté descontado, subraya la venta en el papelito con marcatextos.',
    ],
    nunca: [
      'Subrayes una venta que todavía no descuentas en la página. El subrayado quiere decir "ya está descontado".',
    ],
    bifurcaciones: [
      {
        si: 'encuentras en el papelito una venta sin subrayar.',
        entonces: 'Todavía no se descuenta. Descuéntala en la página y luego subráyala.',
      },
    ],
    // Inventario = artículos por fuera de Microsip (V89).
    moduloLink: '/inventario',
  },
  {
    id: 'venta-credito-remision',
    seccion: 'Tienda',
    titulo: 'Venta a crédito con remisión',
    resumen: 'Se lleva la mercancía hoy; se paga y se factura después.',
    cuandoAplica: 'El cliente se lleva la mercancía hoy, pero paga y/o se le factura después.',
    dondeSeHace: ['Microsip'],
    pasos: [
      'Haz la remisión en Microsip.',
      'Entrega la mercancía junto con la remisión.',
    ],
    nunca: [
      'Entregues sin una remisión hecha en Microsip. Si entregas sin remisión, el inventario queda mal.',
    ],
  },
  {
    id: 'crear-pendiente',
    seccion: 'Tienda',
    titulo: 'Crear un pendiente nuevo',
    resumen: 'Registrar un pendiente nuevo en la página.',
    cuandoAplica: 'Cuando se registra un pendiente nuevo en la página.',
    dondeSeHace: ['Página'],
    pasos: [
      'Primero descuenta del inventario.',
      'Toma los datos del cliente.',
      'Sube el pendiente a la página.',
    ],
    nunca: [
      'Subas el pendiente antes de descontar del inventario.',
    ],
    moduloLink: '/pendientes',
  },
  {
    id: 'salida-almacen',
    seccion: 'Tienda',
    titulo: 'Salida de almacén (bodega → tienda)',
    resumen: 'Bajar mercancía de bodega a tienda.',
    cuandoAplica: 'Cuando hay que bajar mercancía de bodega a tienda.',
    dondeSeHace: ['Microsip'],
    pasos: [
      'Haz la salida de almacén completa.',
      'Haz la salida de bodega a tienda.',
      'Ya puedes bajar la mercancía a tienda.',
    ],
    nunca: [
      'Bajes mercancía a tienda sin haber hecho la salida completa.',
      'Hagas un ajuste de inventario sin checar existencias primero.',
    ],
    bifurcaciones: [
      {
        si: 'Microsip dice que un artículo no tiene existencias.',
        entonces: 'No hagas ningún ajuste todavía. Primero checa el inventario: cuántos hay en tienda y cuántos hay en bodega. Con eso decides.',
      },
    ],
  },
  {
    id: 'entrega-pedidos-fabrica',
    seccion: 'Tienda',
    titulo: 'Entrega en tienda de pedidos de fábrica',
    resumen: 'El cliente recoge en tienda equipos, uniformes, etc.',
    cuandoAplica: 'Un cliente viene a recoger a tienda algo que hizo la fábrica (equipos, uniformes, etc.).',
    dondeSeHace: ['Página'],
    pasos: [
      'Entra a la página y checa el saldo: cuánto debe el cliente.',
      'Cobra lo que falte.',
      'Cuando esté todo pagado, registra en la página: cuánto se pagó, con qué método y quién lo recibió.',
      'Confirma la entrega al cliente en la página.',
    ],
    nunca: [
      'Confirmes la entrega si no está todo pagado y registrado.',
    ],
    bifurcaciones: [
      // Confirmado por Alfredo el 2026-11-22.
      {
        si: 'el cliente va a pagar después.',
        entonces: '',
        manual: 'venta-credito-remision',
      },
    ],
    relacionados: ['venta-credito-remision', 'fabrica-entrega'],
    // Las órdenes (con saldo, pagos y entrega) se buscan desde el Dashboard.
    moduloLink: '/',
  },
  {
    id: 'tomar-pedido-nuevo',
    seccion: 'Tienda',
    titulo: 'Tomar un pedido nuevo',
    resumen: 'Un cliente encarga algo que va a producir la fábrica.',
    cuandoAplica: 'Un cliente encarga algo que va a producir la fábrica.',
    dondeSeHace: ['Página'],
    pasos: [
      'Haz la orden en la página.',
      {
        texto: 'Toma todos los datos completos:',
        sub: [
          'Nombre del cliente',
          'Número de teléfono',
          'Precio unitario',
          'Anticipo',
          '¿Requiere factura? (sí / no)',
          'Diseño',
          'Tallas',
          'Tela',
        ],
      },
      'Revisa que no falte ningún dato antes de guardar.',
    ],
    nunca: [
      'Guardes una orden con datos incompletos.',
    ],
    moduloLink: '/nueva',
  },

  // ---------------------------------------------------------------------
  // Fábrica (Parte 2). Orden de la lista: F1, F2, F3, F6, F5, F4, F7, F8.
  // 2026-11-22: ajustado a cómo funciona la página hoy (botones y campos
  // reales; Alfredo: "toma cómo funciona la página y ponlo en el manual").
  // ---------------------------------------------------------------------
  {
    // F1 — manual principal de Fábrica (va primero).
    id: 'fabrica-flujo-orden',
    seccion: 'Fábrica',
    titulo: 'Flujo completo de una orden',
    resumen: 'De que llega la orden hasta que el cliente la tiene en la mano.',
    dondeSeHace: ['Página', 'Calendario', 'Microsip'],
    pasos: [
      'Llega la orden en "Por Confirmar" → fábrica la confirma en la página y pone el Tiempo estimado de producción.',
      'Con la fecha de entrega y el tiempo estimado, la orden sale sola en el Calendario.',
      'Pasa por sus etapas (corte, sublimado, bordado, costura, terminado, según la orden). En cada una, la estación da Iniciar al empezar y su botón de terminar al acabar.',
      'Cuando termina la última etapa, la orden queda "Lista para entregar".',
      'Se entrega (ver manual "Entrega de la orden").',
      'Todo se registra en la página y en Microsip. En Microsip, la mercancía siempre va con recepción de mercancía hecha en la fábrica.',
    ],
    nunca: [
      'Saques una orden de fábrica sin su recepción de mercancía en Microsip.',
    ],
    relacionados: ['fabrica-recibir-programar', 'fabrica-entrega'],
    manualExterno: 'Recepción de mercancía en Microsip (manual de fábrica)',
  },
  {
    // F2
    id: 'fabrica-recibir-programar',
    seccion: 'Fábrica',
    titulo: 'Recibir, confirmar y programar una orden',
    resumen: 'Llega una orden nueva: se confirma y se le pone su tiempo de producción.',
    cuandoAplica: 'Llega una orden nueva a fábrica (sale en "Por Confirmar").',
    dondeSeHace: ['Página', 'Calendario'],
    pasos: [
      'Abre la orden y revísala: prendas, tallas, fotos y fecha de entrega.',
      'Dale Confirmar (en la pantalla de tu estación) o Confirmar pedido (en "Estado de la orden").',
      'Pon el Tiempo estimado de producción en días y dale Guardar. Con eso la orden sale en el Calendario.',
    ],
    nunca: [
      'Empieces a trabajar una orden que siga en "Por Confirmar".',
    ],
    bifurcaciones: [
      {
        si: 'tienda cambió algo después de que fábrica confirmó.',
        entonces: 'Arriba de la orden sale el aviso de cambios. Revisa qué cambió y dale ✓ Aceptar cambios.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F3
    id: 'fabrica-corte',
    seccion: 'Fábrica',
    titulo: 'Corte',
    resumen: 'Del trazo hasta que se termina de cortar todo.',
    dondeSeHace: ['Página'],
    inicioYFin: {
      inicio: 'cuando se empieza a hacer el trazo.',
      botonInicio: 'Iniciar',
      fin: 'cuando se termina de cortar todo.',
      botonFin: 'Cortado',
    },
    pasos: [
      'Al empezar el trazo, abre la orden y dale Iniciar.',
      'Corta todo.',
      {
        texto: 'Al terminar de cortar todo, llena por cada tela:',
        sub: [
          'Largo del trazo',
          'Piezas por trazo',
          'Número de hojas',
          'Tela, si la prenda no tiene tela asignada',
        ],
      },
      'Si usaste otra tela (ej. vivos), dale + Agregar otro corte y escribe ¿Qué corte es?.',
      'Dale Cortado.',
    ],
    reportarTitulo: 'Al dar Cortado, captura:',
    reportar: [
      'Largo del trazo',
      'Piezas por trazo',
      'Número de hojas',
      'Tela (si la prenda no tiene tela asignada)',
      'Otro corte, si usaste otra tela (ej. vivos)',
    ],
    nunca: [
      'Des Cortado si falta algo por cortar.',
    ],
    bifurcaciones: [
      {
        si: 'no puedes registrar la tela en ese momento.',
        entonces: 'Usa Marcar cortada sin registrar la tela y confirma. Después, en la orden, dale Registrar el corte.',
      },
      {
        si: 'salen menos piezas de las pedidas (no alcanzó la tela, la tela venía con fallas).',
        entonces: 'El corte no tiene dónde anotarlo en la página: avísale a Admin fábrica antes de dar Cortado. Terminado lo captura como Parcial, con su comentario.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F6
    id: 'fabrica-sublimado',
    seccion: 'Fábrica',
    titulo: 'Sublimado (diseño → impresión → sublimado)',
    resumen: 'Diseño autorizado, impresión y sublimado.',
    dondeSeHace: ['Página'],
    inicioYFin: {
      etapa: 'Impresión',
      inicio: 'cuando empieza a imprimirse.',
      botonInicio: 'Iniciar',
      fin: 'cuando termina de imprimirse todo.',
      botonFin: 'Impresa',
    },
    pasos: [
      'Diseño: en Pendientes de diseño abre la orden. En Diseños sube cada propuesta como Propuesta. Cuando quede, súbelo como Diseño final.',
      'Ventas (o Admin fábrica) revisa el Diseño final y da Diseño autorizado. Sin eso, la impresión no te toca.',
      'Impresión: al empezar a imprimir, abre la orden y dale Iniciar. Al terminar de imprimir todo, dale Impresa y captura el reporte.',
      'Sublimado: en Pendientes de sublimado abre la orden. Dale Iniciar al empezar y Sublimada al terminar.',
    ],
    reportarTitulo: 'Al dar Impresa, captura:',
    reportar: [
      'Largo total del trazo (metros)',
      'Tinta en mL de cada color: Azul, Magenta, Amarillo y Negro',
      'Notas (opcional)',
    ],
    nunca: [
      'Mandes a impresión un diseño que no esté autorizado.',
    ],
    bifurcaciones: [
      {
        si: 'el cliente pide cambios al diseño.',
        entonces: 'Sube una nueva Propuesta. Si ya estaba autorizado, Ventas da Quitar autorización (solo mientras no se haya impreso). No se imprime hasta que vuelva a quedar autorizado.',
      },
      {
        si: 'imprimes varias órdenes juntas.',
        entonces: 'En Pendientes de impresión palomea las órdenes y dale Marcar impresas. Capturas el trazo y la tinta del lote una sola vez.',
      },
      {
        si: 'capturaste mal la tinta o los metros.',
        entonces: 'En la pestaña Lotes, dale Corregir números y Guardar corrección.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F5
    id: 'fabrica-bordado',
    seccion: 'Fábrica',
    titulo: 'Bordado',
    resumen: 'Solo si la orden lleva bordado.',
    cuandoAplica: 'Solo si la orden lleva bordado.',
    dondeSeHace: ['Página'],
    inicioYFin: {
      inicio: 'cuando se pone la primera pieza.',
      botonInicio: 'Iniciar',
      fin: 'cuando sale la última pieza.',
      botonFin: 'Terminar',
    },
    pasos: [
      'Abre la orden y revisa dónde va cada bordado en las Fotos de bordado.',
      'Al poner la primera pieza, dale Iniciar.',
      'Si se para el trabajo, dale ⏸ Pausar y después ▶ Reanudar.',
      'Cuando sale la última pieza, dale Terminar.',
    ],
    bifurcaciones: [
      {
        si: 'no ves la orden en tu lista.',
        entonces: 'Todavía no termina Corte. Te aparece en cuanto Corte da Cortado. Mientras, la encuentras con el buscador.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F4
    id: 'fabrica-costura',
    seccion: 'Fábrica',
    titulo: 'Costura',
    resumen: 'De que la orden entra a la línea hasta que sale la última pieza.',
    dondeSeHace: ['Página'],
    inicioYFin: {
      inicio: 'cuando la orden se mete a la línea.',
      botonInicio: 'Iniciar',
      fin: 'cuando sale la última pieza de la línea.',
      botonFin: 'Terminar',
    },
    pasos: [
      'Cuando la orden entra a la línea, ábrela y dale Iniciar.',
      'Cuando sale la última pieza de la línea, dale Terminar.',
    ],
    nunca: [
      'Des Terminar mientras quede alguna pieza en la línea.',
    ],
    bifurcaciones: [
      {
        si: 'no ves la orden en tu lista.',
        entonces: 'Todavía no termina Corte. Te aparece en cuanto Corte da Cortado. Mientras, la encuentras con el buscador.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F7
    id: 'fabrica-terminado',
    seccion: 'Fábrica',
    titulo: 'Terminado',
    resumen: 'De la primera pieza que sale de la línea hasta que la orden está lista.',
    dondeSeHace: ['Página'],
    inicioYFin: {
      inicio: 'cuando sale la primera pieza de la línea.',
      botonInicio: 'Iniciar',
      fin: 'cuando se dobla la última pieza y la orden está lista para que se la lleven.',
      botonFin: 'Confirmar y generar reporte',
    },
    pasos: [
      'Cuando sale la primera pieza de la línea, dale Iniciar. Puede empezar mientras costura sigue trabajando: la orden te aparece en cuanto Costura o Bordado dan Iniciar.',
      'Si se para el trabajo, dale ⏸ Pausar y después ▶ Reanudar.',
      'En cada talla marca Correcta si salieron las piezas pedidas, o Parcial con la Cantidad real y un Comentario.',
      'Cuando se dobla la última pieza, dale Confirmar y generar reporte. La orden queda lista.',
    ],
    reportarTitulo: 'Al dar Confirmar y generar reporte, captura:',
    reportar: [
      'Por cada talla: Correcta, o Parcial con la Cantidad real',
      'Comentario si hay diferencia (opcional)',
    ],
    bifurcaciones: [
      {
        si: 'es una orden de Frisa.',
        entonces: 'Te aparece hasta que Costura da Terminar (en Frisa cada etapa espera a que acabe la anterior).',
      },
      {
        si: 'la orden lleva impresión en prenda.',
        entonces: 'Dale Impresa cuando esté impresa.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F8
    id: 'fabrica-entrega',
    seccion: 'Fábrica',
    titulo: 'Entrega de la orden',
    resumen: 'La orden está lista: recepción en Microsip y entrega.',
    cuandoAplica: 'La orden está "Lista para entregar".',
    dondeSeHace: ['Página', 'Microsip'],
    pasos: [
      'Haz la recepción de mercancía en Microsip (según el manual de fábrica).',
      'La orden sale como "Lista para entregar" (y al chofer en "Listas para entregar").',
      'Cuando el cliente la recibe, en la orden se da Confirmar entrega al cliente. Ese botón solo lo tienen Admin tienda, Admin fábrica y Administración general.',
      'Según cómo se entregue: ver abajo "Si pasa esto → haz esto".',
    ],
    nunca: [
      'Entregues sin recepción en Microsip.',
      'Dejes una orden entregada sin Confirmar entrega al cliente en la página.',
    ],
    bifurcaciones: [
      {
        si: 'se entrega directo al chofer para llevarla a la empresa o al cliente.',
        entonces: 'El chofer la lleva. Cuando el cliente la recibe, Admin tienda, Admin fábrica o Administración general da Confirmar entrega al cliente (el chofer no tiene ese botón).',
      },
      {
        si: 'se entrega a la tienda.',
        entonces: 'La orden se queda en "Lista para entregar" mientras está en tienda (la página no tiene un paso de "recibida en tienda"). Cuando el cliente la recoge: checar saldo, registrar el pago y Admin tienda da Confirmar entrega al cliente.',
        manual: 'entrega-pedidos-fabrica',
      },
    ],
    relacionados: ['entrega-pedidos-fabrica'],
    manualExterno: 'Recepción de mercancía en Microsip (manual de fábrica)',
    moduloLink: '/',
  },
  // ---------------------------------------------------------------------
  // Frisa (Parte 3). Orden de la lista: FR1 … FR7. Nombres de pantallas y
  // botones tomados de la página (Frisa → Órdenes de surtido, Restock,
  // Revisión Microsip) el 2026-11-22. Los manuales que ya existían de Frisa
  // viven en Manuales (base) y se ligan con `manualesPagina`.
  // ---------------------------------------------------------------------
  {
    // FR1 — manual principal de Frisa (va primero).
    id: 'frisa-ciclo',
    seccion: 'Frisa',
    titulo: 'Ciclo completo de Frisa',
    resumen: 'Desde que llega la orden de compra de Frisa hasta que se repone el inventario.',
    dondeSeHace: ['Página', 'Microsip'],
    pasos: [
      'Llega la OC por correo → se sube a la página y se captura en Microsip (ver "Llega una orden de compra de Frisa").',
      'Se surten las órdenes en Frisa → Órdenes de surtido. El chofer surte las órdenes de surtido.',
      'Se hacen las remisiones en Microsip, con base en lo surtido en la página (ver "Hacer las remisiones en Microsip").',
      'Con órdenes surtidas, OC impresas y remisiones, se va a entregar. Al volver se confirma la entrega en la página (ver "Salir a entregar y confirmar la entrega").',
      'Antes de comprar, se revisa el inventario de Microsip contra el de la página en Frisa → Revisión Microsip.',
      'Sin diferencias, se hace la recompra en Frisa → Restock: pedidos de compra y órdenes de taller al mismo tiempo.',
      'Llega lo comprado: el pantalón lo recibe la tienda y las playeras lisas las recibe Terminado en la página. La fábrica produce, hace la recepción en Microsip y sube a bodega en la página.',
    ],
    nunca: [
      'Hagas algo solo en la página o solo en Microsip. Todo se hace en los dos; si no, los inventarios dejan de cuadrar.',
      'Ajustes tú las diferencias entre Microsip y la página: se reportan a Alfredo, nadie más las ajusta.',
    ],
    relacionados: ['frisa-llega-oc', 'frisa-remisiones', 'frisa-entrega', 'frisa-revision-microsip', 'frisa-recompra', 'frisa-recepcion-bodega'],
    manualesPagina: ['frisa-niveles'],
    moduloLink: '/frisa',
  },
  {
    // FR2
    id: 'frisa-llega-oc',
    seccion: 'Frisa',
    titulo: 'Llega una orden de compra de Frisa',
    resumen: 'Subir la OC a la página y capturarla en Microsip.',
    cuandoAplica: 'Llega por correo una OC de cualquier planta de Frisa.',
    dondeSeHace: ['Página', 'Microsip'],
    pasos: [
      'Descarga el PDF de la OC del correo.',
      'En la página entra a Frisa → Órdenes de surtido y dale + Subir orden de compra.',
      {
        texto: 'En "Subir orden de compra de Frisa":',
        sub: [
          'Sube el PDF de la orden de compra. La página lo lee sola ("Leyendo el PDF…").',
          'Revisa Planta, Número de OC, Fecha de la OC y Fecha límite.',
          'Revisa cada renglón: producto y cantidad. Los que dicen "Sugerida por parecido: revísala" hay que checarlos.',
          'Dale Crear orden de surtido.',
        ],
      },
      'Captura la OC en Microsip como pedido en la empresa Frisa.',
      'Revisa que planta, productos, tallas y cantidades sean iguales en la página, en Microsip y en el PDF.',
    ],
    nunca: [
      'Captures una OC solo en uno de los dos sistemas.',
    ],
    relacionados: ['frisa-ciclo', 'frisa-remisiones'],
    manualesPagina: ['frisa-surtido'],
    moduloLink: '/frisa',
  },
  {
    // FR3
    id: 'frisa-remisiones',
    seccion: 'Frisa',
    titulo: 'Hacer las remisiones en Microsip',
    resumen: 'La remisión se hace con lo surtido en la página, no con la OC.',
    cuandoAplica: 'Ya se surtieron las órdenes en la página y se va a preparar la entrega.',
    dondeSeHace: ['Microsip', 'Página'],
    pasos: [
      'En la página abre Frisa → Órdenes de surtido y la orden de cada planta: ahí está lo surtido, renglón por renglón (Producto y piezas).',
      'Haz la remisión en Microsip con base en lo surtido en la página, no en la OC.',
      'Captúrala en el mismo orden que aparece en la página, renglón por renglón (producto y talla).',
      'Al terminar, compara la remisión contra la página: mismas cantidades en cada renglón.',
    ],
    nunca: [
      'Hagas la remisión con lo que pidió la OC si se surtió diferente. Así es como aparecen diferencias en los faltantes.',
    ],
    bifurcaciones: [
      {
        si: 'la remisión no cuadra con lo surtido en la página.',
        entonces: 'Corrige la remisión antes de salir. No se sale a entregar con diferencias.',
      },
    ],
    relacionados: ['frisa-entrega'],
    manualesPagina: ['frisa-surtido'],
    moduloLink: '/frisa',
  },
  {
    // FR4
    id: 'frisa-entrega',
    seccion: 'Frisa',
    titulo: 'Salir a entregar y confirmar la entrega',
    resumen: 'Entregar en cada planta y confirmar en la página que se entregó todo.',
    dondeSeHace: ['Página'],
    reportarTitulo: 'Antes de salir, checa que llevas:',
    reportarAntes: true,
    reportar: [
      'Órdenes surtidas',
      'Órdenes de compra impresas (en la orden: Ver PDF de la orden de compra)',
      'Remisiones de Microsip',
    ],
    pasos: [
      'Entrega en cada planta.',
      'Confirma que se entregó todo correctamente.',
      'En la página, abre la orden en Frisa → Órdenes de surtido y dale Ya entregó el chofer.',
      'Elige Se entregó todo, pon la Fecha de entrega y el Folio de remisión, y guarda.',
      'Con esto, el inventario de la página queda actualizado.',
    ],
    nunca: [
      'Confirmes la entrega en la página sin haber verificado que se entregó completa. Frisa no acepta entregas parciales.',
    ],
    bifurcaciones: [
      {
        si: 'el chofer entregó varias órdenes.',
        entonces: 'Usa Confirmar entregas de Leo para confirmarlas de una vez. Si alguna no se entregó completa, márcala como Parcial o No se entregó.',
      },
    ],
    relacionados: ['frisa-remisiones'],
    manualesPagina: ['frisa-surtido', 'chofer'],
    moduloLink: '/frisa',
  },
  {
    // FR5
    id: 'frisa-revision-microsip',
    seccion: 'Frisa',
    titulo: 'Revisión de inventario Microsip vs página (antes de comprar)',
    resumen: 'Antes de cualquier recompra, el inventario de Microsip y el de la página tienen que cuadrar.',
    cuandoAplica: 'Siempre, antes de hacer cualquier recompra.',
    dondeSeHace: ['Microsip', 'Página'],
    pasos: [
      'Saca de Microsip el reporte "Existencia y valor del inventario" (línea FRISA).',
      'En la página entra a Frisa → Revisión Microsip y sube el archivo tal cual (Excel de Microsip .xlsx o CSV).',
      'Dale Ver diferencias y revisa las diferencias entre la página y Microsip.',
      'Si dice Todo cuadró (sin diferencias), ya puedes hacer la recompra.',
    ],
    nunca: [
      'Hagas pedidos de compra ni órdenes de taller con diferencias sin resolver.',
      'Corrijas ni ajustes tú las diferencias: no piques Ajustar.',
    ],
    bifurcaciones: [
      {
        si: 'hay diferencias.',
        entonces: 'Repórtalas a Alfredo. Él revisa todos los movimientos para encontrar qué está causando la diferencia. No se compra hasta que él lo resuelva y la revisión salga sin diferencias.',
      },
    ],
    relacionados: ['frisa-recompra'],
    manualesPagina: ['frisa-microsip'],
    moduloLink: '/frisa',
  },
  {
    // FR6
    id: 'frisa-recompra',
    seccion: 'Frisa',
    titulo: 'Recompra: pedidos de compra y órdenes de taller',
    resumen: 'Qué pedir, cómo separarlo por producto y hacerlo todo al mismo tiempo.',
    cuandoAplica: 'Ya pasó la revisión de Microsip sin diferencias.',
    dondeSeHace: ['Página', 'Microsip'],
    bloques: [
      {
        titulo: 'Cómo se ve la pantalla (Frisa → Restock)',
        parrafos: [
          'Tiene tres pestañas: Órdenes de taller, Pantalón y Playera lisa. Cada una empieza con la tabla "Lo que no alcanza…" con las columnas Producto, Hay, Viene, Alcanza para, Estado y Pedir.',
          'La página calcula lo que habrá cuando llegue el siguiente pedido: lo de taller se pide cada 7 días y tarda 10; lo que se compra hecho, cada 10 días y tarda 10.',
          'La cantidad sugerida sale en la columna Pedir y ya viene escrita, por talla, en cada recuadro "Orden de taller: …" y en el "Pedido de compra". Puedes cambiarla.',
          'Los niveles salen de los Supuestos (Frisa → Niveles de inventario): máximo 6 semanas de venta (42 días), reorden 4 semanas (28 días) y crítico 20 días.',
        ],
        items: [
          'CRÍTICO (rojo): no alcanza ni para el mínimo cuando llegue el siguiente pedido.',
          'PEDIR (naranja): llega al reorden.',
          'CERCA (amarillo): está a punto de llegar al reorden.',
          'Lo que alcanza no sale; para verlo, palomea Ver todas.',
        ],
      },
      {
        titulo: 'Cómo separarlo según el producto',
        tabla: {
          columnas: ['Producto', 'Qué se hace', 'Procesos en fábrica'],
          filas: [
            ['Pantalón (y bata, bolsa)', 'Solo pedido de compra al proveedor (pestaña Pantalón)', 'Ninguno: llega terminado y lo recibe la tienda'],
            ['Camisa', 'Solo orden de taller', 'Corte → Costura (con reflejante) → Bordado → Terminado. Nuevo Ingreso lleva además Impresión'],
            ['Playera con reflejante', 'Pedido de playera lisa + orden de taller', 'Descosido → Reflejante → Impresión → Terminado'],
            ['Playera sin reflejante', 'Pedido de playera lisa + orden de taller', 'Solo Impresión → Terminado (no se descose)'],
          ],
        },
      },
    ],
    pasos: [
      'Pide lo que la pantalla marca, empezando por lo CRÍTICO y luego lo de PEDIR, con la cantidad sugerida por producto y talla.',
      'Haz el pedido al proveedor.',
      'En ese mismo momento, haz el pedido en la página: pestaña Pantalón → Crear pedido de compra, o pestaña Playera lisa → Crear pedido de playera lisa (con su Proveedor).',
      'Al mismo tiempo, haz las órdenes de taller: en la pestaña Órdenes de taller, en cada recuadro "Orden de taller: …" revisa las piezas por talla y la fecha de Entrega, y dale Crear orden de taller. De cada playera que compraste, la misma cantidad por talla; y de cada camisa.',
      'Revisa que cada playera comprada tenga su orden de taller con la misma cantidad por talla.',
    ],
    nunca: [
      'Hagas un pedido al proveedor sin su pedido de compra en la página.',
      'Compres playeras sin hacer su orden de taller al mismo tiempo.',
    ],
    relacionados: ['frisa-revision-microsip', 'frisa-recepcion-bodega'],
    manualesPagina: ['frisa-restock', 'frisa-niveles'],
    moduloLink: '/frisa',
  },
  {
    // FR7
    id: 'frisa-recepcion-bodega',
    seccion: 'Frisa',
    titulo: 'Recepción de compras, producción y subida a bodega',
    resumen: 'Quién recibe lo que llega y cómo se sube a bodega lo que termina el taller.',
    cuandoAplica: 'Llega mercancía del proveedor o termina una orden de taller de Frisa.',
    dondeSeHace: ['Microsip', 'Página'],
    bloques: [
      {
        titulo: 'Quién recibe lo que llega del proveedor',
        items: [
          'Pantalón → lo recibe la tienda. Llega terminado, no pasa por fábrica.',
          'Playeras lisas → las recibe en la página el personal de Terminado en fábrica.',
        ],
      },
    ],
    pasos: [
      {
        texto: 'Playeras lisas (Terminado):',
        sub: [
          'Entra a Frisa → Restock → Playera lisa. En "Por recibir: pedidos de playera lisa que no han llegado", dale Recibir.',
          'Escribe lo que llegó de verdad por talla y revisa que sea lo de la orden de compra. Dale Recibir: se suma al inventario.',
        ],
      },
      'La orden de taller pasa por todos sus procesos en la página, igual que cualquier orden (ver manuales de Fábrica: Inicio y Terminado de cada etapa).',
      {
        texto: 'Subir a bodega (cuando la orden ya está terminada):',
        sub: [
          'La orden sale en Frisa → Restock → Órdenes de taller, en "Por entrar: terminadas, falta subirlas a bodega", con el botón Subir a bodega.',
          'Sube físicamente la mercancía a bodega.',
          'Haz la recepción de mercancía en Microsip.',
          'Ahora sí, dale Subir a bodega. Corrige si subieron menos (merma, defectos) y dale Confirmar: subir … pzas.',
        ],
      },
      {
        texto: 'Pantalón (tienda):',
        sub: [
          'Entra a Frisa → Restock → Pantalón. En "Por recibir: pedidos de pantalón que no han llegado", dale Recibir.',
          'Escribe lo que llegó de verdad por talla y revisa que sea lo de la orden de compra. Dale Recibir: se suma al inventario.',
          // TODO confirmar con Alfredo: si la recepción del pantalón también se hace en Microsip.
          'Haz la recepción de mercancía en Microsip.',
        ],
      },
    ],
    nunca: [
      'Des Confirmar: subir … pzas si la mercancía no está físicamente en bodega y la recepción no está hecha en Microsip.',
    ],
    bifurcaciones: [
      {
        si: 'lo que llega del proveedor no coincide con la orden de compra (faltan piezas o tallas).',
        entonces: 'Al dar Recibir escribe lo que llegó de verdad y avísale a Alfredo.',
      },
    ],
    relacionados: ['frisa-recompra', 'fabrica-corte', 'fabrica-costura', 'fabrica-bordado', 'fabrica-sublimado', 'fabrica-terminado'],
    manualesPagina: ['frisa-restock'],
    manualExterno: 'Recepción de mercancía en Microsip (manual de fábrica)',
    moduloLink: '/frisa',
  },
]

// Manuales del módulo Manuales (en la base) que se ligan desde aquí, por su clave.
// En la pestaña Frisa salen después de los procesos.
export const MANUALES_PAGINA = {
  'frisa-surtido': 'Cómo surtir una orden',
  'frisa-restock': 'Cómo hacer el restock: crear una orden de taller FR',
  'frisa-niveles': 'Cómo se mantiene el inventario',
  'frisa-microsip': 'Revisión contra Microsip (cada 10 días)',
  'frisa-plantas': 'Plantas Frisa: subir remisiones y facturas',
  'frisa-reportes': 'Reportes de Frisa',
  chofer: 'Inicio del chofer',
}
export const MANUALES_PAGINA_POR_SECCION = {
  Frisa: ['frisa-surtido', 'frisa-restock', 'frisa-niveles', 'frisa-microsip', 'frisa-plantas', 'frisa-reportes'],
}

const POR_ID = Object.fromEntries(MANUALES_PROCESOS.map((m) => [m.id, m]))

export function manualProceso(id) {
  return POR_ID[id] || null
}
