// V31 — arranque en producción con "la idea original" nada más: crear y
// consultar órdenes, cambiar estados de producción, descargar con
// historial de cambios. Todo lo demás se sigue desarrollando en la rama
// `dev` sin afectar esto. Para reactivar un módulo aquí cuando esté
// listo, basta con cambiar su valor a `true` — no hay que deshacer
// ningún otro cambio (el código del módulo sigue completo, solo estaba
// apagado).
//
// Nota sobre "inventarios": no existe un módulo aparte que apagar — lo
// único relacionado en todo el sistema es un checkbox
// ("Inventariado"/"No inventariado") dentro de una prenda con categoría
// "reparación" en Pendientes (ver schema_v17_inventariado.sql). Ese
// checkbox se queda, es parte de Pendientes, no un módulo de inventario
// real — no había nada más que apagar ahí.
export const PEDIDOS_PROVEEDOR_HABILITADO = false
