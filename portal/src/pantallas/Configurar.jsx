import { useState, useEffect } from 'react'
import { guardarCanal, borrarCanal, guardarRegla, borrarRegla, guardarPulsadorModo, mensajeError } from '../firebase.js'
import { MAX, errorCanal, errorRegla, errorPulsadorModo } from '../validar.js'
import { textoRegla } from '../componentes/comunes.jsx'

const numeroONull = (v) => (v === '' || v == null ? null : Number(v))

// ===================================================================
//  Formulario de entrada o salida
// ===================================================================

function FormCanal({ usuario, placa, inicial, nuevo, onListo, onCancelar }) {
  const [f, setF] = useState({
    tipo: inicial.tipo || 'entrada',
    id: inicial.id || '',
    nombre: inicial.nombre || '',
    unidad: inicial.unidad || '',
    pin: inicial.pin ?? '',
    nivel_activo: inicial.nivel_activo || 'LOW',
    pulsador: inicial.pulsador ?? '',
    conexion: inicial.conexion || '',
    libreria: inicial.libreria || '',
  })
  const [error, setError] = useState(null)
  const [yendo, setYendo] = useState(false)
  const campo = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const esSalida = f.tipo === 'salida'

  // Solo se guardan los campos con algo escrito.
  function armar() {
    const c = { id: f.id.trim(), tipo: f.tipo }
    if (f.nombre.trim()) c.nombre = f.nombre.trim()
    if (f.conexion.trim()) c.conexion = f.conexion.trim()
    if (f.pin !== '') c.pin = Number(f.pin)
    if (esSalida) {
      c.nivel_activo = f.nivel_activo
      if (f.pulsador !== '') c.pulsador = Number(f.pulsador)
    } else {
      if (f.unidad.trim()) c.unidad = f.unidad.trim()
      if (f.libreria.trim()) c.libreria = f.libreria.trim()
    }
    return c
  }

  async function enviar(ev) {
    ev.preventDefault()
    const c = armar()
    const e = errorCanal(c, { canales: placa.canales, pulsadorModo: placa.pulsadorModo, nuevo })
    if (e) { setError(e); return }
    const orden = nuevo
      ? Math.max(-1, ...placa.canales.map(x => x.orden ?? 0)) + 1
      : (inicial.orden ?? 0)
    setYendo(true)
    try {
      await guardarCanal(usuario, c, orden)
      onListo(null)
    } catch (err) {
      setError(mensajeError(err))
      setYendo(false)
    }
  }

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h2>{nuevo ? 'Agregar' : 'Editar'} {esSalida ? 'salida' : 'entrada'}</h2>

      {nuevo && (
        <label>
          Tipo
          <select value={f.tipo} onChange={campo('tipo')}>
            <option value="entrada">Entrada (la placa la mide o la lee: un sensor, un botón)</option>
            <option value="salida">Salida (se prende y se apaga: un relé, un LED)</option>
          </select>
        </label>
      )}

      <label>
        Id
        <input value={f.id} onChange={campo('id')} disabled={!nuevo}
               placeholder={esSalida ? 'riego' : 'suelo'} autoCapitalize="none" required />
        <span className="ayuda-campo">
          {nuevo
            ? 'El nombre que usan tu sketch y tu app: minúsculas, números y _, hasta 15 caracteres. Tiene que ser igual en los tres lados.'
            : 'El id no se puede cambiar, porque es el nombre que usan tu sketch y tu app. Para renombrarlo, borralo y crealo de nuevo.'}
        </span>
      </label>

      <label>
        Nombre para mostrar
        <input value={f.nombre} onChange={campo('nombre')} maxLength={40}
               placeholder={esSalida ? 'Riego' : 'Humedad de suelo'} />
      </label>

      <div className="dos-columnas">
        <label>
          GPIO {esSalida ? '' : '(opcional)'}
          <input value={f.pin} onChange={campo('pin')} type="number" min={0}
                 placeholder={esSalida ? '26' : '34'} required={esSalida} />
        </label>

        {esSalida ? (
          <label>
            Se activa con
            <select value={f.nivel_activo} onChange={campo('nivel_activo')}>
              <option value="LOW">LOW (la mayoría de los módulos de relés)</option>
              <option value="HIGH">HIGH (un LED, el LED de la placa)</option>
            </select>
          </label>
        ) : (
          <label>
            Unidad
            <input value={f.unidad} onChange={campo('unidad')} maxLength={10} placeholder="%" />
          </label>
        )}
      </div>

      {esSalida && (
        <label>
          Pulsador (GPIO, opcional)
          <input value={f.pulsador} onChange={campo('pulsador')} type="number" min={0} placeholder="32" />
          <span className="ayuda-campo">
            Un pulsador entre ese GPIO y GND prende o apaga esta salida desde la placa. No
            hace falta resistencia: se usa la interna. Si la salida tiene regla y el modo
            automático está activado, el pulsador no hace nada.
          </span>
        </label>
      )}

      <label>
        Conexión (opcional)
        <input value={f.conexion} onChange={campo('conexion')} maxLength={120}
               placeholder={esSalida ? 'IN1 del módulo de relés' : 'sensor capacitivo, salida analógica'} />
        <span className="ayuda-campo">Aparece en el prompt, para que la IA sepa cómo está cableado.</span>
      </label>

      {!esSalida && (
        <label>
          Librería (opcional)
          <input value={f.libreria} onChange={campo('libreria')} maxLength={120}
                 placeholder="DHT sensor library de Adafruit (DHT.h)" />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button className="principal" disabled={yendo}>{yendo ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

// ===================================================================
//  Formulario de regla
// ===================================================================

function FormRegla({ usuario, salida, entradas, inicial, onListo, onCancelar }) {
  const [f, setF] = useState({
    entrada: inicial?.entrada || entradas[0]?.id || '',
    condicion: inicial?.condicion || '>',
    umbral: inicial?.umbral ?? '',
    hist: inicial?.hist ?? 1,
  })
  const [error, setError] = useState(null)
  const campo = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  async function enviar(ev) {
    ev.preventDefault()
    const g = { salida, entrada: f.entrada, condicion: f.condicion, umbral: numeroONull(f.umbral), hist: numeroONull(f.hist) }
    const e = errorRegla(g)
    if (e) { setError(e); return }
    try {
      await guardarRegla(usuario, g)
      onListo(null)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la regla de "${salida}"?`)) return
    try {
      await borrarRegla(usuario, salida)
      onListo(null)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  if (entradas.length === 0) {
    return (
      <div className="tarjeta">
        <h2>Regla de "{salida}"</h2>
        <p className="ayuda">Para armar una regla primero necesitás al menos una entrada.</p>
        <button onClick={onCancelar}>Volver</button>
      </div>
    )
  }

  const u = Number(f.umbral), h = Number(f.hist)
  const completa = f.umbral !== '' && f.hist !== ''
  const apagado = f.condicion === '>' ? `baja de ${u - h}` : `supera ${u + h}`

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h2>Regla de "{salida}"</h2>
      <p className="ayuda">
        La evalúa tu placa cuando está en modo automático, así sigue funcionando
        aunque se corte internet. Una salida tiene una sola regla.
      </p>

      <div className="dos-columnas">
        <label>
          Entrada
          <select value={f.entrada} onChange={campo('entrada')}>
            {entradas.map(e => <option key={e.id} value={e.id}>{e.nombre || e.id} ({e.id})</option>)}
          </select>
        </label>
        <label>
          Se prende si la entrada
          <select value={f.condicion} onChange={campo('condicion')}>
            <option value=">">supera el umbral</option>
            <option value="<">baja del umbral</option>
          </select>
        </label>
      </div>

      <div className="dos-columnas">
        <label>
          Umbral
          <input value={f.umbral} onChange={campo('umbral')} type="number" step="any" required />
        </label>
        <label>
          Histéresis
          <input value={f.hist} onChange={campo('hist')} type="number" step="any" min={0} required />
        </label>
      </div>

      {completa && (
        <p className="ayuda">
          "{salida}" se prende cuando {f.entrada} {f.condicion === '>' ? 'supera' : 'baja de'} {u},
          y se apaga recién cuando {apagado}. Esa franja evita que la
          salida se prenda y apague sin parar cuando el valor ronda el umbral.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        {inicial && <button type="button" className="peligro" onClick={borrar}>Borrar regla</button>}
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button className="principal">Guardar</button>
      </div>
    </form>
  )
}

// ===================================================================
//  Pulsador de modo
// ===================================================================

function PulsadorModo({ usuario, placa }) {
  const [pin, setPin] = useState(placa.pulsadorModo ?? '')
  const [mensaje, setMensaje] = useState(null)

  async function guardar(ev) {
    ev.preventDefault()
    const valor = numeroONull(pin)
    const e = errorPulsadorModo(valor, placa.canales)
    if (e) { setMensaje({ error: e }); return }
    try {
      await guardarPulsadorModo(usuario, valor)
      setMensaje({ ok: 'Guardado.' })
    } catch (err) {
      setMensaje({ error: mensajeError(err) })
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <h3>Pulsador de modo automático</h3>
      <p className="ayuda">
        Opcional. Un pulsador entre ese GPIO y GND activa y desactiva el modo
        automático desde la placa, igual que el botón de la app. Dejalo vacío si
        no usás uno.
      </p>
      <div className="fila-guardar">
        <input value={pin} onChange={ev => { setPin(ev.target.value); setMensaje(null) }}
               type="number" min={0} placeholder="25" aria-label="GPIO del pulsador de modo" />
        <button>Guardar</button>
      </div>
      {mensaje?.error && <p className="error">{mensaje.error}</p>}
      {mensaje?.ok && <p className="ayuda">{mensaje.ok}</p>}
    </form>
  )
}

// ===================================================================
//  Pantalla
// ===================================================================

export default function Configurar({ usuario, placa, precarga, onPrecargaUsada }) {
  const [editando, setEditando] = useState(null)   // {clase:'canal', inicial, nuevo} | {clase:'regla', salida}
  const [mensaje, setMensaje] = useState(null)

  // "agregar" desde un detectado en Mi placa
  useEffect(() => {
    if (precarga) {
      setEditando({ clase: 'canal', nuevo: true, inicial: precarga })
      onPrecargaUsada()
    }
  }, [precarga, onPrecargaUsada])

  const { canales, reglas } = placa
  const entradas = canales.filter(c => c.tipo === 'entrada')
  const salidas = canales.filter(c => c.tipo === 'salida')
  const reglaDe = Object.fromEntries(reglas.map(g => [g.salida, g]))

  function listo(texto) {
    setEditando(null)
    setMensaje(texto)
  }

  async function borrar(c) {
    const afectadas = reglas.filter(g => g.salida === c.id || g.entrada === c.id).length
    const extra = afectadas ? ` También se borra${afectadas > 1 ? 'n' : ''} ${afectadas} regla${afectadas > 1 ? 's' : ''}.` : ''
    if (!window.confirm(`¿Borrar "${c.id}"?${extra}`)) return
    try {
      await borrarCanal(usuario, c, reglas)
      setMensaje(null)
    } catch (err) {
      setMensaje(mensajeError(err))
    }
  }

  if (editando?.clase === 'canal') {
    return <FormCanal usuario={usuario} placa={placa} inicial={editando.inicial} nuevo={editando.nuevo}
                      onListo={listo} onCancelar={() => setEditando(null)} />
  }

  if (editando?.clase === 'regla') {
    return <FormRegla usuario={usuario} salida={editando.salida} entradas={entradas}
                      inicial={reglaDe[editando.salida]} onListo={listo} onCancelar={() => setEditando(null)} />
  }

  return (
    <>
      <p className="ayuda">
        Lo que declares acá tiene que coincidir con tu sketch: mismos ids. Si tu
        placa manda algo que no está acá, aparece en "Mi placa" para agregarlo.
      </p>

      {mensaje && <div className="tarjeta"><p className="ayuda">{mensaje}</p></div>}

      <div className="tarjeta">
        <div className="bloque-cab">
          <h3>Entradas <span className="tenue">({entradas.length} de {MAX})</span></h3>
          <button className="chico" disabled={entradas.length >= MAX}
                  onClick={() => setEditando({ clase: 'canal', nuevo: true, inicial: { tipo: 'entrada' } })}>
            + Agregar
          </button>
        </div>
        <p className="ayuda">Lo que tu placa mide o lee y manda como número: un sensor, un botón, un potenciómetro.</p>
        {entradas.length === 0 && <p className="ayuda">Ninguna todavía.</p>}
        {entradas.map(s => (
          <div key={s.id} className="fila-canal">
            <div>
              <code>{s.id}</code> {s.nombre || ''}{s.unidad ? ` (${s.unidad})` : ''}
              {(s.conexion || s.pin != null) && (
                <div className="tenue detalle">{[s.pin != null && `GPIO ${s.pin}`, s.conexion].filter(Boolean).join(' · ')}</div>
              )}
            </div>
            <div className="acciones-fila">
              <button className="chico" onClick={() => setEditando({ clase: 'canal', nuevo: false, inicial: s })}>Editar</button>
              <button className="chico peligro" onClick={() => borrar(s)}>Borrar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <div className="bloque-cab">
          <h3>Salidas <span className="tenue">({salidas.length} de {MAX})</span></h3>
          <button className="chico" disabled={salidas.length >= MAX}
                  onClick={() => setEditando({ clase: 'canal', nuevo: true, inicial: { tipo: 'salida' } })}>
            + Agregar
          </button>
        </div>
        <p className="ayuda">Lo que tu placa prende y apaga: un relé, un LED, un buzzer.</p>
        {salidas.length === 0 && <p className="ayuda">Ninguna todavía.</p>}
        {salidas.map(r => {
          const g = reglaDe[r.id]
          return (
            <div key={r.id} className="fila-canal">
              <div>
                <code>{r.id}</code> {r.nombre || ''}
                <div className="tenue detalle">
                  GPIO {r.pin} · {r.nivel_activo}
                  {r.pulsador != null ? ` · pulsador en GPIO ${r.pulsador}` : ''}
                  {r.conexion ? ` · ${r.conexion}` : ''}
                </div>
                <div className="detalle">
                  {g ? <>Regla: {textoRegla(g)}</> : <span className="tenue">Sin regla automática</span>}
                </div>
              </div>
              <div className="acciones-fila">
                <button className="chico" onClick={() => setEditando({ clase: 'canal', nuevo: false, inicial: r })}>Editar</button>
                <button className="chico" onClick={() => setEditando({ clase: 'regla', salida: r.id })}>Regla</button>
                <button className="chico peligro" onClick={() => borrar(r)}>Borrar</button>
              </div>
            </div>
          )
        })}
      </div>

      {salidas.length > 0 && <PulsadorModo key={placa.pulsadorModo ?? 'ninguno'} usuario={usuario} placa={placa} />}
    </>
  )
}
