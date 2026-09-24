import { useState, useEffect, useCallback } from 'react'
import {
  configurado, escucharSesion, salir, usuarioDeCorreo, esDocente,
  escucharAlta, escucharPlaca, mensajeError,
} from './firebase.js'
import Entrar from './pantallas/Entrar.jsx'
import MiPlaca from './pantallas/MiPlaca.jsx'
import Configurar from './pantallas/Configurar.jsx'
import MisDatos from './pantallas/MisDatos.jsx'
import Clase from './pantallas/Clase.jsx'

// La sesión la guarda Firebase Auth en el navegador: al volver a abrir el
// portal se entra solo. La contraseña no se guarda nunca.

export default function App() {
  const [sesion, setSesion] = useState(undefined)     // undefined = todavía no se sabe
  const [rol, setRol] = useState(null)                // 'alumno' | 'docente' | 'ninguno'
  const [entrando, setEntrando] = useState(false)     // un alta a mitad de camino
  const [primeraVez, setPrimeraVez] = useState(false)

  useEffect(() => {
    if (!configurado) return
    return escucharSesion(async (u) => {
      setRol(null)
      setSesion(u)
      if (!u) return
      if (usuarioDeCorreo(u.email)) setRol('alumno')
      else setRol((await esDocente(u.uid)) ? 'docente' : 'ninguno')
    })
  }, [])

  if (!configurado) {
    return (
      <main>
        <div className="tarjeta">
          <p className="error">
            Faltan las variables VITE_FIREBASE_… (ver portal/.env.example). Cargalas en
            las variables de entorno de Netlify y volvé a desplegar.
          </p>
        </div>
      </main>
    )
  }

  if (sesion === undefined || (sesion && !rol && !entrando)) {
    return <main><div className="tarjeta"><p className="ayuda">Cargando…</p></div></main>
  }

  if (!sesion || entrando) {
    return (
      <main>
        <header><h1>Nexus IoT</h1></header>
        <Entrar onInicio={() => setEntrando(true)}
                onFin={(r) => { setPrimeraVez(Boolean(r?.nuevo)); setEntrando(false) }} />
      </main>
    )
  }

  if (rol === 'docente') return <Clase onSalir={salir} />

  if (rol === 'ninguno') {
    return (
      <main>
        <div className="tarjeta">
          <p className="error">Esta cuenta no es de un alumno ni de un docente.</p>
          <button onClick={salir}>Salir</button>
        </div>
      </main>
    )
  }

  return <Alumno usuario={usuarioDeCorreo(sesion.email)} primeraVez={primeraVez} />
}

function Alumno({ usuario, primeraVez }) {
  const [alta, setAlta] = useState(undefined)
  const [placa, setPlaca] = useState(null)
  const [fallo, setFallo] = useState(null)
  // Alguien recién registrado va primero a ver el hardware que le tocó.
  const [tab, setTab] = useState(primeraVez ? 'configurar' : 'placa')
  const [precarga, setPrecarga] = useState(null)

  useEffect(() => escucharAlta(usuario, setAlta, (e) => setFallo(mensajeError(e))), [usuario])
  useEffect(() => escucharPlaca(usuario, (p) => { setPlaca(p); setFallo(null) }, (e) => setFallo(mensajeError(e))), [usuario])

  const usarPrecarga = useCallback(() => setPrecarga(null), [])

  function agregarDetectado(inicial) {
    setPrecarga(inicial)
    setTab('configurar')
  }

  if (alta === null) {
    return (
      <main>
        <div className="tarjeta">
          <p className="error">
            Tu cuenta existe pero no terminó el alta. Salí y tocá "Es mi primera vez"
            con los mismos datos.
          </p>
          <button onClick={salir}>Salir</button>
        </div>
      </main>
    )
  }

  return (
    <main>
      <header>
        <div>
          <h1>Nexus IoT</h1>
          {alta && <span className="tenue subtitulo">{alta.nombre} · {alta.curso}</span>}
        </div>
        <button className="salir" onClick={salir}>salir</button>
      </header>

      {fallo && <div className="tarjeta"><p className="error">{fallo}</p></div>}

      {!placa || !alta
        ? !fallo && <div className="tarjeta"><p className="ayuda">Cargando…</p></div>
        : (
          <>
            <nav>
              <button className={tab === 'placa' ? 'activo' : ''} onClick={() => setTab('placa')}>Mi placa</button>
              <button className={tab === 'configurar' ? 'activo' : ''} onClick={() => setTab('configurar')}>Configurar</button>
              <button className={tab === 'datos' ? 'activo' : ''} onClick={() => setTab('datos')}>Mis datos</button>
            </nav>

            {tab === 'placa' && (
              <MiPlaca usuario={usuario} placa={placa}
                       onAgregar={agregarDetectado} onConfigurar={() => setTab('configurar')} />
            )}
            {tab === 'configurar' && (
              <Configurar usuario={usuario} placa={placa}
                          precarga={precarga} onPrecargaUsada={usarPrecarga} />
            )}
            {tab === 'datos' && <MisDatos usuario={usuario} placa={placa} />}
          </>
        )}
    </main>
  )
}
