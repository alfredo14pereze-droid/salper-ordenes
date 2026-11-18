// Todos los textos, teléfonos, correos y enlaces de la página pública.
// Edita aquí sin tocar los componentes.

// Número de WhatsApp de ventas: 52 + 10 dígitos, sin espacios ni signos.
export const WHATSAPP_VENTAS = '528711325140'
export const WHATSAPP_MENSAJE = 'Hola, me interesa información sobre uniformes SALPER.'

export function linkWhatsApp(mensaje = WHATSAPP_MENSAJE) {
  return `https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(mensaje)}`
}

// Redes sociales: deja '#' mientras no tengas la URL (el ícono se oculta).
export const REDES = {
  facebook: '#',
  instagram: '#',
  tiktok: '#',
}

export const PDF_PERFIL = '/docs/Perfil_SALPER_2025.pdf'
export const PDF_CATALOGO = '/docs/Catalogo_Industrial_2025.pdf'

export const NAV = [
  { id: 'nosotros', label: 'Nosotros' },
  { id: 'procesos', label: 'Procesos' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'uniformes', label: 'Uniformes' },
  { id: 'catalogo', label: 'Catálogo', href: '/catalogo' },
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

export const TIENDA = {
  titulo: 'Comercializadora',
  imagen: '/img/sitio/tienda.webp',
  texto: [
    'Nuestra tienda está en el centro de Torreón, en un punto de fácil acceso para clientes de la ciudad y de toda la región.',
    'Contamos con más de 2,000 artículos deportivos de múltiples disciplinas para deportistas y equipos de todos los niveles.',
  ],
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
