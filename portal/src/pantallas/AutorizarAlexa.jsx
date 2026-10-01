import { useState, useEffect } from 'react'
import { autorizarAlexa, escucharCursos, escucharClase, normalizarPlaca, mensajeError, salir } from '../firebase.js'
import { urlDeVuelta, dispositivosDe, MAX_DISPOSITIVOS, NOMBRE_SKILL } from '../alexa.js'
import { Titulo } from '../componentes/comunes.jsx'

// Lo que ve quien activa la skill en la app Alexa: Amazon abre /alexa para
// que autorice (alexa.js). El alumno vincula su placa; el docente, el Echo
// del laboratorio con las placas que elija de un curso.

export default function AutorizarAlexa({ pedido, rol, usuario }) {
  if (pedido.error) {
    return (
      <main>
        <header><Titulo /></header>
        <div className="tarjeta">
          <h2>Vincular Alexa</h2>
          <p className="error">{pedido.error}</p>
          <a href="/">Ir al portal</a>
        </div>
      </main>
    )
  }
  return (
    <main>
      <header>
        <Titulo />
        <button className="salir" onClick={salir}>salir</button>
      </header>
      {rol === 'docente' ? <ParaDocente pedido={pedido} /> : <ParaAlumno pedido={pedido} usuario={usuario} />}
    </main>
  )
}

// Antes de entrar: qué está pasando.
export function AvisoAlexa() {
  return (
    <div className="tarjeta">
      <h2>Vincular Alexa</h2>
      <p className="ayuda sin-margen">
        La app Alexa te trajo acá para conectar la skill {NOMBRE_SKILL}. Entrá con el
        usuario y la contraseña de tu tarjeta (o como docente, para el Echo del
        laboratorio) y después vas a poder autorizarla.
      </p>
    </div>
  )
}

function Botones({ pedido, yendo, puede = true, onAutorizar }) {
  const cancelar = () => window.location.replace(urlDeVuelta(pedido, { error: 'access_denied' }))
  return (
    <div className="acciones">
      <button type="button" disabled={yendo} onClick={cancelar}>Cancelar</button>
      <button className="principal" disabled={yendo || !puede} onClick={onAutorizar}>
        {yendo ? 'Un momento…' : 'Autorizar'}
      </button>
    </div>
  )
}

function useAutorizar(pedido) {
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState(null)
  async function autorizar(dueno) {
    setYendo(true)
    setError(null)
    try {
      window.location.replace(await autorizarAlexa(pedido, dueno))
    } catch (e) {
      setError(mensajeError(e, 'alexa'))
      setYendo(false)
    }
  }
  return { yendo, error, autorizar }
}

function ParaAlumno({ pedido, usuario }) {
  const { yendo, error, autorizar } = useAutorizar(pedido)
  return (
    <div className="tarjeta">
      <h2>Vincular Alexa</h2>
      <p className="ayuda">
        La skill {NOMBRE_SKILL} quiere manejar tu placa <code>{usuario}</code>. Alexa va a poder:
      </p>
      <ul className="lista-avisos">
        <li>prender y apagar tus salidas: "Alexa, prende la bomba"</li>
        <li>activar y desactivar el modo automático</li>
        <li>decirte la temperatura de tus entradas en °C</li>
      </ul>
      <p className="ayuda">Lo cortás cuando quieras desde el portal, en Mis datos → Alexa.</p>
      {error && <p className="error">{error}</p>}
      <Botones pedido={pedido} yendo={yendo} onAutorizar={() => autorizar({ usuario })} />
    </div>
  )
}

function ParaDocente({ pedido }) {
  const { yendo, error: errorAutorizar, autorizar } = useAutorizar(pedido)
  const [cursos, setCursos] = useState(null)
  const [curso, setCurso] = useState(null)
  const [clase, setClase] = useState(null)
  const [elegidos, setElegidos] = useState(null)     // Set; null = todavía no se cargó
  const [error, setError] = useState(null)

  useEffect(() => escucharCursos(setCursos, (e) => setError(mensajeError(e))), [])
  useEffect(() => {
    const codigos = Object.keys(cursos || {})
    if (!curso && codigos.length === 1) setCurso(codigos[0])
  }, [cursos, curso])
  useEffect(() => {
    if (!curso) return
    setClase(null)
    setElegidos(null)
    return escucharClase(curso, setClase, (e) => setError(mensajeError(e)))
  }, [curso])
  // Arranca con los que ya maneja el Echo (si se vincula de nuevo).
  useEffect(() => {
    if (clase && elegidos === null) setElegidos(new Set(Object.keys(cursos?.[curso]?.alexa?.alumnos || {})))
  }, [clase, elegidos, cursos, curso])

  const filas = clase
    ? Object.entries(clase.alumnos)
        .map(([usuario, a]) => ({ usuario, nombre: a.nombre, n: dispositivosDe(normalizarPlaca(clase.placas[usuario])) }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre))
    : []
  const total = filas.filter(f => elegidos?.has(f.usuario)).reduce((s, f) => s + f.n, 0)

  function alternar(usuario) {
    setElegidos(e => {
      const n = new Set(e)
      if (n.has(usuario)) n.delete(usuario)
      else n.add(usuario)
      return n
    })
  }

  return (
    <div className="tarjeta">
      <h2>Vincular el Echo del laboratorio</h2>
      <p className="ayuda">
        Esta cuenta de Amazon va a manejar las placas que elijas: "Alexa, prende la
        bomba de Ana Pérez", "Alexa, ¿está prendida la luz de Beto?".
      </p>

      {!cursos ? <p className="ayuda">Cargando…</p> : (
        <label>
          Curso
          <select value={curso || ''} onChange={e => setCurso(e.target.value || null)}>
            <option value="">Elegí uno</option>
            {Object.entries(cursos).map(([c, d]) => <option key={c} value={c}>{c} — {d.nombre}</option>)}
          </select>
        </label>
      )}

      {curso && !clase && <p className="ayuda">Cargando la clase…</p>}
      {clase && filas.length === 0 && <p className="ayuda">Este curso todavía no tiene alumnos.</p>}
      {clase && filas.length > 0 && (
        <div className="casillas">
          <div className="bloque-cab">
            <span className="ayuda sin-margen">Las placas que maneja el Echo</span>
            <span className="acciones-fila">
              <button type="button" className="chico" onClick={() => setElegidos(new Set(filas.map(f => f.usuario)))}>todas</button>
              <button type="button" className="chico" onClick={() => setElegidos(new Set())}>ninguna</button>
            </span>
          </div>
          {filas.map(f => (
            <label key={f.usuario} className="casilla">
              <input type="checkbox" checked={Boolean(elegidos?.has(f.usuario))} onChange={() => alternar(f.usuario)} />
              <span>{f.nombre} <span className="tenue">· {f.n} dispositivo{f.n === 1 ? '' : 's'}</span></span>
            </label>
          ))}
          <p className={total > MAX_DISPOSITIVOS ? 'error' : 'ayuda'}>
            En total, {total} dispositivo{total === 1 ? '' : 's'}
            {total > MAX_DISPOSITIVOS ? `: Alexa acepta hasta ${MAX_DISPOSITIVOS} y los que sobren no van a aparecer.` : '.'}
            {' '}Después se cambia desde la lista del curso, en el portal.
          </p>
        </div>
      )}

      {(error || errorAutorizar) && <p className="error">{error || errorAutorizar}</p>}
      <Botones pedido={pedido} yendo={yendo} puede={Boolean(curso && elegidos?.size)}
               onAutorizar={() => autorizar({ curso, alumnos: [...elegidos] })} />
    </div>
  )
}
