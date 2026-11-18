import { Link } from 'react-router-dom'
import { Header, Footer, BotonWhatsAppFlotante } from './Marco'
import { Icono } from './Iconos'
import { usePagina, TiendaInfo } from './comun'
import { ESCOLAR } from './content'

export default function EscolarPage() {
  usePagina(
    'Uniformes escolares en Torreón | SALPER',
    'Uniformes escolares en Torreón: Instituto Domus, IMES, Instituto Tricio, Echavarría y Avenue. Cómo comprar el de tu colegio en la tienda SALPER.',
    '/escolar'
  )

  return (
    <div className="ps">
      <Header />
      <main>
        <section className="ps-pag-hero ps-textura">
          <div className="ps-wrap">
            <p className="ps-kicker ps-kicker--claro">Escolar</p>
            <h1 className="ps-titulo ps-titulo--claro">{ESCOLAR.titulo}</h1>
            <p>{ESCOLAR.texto}</p>
          </div>
        </section>

        <section className="ps-seccion">
          <div className="ps-wrap">
            <ul className="ps-colegios">
              {ESCOLAR.colegios.map((c) => {
                const compra = ESCOLAR.compra[c.compra]
                return (
                  <li key={c.nombre} className="ps-colegio">
                    <span className="ps-colegio__logo">
                      {c.logo ? <img src={c.logo} alt={`Logotipo ${c.nombre}`} loading="lazy" /> : <Icono nombre="colegio" size={48} />}
                    </span>
                    <strong>{c.nombre}</strong>
                    <span className={'ps-badge ' + (c.compra === 'tienda' ? 'ps-badge--verde' : 'ps-badge--ambar')}>{compra.badge}</span>
                    <span className="ps-colegio__como">{compra.texto}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="ps-seccion ps-seccion--gris">
          <div className="ps-wrap ps-escolar-abajo">
            <div className="ps-escolar-otro">
              <span className="ps-icono-circulo ps-icono-circulo--grande">
                <Icono nombre="educacion" size={32} />
              </span>
              <h2 className="ps-subtitulo">{ESCOLAR.otroColegio.titulo}</h2>
              <p>{ESCOLAR.otroColegio.texto}</p>
              <Link to="/?sector=educacion#cotizar" className="ps-btn ps-btn--primario">
                {ESCOLAR.otroColegio.boton} <Icono nombre="flecha" size={18} />
              </Link>
            </div>
            <div>
              <h2 className="ps-subtitulo">Compra en nuestra tienda</h2>
              <TiendaInfo whatsapp={ESCOLAR.whatsappTalla} botonWhatsApp={ESCOLAR.botonTalla} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <BotonWhatsAppFlotante />
    </div>
  )
}
