import { useEffect, useState } from 'react'
import { formatMinutosHabiles } from '../../utils/horasHabiles'
import { estaPausada, msTrabajados, minutosHabilesTrabajados } from '../../utils/pausasEtapa'

const dos = (n) => String(n).padStart(2, '0')

// MM:SS la primera hora; después H:MM:SS, y con días si la etapa lleva más de uno.
export function formatCronometro(ms) {
  const total = Math.max(Math.floor(ms / 1000), 0)
  const dias = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (dias > 0) return `${dias} d ${h}:${dos(m)}:${dos(s)}`
  if (h > 0) return `${h}:${dos(m)}:${dos(s)}`
  return `${dos(m)}:${dos(s)}`
}

// V139 — tiempo transcurrido de una etapa en proceso, en vivo. El número
// grande es tiempo corrido desde que se inició; abajo va el tiempo hábil
// (8:00 a 18:00, lunes a viernes), que es el que cuenta para el reporte.
// V140 — recibe la fila de la etapa: las pausas no cuentan, y mientras está
// en pausa el reloj se queda quieto (se recalcula de la fila, así que no se
// pierde al recargar).
export default function EtapaCronometro({ etapa, iniciadoEn, compacto = false }) {
  const [ahora, setAhora] = useState(() => Date.now())
  const fila = etapa || { estado: 'en_proceso', iniciado_en: iniciadoEn }
  const pausada = estaPausada(fila)

  useEffect(() => {
    if (pausada) return undefined
    setAhora(Date.now())
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pausada])

  if (!fila.iniciado_en) return null
  const corrido = formatCronometro(msTrabajados(fila, ahora))
  const habil = formatMinutosHabiles(minutosHabilesTrabajados(fila, ahora))
  const clase = 'etapa-crono' + (pausada ? ' etapa-crono--pausada' : '')

  if (compacto) {
    return (
      <span className={clase + ' etapa-crono--compacto'} role="timer">
        <span className="etapa-crono__punto" aria-hidden="true" />
        {pausada ? 'En pausa · ' : ''}
        {corrido} · {habil} hábiles
      </span>
    )
  }

  return (
    <div className={clase} role="timer" aria-label={pausada ? 'Tiempo trabajado, en pausa' : 'Tiempo transcurrido'}>
      <span className="etapa-crono__estado">
        <span className="etapa-crono__punto" aria-hidden="true" />
        {pausada ? 'En pausa' : 'En proceso'}
      </span>
      <span className="etapa-crono__reloj">{corrido}</span>
      <span className="etapa-crono__habil">Tiempo hábil: {habil}</span>
    </div>
  )
}
