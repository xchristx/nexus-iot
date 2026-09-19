import { useState } from 'react'
import { entrar } from '../api.js'

export default function Entrar({ onSesion }) {
  const [curso, setCurso] = useState('')
  const [alumno, setAlumno] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [yendo, setYendo] = useState(false)

  async function enviar(ev) {
    ev.preventDefault()
    setYendo(true)
    setError(null)
    const r = await entrar(curso, alumno, pin)
    setYendo(false)
    if (!r.ok) { setError(r.error); return }
    onSesion({ clave: r.clave, admin: r.clave_admin, nuevo: r.nuevo })
  }

  return (
    <form className="tarjeta" onSubmit={enviar}>
      <h2>Entrar</h2>
      <p className="ayuda">
        La primera vez se crea tu cuenta con el PIN que elijas. Las siguientes,
        entrás con el mismo nombre y el mismo PIN.
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
      </label>

      <label>
        PIN (de 4 a 8 números)
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
               type="password" inputMode="numeric" maxLength={8}
               autoComplete="off" required />
      </label>

      <p className="ayuda">
        Anotá tu PIN: no se puede recuperar solo. Si te lo olvidás, el docente
        te lo puede resetear.
      </p>

      {error && <p className="error">{error}</p>}

      <button className="principal" disabled={yendo}>
        {yendo ? 'Un momento…' : 'Entrar'}
      </button>
    </form>
  )
}
