import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Header, Footer } from './Marco'
import { usePagina } from './comun'
import { Icono, IconoWhatsApp } from './Iconos'
import { CATEGORIAS, PRODUCTOS } from './catalogo'
import { PDF_CATALOGO, linkWhatsApp } from './content'

const cotizar = (p) => linkWhatsApp(`Hola, me interesa cotizar: ${p.nombre}`)

function Ficha({ p }) {
  const filas = [
    ['Composición', p.composicion],
    ['Manga', p.manga],
    ['Corte', p.corte],
    ['Tallas', p.tallas],
  ].filter(([, v]) => v)
  return (
    <dl className="ps-ficha">
      {filas.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Modal({ producto, onCerrar }) {
  const [foto, setFoto] = useState(0)
  const cerrarRef = useRef(null)

  useEffect(() => {
    const prev = document.activeElement
    cerrarRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [onCerrar])

  return (
    <div className="ps-modal" role="dialog" aria-modal="true" aria-label={producto.nombre} onClick={onCerrar}>
      <div className="ps-modal__caja" onClick={(e) => e.stopPropagation()}>
        <button ref={cerrarRef} type="button" className="ps-modal__cerrar" aria-label="Cerrar" onClick={onCerrar}>
          <Icono nombre="cerrar" />
        </button>
        <div className="ps-modal__galeria">
          <img className="ps-modal__principal" src={producto.fotos[foto]} alt={producto.nombre} />
          {producto.fotos.length > 1 && (
            <div className="ps-modal__miniaturas">
              {producto.fotos.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  className={i === foto ? 'is-activa' : ''}
                  onClick={() => setFoto(i)}
                  aria-label={`Foto ${i + 1}`}
                >
                  <img src={f} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ps-modal__info">
          <p className="ps-kicker">{producto.categoria}</p>
          <h2>{producto.nombre}</h2>
          {producto.nota && <p className="ps-modal__nota">{producto.nota}</p>}
          <Ficha p={producto} />
          <a href={cotizar(producto)} className="ps-btn ps-btn--whatsapp" target="_blank" rel="noopener noreferrer">
            <IconoWhatsApp /> Cotizar por WhatsApp
          </a>
          <Link to={`/?producto=${producto.id}#cotizar`} className="ps-btn ps-btn--borde">
            Cotizar con formulario
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function Catalogo() {
  // ?categoria=… (lo usan las tarjetas de "Sectores que atendemos").
  const [params, setParams] = useSearchParams()
  const deUrl = params.get('categoria')
  const categoria = CATEGORIAS.includes(deUrl) ? deUrl : 'Todos'
  const setCategoria = (c) => setParams(c === 'Todos' ? {} : { categoria: c }, { replace: true })
  const [abierto, setAbierto] = useState(null)

  usePagina(
    'Catálogo de uniformes | SALPER Torreón',
    'Catálogo de uniformes SALPER: corporativo, industrial y seguridad, médico, gastronomía y pantalones. Cotiza en línea o por WhatsApp.',
    '/catalogo'
  )

  const productos = useMemo(
    () => (categoria === 'Todos' ? PRODUCTOS : PRODUCTOS.filter((p) => p.categoria === categoria)),
    [categoria]
  )

  return (
    <div className="ps">
      <Header />
      <main>
        <section className="ps-cat-hero ps-textura">
          <div className="ps-wrap">
            <p className="ps-kicker ps-kicker--claro">Catálogo industrial 2025</p>
            <h1 className="ps-titulo ps-titulo--claro">Catálogo de uniformes</h1>
            <p>Todos los modelos en corte Dama y Caballero. Elige un producto para ver sus fotos y cotizarlo por WhatsApp.</p>
          </div>
        </section>

        <div className="ps-filtros-barra">
          <div className="ps-wrap ps-filtros" role="tablist" aria-label="Categorías">
            {['Todos', ...CATEGORIAS].map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={categoria === c}
                className={'ps-chip' + (categoria === c ? ' is-activo' : '')}
                onClick={() => setCategoria(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <section className="ps-seccion ps-seccion--cat">
          <div className="ps-wrap">
            <ul className="ps-productos">
              {productos.map((p) => (
                <li key={p.id} className="ps-producto">
                  <button type="button" className="ps-producto__abrir" onClick={() => setAbierto(p)}>
                    <span className={'ps-producto__foto' + (p.fotoAncha ? ' ps-producto__foto--ancha' : '')}>
                      <img src={p.fotos[0]} alt={p.nombre} loading="lazy" />
                    </span>
                    <span className="ps-producto__cuerpo">
                      <span className="ps-producto__cat">{p.categoria}</span>
                      <strong>{p.nombre}</strong>
                      <Ficha p={p} />
                    </span>
                  </button>
                  <div className="ps-producto__acciones">
                    <a href={cotizar(p)} className="ps-producto__cotizar" target="_blank" rel="noopener noreferrer">
                      <IconoWhatsApp size={18} /> Cotizar por WhatsApp
                    </a>
                    <Link to={`/?producto=${p.id}#cotizar`} className="ps-producto__formulario">
                      Cotizar con formulario
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Footer />

      <a href={PDF_CATALOGO} className="ps-btn ps-btn--primario ps-pdf-flotante" download>
        <Icono nombre="descargar" size={18} /> Descargar catálogo PDF
      </a>

      {abierto && <Modal producto={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}
