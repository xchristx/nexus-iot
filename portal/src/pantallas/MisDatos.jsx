import { urlKodularLeer, urlKodularPost, datosSketch } from '../api.js'
import { generarPrompt } from '../prompt.js'
import { Bloque, Copiar, Etiqueta, textoRegla } from '../componentes/comunes.jsx'

export default function MisDatos({ config }) {
  const { clave, canales, reglas } = config
  const sensores = canales.filter(c => c.tipo === 'sensor')
  const reles = canales.filter(c => c.tipo === 'rele')
  const ids = canales.map(c => c.id)

  const prompt = canales.length
    ? generarPrompt({ url: datosSketch.url, publicable: datosSketch.publicable, clave, canales })
    : null

  const releEj = reles[0]?.id || 'bomba'
  const releConRegla = reglas[0]?.rele || releEj

  const sketch =
    'const char *SUPABASE_URL    = "' + datosSketch.url + '";\n' +
    'const char *PUBLISHABLE_KEY = "' + datosSketch.publicable + '";\n' +
    'const char *CLAVE           = "' + clave + '";'

  const comando =
    'URL:    ' + urlKodularPost('enviar_comando') + '\n' +
    'Header: Content-Type: application/json\n' +
    'Body:   {"p_clave":"' + clave + '","p_cmd":"' + releEj + '=1"}\n\n' +
    'Relés: ' + (reles.map(r => r.id).join(', ') || '(ninguno declarado)') + '    Valores: 1 o 0'

  const automatico =
    'URL:    ' + urlKodularPost('ajustar_regla') + '\n' +
    'Header: Content-Type: application/json\n' +
    'Body:   {"p_clave":"' + clave + '","p_rele":"' + releConRegla + '",\n' +
    '         "p_cambios":{"activa":true,"umbral":30}}\n\n' +
    'Se puede cambiar: activa, umbral, hist.\n' +
    'Crear o borrar reglas se hace acá en el portal, en Configurar.'

  return (
    <>
      <Bloque
        titulo="La clave de tu placa"
        ayuda="Va en tu sketch y en tu app. No es tu PIN: con esta clave se leen datos y se prenden relés, pero no se puede cambiar tu configuración."
        texto={clave} />

      <Bloque titulo="Tu hardware" ayuda="Lo que declaraste en Configurar. Los ids son los nombres que viajan en el JSON.">
        {canales.length === 0
          ? <p className="ayuda">Todavía no declaraste nada.</p>
          : (
            <ul className="hardware">
              {sensores.map(s => (
                <li key={s.id}>
                  <code>"{s.id}"</code> {s.nombre || s.id}{s.unidad ? ` (${s.unidad})` : ''}
                  {s.conexion && <span className="tenue"> — {s.conexion}</span>}
                </li>
              ))}
              {reles.map(r => {
                const g = reglas.find(x => x.rele === r.id)
                return (
                  <li key={r.id}>
                    <code>"{r.id}"</code> {r.nombre || r.id}
                    <span className="tenue"> — GPIO {r.pin}, activo en {r.nivel_activo}{r.conexion ? `, ${r.conexion}` : ''}</span>
                    {g && <div className="detalle">Automático: {textoRegla(g)} {g.activa ? <Etiqueta>activa</Etiqueta> : <Etiqueta tenue>inactiva</Etiqueta>}</div>}
                  </li>
                )
              })}
            </ul>
          )}
      </Bloque>

      <Bloque
        titulo="Kodular: leer datos"
        ayuda={'Pegala en Web.Url y usá Web.Get. No lleva headers. Devuelve ' +
               (ids.length ? ids.join(', ') + ', ' : '') +
               'detectados, faltan, pendientes, reglas, edad, avisos y ultimo_error.'}
        texto={urlKodularLeer(clave)} />

      <Bloque
        titulo="Kodular: prender un relé"
        ayuda={'Con Web.PostText. Lleva un header. El relé cambia cuando tu placa recoge el ' +
               'comando, en unos 5 segundos: mientras el comando siga apareciendo en "pendientes" ' +
               'al leer datos, mostrá algo como "enviando…" para que no parezca que el botón no anduvo.'}
        texto={comando} />

      <Bloque titulo="Kodular: modo automático" ayuda="Para prender, apagar o mover el umbral de una regla desde la app." texto={automatico} />

      <Bloque
        titulo="Tu sketch del ESP32"
        ayuda="Reemplazá estas tres líneas en la sección de configuración."
        texto={sketch} />

      {!prompt ? (
        <Bloque titulo="Prompt para generar tu código con IA">
          <p className="ayuda">
            Primero declará tus sensores y relés en Configurar: el prompt se arma
            con ese hardware.
          </p>
        </Bloque>
      ) : (
        <div className="bloque destacado">
          <div className="bloque-cab">
            <h3>Prompt para generar tu código con IA</h3>
            <Copiar texto={prompt}>copiar prompt</Copiar>
          </div>
          <p className="ayuda">
            Ya viene con tu clave y tu hardware. Copialo, pegalo en la IA que uses,
            y te devuelve el sketch listo. Si cambiás tu hardware, volvé a copiarlo.
          </p>
          <pre className="prompt">{prompt}</pre>
        </div>
      )}
    </>
  )
}
