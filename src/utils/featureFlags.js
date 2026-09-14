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

// V33 — el catálogo de Proveedores se esconde en producción por ahora
// (pedido explícito del usuario: "escóndelo, lo agregamos después"). El
// código/RPCs siguen completos, solo se oculta la sección en
// CatalogosPage.jsx — reactivarlo es cambiar este valor a `true`.
export const PROVEEDORES_HABILITADO = false

// V38 — TEMPORAL: mientras se sube el historial de órdenes que ya
// estaban activas antes de usar SALPER, "Nueva orden" deja capturar a
// mano la fecha real de creación (si no, todas nacerían con la fecha de
// hoy y ensuciarían Estadísticas — tiempo de producción, tendencia
// mensual, etc.). Pedido explícito del usuario: apagar esto ("quitar
// eso") en cuanto termine de subir las órdenes activas — basta con
// cambiar este valor a `false`, el campo desaparece del formulario y
// las órdenes nuevas vuelven a nacer con la fecha de hoy automática (el
// parámetro del RPC se queda, simplemente deja de mandarse).
export const CAPTURA_FECHA_CREACION_HABILITADA = true
