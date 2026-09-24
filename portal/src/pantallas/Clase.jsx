import { useState, useEffect } from 'react'
import {
  escucharCursos, escucharClase, escucharDesfase, fijarAbierto, borrarAlumno,
  normalizarPlaca, aBinario, mensajeError,
} from '../firebase.js'

// Lo que el docente mira antes y durante la clase: quién tiene la placa
// conectada, qué manda y si algo avisa. Todo en vivo.

const LATIDO_MAX = 40000

export default function Clase({ onSalir }) {
  const [cursos, setCursos] = useState(null)
  const [curso, setCurso] = useState(null)
  const [clase, setClase] = useState(null)
  const [desfase, setDesfase] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [error, setError] = useState(null)

  useEffect(() => escucharCursos(setCursos, (e) => setError(mensajeError(e))), [])
  useEffect(() => escucharDesfase(setDesfase), [])
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  // Con un solo curso, se elige solo.
  useEffect(() => {
    if (cursos && !curso) {
      const codigos = Object.keys(cursos)
      if (codigos.length === 1) setCurso(codigos[0])
    }
  }, [cursos, curso])

  useEffect(() => {
    if (!curso) return
    setClase(null)
    return escucharClase(curso, setClase, (e) => setError(mensajeError(e)))
  }, [curso])

  async function alternarInscripcion() {
    try {
      await fijarAbierto(curso, !cursos[curso].abierto)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function borrar(usuario, nombre) {
    if (!window.confirm(`¿Borrar a ${nombre} (${usuario})? Se pierden su hardware, sus reglas y sus datos.`)) return
    try {
      await borrarAlumno(usuario)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const filas = clase
    ? Object.entries(clase.alumnos)
        .map(([usuario, a]) => ({ usuario, ...a, placa: normalizarPlaca(clase.placas[usuario]) }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre))
    : []
  const conectadas = filas.filter(f => estaConectada(f.placa, ahora + desfase)).length

  return (
    <main className="ancho">
      <header>
        <div>
          <h1>Nexus IoT</h1>
          <span className="tenue subtitulo">Docente</span>
        </div>
        <button className="salir" onClick={onSalir}>salir</button>
      </header>

      {error && <div className="tarjeta"><p className="error">{error}</p></div>}

      {!cursos ? <div className="tarjeta"><p className="ayuda">Cargando…</p></div> : (
        <div className="tarjeta">
          {Object.keys(cursos).length === 0 ? (
            <p className="ayuda">
              No hay cursos todavía. Se crean desde Firebase Console, en
              cursos/&lt;CODIGO&gt; (ver firebase/LEEME.md, paso 3).
            </p>
          ) : (
            <label>
              Curso
              <select value={curso || ''} onChange={e => setCurso(e.target.value || null)}>
                <option value="">Elegí uno</option>
                {Object.entries(cursos).map(([c, d]) => <option key={c} value={c}>{c} — {d.nombre}</option>)}
              </select>
            </label>
          )}
          {curso && cursos[curso] && (
            <div className="salida-fila">
              <span>
                Inscripciones {cursos[curso].abierto ? 'abiertas' : 'cerradas'}
                <span className="tenue detalle"> · los que ya están pueden entrar igual</span>
              </span>
              <button className="chico" onClick={alternarInscripcion}>
                {cursos[curso].abierto ? 'Cerrar' : 'Abrir'}
              </button>
            </div>
          )}
        </div>
      )}

      {curso && !clase && <div className="tarjeta"><p className="ayuda">Cargando la clase…</p></div>}

      {clase && (
        <div className="tarjeta">
          <h3>
            {filas.length} alumno{filas.length === 1 ? '' : 's'}
            <span className="tenue"> · {conectadas} placa{conectadas === 1 ? '' : 's'} conectada{conectadas === 1 ? '' : 's'}</span>
          </h3>
          {filas.length === 0 && <p className="ayuda">Nadie se anotó todavía. Pasales el código {curso}.</p>}
          {filas.map(f => <FilaAlumno key={f.usuario} f={f} ahora={ahora + desfase} onBorrar={() => borrar(f.usuario, f.nombre)} />)}
        </div>
      )}

      <div className="tarjeta">
        <h3>Si alguien se olvidó la contraseña</h3>
        <p className="ayuda sin-margen">
          En Firebase Console → Authentication, borrá su cuenta (buscala por su
          usuario). Después el alumno toca "Es mi primera vez" con el mismo nombre y
          una contraseña nueva: conserva todo lo que había configurado. Tiene que
          cambiarla también en su sketch y en su app.
        </p>
      </div>
    </main>
  )
}

function estaConectada(p, ahora) {
  return typeof p.estado.visto === 'number' && ahora - p.estado.visto <= LATIDO_MAX
}

function FilaAlumno({ f, ahora, onBorrar }) {
  const p = f.placa
  const nunca = typeof p.estado.visto !== 'number'
  const viva = estaConectada(p, ahora)
  const entradas = p.canales.filter(c => c.tipo === 'entrada')
  const salidas = p.canales.filter(c => c.tipo === 'salida')
  const valores = [
    ...entradas.map(c => typeof p.estado[c.id] === 'number' ? `${c.id} ${Number(p.estado[c.id]).toFixed(1)}` : `${c.id} —`),
    ...salidas.map(c => `${c.id} ${aBinario(p.estado[c.id]) === 1 ? 'ON' : aBinario(p.estado[c.id]) === 0 ? 'OFF' : '—'}`),
  ]

  return (
    <div className={'fila-canal alumno ' + (viva ? 'viva' : 'muerta')}>
      <div>
        <span className="punto" /> {f.nombre} <code className="tenue">{f.usuario}</code>
        <div className="tenue detalle">
          {nunca ? 'nunca se conectó' : viva ? 'conectada' : 'desconectada'}
          {' · '}{entradas.length} entrada{entradas.length === 1 ? '' : 's'}, {salidas.length} salida{salidas.length === 1 ? '' : 's'}
          {p.reglas.length > 0 && ` · ${p.reglas.length} regla${p.reglas.length === 1 ? '' : 's'}`}
          {p.auto && ' · modo automático'}
        </div>
        {!nunca && valores.length > 0 && <div className="detalle">{valores.join(' · ')}</div>}
        {typeof p.estado.aviso === 'string' && p.estado.aviso && <div className="detalle aviso">{p.estado.aviso}</div>}
      </div>
      <div className="acciones-fila">
        <button className="chico peligro" onClick={onBorrar}>Borrar</button>
      </div>
    </div>
  )
}
