import { useState, useEffect, useCallback } from 'react'
import { configurado, leerConfig } from './api.js'
import Entrar from './pantallas/Entrar.jsx'
import MiPlaca from './pantallas/MiPlaca.jsx'
import Configurar from './pantallas/Configurar.jsx'
import MisDatos from './pantallas/MisDatos.jsx'

// En localStorage quedan las dos claves: la de la placa y la del portal. El
// PIN no se guarda nunca.
const SESION = 'nexus.sesion'

function leerSesion() {
  try {
    localStorage.removeItem('nexus.clave')   // de la versión anterior del portal
    return JSON.parse(localStorage.getItem(SESION))
  } catch {
    return null
  }
}

function guardarSesion(s) {
  try {
    if (s) localStorage.setItem(SESION, JSON.stringify(s))
    else localStorage.removeItem(SESION)
  } catch { /* modo privado: la sesión dura lo que dure la pestaña */ }
}

export default function App() {
  const [sesion, setSesion] = useState(leerSesion)
  const [config, setConfig] = useState(null)
  const [falloRed, setFalloRed] = useState(null)
  const [avisoSesion, setAvisoSesion] = useState(null)
  const [tab, setTab] = useState('placa')
  const [precarga, setPrecarga] = useState(null)

  const salir = useCallback((motivo) => {
    guardarSesion(null)
    setSesion(null)
    setConfig(null)
    setAvisoSesion(motivo || null)
  }, [])

  const recargar = useCallback(async () => {
    if (!sesion) return
    const r = await leerConfig(sesion.admin)
    if (r.ok) { setConfig(r); setFalloRed(null); return }
    // Un corte de internet no cierra la sesión; una clave inválida sí (por
    // ejemplo, el docente reseteó el PIN y rotó la clave del portal).
    if (r.red) setFalloRed(r.error)
    else salir(r.error)
  }, [sesion, salir])

  useEffect(() => { recargar() }, [recargar])

  const usarPrecarga = useCallback(() => setPrecarga(null), [])

  function iniciar(s) {
    const nueva = { clave: s.clave, admin: s.admin }
    guardarSesion(nueva)
    setAvisoSesion(null)
    // Alguien recién registrado va primero a ver el hardware que le tocó.
    setTab(s.nuevo ? 'configurar' : 'placa')
    setSesion(nueva)
  }

  function agregarDetectado(inicial) {
    setPrecarga(inicial)
    setTab('configurar')
  }

  if (!configurado) {
    return (
      <main>
        <div className="tarjeta">
          <p className="error">
            Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Cargalas en las
            variables de entorno de Netlify y volvé a desplegar.
          </p>
        </div>
      </main>
    )
  }

  if (!sesion) {
    return (
      <main>
        <header><h1>Nexus IoT</h1></header>
        {avisoSesion && <div className="tarjeta"><p className="error">{avisoSesion}</p></div>}
        <Entrar onSesion={iniciar} />
      </main>
    )
  }

  return (
    <main>
      <header>
        <div>
          <h1>Nexus IoT</h1>
          {config && <span className="tenue subtitulo">{config.alumno} · {config.curso}</span>}
        </div>
        <button className="salir" onClick={() => salir()}>salir</button>
      </header>

      {falloRed && (
        <div className="tarjeta">
          <p className="error">{falloRed}</p>
          <button onClick={recargar}>Reintentar</button>
        </div>
      )}

      {!config
        ? !falloRed && <div className="tarjeta"><p className="ayuda">Cargando…</p></div>
        : (
          <>
            <nav>
              <button className={tab === 'placa' ? 'activo' : ''} onClick={() => setTab('placa')}>Mi placa</button>
              <button className={tab === 'configurar' ? 'activo' : ''} onClick={() => setTab('configurar')}>Configurar</button>
              <button className={tab === 'datos' ? 'activo' : ''} onClick={() => setTab('datos')}>Mis datos</button>
            </nav>

            {tab === 'placa' && (
              <MiPlaca clave={sesion.clave} canales={config.canales}
                       onAgregar={agregarDetectado} onConfigurar={() => setTab('configurar')} />
            )}
            {tab === 'configurar' && (
              <Configurar admin={sesion.admin} config={config} recargar={recargar}
                          precarga={precarga} onPrecargaUsada={usarPrecarga} />
            )}
            {tab === 'datos' && <MisDatos config={config} />}
          </>
        )}
    </main>
  )
}
