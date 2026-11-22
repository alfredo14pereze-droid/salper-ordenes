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
//   manualExterno — (opcional) manual que existe fuera de la página (sale como nota gris)

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
]

const POR_ID = Object.fromEntries(MANUALES_PROCESOS.map((m) => [m.id, m]))

export function manualProceso(id) {
  return POR_ID[id] || null
}
