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
//   cuandoAplica  — cuándo se usa este manual
//   dondeSeHace   — 'Microsip' | 'Página' | 'Papelito Salper' (uno o varios)
//   pasos         — en orden. Un paso con sublista: { texto: '...', sub: ['...', '...'] }
//   nunca         — (opcional) reglas que no se rompen (salen en rojo)
//   bifurcaciones — (opcional) [{ si: 'pasa esto', entonces: 'haz esto' }] (si: sin "Si" y en minúscula,
//                   salvo nombres: 'Microsip dice…')
//   relacionados  — (opcional) ids de otros manuales de este archivo
//   moduloLink    — (opcional) ruta del módulo de la página ("Ir al módulo")

export const SECCIONES_PROCESOS = ['Tienda', 'Fábrica', 'Frisa']

export const SISTEMAS = ['Microsip', 'Página', 'Papelito Salper']

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
        entonces: 'Ver manual "Venta a crédito con remisión".',
        manual: 'venta-credito-remision',
      },
    ],
    relacionados: ['venta-credito-remision'],
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
]

const POR_ID = Object.fromEntries(MANUALES_PROCESOS.map((m) => [m.id, m]))

export function manualProceso(id) {
  return POR_ID[id] || null
}
