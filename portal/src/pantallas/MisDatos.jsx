import { firebaseConfig } from '../firebase.js'
import { generarPrompt } from '../prompt.js'
import { Bloque, Copiar, textoRegla } from '../componentes/comunes.jsx'

export default function MisDatos({ usuario, placa }) {
  const { canales, reglas, pulsadorModo } = placa
  const entradas = canales.filter(c => c.tipo === 'entrada')
  const salidas = canales.filter(c => c.tipo === 'salida')

  const prompt = canales.length
    ? generarPrompt({ apiKey: firebaseConfig.apiKey, databaseURL: firebaseConfig.databaseURL, usuario, canales, pulsadorModo })
    : null

  const sketch =
    'const char *API_KEY      = "' + firebaseConfig.apiKey + '";\n' +
    'const char *DATABASE_URL = "' + firebaseConfig.databaseURL + '";\n' +
    'const char *USUARIO      = "' + usuario + '";\n' +
    'const char *CONTRASENA   = "";   // la misma con la que entrás acá'

  const rutas =
    'placas/' + usuario + '/estado       lo que manda la placa (se lee)\n' +
    'placas/' + usuario + '/control/cmd  prender o apagar: etiqueta = id, valor = 1 o 0\n' +
    'placas/' + usuario + '/control      etiqueta "auto": true o false'

  return (
    <>
      <Bloque
        titulo="Tu usuario"
        ayuda="Con este usuario y tu contraseña entran tu placa y tu app. La contraseña es la misma que usás acá: no se la pases a nadie ni la pegues en la IA."
        texto={usuario} />

      <Bloque titulo="Tu hardware" ayuda="Lo que declaraste en Configurar. Los ids son los nombres que usan tu sketch y tu app.">
        {canales.length === 0
          ? <p className="ayuda">Todavía no declaraste nada.</p>
          : (
            <ul className="hardware">
              {entradas.map(s => (
                <li key={s.id}>
                  <code>"{s.id}"</code> {s.nombre || s.id}{s.unidad ? ` (${s.unidad})` : ''}
                  {s.conexion && <span className="tenue"> — {s.conexion}</span>}
                </li>
              ))}
              {salidas.map(r => {
                const g = reglas.find(x => x.salida === r.id)
                return (
                  <li key={r.id}>
                    <code>"{r.id}"</code> {r.nombre || r.id}
                    <span className="tenue">
                      {' '}— GPIO {r.pin}, activo en {r.nivel_activo}
                      {r.pulsador != null ? `, pulsador en GPIO ${r.pulsador}` : ''}
                      {r.conexion ? `, ${r.conexion}` : ''}
                    </span>
                    {g && <div className="detalle">Regla: {textoRegla(g)}</div>}
                  </li>
                )
              })}
              {pulsadorModo != null && <li>Pulsador de modo automático en GPIO {pulsadorModo}</li>}
            </ul>
          )}
      </Bloque>

      <Bloque
        titulo="Tu app de Kodular"
        ayuda={'Importá el proyecto NexusIoT_curso.aia que te pasó el docente. Al abrir la app, ' +
               'escribís tu usuario y tu contraseña. Para probarla tenés que compilar el APK: el ' +
               'Companion no funciona con Firebase. Si armás tus propios bloques, estas son las rutas:'}
        texto={rutas} />

      <Bloque
        titulo="Tu sketch del ESP32"
        ayuda="Si ya tenés el sketch, estas son las líneas de la configuración. La contraseña completala vos en el código."
        texto={sketch} />

      {!prompt ? (
        <Bloque titulo="Prompt para generar tu código con IA">
          <p className="ayuda">
            Primero declará tus entradas y salidas en Configurar: el prompt se
            arma con ese hardware.
          </p>
        </Bloque>
      ) : (
        <div className="bloque destacado">
          <div className="bloque-cab">
            <h3>Prompt para generar tu código con IA</h3>
            <Copiar texto={prompt}>copiar prompt</Copiar>
          </div>
          <p className="ayuda">
            Ya viene con tu usuario y tu hardware, pero NO con tu contraseña: esa la
            escribís vos en el código que te devuelva la IA. Si cambiás tu hardware,
            volvé a copiarlo.
          </p>
          <pre className="prompt">{prompt}</pre>
        </div>
      )}
    </>
  )
}
