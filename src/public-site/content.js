// Todos los textos, teléfonos, correos y enlaces de la página pública.
// Edita aquí sin tocar los componentes.

// Número de WhatsApp de ventas: 52 + 10 dígitos, sin espacios ni signos.
export const WHATSAPP_VENTAS = '528711325140'
export const WHATSAPP_MENSAJE = 'Hola, me interesa información sobre uniformes SALPER.'

export function linkWhatsApp(mensaje = WHATSAPP_MENSAJE) {
  return `https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(mensaje)}`
}

// Redes sociales: pega la URL completa. Vacía = el ícono no se muestra.
export const FACEBOOK_URL = ''
export const INSTAGRAM_URL = ''
export const REDES = { facebook: FACEBOOK_URL, instagram: INSTAGRAM_URL }

// Correo de ventas para cotizaciones (también es el de derechos ARCO).
export const CORREO_VENTAS = 'ventas@gruposalper.com'

// Un dato "vacío" es '' / null o un texto que empieza con TODO: no se muestra.
export function hayDato(v) {
  if (v == null) return false
  if (Array.isArray(v)) return v.some(hayDato)
  const t = String(v).trim()
  return t !== '' && !/^TODO/i.test(t)
}

export const PDF_PERFIL = '/docs/Perfil_SALPER_2025.pdf'
export const PDF_CATALOGO = '/docs/Catalogo_Industrial_2025.pdf'

// Menú. `id` = ancla en la página de inicio; `href` = página aparte.
export const NAV = [
  { id: 'nosotros', label: 'Nosotros' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'catalogo', label: 'Catálogo', href: '/catalogo' },
  { id: 'escolar', label: 'Escolar', href: '/escolar' },
  { id: 'tienda', label: 'Tienda', href: '/tienda' },
  { id: 'contacto', label: 'Contacto' },
]

export const HERO = {
  desde: 'Desde 1970',
  frase: 'Fabricantes de uniformes industriales, corporativos y escolares en Torreón, Coahuila.',
  botonCatalogo: 'Ver catálogo',
  botonContacto: 'Contáctanos',
}

export const NOSOTROS = {
  titulo: 'Sobre nosotros',
  imagen: '/img/sitio/nosotros.webp',
  parrafos: [
    'SALPER S.A. de C.V. es una empresa mexicana fundada en 1970 por el empresario Salvador Pérez Valdés, con sede en Torreón, Coahuila, su ciudad natal. Desde sus inicios se ha distinguido por su compromiso con la calidad, la innovación y la excelencia en el servicio.',
    'En 1994 construyó una nave industrial moderna de 1,600 m², diseñada para albergar hasta 250 colaboradores.',
    'A inicios del nuevo milenio entró a la confección de ropa industrial, para exportación y mercado local, incluyendo prendas con propiedades retardantes al fuego, antiestáticas y diseñadas para aplicaciones específicas.',
    'Hoy es proveedor estratégico a nivel mayorista y minorista para consorcios empresariales, instituciones educativas y sectores público y privado.',
  ],
  datos: [
    { valor: '1970', etiqueta: 'Año de fundación' },
    { valor: '1,600 m²', etiqueta: 'Nave industrial' },
    { valor: '250', etiqueta: 'Operadores de capacidad' },
    { valor: '2,000+', etiqueta: 'Artículos en tienda' },
  ],
}

