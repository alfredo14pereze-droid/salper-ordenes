// Secciones nuevas de la página de inicio (Fase 2). Textos en content.js.
import { Link } from 'react-router-dom'
import { Icono } from './Iconos'
import { useAparecer } from './comun'
import { HISTORIA, MISION_VISION, SECTORES, SERVICIOS, COMO_TRABAJAMOS, hayDato } from './content'

export function Historia() {
  const ref = useAparecer()
  return (
    <section id="historia" className="ps-seccion ps-seccion--gris" ref={ref}>
      <div className="ps-wrap">
        <p className="ps-kicker ps-centro">Más de 50 años</p>
        <h2 className="ps-titulo ps-centro">{HISTORIA.titulo}</h2>
        <ol className="ps-linea">
          {HISTORIA.hitos.map((h, i) => (
            <li key={h.anio} className="ps-linea__hito ps-aparece" style={{ '--retraso': `${i * 120}ms` }}>
              <span className="ps-linea__punto" aria-hidden="true" />
              <span className="ps-linea__anio">{h.anio}</span>
              <p>{h.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function MisionVision() {
  const ref = useAparecer()
  return (
    <section id="mision" className="ps-seccion" ref={ref}>
      <div className="ps-wrap">
        <p className="ps-kicker ps-centro">Lo que nos mueve</p>
        <h2 className="ps-titulo ps-centro">{MISION_VISION.titulo}</h2>
        <div className="ps-mv">
          <article className="ps-mv__tarjeta ps-aparece">
            <h3>Misión</h3>
            <p>{MISION_VISION.mision}</p>
          </article>
          <article className="ps-mv__tarjeta ps-mv__tarjeta--azul ps-aparece" style={{ '--retraso': '120ms' }}>
            <h3>Visión</h3>
            <p>{MISION_VISION.vision}</p>
          </article>
        </div>
        <h3 className="ps-subtitulo ps-centro">Valores</h3>
        <ul className="ps-valores">
          {MISION_VISION.valores.map((v, i) => (
            <li key={v.nombre} className="ps-valor ps-aparece" style={{ '--retraso': `${i * 60}ms` }}>
              <span className="ps-icono-circulo">
                <Icono nombre={v.icono} size={24} />
              </span>
              <strong>{v.nombre}</strong>
              <span>{v.texto}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function Sectores() {
  return (
    <section id="sectores" className="ps-seccion">
      <div className="ps-wrap">
        <p className="ps-kicker ps-centro">A quién vestimos</p>
        <h2 className="ps-titulo ps-centro">{SECTORES.titulo}</h2>
        <ul className="ps-sectores">
          {SECTORES.lista.map((s) => {
            const destino = s.href || `/catalogo?categoria=${encodeURIComponent(s.categoria)}`
            return (
              <li key={s.id}>
                <Link to={destino} className="ps-sector">
                  <span className="ps-icono-circulo">
                    <Icono nombre={s.icono} size={24} />
                  </span>
                  <strong>{s.nombre}</strong>
                  <span className="ps-sector__texto">{s.texto}</span>
                  <span className="ps-sector__prendas">{s.prendas}</span>
                  <span className="ps-sector__ver">
                    {s.href ? 'Ver uniformes escolares' : 'Ver en el catálogo'} <Icono nombre="flecha" size={16} />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export function Servicios() {
  return (
    <section id="servicios" className="ps-seccion ps-seccion--gris">
      <div className="ps-wrap">
        <p className="ps-kicker ps-centro">Servicios</p>
        <h2 className="ps-titulo ps-centro">{SERVICIOS.titulo}</h2>
        <p className="ps-centro ps-intro">{SERVICIOS.texto}</p>
        <ul className="ps-servicios">
          {SERVICIOS.lista.map((s) => (
            <li key={s.id} className="ps-servicio">
              {s.imagen ? (
                <img src={s.imagen} alt={s.nombre} loading="lazy" className="ps-servicio__foto" />
              ) : (
                <span className="ps-servicio__foto ps-servicio__foto--icono">
                  <Icono nombre={s.id} size={56} />
                </span>
              )}
              <div className="ps-servicio__cuerpo">
                <strong>{s.nombre}</strong>
                <p>{s.texto}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="ps-centro">
          <a href="#cotizar" className="ps-btn ps-btn--primario">
            {SERVICIOS.cta} <Icono nombre="flecha" size={18} />
          </a>
        </div>
      </div>
    </section>
  )
}

export function ComoTrabajamos() {
  const ref = useAparecer()
  const datos = COMO_TRABAJAMOS.datos.filter((d) => hayDato(d.valor))
  return (
    <section id="como-trabajamos" className="ps-seccion ps-seccion--gris" ref={ref}>
      <div className="ps-wrap">
        <p className="ps-kicker ps-centro">Paso a paso</p>
        <h2 className="ps-titulo ps-centro">{COMO_TRABAJAMOS.titulo}</h2>
        <ol className="ps-pasos">
          {COMO_TRABAJAMOS.pasos.map((p, i) => (
            <li key={p.nombre} className="ps-paso ps-aparece" style={{ '--retraso': `${i * 80}ms` }}>
              <span className="ps-paso__num">{i + 1}</span>
              <span className="ps-icono-circulo">
                <Icono nombre={p.icono} size={24} />
              </span>
              <strong>{p.nombre}</strong>
              <span>{p.texto}</span>
            </li>
          ))}
        </ol>
        {datos.length > 0 && (
          <dl className="ps-franja-datos">
            {datos.map((d) => (
              <div key={d.etiqueta}>
                <dt>{d.etiqueta}</dt>
                <dd>{d.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
