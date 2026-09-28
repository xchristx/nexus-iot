import { useState, useEffect } from 'react'
import {
  guardarCanal, borrarCanal, guardarRegla, borrarRegla, guardarPulsadorModo, mensajeError,
  guardarWidget, guardarAlerta, borrarAlerta, moverCanal, aBinario,
} from '../firebase.js'
import { MAX, errorCanal, errorRegla, errorPulsadorModo, errorAlerta, errorWidget } from '../validar.js'
import { textoRegla } from '../componentes/comunes.jsx'
import {
  WIDGETS_ENTRADA, WIDGETS_SALIDA, COLORES, ICONOS, widgetDe,
  WidgetEntrada, Interruptor, BotonSalida, Icono, varColor,
} from '../componentes/widgets.jsx'
import { textoAlerta } from '../alertas.js'

const numeroONull = (v) => (v === '' || v == null ? null : Number(v))

// ===================================================================
//  Vista previa del widget
// ===================================================================

// Con el valor que manda la placa si hay uno; si no, uno de muestra.
function VistaPrevia({ tipo, nombre, unidad, valor, w }) {
  if (tipo === 'salida') {
    const v = aBinario(valor) ?? 1
    return (
      <div className="vista-previa">
        {w.widget === 'boton'
          ? <BotonSalida nombre={nombre} icono={w.icono} valor={v} color={w.color} onCambiar={() => {}} />
          : (
            <div className="salida-fila">
              <span className="salida-nombre">{w.icono && <Icono nombre={w.icono} />}{nombre}</span>
              <Interruptor valor={v} color={w.color} onCambiar={() => {}} />
            </div>
          )}
      </div>
    )
  }
  const muestra = typeof valor === 'number' ? valor
    : w.widget === 'indicador' ? 1
    : w.min < w.max ? w.min + (w.max - w.min) * 0.6 : 24
  return (
    <div className="vista-previa datos">
      <WidgetEntrada titulo={nombre} valor={muestra} unidad={unidad} w={w} />
    </div>
  )
}

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
  const w0 = widgetDe({ id: inicial.id, tipo: inicial.tipo || 'entrada' }, placa.tablero)
  const [w, setWidget] = useState({ ...w0, icono: w0.icono || '', min: String(w0.min), max: String(w0.max) })
  const setW = (nuevo) => { setWidget(nuevo); setError(null) }
  const campo = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const esSalida = f.tipo === 'salida'
  const opciones = esSalida ? WIDGETS_SALIDA : WIDGETS_ENTRADA
  // Si cambió el tipo, el widget elegido puede no corresponder.
  const widget = opciones.some(x => x.id === w.widget) ? w.widget : opciones[0].id
  const conEscala = widget === 'medidor' || widget === 'barra'

  function armarWidget() {
    const r = { widget, color: w.color }
    if (w.icono) r.icono = w.icono
    if (conEscala) { r.min = numeroONull(w.min); r.max = numeroONull(w.max) }
    return r
  }

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
    const wid = armarWidget()
    const ew = errorWidget(wid)
    if (ew) { setError(ew); return }
    const orden = nuevo
      ? Math.max(-1, ...placa.canales.map(x => x.orden ?? 0)) + 1
      : (inicial.orden ?? 0)
    setYendo(true)
    try {
      await guardarCanal(usuario, c, orden)
    } catch (err) {
      setError(mensajeError(err))
      setYendo(false)
      return
    }
    // El canal ya quedó guardado: si falla solo el widget, se dice así.
    try {
      await guardarWidget(usuario, c.id, wid)
      onListo(null)
    } catch (err) {
      onListo(`"${c.id}" se guardó, pero no cómo se ve. ${mensajeError(err, 'tablero')}`)
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

      <h3 className="seccion">Cómo se ve en Mi placa</h3>
      <VistaPrevia tipo={f.tipo} nombre={f.nombre.trim() || f.id.trim() || (esSalida ? 'Salida' : 'Entrada')}
                   unidad={f.unidad.trim()} valor={placa.estado[f.id.trim()]}
                   w={{ ...armarWidget(), min: numeroONull(w.min) ?? 0, max: numeroONull(w.max) ?? 100, icono: w.icono || null }} />

      <div className="dos-columnas">
        <label>
          Forma
          <select value={widget} onChange={ev => setW({ ...w, widget: ev.target.value })}>
            {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </label>
        <label>
          Ícono
          <select value={w.icono} onChange={ev => setW({ ...w, icono: ev.target.value })}>
            <option value="">Ninguno</option>
            {ICONOS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
      </div>

      {conEscala && (
        <div className="dos-columnas">
          <label>
            Mínimo de la escala
            <input value={w.min} onChange={ev => setW({ ...w, min: ev.target.value })} type="number" step="any" />
          </label>
          <label>
            Máximo de la escala
            <input value={w.max} onChange={ev => setW({ ...w, max: ev.target.value })} type="number" step="any" />
          </label>
        </div>
      )}

      <div className="etiqueta-campo">
        Color
        <div className="colores" role="radiogroup" aria-label="Color">
          {COLORES.map(c => (
            <button key={c} type="button" role="radio" aria-checked={w.color === c} aria-label={c} title={c}
                    className={'color' + (w.color === c ? ' activo' : '')} style={{ '--c': varColor(c) }}
                    onClick={() => setW({ ...w, color: c })} />
          ))}
        </div>
      </div>

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
//  Formulario de alerta
// ===================================================================

function FormAlerta({ usuario, entrada, inicial, onListo, onCancelar }) {
  const [f, setF] = useState({
    condicion: inicial?.condicion || '>',
    umbral: inicial?.umbral ?? '',
    hist: inicial?.hist ?? 1,
  })
  const [error, setError] = useState(null)
  const campo = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const nombre = entrada.nombre || entrada.id

  async function enviar(ev) {
    ev.preventDefault()
    const a = { entrada: entrada.id, condicion: f.condicion, umbral: numeroONull(f.umbral), hist: numeroONull(f.hist) }
    const e = errorAlerta(a)
    if (e) { setError(e); return }
    try {
      await guardarAlerta(usuario, a)
      onListo(null)
    } catch (err) {
      setError(mensajeError(err, 'alertas'))
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la alerta de "${entrada.id}"?`)) return
    try {
      await borrarAlerta(usuario, entrada.id)
      onListo(null)
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const u = Number(f.umbral), h = Number(f.hist)
  const completa = f.umbral !== '' && f.hist !== ''
  const fin = f.condicion === '>' ? `baja de ${u - h}` : `supera ${u + h}`

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h2>Alerta de "{nombre}"</h2>
      <p className="ayuda">
        Te avisa con un sonido, una notificación y una tarjeta roja en Mi placa. La
        revisa el portal (o la app) mientras está abierto: con todo cerrado no llega.
        No prende ni apaga nada; para eso están las reglas de las salidas.
      </p>

      <div className="dos-columnas">
        <label>
          Avisar si {entrada.id}
          <select value={f.condicion} onChange={campo('condicion')}>
            <option value=">">supera el umbral</option>
            <option value="<">baja del umbral</option>
          </select>
        </label>
        <label>
          Umbral{entrada.unidad ? ` (${entrada.unidad})` : ''}
          <input value={f.umbral} onChange={campo('umbral')} type="number" step="any" required />
        </label>
      </div>

      <label>
        Histéresis
        <input value={f.hist} onChange={campo('hist')} type="number" step="any" min={0} required />
      </label>

      {completa && (
        <p className="ayuda">
          Avisa cuando {entrada.id} {f.condicion === '>' ? 'supera' : 'baja de'} {u}, y la alerta
          termina recién cuando {fin}. Así un valor que ronda el umbral no avisa una y otra vez.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        {inicial && <button type="button" className="peligro" onClick={borrar}>Borrar alerta</button>}
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
  const alertaDe = Object.fromEntries(placa.alertas.map(a => [a.entrada, a]))

  async function mover(id, paso) {
    try {
      await moverCanal(usuario, canales, id, paso)
    } catch (err) {
      setMensaje(mensajeError(err))
    }
  }

  // ↑ ↓ para ordenar cómo aparecen en Mi placa.
  const flechas = (lista, i) => (
    <span className="flechas">
      <button className="chico" aria-label="Subir" disabled={i === 0} onClick={() => mover(lista[i].id, -1)}>↑</button>
      <button className="chico" aria-label="Bajar" disabled={i === lista.length - 1} onClick={() => mover(lista[i].id, 1)}>↓</button>
    </span>
  )

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

  if (editando?.clase === 'alerta') {
    return <FormAlerta usuario={usuario} entrada={editando.entrada} inicial={alertaDe[editando.entrada.id]}
                       onListo={listo} onCancelar={() => setEditando(null)} />
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
        {entradas.map((s, i) => (
          <div key={s.id} className="fila-canal">
            <div>
              <code>{s.id}</code> {s.nombre || ''}{s.unidad ? ` (${s.unidad})` : ''}
              {(s.conexion || s.pin != null) && (
                <div className="tenue detalle">{[s.pin != null && `GPIO ${s.pin}`, s.conexion].filter(Boolean).join(' · ')}</div>
              )}
              {alertaDe[s.id] && <div className="detalle">Alerta: {textoAlerta(alertaDe[s.id], s.unidad)}</div>}
            </div>
            <div className="acciones-fila">
              {flechas(entradas, i)}
              <button className="chico" onClick={() => setEditando({ clase: 'canal', nuevo: false, inicial: s })}>Editar</button>
              <button className="chico" onClick={() => setEditando({ clase: 'alerta', entrada: s })}>Alerta</button>
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
        {salidas.map((r, i) => {
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
                {flechas(salidas, i)}
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
