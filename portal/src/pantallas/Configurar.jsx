import { useState, useEffect } from 'react'
import { guardarCanal, borrarCanal, guardarRegla, borrarRegla } from '../api.js'
import { Etiqueta, textoRegla } from '../componentes/comunes.jsx'

const MAX = 10

// ===================================================================
//  Formulario de entrada o salida
// ===================================================================

function FormCanal({ admin, inicial, nuevo, onListo, onCancelar }) {
  const [f, setF] = useState({
    tipo: inicial.tipo || 'entrada',
    id: inicial.id || '',
    nombre: inicial.nombre || '',
    unidad: inicial.unidad || '',
    pin: inicial.pin ?? '',
    nivel_activo: inicial.nivel_activo || 'LOW',
    conexion: inicial.conexion || '',
    libreria: inicial.libreria || '',
  })
  const [error, setError] = useState(null)
  const [yendo, setYendo] = useState(false)
  const campo = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const esSalida = f.tipo === 'salida'

  // Solo se mandan los campos con algo escrito: el backend valida el resto y
  // devuelve el mensaje que se muestra tal cual.
  function armar() {
    const c = { id: f.id.trim(), tipo: f.tipo }
    if (f.nombre.trim()) c.nombre = f.nombre.trim()
    if (f.conexion.trim()) c.conexion = f.conexion.trim()
    if (f.pin !== '') c.pin = Number(f.pin)
    if (esSalida) {
      c.nivel_activo = f.nivel_activo
    } else {
      if (f.unidad.trim()) c.unidad = f.unidad.trim()
      if (f.libreria.trim()) c.libreria = f.libreria.trim()
    }
    return c
  }

  async function enviar(ev) {
    ev.preventDefault()
    setYendo(true)
    const r = await guardarCanal(admin, armar())
    setYendo(false)
    if (!r.ok) { setError(r.error); return }
    onListo(r.reglas_borradas > 0
      ? `Guardado. Se borraron ${r.reglas_borradas} regla(s) que ya no tenían sentido.`
      : null)
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
            ? 'El nombre que viaja en el JSON: minúsculas, números y _, hasta 15 caracteres. Tiene que ser igual en tu sketch y en tu app.'
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
          <input value={f.pin} onChange={campo('pin')} type="number" min={0} max={39}
                 placeholder={esSalida ? '25' : '34'} required={esSalida} />
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

function FormRegla({ admin, salida, entradas, inicial, onListo, onCancelar }) {
  const [f, setF] = useState({
    entrada: inicial?.entrada || entradas[0]?.id || '',
    condicion: inicial?.condicion || '>',
    umbral: inicial?.umbral ?? '',
    hist: inicial?.hist ?? 1,
    activa: inicial?.activa ?? false,
  })
  const [error, setError] = useState(null)
  const campo = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  async function enviar(ev) {
    ev.preventDefault()
    const r = await guardarRegla(admin, {
      salida,
      entrada: f.entrada,
      condicion: f.condicion,
      umbral: f.umbral === '' ? null : Number(f.umbral),
      hist: f.hist === '' ? null : Number(f.hist),
      activa: f.activa,
    })
    if (!r.ok) { setError(r.error); return }
    onListo(null)
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la regla de "${salida}"?`)) return
    const r = await borrarRegla(admin, salida)
    if (!r.ok) { setError(r.error); return }
    onListo(null)
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
        La evalúa tu placa, así sigue funcionando aunque se corte internet. Una
        salida tiene una sola regla.
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

      <label className="casilla">
        <input type="checkbox" checked={f.activa} onChange={ev => setF({ ...f, activa: ev.target.checked })} />
        Activa
      </label>

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
//  Pantalla
// ===================================================================

export default function Configurar({ admin, config, recargar, precarga, onPrecargaUsada }) {
  const [editando, setEditando] = useState(null)   // {clase:'canal', inicial, nuevo} | {clase:'regla', salida}
  const [mensaje, setMensaje] = useState(null)

  // "agregar" desde un detectado en Mi placa
  useEffect(() => {
    if (precarga) {
      setEditando({ clase: 'canal', nuevo: true, inicial: precarga })
      onPrecargaUsada()
    }
  }, [precarga, onPrecargaUsada])

  const entradas = config.canales.filter(c => c.tipo === 'entrada')
  const salidas = config.canales.filter(c => c.tipo === 'salida')
  const reglaDe = Object.fromEntries(config.reglas.map(g => [g.salida, g]))

  async function listo(texto) {
    setEditando(null)
    setMensaje(texto)
    await recargar()
  }

  async function borrar(c) {
    const afectadas = config.reglas.filter(g => g.salida === c.id || g.entrada === c.id).length
    const extra = afectadas ? ` También se borra${afectadas > 1 ? 'n' : ''} ${afectadas} regla${afectadas > 1 ? 's' : ''}.` : ''
    if (!window.confirm(`¿Borrar "${c.id}"?${extra}`)) return
    const r = await borrarCanal(admin, c.id)
    setMensaje(r.ok ? null : r.error)
    if (r.ok) await recargar()
  }

  if (editando?.clase === 'canal') {
    return <FormCanal admin={admin} inicial={editando.inicial} nuevo={editando.nuevo}
                      onListo={listo} onCancelar={() => setEditando(null)} />
  }

  if (editando?.clase === 'regla') {
    return <FormRegla admin={admin} salida={editando.salida} entradas={entradas}
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
                  GPIO {r.pin} · {r.nivel_activo}{r.conexion ? ` · ${r.conexion}` : ''}
                </div>
                <div className="detalle">
                  {g
                    ? <>Automático: {textoRegla(g)} {g.activa ? <Etiqueta>activa</Etiqueta> : <Etiqueta tenue>inactiva</Etiqueta>}</>
                    : <span className="tenue">Sin regla automática</span>}
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
    </>
  )
}
