import logo from '../../assets/salper-logo.png'

// Logo real de SALPER (negro sobre transparente): se muestra directo
// sobre el nav blanco, sin placa de fondo — el negro del logo ya hace
// ese trabajo. Si algún día se agrega también la versión en blanco del
// logo, esta pieza es el único lugar que habría que tocar para volver a
// meterlo dentro de una placa oscura.
export default function Logo() {
  return <img src={logo} alt="SALPER" className="app-header__logo-img" />
}
