// Revisar con abogado/contador: aviso de privacidad integral (LFPDPPP) armado
// como plantilla. Datos del responsable y fecha en AVISO (content.js).
import { Header, Footer } from './Marco'
import { usePagina } from './comun'
import { AVISO, CORREO_VENTAS } from './content'

export default function AvisoPage() {
  usePagina(
    'Aviso de privacidad | SALPER',
    'Aviso de privacidad integral de SALPER S.A. de C.V. para los datos que se recaban en el formulario de cotización.',
    '/aviso-de-privacidad'
  )
  const correo = <a href={`mailto:${CORREO_VENTAS}`}>{CORREO_VENTAS}</a>

  return (
    <div className="ps">
      <Header />
      <main>
        <section className="ps-pag-hero ps-textura">
          <div className="ps-wrap">
            <p className="ps-kicker ps-kicker--claro">Legal</p>
            <h1 className="ps-titulo ps-titulo--claro">Aviso de privacidad</h1>
            <p>Última actualización: {AVISO.actualizado}</p>
          </div>
        </section>

        <section className="ps-seccion">
          <div className="ps-wrap ps-legal">
            <h2>1. Responsable</h2>
            <p>
              {AVISO.responsable}, con domicilio en {AVISO.domicilio}, es responsable del tratamiento de sus datos
              personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares
              (LFPDPPP), su Reglamento y demás disposiciones aplicables.
            </p>

            <h2>2. Datos personales que recabamos</h2>
            <p>Cuando usted llena el formulario de cotización de este sitio recabamos:</p>
            <ul>
              <li>Nombre.</li>
              <li>Empresa o institución (opcional).</li>
              <li>Teléfono y correo electrónico.</li>
              <li>Sector, productos de interés, cantidad aproximada, personalización, fecha deseada de entrega y el mensaje que nos escriba.</li>
            </ul>
            <p>
              Para evitar abusos del formulario guardamos también una huella cifrada de la dirección IP desde la que se
              envía (no guardamos la IP en sí). No recabamos datos personales sensibles.
            </p>

            <h2>3. Finalidades</h2>
            <p>Sus datos se usan para las siguientes finalidades, necesarias para la relación que usted solicita:</p>
            <ul>
              <li>Atender su solicitud de cotización.</li>
              <li>Contactarle por teléfono, WhatsApp o correo para dar seguimiento comercial a esa solicitud.</li>
            </ul>
            <p>No usamos sus datos para finalidades distintas a las anteriores.</p>

            <h2>4. Transferencias</h2>
            <p>
              No transferimos sus datos personales a terceros, salvo en los casos en que la ley lo exija o lo permita sin
              su consentimiento (artículo 37 de la LFPDPPP), por ejemplo, por requerimiento de una autoridad competente.
              Los proveedores que nos dan servicio de alojamiento y correo electrónico tratan los datos solo por cuenta
              nuestra.
            </p>

            <h2>5. Derechos ARCO</h2>
            <p>
              Usted puede Acceder a sus datos, Rectificarlos, Cancelarlos u Oponerse a su uso (derechos ARCO), así como
              revocar su consentimiento o limitar el uso de sus datos, enviando una solicitud al correo {correo} que
              incluya: su nombre y un medio para comunicarle la respuesta; un documento que acredite su identidad (o la de
              su representante legal); la descripción clara de los datos y del derecho que desea ejercer; y cualquier otro
              elemento que facilite localizar sus datos.
            </p>
            <p>
              Le responderemos en un plazo máximo de 20 días hábiles contados desde que recibamos su solicitud, y, si
              procede, la haremos efectiva dentro de los 15 días hábiles siguientes.
            </p>

            <h2>6. Conservación</h2>
            <p>
              Conservamos sus datos solo el tiempo necesario para atender su solicitud y su seguimiento comercial, y
              después los bloqueamos y eliminamos conforme a la ley.
            </p>

            <h2>7. Cambios a este aviso</h2>
            <p>
              Cualquier cambio a este aviso de privacidad se publicará en esta misma página
              (salperdeportes.com/aviso-de-privacidad), con su fecha de última actualización.
            </p>

            <p className="ps-legal__fecha">Última actualización: {AVISO.actualizado}.</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
