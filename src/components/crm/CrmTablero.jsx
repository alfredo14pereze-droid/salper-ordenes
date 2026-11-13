import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CRM_ESTATUS, estaAbierto, segmentoLabel } from '../../utils/crm'
import { montoCorto } from '../../utils/crmStats'
import { formatDate } from '../../utils/dates'

// Iniciales del responsable para el circulito de la tarjeta.
function iniciales(nombre) {
  if (!nombre || nombre === '—') return ''
  const p = nombre.replace(/^(lic|ing|dra?|lcc)\.?\s+/i, '').split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase()
}

// Tablero por estatus. Las tarjetas se arrastran de una columna a otra para
// cambiar el estatus (en celular se cambia desde la ficha).
// filas: [{ e, principal, proximo }] (ya filtradas); onMover(empresa, estatus).
export default function CrmTablero({ filas, usuarios, hoy, onMover }) {
  const navigate = useNavigate()
  const [arrastrando, setArrastrando] = useState(null)
  const [sobre, setSobre] = useState(null)

  const columnas = CRM_ESTATUS.map((s) => {
    const lista = filas.filter((f) => f.e.estatus === s.key)
    const monto = lista.reduce((t, f) => t + (Number(s.key === 'ganado' ? f.e.monto_vendido ?? f.e.monto_cotizado : f.e.monto_cotizado) || 0), 0)
    return { ...s, lista, monto }
  })

  function soltar(estatus) {
    const f = arrastrando
    setArrastrando(null)
    setSobre(null)
    if (f && f.e.estatus !== estatus) onMover(f.e, estatus)
  }

  return (
    <div className="crm-tablero" role="list">
      {columnas.map((c) => (
        <section
          key={c.key}
          className={'crm-col' + (sobre === c.key && arrastrando?.e.estatus !== c.key ? ' crm-col--sobre' : '')}
          onDragOver={(ev) => {
            if (!arrastrando) return
            ev.preventDefault()
            if (sobre !== c.key) setSobre(c.key)
          }}
          onDragLeave={(ev) => {
            if (!ev.currentTarget.contains(ev.relatedTarget)) setSobre((s) => (s === c.key ? null : s))
          }}
          onDrop={(ev) => {
            ev.preventDefault()
            soltar(c.key)
          }}
        >
          <header className="crm-col__head">
            <span className="crm-col__punto" style={{ background: c.dot }} />
            <span className="crm-col__titulo">{c.label}</span>
            <span className="crm-col__n">{c.lista.length}</span>
            {c.monto > 0 && <span className="crm-col__monto">{montoCorto(c.monto)}</span>}
          </header>
          <div className="crm-col__tarjetas">
            {c.lista.length === 0 && <div className="crm-col__vacia">{arrastrando ? 'Suelta aquí' : 'Sin prospectos'}</div>}
            {c.lista.map((f) => {
              const { e, principal, proximo } = f
              const resp = e.responsable_id ? usuarios.nombre(e.responsable_id) : ''
              const monto = e.estatus === 'ganado' ? e.monto_vendido ?? e.monto_cotizado : e.monto_cotizado
              const abierto = estaAbierto(e.estatus)
              const vencido = proximo && proximo.fecha < hoy
              return (
                <article
                  key={e.id}
                  role="listitem"
                  className={'crm-tarjeta' + (arrastrando?.e.id === e.id ? ' crm-tarjeta--arrastrando' : '')}
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.effectAllowed = 'move'
                    ev.dataTransfer.setData('text/plain', e.id)
                    setArrastrando(f)
                  }}
                  onDragEnd={() => {
                    setArrastrando(null)
                    setSobre(null)
                  }}
                  onClick={() => navigate(`/crm/${e.id}`)}
                  tabIndex={0}
                  onKeyDown={(ev) => ev.key === 'Enter' && navigate(`/crm/${e.id}`)}
                >
                  <div className="crm-tarjeta__top">
                    <h4 className="crm-tarjeta__nombre">{e.nombre}</h4>
                    {resp && (
                      <span className="crm-avatar" title={resp}>
                        {iniciales(resp)}
                      </span>
                    )}
                  </div>
                  <p className="crm-tarjeta__sub">{principal?.nombre || e.ubicacion || '—'}</p>
                  {(e.segmento || Number(monto) > 0) && (
                    <div className="crm-tarjeta__fila">
                      {e.segmento ? <span className={'crm-tag crm-tag--' + e.segmento}>{segmentoLabel(e.segmento)}</span> : <span />}
                      {monto ? <strong className="crm-tarjeta__monto">{montoCorto(monto)}</strong> : null}
                    </div>
                  )}
                  {proximo ? (
                    <p className={'crm-tarjeta__seg' + (vencido ? ' crm-tarjeta__seg--vencido' : proximo.fecha === hoy ? ' crm-tarjeta__seg--hoy' : '')}>
                      <span aria-hidden>🕑</span> {proximo.nota || 'Volver a contactar'} · {proximo.fecha === hoy ? 'hoy' : formatDate(proximo.fecha, 'd MMM')}
                    </p>
                  ) : abierto ? (
                    <p className="crm-tarjeta__seg crm-tarjeta__seg--sin">Sin seguimiento</p>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
