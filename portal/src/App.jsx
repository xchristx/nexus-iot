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
import Tema from './pantallas/Tema.jsx'
import { Titulo } from './componentes/comunes.jsx'

// La sesión la guarda Firebase Auth en el navegador: al volver a abrir el
// portal se entra solo. La contraseña no se guarda nunca.

export default function App() {
  const [sesion, setSesion] = useState(undefined)     // undefined = todavía no se sabe
  const [rol, setRol] = useState(null)                // 'alumno' | 'docente' | 'ninguno'
  const [entrando, setEntrando] = useState(false)     // un alta a mitad de camino

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
        <header><Titulo /></header>
        <Entrar onInicio={() => setEntrando(true)}
                onFin={() => setEntrando(false)} />
      </main>
    )
  }

  if (rol === 'docente') return <Docente />

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

  return <Alumno usuario={usuarioDeCorreo(sesion.email)} />
}

function Alumno({ usuario }) {
  const [alta, setAlta] = useState(undefined)
  const [placa, setPlaca] = useState(null)
  const [fallo, setFallo] = useState(null)
  const [tab, setTab] = useState('placa')
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
            Tu cuenta existe pero no está en ningún curso (el docente la puede
            haber borrado). Hablá con el docente.
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
          <Titulo />
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
              <button className={tab === 'tema' ? 'activo' : ''} onClick={() => setTab('tema')}>Tema</button>
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
            {tab === 'tema' && <Tema />}
          </>
        )}
    </main>
  )
}

// El docente ve la clase, y desde ahí puede cambiar su tema.
function Docente() {
  const [tema, setTema] = useState(false)
  if (!tema) return <Clase onSalir={salir} onTema={() => setTema(true)} />
  return (
    <main>
      <header>
        <Titulo />
        <button className="salir" onClick={() => setTema(false)}>volver a la clase</button>
      </header>
      <Tema />
    </main>
  )
}
