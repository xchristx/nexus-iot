import { useState, useEffect } from 'react'
import { enviarComando, fijarAuto, escucharDesfase, aBinario, mensajeError, RESERVADOS } from '../firebase.js'
import { Etiqueta, textoRegla, esBinario } from '../componentes/comunes.jsx'

// La placa escribe "visto" cada 15 s aunque nada cambie. Pasados 40 s sin
// noticias, se la da por desconectada.
const LATIDO_MAX = 40000

// Lo que manda la placa sin haberlo declarado. Un valor 1/0 probablemente es
// una salida; cualquier otro número, una entrada.
function detectados(estado, canales) {
  const declarados = new Set(canales.map(c => c.id))
  const ids = Object.keys(estado).filter(id => !declarados.has(id) && !RESERVADOS.includes(id))
  return {
    entradas: ids.filter(id => !esBinario(estado[id])),
    salidas: ids.filter(id => esBinario(estado[id])),
  }
}

function Dato({ titulo, valor, unidad, children }) {
  return (
    <div className="dato">
      <span className="dato-titulo">{titulo}</span>
      <span className="dato-valor">{valor}<small>{unidad}</small></span>
      {children}
    </div>
  )
}

// El botón relleno es lo que la placa informó; el que late es lo que se pidió
// y la placa todavía no recogió. Así nunca se muestra como hecho algo que no pasó.
function Interruptor({ valor, pendiente, bloqueado, onCambiar }) {
  const clase = (v) => [v === 1 ? 'on' : 'off', valor === v && 'activo', pendiente === v && 'pendiente']
    .filter(Boolean).join(' ')
  return (
    <div className="interruptor">
      <button className={clase(1)} disabled={bloqueado} aria-busy={pendiente === 1} onClick={() => onCambiar(1)}>ON</button>
      <button className={clase(0)} disabled={bloqueado} aria-busy={pendiente === 0} onClick={() => onCambiar(0)}>OFF</button>
    </div>
  )
}

