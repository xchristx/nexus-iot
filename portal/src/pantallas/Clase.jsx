import { useState, useEffect } from 'react'
import {
  escucharCursos, escucharClase, escucharCredenciales, escucharDesfase, crearCurso,
  crearAlumnos, nuevaContrasena, borrarAlumno, normalizarPlaca, aBinario, mensajeError,
  desvincularAlexaCurso, elegirAlexa,
} from '../firebase.js'
import { prepararLista, listaParaCopiar } from '../cuentas.js'
import { cruza, textoAlerta } from '../alertas.js'
import { CLIENTE_ALEXA, NOMBRE_SKILL, MAX_DISPOSITIVOS, dispositivosDe } from '../alexa.js'
import { Titulo, Copiar, Etiqueta } from '../componentes/comunes.jsx'

// Lo que el docente mira antes y durante la clase: quién tiene la placa
// conectada, qué manda y si algo avisa. Y las cuentas: los alumnos no se
// registran solos, el docente carga la lista y reparte las tarjetas.

const LATIDO_MAX = 40000

export default function Clase({ onSalir, onTema }) {
  const [cursos, setCursos] = useState(null)
  const [curso, setCurso] = useState(null)
  const [clase, setClase] = useState(null)
  const [credenciales, setCredenciales] = useState({})
  const [desfase, setDesfase] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

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
    setCredenciales({})
    const a = escucharClase(curso, setClase, (e) => setError(mensajeError(e)))
    const b = escucharCredenciales(curso, setCredenciales, (e) => setError(mensajeError(e)))
    return () => { a(); b() }
  }, [curso])

  async function borrar(usuario, nombre) {
    if (!window.confirm(`¿Borrar a ${nombre} (${usuario})? Se borra su cuenta y se pierden su hardware, sus reglas y sus datos.`)) return
    setError(null)
    setAviso(null)
    try {
      const { cuentaBorrada } = await borrarAlumno(usuario)
      if (!cuentaBorrada) {
        setAviso(`Se borraron los datos de ${usuario}, pero no su cuenta (no había contraseña guardada o no coincidía). ` +
          'Bórrala a mano en Firebase Console → Authentication, o no vas a poder volver a cargar a alguien con ese nombre.')
      }
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function regenerar(usuario, nombre) {
    if (!window.confirm(`¿Darle una contraseña nueva a ${nombre}? La de ahora deja de andar: también la tiene que cambiar en su sketch y en su app.`)) return
    setError(null)
    setAviso(null)
    try {
      const nueva = await nuevaContrasena(usuario)
      setAviso(`Contraseña nueva de ${nombre}: ${nueva}`)
    } catch (e) {
      setError(e.message)
    }
  }

  const filas = clase
    ? Object.entries(clase.alumnos)
        .map(([usuario, a]) => ({
          usuario, ...a, placa: normalizarPlaca(clase.placas[usuario]),
          contrasena: credenciales[usuario]?.contrasena || null,
        }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre))
    : []
  const conectadas = filas.filter(f => estaConectada(f.placa, ahora + desfase)).length
  const alexa = cursos?.[curso]?.alexa

  async function cambiarEcho(usuario, si) {
    try {
      await elegirAlexa(curso, usuario, si)
    } catch (e) {
      setError(mensajeError(e, 'alexa'))
    }
  }

  return (
    <main className="ancho">
      <header>
        <div>
          <Titulo />
          <span className="tenue subtitulo">Docente</span>
        </div>
        <span className="acciones-fila">
          <button className="salir" onClick={onTema}>tema</button>
          <button className="salir" onClick={onSalir}>salir</button>
        </span>
      </header>

      {error && <div className="tarjeta"><p className="error">{error}</p></div>}
      {aviso && (
        <div className="tarjeta atencion">
          <div className="salida-fila">
            <p className="ayuda sin-margen">{aviso}</p>
            <button className="chico" onClick={() => setAviso(null)}>Listo</button>
          </div>
        </div>
      )}

      {!cursos ? <div className="tarjeta"><p className="ayuda">Cargando…</p></div> : (
        <div className="tarjeta">
          {Object.keys(cursos).length > 0 && (
            <label>
              Curso
              <select value={curso || ''} onChange={e => setCurso(e.target.value || null)}>
                <option value="">Elige uno</option>
                {Object.entries(cursos).map(([c, d]) => <option key={c} value={c}>{c} — {d.nombre}</option>)}
              </select>
            </label>
          )}
          <NuevoCurso cursos={cursos} onCreado={setCurso} />
        </div>
      )}

      {curso && !clase && <div className="tarjeta"><p className="ayuda">Cargando la clase…</p></div>}

      {clase && <CargarLista curso={curso} existentes={filas.map(f => f.usuario)} onAviso={setAviso} />}

      {clase && (
        <div className="tarjeta">
          <div className="bloque-cab">
            <h3>
              {filas.length} alumno{filas.length === 1 ? '' : 's'}
              <span className="tenue"> · {conectadas} placa{conectadas === 1 ? '' : 's'} conectada{conectadas === 1 ? '' : 's'}</span>
            </h3>
            {filas.length > 0 && (
              <span className="acciones-fila">
                <Copiar texto={listaParaCopiar(filas)}>copiar lista</Copiar>
                <button className="chico" onClick={() => window.print()}>imprimir tarjetas</button>
              </span>
            )}
          </div>
          {filas.length === 0 && <p className="ayuda">Todavía no hay alumnos: carga la lista arriba.</p>}
          {filas.map(f => (
            <FilaAlumno key={f.usuario} f={f} ahora={ahora + desfase}
                        echo={CLIENTE_ALEXA ? Boolean(alexa?.alumnos?.[f.usuario]) : undefined}
                        onEcho={(si) => cambiarEcho(f.usuario, si)}
                        onBorrar={() => borrar(f.usuario, f.nombre)}
                        onRegenerar={() => regenerar(f.usuario, f.nombre)} />
          ))}
        </div>
      )}

      {clase && CLIENTE_ALEXA && (
        <EchoLaboratorio curso={curso} alexa={alexa} filas={filas} onError={setError} />
      )}

      {clase && (
        <div className="tarjeta">
          <h3>Si alguien se olvidó la contraseña</h3>
          <p className="ayuda sin-margen">
            Toca "ver" en su fila y díctasela, o "nueva contraseña" para darle otra.
            Si le das una nueva, la tiene que cambiar también en su sketch y en su app.
            Sus entradas, salidas y reglas no se pierden.
          </p>
        </div>
      )}

      {clase && <Tarjetas curso={curso} nombreCurso={cursos?.[curso]?.nombre} filas={filas} />}
    </main>
  )
}

// ===================================================================
//  Crear un curso
// ===================================================================

function NuevoCurso({ cursos, onCreado }) {
  const vacio = Object.keys(cursos).length === 0
  const [abierto, setAbierto] = useState(vacio)
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState(null)

  async function crear(ev) {
    ev.preventDefault()
    const c = codigo.trim().toUpperCase()
    if (!/^[A-Z0-9]{3,12}$/.test(c)) { setError('El código son de 3 a 12 letras o números, sin espacios (por ejemplo IOT2026).'); return }
    if (cursos[c]) { setError(`Ya existe el curso ${c}.`); return }
    if (!nombre.trim()) { setError('Pon un nombre para el curso.'); return }
    try {
      await crearCurso(c, nombre.trim().slice(0, 80))
      setAbierto(false); setCodigo(''); setNombre(''); setError(null)
      onCreado(c)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  if (!abierto) return <button className="enlace" onClick={() => setAbierto(true)}>+ crear otro curso</button>
  return (
    <form onSubmit={crear}>
      {vacio && <p className="ayuda">Todavía no hay cursos. Crea el primero:</p>}
      <div className="dos-columnas">
        <label>
          Código
          <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="IOT2026"
                 autoCapitalize="characters" aria-label="Código del curso nuevo" />
        </label>
        <label>
          Nombre
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Internet de las Cosas — 2026"
                 maxLength={80} aria-label="Nombre del curso nuevo" />
        </label>
      </div>
      <span className="ayuda-campo">
        El código va al principio de cada usuario (iot2026-ana_perez). Para que los
        alumnos arranquen con un kit, cárgale una plantilla desde Firebase Console
        (firebase/LEEME.md).
      </span>
      {error && <p className="error">{error}</p>}
      <div className="acciones" style={{ marginTop: 10 }}>
        {!vacio && <button type="button" onClick={() => setAbierto(false)}>Cancelar</button>}
        <button className="principal">Crear curso</button>
      </div>
    </form>
  )
}

// ===================================================================
//  Cargar la lista de alumnos
// ===================================================================

function CargarLista({ curso, existentes, onAviso }) {
  const [texto, setTexto] = useState('')
  const [paso, setPaso] = useState(null)          // {hechas, total} mientras crea
  const [resultados, setResultados] = useState(null)

  const lista = prepararLista(curso, texto, existentes)
  const validas = lista.filter(f => !f.error)

  async function crear() {
    setResultados(null)
    setPaso({ hechas: 0, total: validas.length })
    const r = await crearAlumnos(curso, validas, (hechas, total) => setPaso({ hechas, total }))
    setPaso(null)
    setResultados(r)
    if (r.every(x => !x.error)) setTexto('')
    else setTexto(r.filter(x => x.error).map(x => x.nombre).join('\n'))
    const bien = r.filter(x => !x.error).length
    if (bien) onAviso(`Se ${bien === 1 ? 'creó 1 cuenta' : `crearon ${bien} cuentas`}. Imprime las tarjetas o copia la lista para repartirlas.`)
  }

  return (
    <div className="tarjeta">
      <h3>Cargar alumnos</h3>
      <p className="ayuda">
        Un nombre y apellido por renglón (también se puede pegar una columna de una
        planilla). A cada uno se le crea una cuenta con una contraseña al azar, y
        arranca con la plantilla del curso.
      </p>
      <textarea className="tema-textarea" value={texto} onChange={e => { setTexto(e.target.value); setResultados(null) }}
                placeholder={'Ana Pérez\nBruno Díaz\nCarla Gómez'} aria-label="Lista de alumnos" disabled={Boolean(paso)} />

      {lista.length > 0 && !paso && (
        <ul className="lista-avisos" style={{ marginTop: 10 }}>
          {lista.map((f, i) => (
            <li key={i} className={f.error ? 'error' : ''}>
              {f.nombre} → {f.error ? f.error : <code>{f.usuario}</code>}
              {f.repetido && <span className="tenue"> (ya había otro con ese nombre)</span>}
            </li>
          ))}
        </ul>
      )}

      {paso && <p className="ayuda">Creando cuentas… {paso.hechas} de {paso.total}. No cierres esta pestaña.</p>}

      {resultados?.some(x => x.error) && (
        <ul className="lista-avisos error" style={{ marginTop: 10 }}>
          {resultados.filter(x => x.error).map(x => <li key={x.usuario}>{x.nombre}: {x.error}</li>)}
        </ul>
      )}

      <div className="acciones" style={{ marginTop: 10 }}>
        <button className="principal" disabled={!validas.length || Boolean(paso)} onClick={crear}>
          {validas.length ? `Crear ${validas.length} cuenta${validas.length === 1 ? '' : 's'}` : 'Crear cuentas'}
        </button>
      </div>
    </div>
  )
}

// ===================================================================
//  Un alumno
// ===================================================================

function estaConectada(p, ahora) {
  return typeof p.estado.visto === 'number' && ahora - p.estado.visto <= LATIDO_MAX
}

function FilaAlumno({ f, ahora, echo, onEcho, onBorrar, onRegenerar }) {
  const [ver, setVer] = useState(false)
  const [yendo, setYendo] = useState(false)
  const p = f.placa
  const nunca = typeof p.estado.visto !== 'number'
  const viva = estaConectada(p, ahora)
  const entradas = p.canales.filter(c => c.tipo === 'entrada')
  const salidas = p.canales.filter(c => c.tipo === 'salida')
  // Sin memoria de histéresis: es una foto de ahora. Solo con la placa viva.
  const alertas = viva ? p.alertas.filter(a => cruza(p.estado[a.entrada], a)) : []
  const valores = [
    ...entradas.map(c => typeof p.estado[c.id] === 'number' ? `${c.id} ${Number(p.estado[c.id]).toFixed(1)}` : `${c.id} —`),
    ...salidas.map(c => `${c.id} ${aBinario(p.estado[c.id]) === 1 ? 'ON' : aBinario(p.estado[c.id]) === 0 ? 'OFF' : '—'}`),
  ]
  const con = (fn) => async () => { setYendo(true); await fn(); setYendo(false) }

  return (
    <div className={'fila-canal alumno ' + (viva ? 'viva' : 'muerta')}>
      <div>
        <span className="punto" /> {f.nombre} <code className="tenue">{f.usuario}</code>
        {p.alexa && <Etiqueta>Alexa propia</Etiqueta>}
        <div className="detalle">
          Contraseña:{' '}
          {f.contrasena
            ? <><code className="contrasena">{ver ? f.contrasena : '••••••••'}</code>
                <button className="enlace" onClick={() => setVer(!ver)}>{ver ? 'ocultar' : 'ver'}</button></>
            : <span className="tenue">no está guardada (cuenta de antes)</span>}
        </div>
        <div className="tenue detalle">
          {nunca ? 'nunca se conectó' : viva ? 'conectada' : 'desconectada'}
          {' · '}{entradas.length} entrada{entradas.length === 1 ? '' : 's'}, {salidas.length} salida{salidas.length === 1 ? '' : 's'}
          {p.reglas.length > 0 && ` · ${p.reglas.length} regla${p.reglas.length === 1 ? '' : 's'}`}
          {p.auto && ' · modo automático'}
        </div>
        {!nunca && valores.length > 0 && <div className="detalle">{valores.join(' · ')}</div>}
        {alertas.map(a => (
          <div key={a.entrada} className="detalle alerta-docente">⚠ alerta: {a.entrada} {textoAlerta(a)}</div>
        ))}
        {typeof p.estado.aviso === 'string' && p.estado.aviso && <div className="detalle aviso">{p.estado.aviso}</div>}
        {echo !== undefined && (
          <label className="casilla chica">
            <input type="checkbox" checked={echo} onChange={e => onEcho(e.target.checked)} />
            en el Echo del laboratorio
          </label>
        )}
      </div>
      <div className="acciones-fila">
        {f.contrasena && <button className="chico" disabled={yendo} onClick={con(onRegenerar)}>Nueva contraseña</button>}
        <button className="chico peligro" disabled={yendo} onClick={con(onBorrar)}>Borrar</button>
      </div>
    </div>
  )
}

// ===================================================================
//  Alexa: el Echo del laboratorio (opcional, ver alexa.js)
// ===================================================================

// El docente vincula un Echo desde la app Alexa (entrando como docente en la
// página que abre la skill) y elige acá qué placas maneja, con la casilla de
// cada alumno. Los alumnos que quieran Alexa en su casa la vinculan solos.
function EchoLaboratorio({ curso, alexa, filas, onError }) {
  const elegidas = filas.filter(f => alexa?.alumnos?.[f.usuario])
  const total = elegidas.reduce((s, f) => s + dispositivosDe(f.placa), 0)
  const propias = filas.filter(f => f.placa.alexa).length

  async function desvincular() {
    if (!window.confirm('¿Desvincular el Echo del laboratorio? Deja de manejar las placas de este curso.')) return
    try {
      await desvincularAlexaCurso(curso)
    } catch (e) {
      onError(mensajeError(e))
    }
  }

  return (
    <div className="tarjeta">
      <div className="bloque-cab">
        <h3>
          Echo del laboratorio
          <span className="tenue"> · {alexa?.desde ? 'vinculado' : 'sin vincular'}</span>
        </h3>
        {alexa?.desde && <button className="chico peligro" onClick={desvincular}>Desvincular</button>}
      </div>
      <p className="ayuda sin-margen">
        {alexa?.desde
          ? `Vinculado desde el ${new Date(alexa.desde).toLocaleDateString('es-BO')}. Maneja ${elegidas.length} ` +
            `placa${elegidas.length === 1 ? '' : 's'} (${total} dispositivo${total === 1 ? '' : 's'}` +
            `${total > MAX_DISPOSITIVOS ? `: Alexa acepta hasta ${MAX_DISPOSITIVOS}` : ''}): las marcadas "en el Echo" en la lista. ` +
            'Después de cambiar algo, dile "Alexa, descubre dispositivos".'
          : `Para que un Echo maneje placas de este curso: en la app Alexa de la cuenta del Echo, activa la skill ` +
            `${NOMBRE_SKILL}, entra como docente y elige el curso y los alumnos.`}
        {propias > 0 && ` ${propias} alumno${propias === 1 ? ' vinculó' : 's vincularon'} Alexa con su propia cuenta.`}
      </p>
    </div>
  )
}

// ===================================================================
//  Tarjetas para imprimir
// ===================================================================

// Solo se ven al imprimir (estilos.css, @media print): una tarjetita por
// alumno para recortar y repartir.
function Tarjetas({ curso, nombreCurso, filas }) {
  const portal = typeof window !== 'undefined' ? window.location.origin : ''
  return (
    <section className="tarjetas-imprimir" aria-hidden="true">
      {filas.map(f => (
        <div key={f.usuario} className="tarjeta-alumno">
          <strong>{f.nombre}</strong>
          <span className="tenue">{curso}{nombreCurso ? ` — ${nombreCurso}` : ''}</span>
          <dl>
            <dt>Usuario</dt><dd><code>{f.usuario}</code></dd>
            <dt>Contraseña</dt><dd><code>{f.contrasena || '(pídesela al docente)'}</code></dd>
          </dl>
          <span className="tenue">Entra en {portal}. Usa los mismos datos en tu placa y en tu app. No se los pases a nadie.</span>
        </div>
      ))}
    </section>
  )
}
