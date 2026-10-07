import { useEffect, useState } from 'react'
import { calcularHorasHabiles, formatMinutosHabiles } from '../../utils/horasHabiles'

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
export default function EtapaCronometro({ iniciadoEn, compacto = false }) {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!iniciadoEn) return null
  const corrido = formatCronometro(ahora - new Date(iniciadoEn).getTime())
  const habil = formatMinutosHabiles(calcularHorasHabiles(iniciadoEn, new Date(ahora)))

  if (compacto) {
    return (
      <span className="etapa-crono etapa-crono--compacto" role="timer">
        <span className="etapa-crono__punto" aria-hidden="true" />
        {corrido} · {habil} hábiles
      </span>
    )
  }

  return (
    <div className="etapa-crono" role="timer" aria-label="Tiempo transcurrido">
      <span className="etapa-crono__estado">
        <span className="etapa-crono__punto" aria-hidden="true" />
        En proceso
      </span>
      <span className="etapa-crono__reloj">{corrido}</span>
      <span className="etapa-crono__habil">Tiempo hábil: {habil}</span>
    </div>
  )
}