export const INSTALACION = {
  titulo: 'Instalación de producción',
  imagen: '/img/sitio/nave.webp',
  texto:
    'Nuestra nave industrial de 1,600 m² tiene capacidad para hasta 250 operadores y un área administrativa. Cada espacio está planificado para la productividad: distribución eficiente de las áreas de trabajo, buena iluminación y ventilación para el desempeño y la seguridad del personal.',
  procesosTitulo: 'Procesos',
  procesos: [
    { id: 'diseno', nombre: 'Diseño', texto: 'Conceptualización del uniforme y su imagen.' },
    { id: 'corte', nombre: 'Corte', texto: 'Trazo y corte preciso de cada pieza.' },
    { id: 'costura', nombre: 'Costura', texto: 'Confección con estándares de calidad.' },
    { id: 'serigrafia', nombre: 'Serigrafía', texto: 'Estampado de logotipos y gráficos.' },
    { id: 'bordado', nombre: 'Bordado', texto: 'Logotipos bordados de larga duración.' },
    { id: 'sublimacion', nombre: 'Sublimación', texto: 'Diseños a todo color en la tela.' },
    { id: 'empaque', nombre: 'Empaque', texto: 'Entrega ordenada y lista para usar.' },
  ],
}

// Tienda deportiva (comercializadora): /tienda, /escolar, footer y JSON-LD.
// Horario: `dias` 0 = domingo … 6 = sábado; horas en 24 h, hora de Torreón.
export const TIENDA = {
  titulo: 'Tienda deportiva',
  imagen: '/img/sitio/tienda.webp',
  texto: [
    'Nuestra tienda está en el centro de Torreón, en un punto de fácil acceso para clientes de la ciudad y de toda la región.',
    'Contamos con más de 2,000 artículos deportivos de múltiples disciplinas para deportistas y equipos de todos los niveles.',
  ],
  calle: 'Calle Rodríguez 47 Nte., esquina con Blvd. Independencia',
  colonia: 'Col. Centro',
  ciudad: 'Torreón',
  estado: 'Coahuila',
  pais: 'MX',
  telefono: '871 242 9365',
  horario: [
    { etiqueta: 'Lunes a viernes', dias: [1, 2, 3, 4, 5], abre: '09:00', cierra: '19:00' },
    { etiqueta: 'Sábado', dias: [6], abre: '09:00', cierra: '18:00' },
    { etiqueta: 'Domingo', dias: [0], abre: '10:00', cierra: '14:00' },
  ],
  zonaHoraria: 'America/Monterrey',
  // Búsqueda para el mapa y el botón "Cómo llegar" (Google Maps, sin API key).
  mapaBusqueda: 'Calle Rodríguez 47 Norte, Centro, Torreón, Coahuila',
  // Marcas que manejamos, p. ej. ['Marca 1', 'Marca 2']. Vacío = no se muestra el bloque.
  marcas: [],
}

// Planta de producción: solo dirección (no es punto de venta, sin horario ni mapa).
export const PLANTA = {
  titulo: 'Planta de producción',
  direccion: 'Calle O 472, Col. Eduardo Guerra, Torreón, Coahuila',
  nota: 'No es punto de venta',
}

// Logos recortados de la página 6 del Perfil 2025 (public/img/clientes).
export const CLIENTES = [
  { nombre: 'Peñoles', logo: 'penoles.png' },
  { nombre: 'ATR Autosistemas de Torreón', logo: 'atr.png' },
  { nombre: 'UANE', logo: 'uane.png' },
  { nombre: 'Instituto Domus', logo: 'domus.png' },
  { nombre: 'Alfa Seguridad', logo: 'alfa-seguridad.png' },
  { nombre: 'Las Villas Grupo Inmobiliario', logo: 'las-villas.png' },
  { nombre: 'Cimaco', logo: 'cimaco.png' },
  { nombre: 'Frisa', logo: 'frisa.png' },
  { nombre: 'Emyasa', logo: 'emyasa.png' },
  { nombre: 'Lala', logo: 'lala.png' },
  { nombre: 'Colegio Juan Beckmann', logo: 'colegio-juan-beckmann.png' },
  { nombre: 'Lottus Education', logo: 'lottus.png' },
  { nombre: 'Punto+', logo: 'punto.png' },
  { nombre: 'Global Safety Textiles', logo: 'global-safety-textiles.png' },
  { nombre: 'Fimsa', logo: 'fimsa.png' },
  { nombre: 'Ximple Logistics', logo: 'ximple.png' },
  { nombre: 'Lozoya', logo: 'lozoya.png' },
]

