import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Header, Footer, BotonWhatsAppFlotante } from './Marco'
import { Icono } from './Iconos'
import {
  HERO,
  NOSOTROS,
  INSTALACION,
  TIENDA,
  CLIENTES,
  UNIFORMES,
  COMPETITIVIDAD,
  DESCARGAS,
} from './content'

export default function Landing() {
  useEffect(() => {
    document.title = 'SALPER | Uniformes industriales y corporativos en Torreón desde 1970'
  }, [])

  return (
    <div className="ps">
      <Header />
      <main>
        <section className="ps-hero ps-textura">
          <div className="ps-wrap ps-hero__contenido">
            <img className="ps-hero__logo" src="/img/sitio/logo-blanco.png" alt="SALPER" width="440" height="198" />
            <p className="ps-hero__desde">{HERO.desde}</p>
            <h1 className="ps-hero__frase">{HERO.frase}</h1>
            <div className="ps-hero__botones">
              <Link to="/catalogo" className="ps-btn ps-btn--primario">
                {HERO.botonCatalogo} <Icono nombre="flecha" size={18} />
              </Link>
              <a href="#contacto" className="ps-btn ps-btn--claro">
                {HERO.botonContacto}
              </a>
            </div>
          </div>
        </section>

        <section id="nosotros" className="ps-seccion">
          <div className="ps-wrap ps-nosotros">
            <div className="ps-nosotros__texto">
              <p className="ps-kicker">Quiénes somos</p>
              <h2 className="ps-titulo">{NOSOTROS.titulo}</h2>
              {NOSOTROS.parrafos.map((p) => (
                <p key={p.slice(0, 20)}>{p}</p>
              ))}
            </div>
            <img
              className="ps-nosotros__img"
              src={NOSOTROS.imagen}
              alt="Uniformes SALPER: industrial, médico y corporativo"
              loading="lazy"
              width="1000"
              height="686"
            />
            <div className="ps-nosotros__datos">
              {NOSOTROS.datos.map((d) => (
                <div key={d.etiqueta} className="ps-dato">
                  <span className="ps-dato__valor">{d.valor}</span>
                  <span className="ps-dato__etiqueta">{d.etiqueta}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="procesos" className="ps-seccion ps-seccion--gris">
          <div className="ps-wrap">
            <div className="ps-instalacion">
              <div>
                <p className="ps-kicker">Fábrica en Torreón</p>
                <h2 className="ps-titulo">{INSTALACION.titulo}</h2>
                <p>{INSTALACION.texto}</p>
              </div>
              <img
                src={INSTALACION.imagen}
                alt="Nave industrial de SALPER"
                loading="lazy"
                width="900"
                height="581"
                className="ps-instalacion__img"
              />
            </div>
            <h3 className="ps-subtitulo">{INSTALACION.procesosTitulo}</h3>
            <ol className="ps-procesos">
              {INSTALACION.procesos.map((p, i) => (
                <li key={p.id} className="ps-proceso">
                  <span className="ps-proceso__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ps-proceso__icono">
                    <Icono nombre={p.id} size={28} />
                  </span>
                  <strong>{p.nombre}</strong>
                  <span className="ps-proceso__texto">{p.texto}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="ps-seccion">
          <div className="ps-wrap ps-tienda">
            <img src={TIENDA.imagen} alt="Artículos deportivos de la tienda SALPER" loading="lazy" width="900" height="1010" />
            <div>
              <p className="ps-kicker">Tienda en el centro de Torreón</p>
              <h2 className="ps-titulo">{TIENDA.titulo}</h2>
              {TIENDA.texto.map((t) => (
                <p key={t.slice(0, 20)}>{t}</p>
              ))}
            </div>
          </div>
        </section>

        <section id="clientes" className="ps-seccion ps-seccion--gris">
          <div className="ps-wrap">
            <p className="ps-kicker ps-centro">Confían en nosotros</p>
            <h2 className="ps-titulo ps-centro">Nuestros clientes</h2>
            <ul className="ps-clientes">
              {CLIENTES.map((c) => (
                <li key={c.logo}>
                  <img src={`/img/clientes/${c.logo}`} alt={c.nombre} title={c.nombre} loading="lazy" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="uniformes" className="ps-seccion">
          <div className="ps-wrap">
            <p className="ps-kicker ps-centro">Lo que fabricamos</p>
            <h2 className="ps-titulo ps-centro">Nuestros uniformes</h2>
            <ul className="ps-uniformes">
              {UNIFORMES.map((u) => (
                <li key={u.nombre} className="ps-uniforme">
                  <img src={u.imagen} alt={u.nombre} loading="lazy" />
                  <span>{u.nombre}</span>
                </li>
              ))}
            </ul>
            <div className="ps-centro">
              <Link to="/catalogo" className="ps-btn ps-btn--primario">
                Ver catálogo completo <Icono nombre="flecha" size={18} />
              </Link>
            </div>
          </div>
        </section>

        <section className="ps-seccion ps-seccion--azul ps-textura">
          <div className="ps-wrap">
            <p className="ps-kicker ps-kicker--claro ps-centro">Por qué SALPER</p>
            <h2 className="ps-titulo ps-titulo--claro ps-centro">{COMPETITIVIDAD.titulo}</h2>
            <div className="ps-sellos">
              {COMPETITIVIDAD.sellos.map((s) => (
                <img key={s.nombre} src={s.logo} alt={`Logotipo ${s.nombre}`} loading="lazy" />
              ))}
            </div>
            <ul className="ps-factores">
              {COMPETITIVIDAD.factores.map((f) => (
                <li key={f.titulo}>
                  <span className="ps-factores__check">
                    <Icono nombre="check" size={18} />
                  </span>
                  <div>
                    <strong>{f.titulo}</strong>
                    <p>{f.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="descargas" className="ps-seccion">
          <div className="ps-wrap">
            <p className="ps-kicker ps-centro">Descargas</p>
            <h2 className="ps-titulo ps-centro">Conoce más de SALPER</h2>
            <div className="ps-descargas">
              {DESCARGAS.map((d) => (
                <a key={d.href} href={d.href} className="ps-descarga" download>
                  <span className="ps-descarga__icono">
                    <Icono nombre="pdf" size={30} />
                  </span>
                  <span>
                    <strong>{d.titulo}</strong>
                    <span className="ps-descarga__detalle">{d.detalle}</span>
                  </span>
                  <Icono nombre="descargar" size={22} className="ps-descarga__flecha" />
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <BotonWhatsAppFlotante />
    </div>
  )
}
