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
//   inicioYFin    — (opcional) { inicio: '...', fin: '...', etapa?: 'Impresión' }: cuándo se da
//                   Inicio y cuándo Terminado a la etapa. Sale hasta arriba en dos cajas.
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
  // ---------------------------------------------------------------------
  {
    // F1 — manual principal de Fábrica (va primero).
    id: 'fabrica-flujo-orden',
    seccion: 'Fábrica',
    titulo: 'Flujo completo de una orden',
    resumen: 'De que llega la orden hasta que el cliente la tiene en la mano.',
    dondeSeHace: ['Página', 'Calendario', 'Microsip'],
    pasos: [
      'Llega la orden → se confirma de recibido en la página.',
      'Se programa en el calendario de producción.',
      'Pasa por sus etapas. Cada etapa se marca con Inicio y Terminado en la página (corte, sublimado, bordado, costura, terminado, según la orden).',
      'Cuando termina la última etapa, la orden queda lista.',
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
    resumen: 'Llega una orden nueva: se confirma y se programa.',
    cuandoAplica: 'Llega una orden nueva a fábrica.',
    dondeSeHace: ['Página', 'Calendario'],
    pasos: [
      'Revisa la orden en la página.',
      'Confirma de recibido.',
      'Prográmala en el calendario de producción.',
    ],
    nunca: [
      'Empieces a trabajar una orden que no está confirmada ni programada.',
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
      fin: 'cuando se termina de cortar todo.',
    },
    pasos: [
      'Al empezar el trazo, da Inicio a Corte en la página.',
      'Corta todo.',
      'Al terminar de cortar todo, da Terminado y captura el reporte.',
    ],
    // TODO confirmar con Alfredo — el reporte de corte es PROPUESTA.
    reportar: [
      { texto: 'Piezas cortadas por talla', porConfirmar: true },
      { texto: 'Diferencias contra lo pedido (faltantes o sobrantes)', porConfirmar: true },
      { texto: 'Tela usada (metros o kilos) y tipo de tela', porConfirmar: true },
      { texto: 'Merma o retazo', porConfirmar: true },
      { texto: 'Fallas en la tela o problemas', porConfirmar: true },
      { texto: 'Quién cortó', porConfirmar: true },
    ],
    nunca: [
      'Des Terminado si falta algo por cortar.',
    ],
    bifurcaciones: [
      {
        si: 'salen menos piezas de las pedidas (no alcanzó la tela, la tela venía con fallas).',
        entonces: 'Anótalo en el reporte antes de dar Terminado, para que tienda y terminado lo sepan.',
      },
    ],
    moduloLink: '/',
  },
  {
    // F6
    id: 'fabrica-sublimado',
    seccion: 'Fábrica',
    titulo: 'Sublimado (diseño → impresión → sublimado)',
    resumen: 'Diseño confirmado, impresión y sublimado.',
    dondeSeHace: ['Página'],
    inicioYFin: {
      etapa: 'Impresión',
      inicio: 'cuando empieza a imprimirse.',
      fin: 'cuando termina de imprimirse todo.',
    },
    pasos: [
      'Diseño: sube las propuestas de diseño a la página. Sigue subiendo propuestas hasta que el diseño esté confirmado.',
      'Impresión: ya con el diseño confirmado, da Inicio a la impresión. Al terminar, da Terminado y reporta.',
      'Sublimado: registra cuándo empezó y cuándo terminó el sublimado.',
    ],
    reportarTitulo: 'Al terminar la impresión, reporta:',
    // Litros de tinta: confirmado. Lo demás es PROPUESTA — TODO confirmar con Alfredo.
    reportar: [
      'Litros de tinta usados',
      { texto: 'Papel usado (metros)', porConfirmar: true },
      { texto: 'Reimpresiones o merma', porConfirmar: true },
    ],
    nunca: [
      'Mandes a impresión un diseño que no esté confirmado.',
    ],
    bifurcaciones: [
      {
        si: 'el cliente pide cambios al diseño.',
        entonces: 'Sube una nueva propuesta. No se imprime hasta que quede confirmada.',
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
      fin: 'cuando sale la última pieza.',
    },
    pasos: [
      'Revisa en la orden dónde va cada bordado (ubicaciones y fotos).',
      'Al poner la primera pieza, da Inicio.',
      'Si se para el trabajo, usa Pausar y después Reanudar.',
      'Cuando sale la última pieza, da Terminado.',
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
      fin: 'cuando sale la última pieza de la línea.',
    },
    pasos: [
      'Cuando la orden entra a la línea, da Inicio a Costura.',
      'Cuando sale la última pieza de la línea, da Terminado.',
    ],
    nunca: [
      'Des Terminado mientras quede alguna pieza en la línea.',
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
      fin: 'cuando se dobla la última pieza y la orden está lista para que se la lleven.',
    },
    pasos: [
      'Cuando sale la primera pieza de la línea, da Inicio a Terminado. Puede empezar mientras costura sigue trabajando.',
      'Si se para el trabajo, usa Pausar y después Reanudar.',
      'Captura las cantidades surtidas reales por partida (con comentarios si hay diferencias).',
      'Cuando se dobla la última pieza, da Terminado. La orden queda lista.',
    ],
    moduloLink: '/',
  },
  {
    // F8
    id: 'fabrica-entrega',
    seccion: 'Fábrica',
    titulo: 'Entrega de la orden',
    resumen: 'La orden está lista: recepción en Microsip y entrega.',
    cuandoAplica: 'La orden está lista.',
    dondeSeHace: ['Página', 'Microsip'],
    pasos: [
      'Haz la recepción de mercancía en Microsip (según el manual de fábrica).',
      'Según cómo se entregue: ver abajo "Si pasa esto → haz esto".',
    ],
    nunca: [
      'Entregues sin recepción en Microsip.',
      'Dejes una orden entregada sin marcarla en la página.',
    ],
    bifurcaciones: [
      {
        si: 'se entrega directo al chofer para llevarla a la empresa o al cliente.',
        entonces: 'Se marca en la página como entregado al cliente.',
      },
      {
        si: 'se entrega a la tienda.',
        entonces: 'La encargada de tienda la recibe y la marca como recibida en la página. Cuando el cliente la recoge en tienda, ella la marca como entregado al cliente (checar saldo y registrar pago antes de entregar).',
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