export const UNIFORMES = [
  { nombre: 'Chaleco Brigadista', imagen: '/img/catalogo/chaleco-brigadista.webp' },
  { nombre: 'Bata', imagen: '/img/sitio/bata.webp' },
  { nombre: 'Overol', imagen: '/img/catalogo/overol.webp' },
  { nombre: 'Camisola y pantalón de Mezclilla', imagen: '/img/catalogo/camisa-mezclilla.webp' },
  { nombre: 'Playera Polo Dryfit', imagen: '/img/catalogo/polo-femenil.webp' },
  { nombre: 'Chamarra', imagen: '/img/catalogo/sudadera.webp' },
  { nombre: 'Camisa Corporativa', imagen: '/img/catalogo/camisa-caballero.webp' },
  { nombre: 'Blusa Corporativa', imagen: '/img/catalogo/blusa-femenil.webp' },
  { nombre: 'Quirúrgicos', imagen: '/img/catalogo/quirurgico-basic.webp' },
]

export const COMPETITIVIDAD = {
  titulo: 'Factores de competitividad',
  sellos: [
    { nombre: 'UL', logo: '/img/sitio/ul.png' },
    { nombre: 'Intertek', logo: '/img/sitio/intertek.png' },
  ],
  factores: [
    { titulo: 'Certificación UL', texto: 'Asegura la calidad de fabricación y de materias primas en uniformes de trabajo y deportivos.' },
    { titulo: 'Auditoría Intertek', texto: 'Empresa socialmente responsable, en cumplimiento con requisitos legales laborales e impuestos.' },
    { titulo: 'Empresa 100% integrada', texto: 'Maquinaria, capacidad y experiencia en cada proceso.' },
    { titulo: 'Política de ventas', texto: 'Alianza con clientes, precio y entregas oportunas, inventario exclusivo según su proyección de consumo.' },
    { titulo: 'Gran inventario', texto: 'Más de 2,000 artículos con existencia constante.' },
  ],
}

export const DESCARGAS = [
  { titulo: 'Perfil corporativo 2025', detalle: 'PDF · 9 páginas', href: PDF_PERFIL },
  { titulo: 'Catálogo industrial 2025', detalle: 'PDF · 17 páginas', href: PDF_CATALOGO },
]

export const CONTACTO = {
  titulo: 'Contacto',
  personas: [
    { nombre: 'Armando Pérez Towns', telefono: '871 132 5140', correo: 'armando.pt@salperdeportes.com' },
    { nombre: 'General', telefono: '871 242 9365', correo: 'contacto@salperdeportes.com' },
  ],
  botonWhatsApp: 'Escríbenos por WhatsApp',
  copyright: 'SALPER S.A. de C.V. · Torreón, Coahuila',
}

// ---------------------------------------------------------------------
// Fase 2
// ---------------------------------------------------------------------

export const HISTORIA = {
  titulo: 'Nuestra historia',
  hitos: [
    { anio: '1970', texto: 'Salvador Pérez Valdés funda SALPER en Torreón, Coahuila, como proveedor de artículos deportivos.' },
    { anio: '1994', texto: 'Se construye la nave industrial de 1,600 m², con capacidad para 250 colaboradores, para fabricar uniformes.' },
    { anio: '2000s', texto: 'Entrada a la confección de ropa industrial para exportación y mercado nacional, incluidas prendas retardantes al fuego, antiestáticas y para aplicaciones especiales.' },
    { anio: 'Hoy', texto: 'Proveedor estratégico de consorcios empresariales, instituciones educativas y sector público y privado, con más de 50 años de trayectoria.' },
  ],
}

