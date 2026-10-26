// Constantes del cotizador de destajo (un solo lugar para cambiarlas).
//
// Ojo: la base también guarda un precio por segundo y una jornada en
// prod_config ('precio_por_segundo' = 0.025 y 'segundos_jornada' = 25650,
// o sea 427.5 min) para calcular el valor generado de las operadoras. Estas
// constantes son SOLO del cotizador; cambiarlas no toca la captura ni los
// premios.
export const COSTO_POR_SEGUNDO = 0.025

// Minutos efectivos de trabajo por operadora al día (hoja COSTEO del Excel,
// confirmado por Alfredo).
export const MINUTOS_EFECTIVOS_DIA = 425

// Tope de operadoras que se pueden capturar en el cotizador.
export const MAX_OPERADORAS = 60
