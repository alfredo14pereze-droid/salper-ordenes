// Formulario de cotización (#cotizar en la página de inicio).
// Envía a /api/cotizacion (función de Vercel): ahí se valida, se guarda en
// cotizaciones_web con la llave de servidor y se avisa por correo a ventas.
// El navegador NUNCA escribe directo en Supabase.
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icono, IconoWhatsApp } from './Iconos'
import { PRODUCTOS } from './catalogo'
import { COTIZACION, SECTORES, linkWhatsApp } from './content'

const OTRO = 'Otro'
const VACIO = {
  nombre: '',
  empresa: '',
  telefono: '',
  correo: '',
  sector: '',
  productos: [],
  cantidad_aprox: '',
  personalizacion: [],
  fecha_deseada: '',
  mensaje: '',
  acepta_aviso: false,
  sitio_web: '', // honeypot: las personas no lo ven; si llega lleno, es un bot
}

const hoyISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function validar(f) {
  const e = {}
  if (f.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.'
  if (f.telefono.replace(/\D/g, '').length < 10) e.telefono = 'Escribe un teléfono de 10 dígitos.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.correo.trim())) e.correo = 'Escribe un correo válido.'
  if (!f.acepta_aviso) e.acepta_aviso = 'Necesitamos que aceptes el aviso de privacidad.'
  return e
}

function Chips({ opciones, valor, onCambio, nombre }) {
  const alternar = (o) => onCambio(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o])
  return (
    <div className="ps-form__chips" role="group" aria-label={nombre}>
      {opciones.map((o) => (
        <label key={o} className={'ps-chip ps-chip--check' + (valor.includes(o) ? ' is-activo' : '')}>
          <input type="checkbox" checked={valor.includes(o)} onChange={() => alternar(o)} />
          {o}
        </label>
      ))}
    </div>
  )
}

