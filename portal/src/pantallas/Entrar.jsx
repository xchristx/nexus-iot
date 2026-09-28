import { useState } from 'react'
import { entrar, entrarDocente } from '../firebase.js'
import { BajarApp } from '../componentes/comunes.jsx'

export default function Entrar({ onInicio, onFin }) {
  const [docente, setDocente] = useState(false)
  const [usuario, setUsuario] = useState('')
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
    else hacer('entrar', () => entrar(usuario, contrasena))
  }

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
        Con el usuario y la contraseña de la tarjeta que te dio el docente. Son los
        mismos que vas a poner en tu placa y en tu app.
      </p>

      <label>
        Usuario
        <input value={usuario} onChange={e => setUsuario(e.target.value)}
               placeholder="iot2026-ana_perez" autoCapitalize="none" autoCorrect="off"
               spellCheck={false} autoComplete="username" required />
      </label>

      <label>
        Contraseña
        <input value={contrasena} onChange={e => setContrasena(e.target.value)}
               type="password" autoComplete="current-password" required />
      </label>

      {error && <p className="error">{error}</p>}

      <button className="principal" disabled={Boolean(yendo)}>
        {yendo ? 'Un momento…' : 'Entrar'}
      </button>

      <p className="ayuda" style={{ marginTop: 14 }}>
        ¿No tenés tarjeta o perdiste la contraseña? Pedísela al docente: él tiene
        la lista y te puede dar una nueva.
      </p>

      <p className="pie"><button type="button" className="enlace" onClick={() => { setDocente(true); setError(null) }}>Soy docente</button></p>
      <BajarApp />
    </form>
  )
}
