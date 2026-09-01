import { supabaseServer } from './supabaseServer.js'

// Registro de "tools" que el modelo puede usar — cada una es una
// consulta de solo lectura a Supabase, nunca acceso directo a la base.
// Para agregar una tool nueva (inventario de tela, tiempos de
// producción, cotizador...) solo hay que agregar un objeto más a este
// arreglo con { name, description, input_schema, handler } — nada más
// del módulo de chat necesita tocarse.

const ETAPAS = ['en_confirmacion', 'confirmado', 'cortado', 'sublimado', 'en_produccion', 'completado']

function sumarPiezas(items) {
  return (items || []).reduce(
    (total, item) => total + (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0),
    0
  )
}

function resumenOrden(order) {
  return {
    folio: order.order_number,
    cliente: order.client_name,
    tipo: order.order_type_key,
    etapa: order.status,
    fecha_entrega: order.requested_delivery_date,
    dias_estimados_produccion: order.estimated_production_days,
    total_piezas: sumarPiezas(order.items),
    creada: order.created_at,
  }
}

export const TOOLS = [
  {
    name: 'buscar_ordenes',
    description:
      'Busca órdenes de producción con filtros opcionales (cliente, tipo, etapa, rango de fecha de entrega). ' +
      'También sirve para preguntas tipo "cuántas órdenes entran esta semana/mes": pasa fecha_desde y ' +
      'fecha_hasta y cuenta los resultados. Nunca incluye órdenes canceladas.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: {
          type: 'string',
          description: 'Nombre del cliente, o parte de él (búsqueda parcial, no distingue mayúsculas/minúsculas).',
        },
        tipo: {
          type: 'string',
          description: 'Clave del tipo de orden, ej. "sublimacion", "escolar", "industrial" (o un tipo custom).',
        },
        etapa: {
          type: 'string',
          enum: ETAPAS,
          description: 'Etapa exacta de la orden.',
        },
        fecha_desde: { type: 'string', description: 'Fecha de entrega mínima, formato YYYY-MM-DD.' },
        fecha_hasta: { type: 'string', description: 'Fecha de entrega máxima, formato YYYY-MM-DD.' },
        limite: { type: 'integer', description: 'Máximo de resultados a devolver (default 30, máx 100).' },
      },
    },
    handler: async (input) => {
      let query = supabaseServer.from('orders').select('*').is('cancelled_at', null)

      if (input.cliente) query = query.ilike('client_name', `%${input.cliente}%`)
      if (input.tipo) query = query.eq('order_type_key', input.tipo)
      if (input.etapa) query = query.eq('status', input.etapa)
      if (input.fecha_desde) query = query.gte('requested_delivery_date', input.fecha_desde)
      if (input.fecha_hasta) query = query.lte('requested_delivery_date', input.fecha_hasta)

      const limite = Math.min(Math.max(Number(input.limite) || 30, 1), 100)
      query = query.order('requested_delivery_date', { ascending: true }).limit(limite)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      return { total_encontradas: data.length, ordenes: data.map(resumenOrden) }
    },
  },

  {
    name: 'contar_ordenes_por_etapa',
    description: 'Cuenta cuántas órdenes activas (no canceladas) hay en cada etapa de producción ahora mismo.',
    input_schema: { type: 'object', properties: {} },
    handler: async () => {
      const { data, error } = await supabaseServer.from('orders').select('status').is('cancelled_at', null)
      if (error) throw new Error(error.message)

      const conteo = Object.fromEntries(ETAPAS.map((e) => [e, 0]))
      for (const row of data) conteo[row.status] = (conteo[row.status] || 0) + 1

      return { conteo_por_etapa: conteo, total_activas: data.length }
    },
  },

  {
    name: 'ordenes_atrasadas',
    description:
      'Devuelve las órdenes cuya fecha de entrega ya pasó y que todavía no están completadas ni canceladas, ' +
      'con los días de atraso de cada una.',
    input_schema: { type: 'object', properties: {} },
    handler: async () => {
      const hoy = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabaseServer
        .from('orders')
        .select('*')
        .is('cancelled_at', null)
        .neq('status', 'completado')
        .lt('requested_delivery_date', hoy)
        .order('requested_delivery_date', { ascending: true })
      if (error) throw new Error(error.message)

      return {
        total_atrasadas: data.length,
        ordenes: data.map((o) => ({
          ...resumenOrden(o),
          dias_de_atraso: Math.max(0, Math.floor((Date.now() - new Date(o.requested_delivery_date)) / 86400000)),
        })),
      }
    },
  },
]

export const toolsByName = Object.fromEntries(TOOLS.map((t) => [t.name, t]))
