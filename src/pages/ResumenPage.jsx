import { useMemo } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { isActiveStatus } from '../utils/status'
import { formatDate } from '../utils/dates'
import TypeBadge from '../components/orders/TypeBadge'
import StatusBadge from '../components/orders/StatusBadge'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

// Resumen de todo lo que sigue pendiente (no completado, no cancelado),
// agrupado por CLIENTE — no por orden — porque un mismo cliente puede
// tener varias órdenes abiertas al mismo tiempo (de tipos distintos) y
// fábrica necesita verlas juntas, con el total combinado. Dentro de cada
// cliente, cada orden mantiene su propio desglose de prendas/tallas y su
// foto de referencia.
function itemTotal(item) {
  return (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
}

function orderTotal(order) {
  return (order.items || []).reduce((s, item) => s + itemTotal(item), 0)
}

export default function ResumenPage() {
  const { orders, loading, error, refresh } = useOrders()
  const { typesByKey } = useOrderTypes()

  const clientGroups = useMemo(() => {
    const pending = orders.filter((o) => isActiveStatus(o.status) && !o.cancelled_at)

    const byClient = new Map()
    for (const order of pending) {
      const key = order.client_name.trim().toLowerCase()
      if (!byClient.has(key)) {
        byClient.set(key, { clientName: order.client_name.trim(), orders: [] })
      }
      byClient.get(key).orders.push(order)
    }

    const groups = Array.from(byClient.values()).map((group) => {
      const sortedOrders = [...group.orders].sort(
        (a, b) => new Date(a.requested_delivery_date) - new Date(b.requested_delivery_date)
      )
      const total = sortedOrders.reduce((s, o) => s + orderTotal(o), 0)
      const nearestDelivery = sortedOrders[0]?.requested_delivery_date
      return { ...group, orders: sortedOrders, total, nearestDelivery }
    })

    groups.sort((a, b) => new Date(a.nearestDelivery) - new Date(b.nearestDelivery))
    return groups
  }, [orders])

  const grandTotal = clientGroups.reduce((s, g) => s + g.total, 0)
  const orderCount = clientGroups.reduce((s, g) => s + g.orders.length, 0)

  if (loading) return <Loading label="Cargando resumen…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Resumen</h2>
      </div>
      <p className="page-subtitle">
        Todo lo que sigue pendiente ahora mismo, agrupado por cliente — para ver de un vistazo lo que hay en
        proceso aunque sean tipos de orden distintos al mismo tiempo.
      </p>

      {clientGroups.length === 0 ? (
        <EmptyState>No hay órdenes pendientes en este momento.</EmptyState>
      ) : (
        <>
          <div className="items-grand-total" style={{ marginBottom: 24 }}>
            <span>
              Piezas pendientes en {orderCount} orden{orderCount === 1 ? '' : 'es'} de {clientGroups.length}{' '}
              cliente{clientGroups.length === 1 ? '' : 's'}
            </span>
            <b>{grandTotal}</b>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {clientGroups.map((group) => (
              <section key={group.clientName}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 12,
                    borderBottom: '2px solid var(--color-black)',
                    paddingBottom: 8,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 20 }}>{group.clientName}</h3>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {group.orders.length} orden{group.orders.length === 1 ? '' : 'es'} ·{' '}
                    <b style={{ color: 'var(--color-orange-strong)' }}>{group.total} piezas</b>
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {group.orders.map((order) => {
                    const photo = (order.reference_photos || [])[0]
                    return (
                      <article key={order.id} className="card">
                        <div className="order-card__top" style={{ marginBottom: 10 }}>
                          <span className="order-card__number">#{order.order_number}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <TypeBadge type={typesByKey[order.order_type_key]} />
                            <StatusBadge status={order.status} />
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            marginBottom: 14,
                          }}
                        >
                          {order.description ? (
                            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                              {order.description}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span className="order-card__due">Entrega: {formatDate(order.requested_delivery_date)}</span>
                        </div>

                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {(order.items || []).length === 0 ? (
                              <p className="pantone-hint" style={{ margin: 0 }}>
                                Sin prendas especificadas todavía.
                              </p>
                            ) : (
                              order.items.map((item, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    alignItems: 'center',
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.garment}</div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                      {[item.color, item.pantone].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {(item.sizes || []).map((sz, j) => (
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
                              ))
                            )}
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
                              Total de esta orden: <b style={{ marginLeft: 6 }}>{orderTotal(order)} piezas</b>
                            </div>
                          </div>

                          <div
                            style={{
                              width: 110,
                              height: 110,
                              flexShrink: 0,
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--color-text-muted)',
                              fontSize: 11,
                              textAlign: 'center',
                              padding: 8,
                              overflow: 'hidden',
                            }}
                          >
                            {photo ? (
                              <img
                                src={photo.url}
                                alt={photo.caption || `Referencia orden ${order.order_number}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                              />
                            ) : (
                              'Sin foto de referencia'
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