export default function Cotizacion() {
  const { search } = useLocation()
  const [f, setF] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [estado, setEstado] = useState('editando') // editando | enviando | listo
  const [errorEnvio, setErrorEnvio] = useState('')

  const nombresProductos = useMemo(() => [...PRODUCTOS.map((p) => p.nombre), OTRO], [])
  const sectores = useMemo(() => [...SECTORES.lista.map((s) => s.nombre), OTRO], [])

  // ?producto=<id del catálogo> y ?sector=<id del sector> llegan preseleccionados.
  useEffect(() => {
    const q = new URLSearchParams(search)
    const prod = PRODUCTOS.find((p) => p.id === q.get('producto'))
    const sec = SECTORES.lista.find((s) => s.id === q.get('sector'))
    if (!prod && !sec) return
    setF((v) => ({
      ...v,
      productos: prod && !v.productos.includes(prod.nombre) ? [...v.productos, prod.nombre] : v.productos,
      sector: sec ? sec.nombre : v.sector,
    }))
  }, [search])

  const cambiar = (campo) => (ev) => {
    const valor = ev?.target ? (ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value) : ev
    setF((v) => ({ ...v, [campo]: valor }))
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }))
  }

  async function enviar(ev) {
    ev.preventDefault()
    const e = validar(f)
    setErrores(e)
    if (Object.keys(e).length) {
      document.getElementById(`cot-${Object.keys(e)[0]}`)?.focus()
      return
    }
    setEstado('enviando')
    setErrorEnvio('')
    try {
      const r = await fetch('/api/cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'No se pudo enviar. Intenta de nuevo.')
      setEstado('listo')
    } catch (err) {
      setErrorEnvio(err.message || 'No se pudo enviar. Intenta de nuevo.')
      setEstado('editando')
    }
  }

  const mensajeWhatsApp = `Hola, soy ${f.nombre.trim()}${f.empresa.trim() ? ` de ${f.empresa.trim()}` : ''}. Acabo de enviar una solicitud de cotización en su página.`

  return (
    <section id="cotizar" className="ps-seccion ps-cotizar">
      <div className="ps-wrap ps-cotizar__grid">
        <div className="ps-cotizar__intro">
          <p className="ps-kicker">Cotización</p>
          <h2 className="ps-titulo">{COTIZACION.titulo}</h2>
          <p>{COTIZACION.texto}</p>
          <p>
            ¿Prefieres hablar directo?{' '}
            <a href={linkWhatsApp()} target="_blank" rel="noopener noreferrer" className="ps-enlace">
              Escríbenos por WhatsApp
            </a>
          </p>
        </div>

        {estado === 'listo' ? (
          <div className="ps-form ps-form--listo" role="status">
            <span className="ps-icono-circulo ps-icono-circulo--grande">
              <Icono nombre="check" size={32} />
            </span>
            <h3>{COTIZACION.exito}</h3>
            <a href={linkWhatsApp(mensajeWhatsApp)} className="ps-btn ps-btn--whatsapp" target="_blank" rel="noopener noreferrer">
              <IconoWhatsApp /> {COTIZACION.whatsappDespues}
            </a>
          </div>
        ) : (
          <form className="ps-form" onSubmit={enviar} noValidate>
            <div className="ps-form__fila">
              <Campo id="nombre" label="Nombre" requerido error={errores.nombre}>
                <input id="cot-nombre" autoComplete="name" value={f.nombre} onChange={cambiar('nombre')} maxLength={120} />
              </Campo>
              <Campo id="empresa" label="Empresa o institución">
                <input id="cot-empresa" autoComplete="organization" value={f.empresa} onChange={cambiar('empresa')} maxLength={160} />
              </Campo>
            </div>
            <div className="ps-form__fila">
              <Campo id="telefono" label="Teléfono" requerido error={errores.telefono}>
                <input id="cot-telefono" type="tel" inputMode="tel" autoComplete="tel" value={f.telefono} onChange={cambiar('telefono')} maxLength={30} />
              </Campo>
              <Campo id="correo" label="Correo" requerido error={errores.correo}>
                <input id="cot-correo" type="email" autoComplete="email" value={f.correo} onChange={cambiar('correo')} maxLength={160} />
              </Campo>
            </div>
            <div className="ps-form__fila">
              <Campo id="sector" label="Sector">
                <select id="cot-sector" value={f.sector} onChange={cambiar('sector')}>
                  <option value="">Elige uno</option>
                  {sectores.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Campo>
              <Campo id="cantidad_aprox" label="Cantidad aproximada de prendas">
                <select id="cot-cantidad_aprox" value={f.cantidad_aprox} onChange={cambiar('cantidad_aprox')}>
                  <option value="">Elige una</option>
                  {COTIZACION.cantidades.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Campo>
            </div>
            <fieldset className="ps-form__grupo">
              <legend>Productos de interés</legend>
              <Chips nombre="Productos de interés" opciones={nombresProductos} valor={f.productos} onCambio={cambiar('productos')} />
            </fieldset>
            <fieldset className="ps-form__grupo">
              <legend>¿Necesitas personalización?</legend>
              <Chips nombre="Personalización" opciones={COTIZACION.personalizacion} valor={f.personalizacion} onCambio={cambiar('personalizacion')} />
            </fieldset>
            <div className="ps-form__fila">
              <Campo id="fecha_deseada" label="Fecha deseada de entrega (opcional)">
                <input id="cot-fecha_deseada" type="date" min={hoyISO()} value={f.fecha_deseada} onChange={cambiar('fecha_deseada')} />
              </Campo>
            </div>
            <Campo id="mensaje" label="Mensaje">
              <textarea id="cot-mensaje" rows={4} value={f.mensaje} onChange={cambiar('mensaje')} maxLength={2000} placeholder="Modelos, colores, tallas, logotipo…" />
            </Campo>

            {/* Honeypot anti-spam: fuera de la vista y del tabulador. */}
            <div className="ps-form__trampa" aria-hidden="true">
              <label htmlFor="cot-sitio_web">Sitio web</label>
              <input id="cot-sitio_web" tabIndex={-1} autoComplete="off" value={f.sitio_web} onChange={cambiar('sitio_web')} />
            </div>

            <label className={'ps-form__acepto' + (errores.acepta_aviso ? ' is-error' : '')}>
              <input id="cot-acepta_aviso" type="checkbox" checked={f.acepta_aviso} onChange={cambiar('acepta_aviso')} />
              <span>
                Acepto el <Link to="/aviso-de-privacidad">aviso de privacidad</Link>.
              </span>
            </label>
            {errores.acepta_aviso && <p className="ps-form__error">{errores.acepta_aviso}</p>}

            {errorEnvio && (
              <p className="ps-form__error ps-form__error--envio" role="alert">
                {errorEnvio}
              </p>
            )}
            <button type="submit" className="ps-btn ps-btn--primario ps-form__enviar" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar solicitud'} <Icono nombre="enviar" size={18} />
            </button>
            <p className="ps-form__nota">* Campos obligatorios</p>
          </form>
        )}
      </div>
    </section>
  )
}

function Campo({ id, label, requerido, error, children }) {
  return (
    <div className={'ps-form__campo' + (error ? ' is-error' : '')}>
      <label htmlFor={`cot-${id}`}>
        {label}
        {requerido && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {error && (
        <p className="ps-form__error" id={`cot-${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}
