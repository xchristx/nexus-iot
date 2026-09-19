import { useState, useEffect, useCallback } from 'react'
import { leerEstado, enviarComando, ajustarRegla } from '../api.js'
import { Etiqueta, textoRegla, esBinario } from '../componentes/comunes.jsx'

// Mientras hay un comando esperando a la placa se consulta más seguido, para
// que el cambio se vea apenas se aplica. Sin nada pendiente alcanza con 3 s.
const CONSULTA_NORMAL = 3000
const CONSULTA_PENDIENTE = 1000

// Lo que manda la placa sin haberlo declarado. Un valor 1/0 probablemente es
// un relé; cualquier otro número, un sensor. Es la misma regla que usa el
// backend para decidir qué se puede comandar.
function separarDetectados(e) {
  const ids = e.detectados || []
  return {
    sensores: ids.filter(id => !esBinario(e[id])),
    reles: ids.filter(id => esBinario(e[id])),
  }
}

const enCola = (e, rele) => (e?.pendientes || []).some(c => c.startsWith(rele + '='))

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
// y todavía no llegó. Así nunca se muestra como hecho algo que no pasó.
function Interruptor({ valor, pendiente, onCambiar }) {
  const clase = (v) => [v === 1 ? 'on' : 'off', valor === v && 'activo', pendiente === v && 'pendiente']
    .filter(Boolean).join(' ')
  return (
    <div className="interruptor">
      <button className={clase(1)} aria-busy={pendiente === 1} onClick={() => onCambiar(1)}>ON</button>
      <button className={clase(0)} aria-busy={pendiente === 0} onClick={() => onCambiar(0)}>OFF</button>
    </div>
  )
}

