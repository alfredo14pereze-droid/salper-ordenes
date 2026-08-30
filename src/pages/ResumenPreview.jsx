import TypeBadge from '../components/orders/TypeBadge'
import StatusBadge from '../components/orders/StatusBadge'
import { formatDate } from '../utils/dates'

// PREVIEW — no conectado a Supabase todavía. Datos de ejemplo para
// mostrar cómo se vería la pestaña "Resumen": todo lo que sigue
// pendiente (no completado, no cancelado) agrupado por orden, con los
// totales de prendas/tallas de cada una y su foto de referencia a la
// derecha — para que fábrica vea de un vistazo todo lo que hay en
// proceso al mismo tiempo, sin importar el tipo.
const SAMPLE_TYPES = {
  sublimacion: { key: 'sublimacion', label: 'Sublimación', color: '#e8720c' },
  escolar: { key: 'escolar', label: 'Escolar', color: '#e8720c' },
  industrial: { key: 'industrial', label: 'Industrial', color: '#e8720c' },
}

const SAMPLE_ORDERS = [
  {
    order_number: 'SUB-014',
    client_name: 'Halcones FC',
    order_type_key: 'sublimacion',
    status: 'sublimado',
    requested_delivery_date: '2026-09-10',
    reference_photo: null,
    items: [
      {
        garment: 'Playera',
        color: 'Azul rey / Blanco',
        sizes: [
          { talla: 'M', cantidad: 12 },
          { talla: 'L', cantidad: 18 },
          { talla: 'XL', cantidad: 10 },
        ],
      },
      {
        garment: 'Short',
        color: 'Azul rey',
        sizes: [
          { talla: 'M', cantidad: 14 },
          { talla: 'L', cantidad: 16 },
        ],
      },
    ],
  },
  {
    order_number: 'ESC-006',
    client_name: 'Colegio Vanguard',
    order_type_key: 'escolar',
    status: 'cortado',
    requested_delivery_date: '2026-09-05',
    reference_photo: null,
    items: [
      {
        garment: 'Polo',
        color: 'Blanco',
        sizes: [
          { talla: '8', cantidad: 20 },
          { talla: '10', cantidad: 25 },
          { talla: '12', cantidad: 15 },
        ],
      },
    ],
  },
  {
    order_number: 'IND-002',
    client_name: 'Maquiladora Del Norte',
    order_type_key: 'industrial',
    status: 'en_produccion',
    requested_delivery_date: '2026-09-02',
    reference_photo: null,
    items: [
      {
        garment: 'Overol',
        color: 'Gris',
        sizes: [
          { talla: 'CH', cantidad: 8 },
          { talla: 'M', cantidad: 22 },
          { talla: 'G', cantidad: 30 },
          { talla: 'XG', cantidad: 10 },
        ],
      },
    ],
  },
  {
    order_number: 'SUB-015',
    client_name: 'Basquetbol Laguna',
    order_type_key: 'sublimacion',
    status: 'confirmado',
    requested_delivery_date: '2026-09-18',
    reference_photo: null,
    items: [
      {
        garment: 'Jersey',
        color: 'Negro / Amarillo',
        sizes: [
          { talla: 'S', cantidad: 6 },
          { talla: 'M', cantidad: 9 },
          { talla: 'L', cantidad: 9 },
        ],
      },
    ],
  },
]

function itemTotal(item) {
  return item.sizes.reduce((s, sz) => s + sz.cantidad, 0)
}

function orderTotal(order) {
  return order.items.reduce((s, item) => s + itemTotal(item), 0)
}

export default function ResumenPreview() {
  const grandTotal = SAMPLE_ORDERS.reduce((s, o) => s + orderTotal(o), 0)

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Resumen — PREVIEW (datos de ejemplo)</h2>
      </div>
      <p className="page-subtitle">
        Todo lo que sigue pendiente ahora mismo, agrupado por orden — para ver de un vistazo lo que hay en proceso
        aunque sean tipos distintos al mismo tiempo.
      </p>

      <div className="items-grand-total" style={{ marginBottom: 24 }}>
        <span>
          Piezas pendientes en {SAMPLE_ORDERS.length} órdenes abiertas
        </span>
        <b>{grandTotal}</b>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SAMPLE_ORDERS.map((order) => (
          <section key={order.order_number} className="card">
            <div className="order-card__top" style={{ marginBottom: 10 }}>
              <span className="order-card__number">#{order.order_number}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <TypeBadge type={SAMPLE_TYPES[order.order_type_key]} />
                <StatusBadge status={order.status} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h3 className="order-card__client" style={{ margin: 0 }}>
                {order.client_name}
              </h3>
              <span className="order-card__due">Entrega: {formatDate(order.requested_delivery_date)}</span>
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.garment}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{item.color}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {item.sizes.map((sz, j) => (
                        <span
                          key={j}
                          style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '3px 8px',
                            fontSize: 12.5,
                            display: 'flex',
                            gap: 4,
                          }}
                        >
                          <b>{sz.talla}</b>
                          <span style={{ color: 'var(--color-text-muted)' }}>× {sz.cantidad}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 8,
                    marginTop: 2,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    fontSize: 13,
                  }}
                >
                  Total de la orden: <b style={{ marginLeft: 6 }}>{orderTotal(order)} piezas</b>
                </div>
              </div>

              <div
                style={{
                  width: 132,
                  height: 132,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 11.5,
                  textAlign: 'center',
                  padding: 8,
                }}
              >
                Foto de referencia
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
