// Insignia del logo: mientras no exista el archivo real de SALPER, es una
// placa negra con el nombre en texto. Cuando llegue el logo real, basta
// con poner el archivo en src/assets/salper-logo.png y reemplazar el
// contenido de este componente por <img src={logo} alt="SALPER" /> — el
// resto de la app no tiene que cambiar, todos usan <Logo />.
export default function Logo() {
  return <span className="app-header__badge">SALPER</span>
}