export default function MiPlaca({ clave, canales, onAgregar, onConfigurar }) {
  const [e, setE] = useState(null)
  const [fallo, setFallo] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [ocupada, setOcupada] = useState(null)

  // Comandos mandados desde esta pantalla que todavía no se aplicaron:
  //   { bomba: { valor: 1, encolado: 1726512345678 } }
  // "encolado" es null mientras el pedido viaja al backend.
  const [enviando, setEnviando] = useState({})

  const refrescar = useCallback(async () => {
    const inicio = Date.now()
    const r = await leerEstado(clave)
    if (!r.ok) { setFallo(r.error); return }
    setE(r)
    setFallo(null)

    // Un comando está aplicado cuando la placa ya lo recogió: deja de estar en
    // "pendientes". Solo cuenta una lectura que empezó DESPUÉS de encolarlo; si
    // no, una respuesta que salió antes lo daría por hecho sin serlo.
    setEnviando(prev => {
      const resueltos = Object.entries(prev)
        .filter(([rele, p]) => p.encolado && inicio >= p.encolado && !enCola(r, rele))
        .map(([rele]) => rele)
      if (resueltos.length === 0) return prev
      const sig = { ...prev }
      resueltos.forEach(rele => delete sig[rele])
      return sig
    })
  }, [clave])

  const hayPendientes = Object.keys(enviando).length > 0 || (e?.pendientes?.length ?? 0) > 0

  useEffect(() => {
    refrescar()
    const id = setInterval(refrescar, hayPendientes ? CONSULTA_PENDIENTE : CONSULTA_NORMAL)
    return () => clearInterval(id)
  }, [refrescar, hayPendientes])

  // edad = segundos desde el último sync. -1 significa que nunca se conectó.
  const nunca = !e || e.edad < 0
  const conectada = !nunca && e.edad <= 30

  async function comandar(rele, valor) {
    setEnviando(prev => ({ ...prev, [rele]: { valor, encolado: null } }))
    const r = await enviarComando(clave, rele + '=' + valor)

    if (!r.ok) {
      setEnviando(prev => { const sig = { ...prev }; delete sig[rele]; return sig })
      setAviso(r.error)
      return
    }

    setEnviando(prev => ({ ...prev, [rele]: { valor, encolado: Date.now() } }))
    setAviso(!conectada
      ? 'Tu placa no está conectada: el comando queda en cola y se aplica apenas vuelva.'
      : r.regla_desactivada
        ? `Se desactivó el modo automático de "${rele}" porque lo manejaste a mano.`
        : null)
  }

  async function alternarRegla(rele, activa) {
    setOcupada(rele)
    const r = await ajustarRegla(clave, rele, { activa })
    setAviso(r.ok ? null : r.error)
    await refrescar()
    setOcupada(null)
  }

  // Qué decirle al alumno mientras el comando no se aplicó.
  function estadoEnvio(rele) {
    const p = enviando[rele]
    if (p && !p.encolado) return 'enviando…'
    if (p) return conectada ? 'esperando a la placa…' : 'en cola: la placa no está conectada'
    if (enCola(e, rele)) return 'comando en cola'   // mandado desde la app Kodular
    return null
  }

  if (fallo) return <div className="tarjeta"><p className="error">{fallo}</p></div>
  if (!e) return <div className="tarjeta"><p className="ayuda">Cargando…</p></div>

  const sensores = canales.filter(c => c.tipo === 'sensor')
  const reles = canales.filter(c => c.tipo === 'rele')
  const detectados = separarDetectados(e)
  const faltan = new Set(e.faltan || [])
  const reglaDe = Object.fromEntries((e.reglas || []).map(g => [g.rele, g]))
  const vacio = canales.length === 0 && (e.detectados || []).length === 0

  // Función de render y no componente: definido acá adentro, React lo vería
  // como un componente nuevo en cada consulta y remontaría las filas cada
  // segundo, reiniciando la animación del botón pendiente.
  function filaRele({ id, nombre, extra, noLoManda, regla }) {
    const envio = estadoEnvio(id)
    return (
      <div key={id} className="salida">
        <div className="salida-fila">
          <span>
            {nombre}
            {noLoManda && <Etiqueta tenue>tu placa no lo manda</Etiqueta>}
            {extra && (
              <button className="chico" onClick={() => onAgregar({ id, tipo: 'rele' })}>
                no declarado · agregar
              </button>
            )}
            {envio && <Etiqueta>{envio}</Etiqueta>}
          </span>
          <Interruptor valor={e[id]} pendiente={enviando[id]?.valor} onCambiar={v => comandar(id, v)} />
        </div>
        {regla && (
          <div className="regla-linea">
            <span>Automático: {textoRegla(regla)}</span>
            <button className={'chico' + (regla.activa ? ' activo' : '')} disabled={ocupada === id}
                    onClick={() => alternarRegla(id, !regla.activa)}>
              {ocupada === id ? '…' : regla.activa ? 'activado' : 'desactivado'}
            </button>
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
          {nunca
            ? 'Tu placa todavía no se conectó nunca'
            : conectada ? 'Placa conectada' : 'Desconectada hace ' + e.edad + ' s'}
        </div>

        {conectada && (sensores.length > 0 || detectados.sensores.length > 0) && (
          <div className="datos">
            {sensores.map(s => (
              <Dato key={s.id} titulo={s.nombre || s.id}
                    valor={faltan.has(s.id) ? '—' : Number(e[s.id]).toFixed(1)}
                    unidad={faltan.has(s.id) ? '' : (s.unidad || '')}>
                {faltan.has(s.id) && <Etiqueta tenue>sin dato</Etiqueta>}
              </Dato>
            ))}
            {detectados.sensores.map(id => (
              <Dato key={id} titulo={id} valor={Number(e[id]).toFixed(1)} unidad="">
                <button className="chico" onClick={() => onAgregar({ id, tipo: 'sensor' })}>
                  no declarado · agregar
                </button>
              </Dato>
            ))}
          </div>
        )}
      </div>

      {/* Lo que evita que el alumno necesite el monitor serie */}
      {e.ultimo_error && (
        <div className="tarjeta problema">
          <h3>Tu placa está mandando algo mal</h3>
          <pre>{e.ultimo_error}</pre>
          <p className="ayuda">
            Si generaste el código con una IA, pegale este mensaje tal cual y te lo corrige.
          </p>
        </div>
      )}

      {conectada && e.avisos?.length > 0 && (
        <div className="tarjeta atencion">
          <h3>Los nombres no coinciden</h3>
          <ul className="lista-avisos">
            {e.avisos.map(a => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}

      {aviso && <div className="tarjeta"><p className="ayuda">{aviso}</p></div>}

      {vacio && (
        <div className="tarjeta">
          <h3>Todavía no tenés sensores ni relés</h3>
          <p className="ayuda">
            Declaralos en Configurar, o conectá tu placa: lo que mande va a aparecer
            acá para agregarlo con un clic.
          </p>
          <button onClick={onConfigurar}>Ir a Configurar</button>
        </div>
      )}

      {(reles.length > 0 || detectados.reles.length > 0) && (
        <div className="tarjeta">
          <h3>Relés</h3>
          <p className="ayuda">
            Probalos desde acá para confirmar que tu ESP32 responde, antes de buscar
            el problema en la app. El cambio se ve cuando la placa lo recoge, en
            unos 5 segundos.
          </p>
          <div className="salidas">
            {reles.map(r => filaRele({
              id: r.id, nombre: r.nombre || r.id, noLoManda: faltan.has(r.id), regla: reglaDe[r.id],
            }))}
            {detectados.reles.map(id => filaRele({ id, nombre: id, extra: true }))}
          </div>
        </div>
      )}

      <p className="pie">
        {e.device_id} · {e.syncs} syncs
      </p>
    </>
  )
}
