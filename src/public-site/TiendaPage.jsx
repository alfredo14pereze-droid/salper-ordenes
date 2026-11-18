import { Link } from 'react-router-dom'
import { Header, Footer, BotonWhatsAppFlotante } from './Marco'
import { Icono } from './Iconos'
import { usePagina, TiendaInfo, MapaTienda, linkComoLlegar } from './comun'
import { TIENDA, hayDato } from './content'

export default function TiendaPage() {
  usePagina(
    'Tienda deportiva en el centro de Torreón | SALPER',
    'Tienda deportiva SALPER en el centro de Torreón: más de 2,000 artículos deportivos y uniformes escolares. Dirección, horario y mapa.',
    '/tienda'
  )
  const marcas = TIENDA.marcas.filter(hayDato)

  return (
    <div className="ps">
      <Header />
      <main>
        <section className="ps-pag-hero ps-pag-hero--foto" style={{ '--foto': `url(${TIENDA.imagen})` }}>
          <div className="ps-wrap">
            <p className="ps-kicker ps-kicker--claro">Comercializadora SALPER</p>
            <h1 className="ps-titulo ps-titulo--claro">Tienda deportiva en el centro de Torreón</h1>
            <p>Más de 2,000 artículos deportivos de múltiples disciplinas.</p>
          </div>
        </section>

        <section className="ps-seccion">
          <div className="ps-wrap ps-tienda-pag">
            <div>
              <h2 className="ps-titulo">{TIENDA.titulo}</h2>
              {TIENDA.texto.map((t) => (
                <p key={t.slice(0, 20)}>{t}</p>
              ))}
              <TiendaInfo comoLlegar={false} />
              <div className="ps-tienda-pag__botones">
                <a href={linkComoLlegar()} className="ps-btn ps-btn--primario" target="_blank" rel="noopener noreferrer">
                  <Icono nombre="mapa" size={18} /> Cómo llegar
                </a>
                <Link to="/escolar" className="ps-btn ps-btn--borde">
                  Uniformes escolares <Icono nombre="flecha" size={18} />
                </Link>
              </div>
            </div>
            <MapaTienda />
          </div>
        </section>

        {marcas.length > 0 && (
          <section className="ps-seccion ps-seccion--gris">
            <div className="ps-wrap">
              <h2 className="ps-titulo ps-centro">Marcas que manejamos</h2>
              <ul className="ps-marcas">
                {marcas.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
      <Footer />
      <BotonWhatsAppFlotante />
    </div>
  )
}
