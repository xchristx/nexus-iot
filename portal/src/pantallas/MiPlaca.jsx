import { useState, useEffect } from 'react'
import { enviarComando, fijarAuto, quitarDetectado, escucharDesfase, aBinario, mensajeError, RESERVADOS } from '../firebase.js'
import { Etiqueta, textoRegla, esBinario } from '../componentes/comunes.jsx'
import { WidgetEntrada, Interruptor, BotonSalida, Icono, widgetDe } from '../componentes/widgets.jsx'
import { useAlertas, textoAlerta } from '../alertas.js'
import { notificar, pitido, permisoAvisos, pedirAvisos, esApp } from '../avisar.js'

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

export default function MiPlaca({ usuario, placa, onAgregar, onConfigurar }) {
  const { canales, reglas, estado, cmd, auto, pulsadorModo, tablero } = placa
  const [desfase, setDesfase] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [aviso, setAviso] = useState(null)
  const [cambiandoModo, setCambiandoModo] = useState(false)
  const [permiso, setPermiso] = useState(null)
  const [entendidas, setEntendidas] = useState([])

  useEffect(() => escucharDesfase(setDesfase), [])
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { permisoAvisos().then(setPermiso).catch(() => setPermiso('imposible')) }, [])

  const visto = typeof estado.visto === 'number' ? estado.visto : null
  const edad = visto == null ? null : Math.max(0, Math.round((ahora + desfase - visto) / 1000))
  const conectada = edad != null && edad * 1000 <= LATIDO_MAX

  const canalDe = (id) => canales.find(c => c.id === id)
  const nombreDe = (id) => canalDe(id)?.nombre || id
  const alertas = useAlertas(placa, conectada, (a, v) => {
    const c = canalDe(a.entrada)
    pitido()
    notificar('alerta-' + a.entrada, 'Alerta: ' + nombreDe(a.entrada),
      `${nombreDe(a.entrada)} ${textoAlerta(a, c?.unidad)} (ahora ${Number(v).toFixed(1)})`)
  })
  const enAlerta = new Set(alertas.map(a => a.entrada))
  // "Entendido" oculta la tarjeta hasta que la alerta se apague y vuelva.
  useEffect(() => {
    setEntendidas(e => e.filter(id => alertas.some(a => a.entrada === id)))
  }, [alertas])
  const aMostrar = alertas.filter(a => !entendidas.includes(a.entrada))

  async function activarAvisos() {
    setPermiso(await pedirAvisos().catch(() => 'no'))
    pitido()   // de paso, el toque habilita el sonido
  }

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

  async function quitar(id) {
    setAviso(null)
    try {
      await quitarDetectado(usuario, id)
    } catch (e) {
      setAviso(mensajeError(e))
    }
  }

  // Lo que la placa mandó sin estar declarado: agregarlo, o quitarlo si quedó
  // de un sketch anterior.
  const botonesDetectado = (id, tipo) => (
    <>
      <button className="chico" onClick={() => onAgregar({ id, tipo })}>no declarado · agregar</button>
      <button className="chico" title="Si tu placa lo sigue mandando, vuelve a aparecer" onClick={() => quitar(id)}>
        quitar
      </button>
    </>
  )

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
    const w = widgetDe({ id, tipo: 'salida' }, tablero)
    const control = {
      valor: aBinario(estado[id]), pendiente: aBinario(cmd[id]), color: w.color,
      bloqueado: automatica || noDeclarado, onCambiar: v => comandar(id, v),
    }
    const etiquetas = (
      <>
        {noDeclarado && botonesDetectado(id, 'salida')}
        {automatica && <Etiqueta>automática</Etiqueta>}
        {envio && <Etiqueta>{envio}</Etiqueta>}
      </>
    )
    return (
      <div key={id} className="salida">
        {w.widget === 'boton' ? (
          <>
            <BotonSalida nombre={nombre} icono={w.icono} {...control} />
            {(noDeclarado || automatica || envio) && <div className="etiquetas-boton">{etiquetas}</div>}
          </>
        ) : (
          <div className="salida-fila">
            <span className="salida-nombre">
              {w.icono && <Icono nombre={w.icono} />}
              {nombre}
              {etiquetas}
            </span>
            <Interruptor {...control} />
          </div>
        )}
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
              return (
                <WidgetEntrada key={s.id} titulo={s.nombre || s.id} valor={v} unidad={s.unidad || ''}
                               w={widgetDe(s, tablero)} alerta={enAlerta.has(s.id)}>
                  {typeof v !== 'number' && <Etiqueta tenue>sin dato</Etiqueta>}
                </WidgetEntrada>
              )
            })}
            {extra.entradas.map(id => (
              <WidgetEntrada key={id} titulo={id} valor={estado[id]} unidad=""
                             w={widgetDe({ id, tipo: 'entrada' }, null)}>
                <div className="etiquetas-boton">{botonesDetectado(id, 'entrada')}</div>
              </WidgetEntrada>
            ))}
          </div>
        )}
      </div>

      {aMostrar.length > 0 && (
        <div className="tarjeta alerta" role="alert">
          <h3>¡Alerta!</h3>
          <ul className="lista-avisos">
            {aMostrar.map(a => (
              <li key={a.entrada}>
                <span>
                  {nombreDe(a.entrada)} {textoAlerta(a, canalDe(a.entrada)?.unidad)}: ahora
                  {' '}<strong>{Number(estado[a.entrada]).toFixed(1)}</strong>
                </span>
                <button className="chico" onClick={() => setEntendidas(e => [...e, a.entrada])}>Entendido</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {placa.alertas.length > 0 && permiso === 'preguntar' && (
        <div className="tarjeta">
          <div className="salida-fila">
            <p className="ayuda sin-margen">
              Tienes alertas configuradas. Activa los avisos para que suenen y te
              lleguen como notificación mientras {esApp ? 'la app' : 'el portal'} esté abierto.
            </p>
            <button className="chico" onClick={activarAvisos}>Activar avisos</button>
          </div>
        </div>
      )}

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
                No llega ningún valor de "{id}". Revisa que en el sketch se llame
                exactamente "{id}" y, si es un sensor, que esté leyendo bien.
              </li>
            ))}
          </ul>
        </div>
      )}

      {aviso && <div className="tarjeta"><p className="error">{aviso}</p></div>}

      {vacio && (
        <div className="tarjeta">
          <h3>Todavía no tienes entradas ni salidas</h3>
          <p className="ayuda">
            Decláralas en Configurar, o conecta tu placa: lo que mande va a aparecer
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
                  ? 'Las salidas con regla las maneja la placa. Para manejarlas a mano, apaga el modo automático.'
                  : 'Todo se maneja a mano. Préndelo para que la placa aplique las reglas.'}
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
            Pruébalas desde acá para confirmar que tu ESP32 responde, antes de buscar
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