export const MISION_VISION = {
  titulo: 'Misión, visión y valores',
  mision: 'Vestir a las empresas, instituciones y deportistas de México con uniformes y artículos de calidad, fabricados con procesos 100% integrados, entregados a tiempo y con un servicio cercano.',
  vision: 'Ser la empresa referente del norte de México en uniformes industriales, corporativos y escolares, reconocida por su calidad certificada, su capacidad de respuesta y sus relaciones de largo plazo con cada cliente.',
  valores: [
    { icono: 'calidad', nombre: 'Calidad', texto: 'Cuidamos cada puntada, de la materia prima al empaque.' },
    { icono: 'reloj', nombre: 'Cumplimiento', texto: 'Lo que prometemos, lo entregamos a tiempo.' },
    { icono: 'saludo', nombre: 'Cercanía', texto: 'Tratamos a cada cliente como socio, no como pedido.' },
    { icono: 'escudo', nombre: 'Responsabilidad', texto: 'Con nuestra gente, con la ley y con nuestra comunidad.' },
    { icono: 'equipo', nombre: 'Trabajo en equipo', texto: 'De diseño a terminado, una sola SALPER.' },
    { icono: 'mejora', nombre: 'Mejora continua', texto: 'Siempre buscamos hacerlo mejor que ayer.' },
  ],
}

// `categoria` = filtro del catálogo (una de CATEGORIAS en catalogo.js);
// `href` manda a otra página en lugar del catálogo.
export const SECTORES = {
  titulo: 'Sectores que atendemos',
  lista: [
    { id: 'mineria', icono: 'mineria', nombre: 'Minería y metalurgia', texto: 'Prendas resistentes para condiciones extremas.', prendas: 'Overol, camisola de gabardina, mezclilla con reflejante', categoria: 'Industrial / Seguridad' },
    { id: 'industria', icono: 'fabrica', nombre: 'Industria y manufactura', texto: 'Uniformes de planta y alta visibilidad.', prendas: 'Camisola, pantalón, chaleco, uniforme de seguridad', categoria: 'Industrial / Seguridad' },
    { id: 'alimentos', icono: 'alimentos', nombre: 'Alimentos', texto: 'Prendas cómodas, fáciles de lavar e higiénicas.', prendas: 'Bata, camisola, polo', categoria: 'Corporativo' },
    { id: 'salud', icono: 'salud', nombre: 'Salud', texto: 'Uniformes cómodos y funcionales para hospitales y clínicas.', prendas: 'Quirúrgico Confort y Basic, bata', categoria: 'Médico' },
    { id: 'educacion', icono: 'educacion', nombre: 'Educación', texto: 'Uniformes escolares y para personal docente.', prendas: 'Uniforme escolar, polo, sudadera', href: '/escolar' },
    { id: 'gastronomia', icono: 'gastronomia', nombre: 'Gastronomía', texto: 'Filipinas y uniformes de cocina.', prendas: 'Uniforme gastronomía', categoria: 'Gastronomía' },
    { id: 'seguridad', icono: 'escudo', nombre: 'Seguridad privada', texto: 'Uniformes con imagen profesional.', prendas: 'Uniforme de seguridad, chamarra', categoria: 'Industrial / Seguridad' },
    { id: 'corporativo', icono: 'maletin', nombre: 'Corporativo y comercio', texto: 'Imagen de marca para oficinas y piso de venta.', prendas: 'Camisa y blusa corporativa, polo Dry Tech, sudadera', categoria: 'Corporativo' },
  ],
}

export const SERVICIOS = {
  titulo: 'Personalización y maquila',
  texto: 'Le ponemos tu marca a cada prenda y ponemos nuestra planta a tu servicio.',
  lista: [
    { id: 'bordado', nombre: 'Bordado', texto: 'Logotipos y nombres en múltiples ubicaciones de la prenda.', imagen: '/img/catalogo/seguridad-2.webp' },
    { id: 'sublimacion', nombre: 'Sublimación', texto: 'Diseños a todo color en prendas de poliéster, ideal para deportivos y sudaderas.', imagen: '/img/catalogo/sudadera-2.webp' },
    { id: 'serigrafia', nombre: 'Serigrafía', texto: 'Impresión duradera para volumen.', imagen: '' },
    { id: 'maquila', nombre: 'Maquila para terceros', texto: 'Ponemos nuestra planta a tu servicio: corte, costura, bordado, sublimado y terminado por proceso o completo.', imagen: '/img/sitio/nave.webp' },
  ],
  cta: 'Cotiza tu proyecto',
}

