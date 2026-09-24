import { useState } from 'react'
import { entrar, registrar, entrarDocente, usuarioDe, normalizarNombre } from '../firebase.js'

export default function Entrar({ onInicio, onFin }) {
  const [docente, setDocente] = useState(false)
  const [curso, setCurso] = useState('')
  const [alumno, setAlumno] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState(null)
  const [yendo, setYendo] = useState(null)

  async function hacer(que, fn) {
    setYendo(que)
    setError(null)
    onInicio()
    const r = await fn()
    setYendo(null)
    if (!r.ok) setError(r.error)
    onFin(r.ok ? r : null)
  }

  function enviar(ev) {
    ev.preventDefault()
    if (docente) hacer('entrar', () => entrarDocente(correo, contrasena))
    else hacer('entrar', () => entrar(curso, alumno, contrasena))
  }

  function primeraVez() {
    // Los campos obligatorios los controla el navegador solo con el submit.
    if (!curso.trim() || !alumno.trim() || !contrasena) {
      setError('Completá el código del curso, tu nombre y una contraseña.')
      return
    }
    hacer('registrar', () => registrar(curso, alumno, contrasena))
  }

  const usuario = curso.trim() && normalizarNombre(alumno) ? usuarioDe(curso, alumno) : null

  if (docente) {
    return (
      <form className="tarjeta" onSubmit={enviar}>
        <h2>Entrar como docente</h2>
        <label>
          Correo
          <input value={correo} onChange={e => setCorreo(e.target.value)}
                 type="email" autoComplete="username" required />
        </label>
        <label>
          Contraseña
          <input value={contrasena} onChange={e => setContrasena(e.target.value)}
                 type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="principal" disabled={Boolean(yendo)}>{yendo ? 'Un momento…' : 'Entrar'}</button>
        <p className="pie"><button type="button" className="enlace" onClick={() => { setDocente(false); setError(null) }}>Soy alumno</button></p>
      </form>
    )
  }

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h2>Entrar</h2>
      <p className="ayuda">
        La primera vez tocá "Es mi primera vez": se crea tu cuenta con la
        contraseña que elijas. Las siguientes, entrás con el mismo nombre y la
        misma contraseña.
      </p>

      <label>
        Código del curso
        <input value={curso} onChange={e => setCurso(e.target.value)}
               placeholder="IOT2026" autoCapitalize="characters" required />
      </label>

      <label>
        Tu nombre y apellido
        <input value={alumno} onChange={e => setAlumno(e.target.value)}
               placeholder="Ana Pérez" autoComplete="name" required />
        {usuario && <span className="ayuda-campo">Tu usuario va a ser <code>{usuario}</code></span>}
      </label>

      <label>
        Contraseña (al menos 6 caracteres)
        <input value={contrasena} onChange={e => setContrasena(e.target.value)}
               type="password" autoComplete="current-password" minLength={6} required />
      </label>

      <p className="ayuda">
        Anotala: la vas a usar también en tu placa y en tu app. Si te la olvidás,
        el docente te puede ayudar a crear una nueva sin perder lo que configuraste.
      </p>

      {error && <p className="error">{error}</p>}

      <button className="principal" disabled={Boolean(yendo)}>
        {yendo === 'entrar' ? 'Un momento…' : 'Entrar'}
      </button>
      <button type="button" className="secundario" disabled={Boolean(yendo)} onClick={primeraVez}>
        {yendo === 'registrar' ? 'Creando tu cuenta…' : 'Es mi primera vez'}
      </button>

      <p className="pie"><button type="button" className="enlace" onClick={() => { setDocente(true); setError(null) }}>Soy docente</button></p>
    </form>
  )
}
