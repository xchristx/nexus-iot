import { useState, useEffect } from 'react'
import { guardarCanal, borrarCanal, guardarRegla, borrarRegla } from '../api.js'
import { Etiqueta, textoRegla } from '../componentes/comunes.jsx'

const MAX = 10

// ===================================================================
//  Formulario de sensor o relé
// ===================================================================

function FormCanal({ admin, inicial, nuevo, onListo, onCancelar }) {
  const [f, setF] = useState({
    tipo: inicial.tipo || 'sensor',
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
  const esRele = f.tipo === 'rele'

  // Solo se mandan los campos con algo escrito: el backend valida el resto y
  // devuelve el mensaje que se muestra tal cual.
  function armar() {
    const c = { id: f.id.trim(), tipo: f.tipo }
    if (f.nombre.trim()) c.nombre = f.nombre.trim()
    if (f.conexion.trim()) c.conexion = f.conexion.trim()
    if (f.pin !== '') c.pin = Number(f.pin)
    if (esRele) {
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
      <h2>{nuevo ? 'Agregar' : 'Editar'} {esRele ? 'relé' : 'sensor'}</h2>

      {nuevo && (
        <label>
          Tipo
          <select value={f.tipo} onChange={campo('tipo')}>
            <option value="sensor">Sensor (mide algo: un número)</option>
            <option value="rele">Relé (se prende y se apaga)</option>
          </select>
        </label>
      )}

      <label>
        Id
        <input value={f.id} onChange={campo('id')} disabled={!nuevo}
               placeholder={esRele ? 'riego' : 'suelo'} autoCapitalize="none" required />
        <span className="ayuda-campo">
          {nuevo
            ? 'El nombre que viaja en el JSON: minúsculas, números y _, hasta 15 caracteres. Tiene que ser igual en tu sketch y en tu app.'
            : 'El id no se puede cambiar, porque es el nombre que usan tu sketch y tu app. Para renombrarlo, borralo y crealo de nuevo.'}
        </span>
      </label>

      <label>
        Nombre para mostrar
        <input value={f.nombre} onChange={campo('nombre')} maxLength={40}
               placeholder={esRele ? 'Riego' : 'Humedad de suelo'} />
      </label>

      <div className="dos-columnas">
        <label>
          GPIO {esRele ? '' : '(opcional)'}
          <input value={f.pin} onChange={campo('pin')} type="number" min={0} max={39}
                 placeholder={esRele ? '25' : '34'} required={esRele} />
        </label>

        {esRele ? (
          <label>
            Se activa con
            <select value={f.nivel_activo} onChange={campo('nivel_activo')}>
              <option value="LOW">LOW (módulo de relés)</option>
              <option value="HIGH">HIGH (LED de la placa)</option>
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
               placeholder={esRele ? 'IN1 del módulo de relés' : 'sensor capacitivo, salida analógica'} />
        <span className="ayuda-campo">Aparece en el prompt, para que la IA sepa cómo está cableado.</span>
      </label>

      {!esRele && (
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

function FormRegla({ admin, rele, sensores, inicial, onListo, onCancelar }) {
  const [f, setF] = useState({
    sensor: inicial?.sensor || sensores[0]?.id || '',
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
      rele,
      sensor: f.sensor,
      condicion: f.condicion,
      umbral: f.umbral === '' ? null : Number(f.umbral),
      hist: f.hist === '' ? null : Number(f.hist),
      activa: f.activa,
    })
    if (!r.ok) { setError(r.error); return }
    onListo(null)
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la regla de "${rele}"?`)) return
    const r = await borrarRegla(admin, rele)
    if (!r.ok) { setError(r.error); return }
    onListo(null)
  }

  if (sensores.length === 0) {
    return (
      <div className="tarjeta">
        <h2>Regla de "{rele}"</h2>
        <p className="ayuda">Para armar una regla primero necesitás al menos un sensor.</p>
        <button onClick={onCancelar}>Volver</button>
      </div>
    )
  }

  const u = Number(f.umbral), h = Number(f.hist)
  const completa = f.umbral !== '' && f.hist !== ''
  const apagado = f.condicion === '>' ? `baja de ${u - h}` : `supera ${u + h}`

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h2>Regla de "{rele}"</h2>
      <p className="ayuda">
        La evalúa tu placa, así sigue funcionando aunque se corte internet. Un
        relé tiene una sola regla.
      </p>

      <div className="dos-columnas">
        <label>
          Sensor
          <select value={f.sensor} onChange={campo('sensor')}>
            {sensores.map(s => <option key={s.id} value={s.id}>{s.nombre || s.id} ({s.id})</option>)}
          </select>
        </label>
        <label>
          Se prende si el sensor
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
          "{rele}" se prende cuando {f.sensor} {f.condicion === '>' ? 'supera' : 'baja de'} {u},
          y se apaga recién cuando {apagado}. Esa franja evita que el relé
          se prenda y apague sin parar cuando el valor ronda el umbral.
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
  const [editando, setEditando] = useState(null)   // {clase:'canal', inicial, nuevo} | {clase:'regla', rele}
  const [mensaje, setMensaje] = useState(null)

  // "agregar" desde un detectado en Mi placa
  useEffect(() => {
    if (precarga) {
      setEditando({ clase: 'canal', nuevo: true, inicial: precarga })
      onPrecargaUsada()
    }
  }, [precarga, onPrecargaUsada])

  const sensores = config.canales.filter(c => c.tipo === 'sensor')
  const reles = config.canales.filter(c => c.tipo === 'rele')
  const reglaDe = Object.fromEntries(config.reglas.map(g => [g.rele, g]))

  async function listo(texto) {
    setEditando(null)
    setMensaje(texto)
    await recargar()
  }

  async function borrar(c) {
    const afectadas = config.reglas.filter(g => g.rele === c.id || g.sensor === c.id).length
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
    return <FormRegla admin={admin} rele={editando.rele} sensores={sensores}
                      inicial={reglaDe[editando.rele]} onListo={listo} onCancelar={() => setEditando(null)} />
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
          <h3>Sensores <span className="tenue">({sensores.length} de {MAX})</span></h3>
          <button className="chico" disabled={sensores.length >= MAX}
                  onClick={() => setEditando({ clase: 'canal', nuevo: true, inicial: { tipo: 'sensor' } })}>
            + Agregar
          </button>
        </div>
        {sensores.length === 0 && <p className="ayuda">Ninguno todavía.</p>}
        {sensores.map(s => (
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
          <h3>Relés <span className="tenue">({reles.length} de {MAX})</span></h3>
          <button className="chico" disabled={reles.length >= MAX}
                  onClick={() => setEditando({ clase: 'canal', nuevo: true, inicial: { tipo: 'rele' } })}>
            + Agregar
          </button>
        </div>
        {reles.length === 0 && <p className="ayuda">Ninguno todavía.</p>}
        {reles.map(r => {
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
                <button className="chico" onClick={() => setEditando({ clase: 'regla', rele: r.id })}>Regla</button>
                <button className="chico peligro" onClick={() => borrar(r)}>Borrar</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