export const COMO_TRABAJAMOS = {
  titulo: 'Cómo trabajamos',
  pasos: [
    { icono: 'chat', nombre: 'Contacto', texto: 'Nos cuentas qué necesitas (formulario, WhatsApp o teléfono).' },
    { icono: 'diseno', nombre: 'Asesoría y muestras', texto: 'Te mostramos telas, modelos y muestrario físico.' },
    { icono: 'pdf', nombre: 'Cotización', texto: 'Precio por prenda, tiempos y condiciones.' },
    { icono: 'check', nombre: 'Aprobación de muestra', texto: 'Confirmas modelo, tallas y personalización (bordado, logo).' },
    { icono: 'costura', nombre: 'Producción', texto: 'Corte, costura, bordado/sublimado y terminado en nuestra propia planta.' },
    { icono: 'camion', nombre: 'Entrega', texto: 'Revisamos cantidades y calidad antes de entregar.' },
  ],
  // Franja de datos: si TODOS están en TODO, la franja no se muestra; si solo
  // algunos, se muestran los que tengan dato.
  datos: [
    { etiqueta: 'Pedido mínimo', valor: 'TODO' },
    { etiqueta: 'Tiempo de entrega típico', valor: 'TODO' },
    { etiqueta: 'Envíos', valor: 'TODO' },
  ],
}

// Formulario de cotización (#cotizar). Los productos salen del catálogo.
export const COTIZACION = {
  titulo: 'Solicita tu cotización',
  texto: 'Cuéntanos qué necesitas y te contactamos en menos de 24 horas hábiles.',
  cantidades: ['Menos de 50', '50 a 200', '200 a 500', 'Más de 500'],
  personalizacion: ['Bordado', 'Sublimación', 'Serigrafía'],
  exito: '¡Gracias! Te contactamos en menos de 24 horas hábiles.',
  whatsappDespues: 'Seguir por WhatsApp',
}

// /escolar. `compra`: 'tienda' (badge verde) o 'anual' (badge ámbar).
// `logo`: ruta en public/img/escolar/ (vacío = escudo genérico).
export const ESCOLAR = {
  titulo: 'Uniformes escolares en Torreón',
  texto: 'Fabricamos los uniformes de varios colegios de la ciudad. Revisa cómo se compra el de tu escuela.',
  colegios: [
    { nombre: 'Instituto Domus', compra: 'tienda', logo: '/img/clientes/domus.png' },
    { nombre: 'IMES', compra: 'tienda', logo: '' },
    { nombre: 'Instituto Tricio', compra: 'anual', logo: '' },
    { nombre: 'Echavarría', compra: 'anual', logo: '' },
    { nombre: 'Avenue', compra: 'anual', logo: '' },
  ],
  compra: {
    tienda: { badge: 'En tienda', texto: 'Disponible en tienda' },
    anual: { badge: 'Pedido anual', texto: 'Pedido anual a través del colegio · existencia limitada en tienda' },
  },
  otroColegio: {
    titulo: '¿Tu colegio no está en la lista?',
    texto: 'Fabricamos uniformes para instituciones; contáctanos.',
    boton: 'Cotizar para mi colegio',
  },
  whatsappTalla: 'Hola, quiero saber si tienen mi talla de uniforme escolar.',
  botonTalla: 'Preguntar por WhatsApp si hay mi talla',
}

// Aviso de privacidad (/aviso-de-privacidad).
// Revisar con abogado/contador: es una plantilla conforme a la LFPDPPP.
export const AVISO = {
  actualizado: '18 de noviembre de 2026',
  responsable: 'SALPER S.A. de C.V.',
  domicilio: 'Calle O 472, Col. Eduardo Guerra, Torreón, Coahuila, México',
}