export default function MiPlaca({ usuario, placa, onAgregar, onConfigurar }) {
  const { canales, reglas, estado, cmd, auto, pulsadorModo } = placa
  const [desfase, setDesfase] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [aviso, setAviso] = useState(null)
  const [cambiandoModo, setCambiandoModo] = useState(false)

  useEffect(() => escucharDesfase(setDesfase), [])
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const visto = typeof estado.visto === 'number' ? estado.visto : null
  const edad = visto == null ? null : Math.max(0, Math.round((ahora + desfase - visto) / 1000))
  const conectada = edad != null && edad * 1000 <= LATIDO_MAX

  const entradas = canales.filter(c => c.tipo === 'entrada')
  const salidas = canales.filter(c => c.tipo === 'salida')
  const extra = detectados(estado, canales)
  const reglaDe = Object.fromEntries(reglas.map(g => [g.salida, g]))
  const vacio = canales.length === 0 && extra.entradas.length === 0 && extra.salidas.length === 0
  // Declarado pero la placa no lo manda: casi siempre un id mal escrito en el sketch.
  const faltan = visto == null ? [] : canales.filter(c => estado[c.id] === undefined).map(c => c.id)

  async function comandar(salida, valor) {
    setAviso(null)
    try {
      await enviarComando(usuario, salida, valor)
    } catch (e) {
      setAviso(mensajeError(e))
    }
  }

  async function alternarModo() {
    setCambiandoModo(true)
    setAviso(null)
    try {
      await fijarAuto(usuario, !auto)
    } catch (e) {
      setAviso(mensajeError(e))
    }
    setCambiandoModo(false)
  }

  // Qué decirle al alumno mientras el comando no se aplicó.
  function estadoEnvio(salida) {
    if (cmd[salida] === undefined) return null
    return conectada ? 'esperando a la placa…' : 'en cola: la placa no está conectada'
  }

  // Función de render y no componente: definido acá adentro, React lo vería
  // como un componente nuevo en cada cambio y remontaría las filas,
  // reiniciando la animación del botón pendiente.
  function filaSalida({ id, nombre, noDeclarado, regla, pulsador }) {
    const envio = estadoEnvio(id)
    const automatica = auto && Boolean(regla)
    return (
      <div key={id} className="salida">
        <div className="salida-fila">
          <span>
            {nombre}
            {noDeclarado && (
              <button className="chico" onClick={() => onAgregar({ id, tipo: 'salida' })}>
                no declarado · agregar
              </button>
            )}
            {automatica && <Etiqueta>automática</Etiqueta>}
            {envio && <Etiqueta>{envio}</Etiqueta>}
          </span>
          <Interruptor valor={aBinario(estado[id])} pendiente={aBinario(cmd[id])}
                       bloqueado={automatica || noDeclarado} onCambiar={v => comandar(id, v)} />
        </div>
        {(regla || pulsador != null) && (
          <div className="regla-linea">
            {regla && <span>Regla: {textoRegla(regla)}</span>}
            {pulsador != null && <span>Pulsador en GPIO {pulsador}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className={'tarjeta estado ' + (conectada ? 'viva' : 'muerta')}>
        <div className="pastilla">
          <span className="punto" />
          {visto == null
            ? 'Tu placa todavía no se conectó nunca'
            : conectada ? 'Placa conectada' : 'Desconectada hace ' + tiempo(edad)}
        </div>

        {(entradas.length > 0 || extra.entradas.length > 0) && visto != null && (
          <div className={'datos' + (conectada ? '' : ' viejos')}>
            {entradas.map(s => {
              const v = estado[s.id]
              const hay = typeof v === 'number'
              return (
                <Dato key={s.id} titulo={s.nombre || s.id}
                      valor={hay ? Number(v).toFixed(1) : '—'} unidad={hay ? (s.unidad || '') : ''}>
                  {!hay && <Etiqueta tenue>sin dato</Etiqueta>}
                </Dato>
              )
            })}
            {extra.entradas.map(id => (
              <Dato key={id} titulo={id} valor={Number(estado[id]).toFixed(1)} unidad="">
                <button className="chico" onClick={() => onAgregar({ id, tipo: 'entrada' })}>
                  no declarado · agregar
                </button>
              </Dato>
            ))}
          </div>
        )}
      </div>

      {typeof estado.aviso === 'string' && estado.aviso && (
        <div className="tarjeta atencion">
          <h3>Tu placa avisa</h3>
          <p className="ayuda">{estado.aviso}</p>
        </div>
      )}

      {conectada && faltan.length > 0 && (
        <div className="tarjeta atencion">
          <h3>Tu placa no manda todo lo que declaraste</h3>
          <ul className="lista-avisos">
            {faltan.map(id => (
              <li key={id}>
                No llega ningún valor de "{id}". Revisá que en el sketch se llame
                exactamente "{id}" y, si es un sensor, que esté leyendo bien.
              </li>
            ))}
          </ul>
        </div>
      )}

      {aviso && <div className="tarjeta"><p className="error">{aviso}</p></div>}

      {vacio && (
        <div className="tarjeta">
          <h3>Todavía no tenés entradas ni salidas</h3>
          <p className="ayuda">
            Declaralas en Configurar, o conectá tu placa: lo que mande va a aparecer
            acá para agregarlo con un clic.
          </p>
          <button onClick={onConfigurar}>Ir a Configurar</button>
        </div>
      )}

      {salidas.length > 0 && (
        <div className={'tarjeta modo' + (auto ? ' encendido' : '')}>
          <div className="salida-fila">
            <div>
              <h3>Modo automático</h3>
              <p className="ayuda sin-margen">
                {auto
                  ? 'Las salidas con regla las maneja la placa. Para manejarlas a mano, apagá el modo automático.'
                  : 'Todo se maneja a mano. Prendelo para que la placa aplique las reglas.'}
                {pulsadorModo != null && ` También se cambia con el pulsador de GPIO ${pulsadorModo}.`}
              </p>
            </div>
            <button className={'chico' + (auto ? ' activo' : '')} disabled={cambiandoModo} onClick={alternarModo}>
              {cambiandoModo ? '…' : auto ? 'ACTIVADO' : 'DESACTIVADO'}
            </button>
          </div>
        </div>
      )}

      {(salidas.length > 0 || extra.salidas.length > 0) && (
        <div className="tarjeta">
          <h3>Salidas</h3>
          <p className="ayuda">
            Probalas desde acá para confirmar que tu ESP32 responde, antes de buscar
            el problema en la app. Con la placa conectada, el cambio se ve en menos de
            un segundo.
          </p>
          <div className="salidas">
            {salidas.map(s => filaSalida({
              id: s.id, nombre: s.nombre || s.id, regla: reglaDe[s.id], pulsador: s.pulsador,
            }))}
            {extra.salidas.map(id => filaSalida({ id, nombre: id, noDeclarado: true }))}
          </div>
        </div>
      )}

      <p className="pie">{usuario}</p>
    </>
  )
}

function tiempo(s) {
  if (s < 90) return s + ' s'
  if (s < 90 * 60) return Math.round(s / 60) + ' min'
  if (s < 36 * 3600) return Math.round(s / 3600) + ' h'
  return Math.round(s / 86400) + ' días'
}
