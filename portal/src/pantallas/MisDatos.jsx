import { useState } from 'react'
import { firebaseConfig, desvincularAlexa, mensajeError } from '../firebase.js'
import { generarPrompt } from '../prompt.js'
import { CLIENTE_ALEXA, NOMBRE_SKILL } from '../alexa.js'
import { Bloque, Copiar, textoRegla, BajarApp } from '../componentes/comunes.jsx'

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
    'const char *CONTRASENA   = "";   // la misma con la que entras acá'

  const rutas =
    'placas/' + usuario + '/estado       lo que manda la placa (se lee)\n' +
    'placas/' + usuario + '/control/cmd  prender o apagar: etiqueta = id, valor = 1 o 0\n' +
    'placas/' + usuario + '/control      etiqueta "auto": true o false'

  return (
    <>
      <Bloque
        titulo="Tu usuario"
        ayuda="Con este usuario y tu contraseña entran tu placa y tu app. La contraseña es la misma que usas acá: no se la pases a nadie ni la pegues en la IA."
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
        ayuda={'Importa el proyecto NexusIoT_curso.aia que te pasó el docente. Al abrir la app, ' +
               'escribes tu usuario y tu contraseña. Para probarla tienes que compilar el APK: el ' +
               'Companion no funciona con Firebase. Si armas tus propios bloques, estas son las rutas:'}
        texto={rutas} />

      <BajarApp />

      {CLIENTE_ALEXA && <Alexa usuario={usuario} placa={placa} />}

      <Bloque
        titulo="Tu sketch del ESP32"
        ayuda="Si ya tienes el sketch, estas son las líneas de la configuración. La contraseña complétala tú en el código."
        texto={sketch} />

      {!prompt ? (
        <Bloque titulo="Prompt para generar tu código con IA">
          <p className="ayuda">
            Primero declara tus entradas y salidas en Configurar: el prompt se
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
            escribes tú en el código que te devuelva la IA. Si cambias tu hardware,
            vuelve a copiarlo.
          </p>
          <pre className="prompt">{prompt}</pre>
        </div>
      )}
    </>
  )
}

// Opcional: solo aparece si el portal tiene Alexa configurada.
function Alexa({ usuario, placa }) {
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState(null)

  async function desvincular() {
    if (!window.confirm('¿Desvincular Alexa? Deja de manejar tu placa. En la app Alexa, desactiva la skill para que desaparezcan los dispositivos.')) return
    setYendo(true)
    setError(null)
    try {
      await desvincularAlexa(usuario)
    } catch (e) {
      setError(mensajeError(e))
    }
    setYendo(false)
  }

  if (placa.alexa) {
    const salida = placa.canales.find(c => c.tipo === 'salida')
    const ejemplo = salida ? (salida.nombre || salida.id.replace(/_/g, ' ')).toLowerCase() : 'la bomba'
    return (
      <Bloque
        titulo="Alexa"
        ayuda={`Vinculada desde el ${new Date(placa.alexa.desde).toLocaleDateString('es-BO')}. Prueba: "Alexa, prende ${ejemplo}". ` +
               'Si cambias entradas o salidas, dile "Alexa, descubre dispositivos".'}>
        {error && <p className="error">{error}</p>}
        <button className="chico peligro" disabled={yendo} onClick={desvincular}>Desvincular</button>
      </Bloque>
    )
  }

  return (
    <Bloque titulo="Alexa (opcional)" ayuda="Para manejar tu placa por voz, desde un Echo o desde la app Alexa del celular:">
      <ol className="lista-avisos">
        <li>Pásale al docente el correo de tu cuenta de Amazon, para que te invite a la skill {NOMBRE_SKILL}.</li>
        <li>Acepta la invitación que te llega por mail. La app Alexa tiene que estar en español de Estados Unidos o de México.</li>
        <li>En la app Alexa, activa la skill: se abre este portal. Entra con tu usuario y toca Autorizar.</li>
        <li>Dile "Alexa, descubre dispositivos". Después, "Alexa, prende…" con el nombre de tu salida.</li>
      </ol>
    </Bloque>
  )
}
