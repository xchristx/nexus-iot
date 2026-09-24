// Capa de acceso a Firebase: Auth para las cuentas y Realtime Database para
// todo lo demás. Las reglas (firebase/database.rules.json) son las que
// protegen: cada alumno solo puede leer y escribir su propia placa.
//
// Cada alumno tiene UNA cuenta, que usan el portal, la placa y la app:
//
//   curso IOT2026 + "Ana Pérez"  ->  usuario  iot2026-ana_perez
//                                ->  correo   iot2026-ana_perez@nexus-iot.example.com
//
// El correo no existe ni se usa para mandar mails: es solo el formato que
// pide Firebase Auth. El usuario es también la clave de su placa en la base.

import { initializeApp } from 'firebase/app'
import {
  getAuth, connectAuthEmulator, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from 'firebase/auth'
import {
  getDatabase, connectDatabaseEmulator, ref, get, set, update, remove, onValue,
  query, orderByChild, orderByKey, equalTo, startAt, endAt,
} from 'firebase/database'

const env = import.meta.env

export const firebaseConfig = {
  apiKey:      env.VITE_FIREBASE_API_KEY,
  authDomain:  env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId:   env.VITE_FIREBASE_PROJECT_ID,
  appId:       env.VITE_FIREBASE_APP_ID,
}

export const configurado = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL)

// Tiene que ser el mismo dominio que en database.rules.json, en el prompt del
// firmware y en la app Kodular.
export const DOMINIO = '@nexus-iot.example.com'

// Ids que la base usa para otra cosa dentro de "estado".
export const RESERVADOS = ['visto', 'aviso', 'auto', 'cmd', 'reglas']

let auth, db
if (configurado) {
  const app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getDatabase(app)
  if (env.VITE_USAR_EMULADOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectDatabaseEmulator(db, '127.0.0.1', 9000)
  }
}

// ===================================================================
//  Nombres
// ===================================================================

// Sin tildes, sin mayúsculas, y los espacios (o cualquier otro signo) como
// "_": "  Ana   Pérez " y "ana perez" son la misma persona.
export function normalizarNombre(nombre) {
  return (nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export const normalizarCurso = (curso) => (curso || '').trim().toUpperCase()
export const usuarioDe = (curso, nombre) => normalizarCurso(curso).toLowerCase() + '-' + normalizarNombre(nombre)
export const correoDe = (usuario) => usuario + DOMINIO
export const usuarioDeCorreo = (correo) =>
  correo && correo.toLowerCase().endsWith(DOMINIO) ? correo.toLowerCase().slice(0, -DOMINIO.length) : null

// ===================================================================
//  Errores: lo que ve el alumno
// ===================================================================

export function mensajeError(e) {
  const codigo = e?.code || ''
  if (codigo.includes('network-request-failed')) return 'No se pudo conectar. Revisá tu internet.'
  if (codigo.includes('invalid-credential') || codigo.includes('wrong-password') || codigo.includes('user-not-found') || codigo.includes('invalid-login'))
    return 'El nombre o la contraseña no coinciden. Si es tu primera vez, tocá "Es mi primera vez".'
  if (codigo.includes('too-many-requests')) return 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.'
  if (codigo.includes('weak-password')) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (codigo.includes('invalid-email')) return 'Ese nombre no sirve para crear una cuenta: usá letras y números.'
  if (codigo.includes('user-disabled')) return 'Tu cuenta está deshabilitada. Hablá con el docente.'
  if (/permission.denied|PERMISSION_DENIED/i.test(codigo + ' ' + (e?.message || '')))
    return 'Firebase rechazó el cambio: algún dato no cumple las reglas.'
  return e?.message || String(e)
}

// ===================================================================
//  Sesión
// ===================================================================

export const escucharSesion = (cb) => onAuthStateChanged(auth, cb)
export const salir = () => signOut(auth)

function validarDatosAlta(curso, nombre, contrasena) {
  if (!/^[A-Z0-9]{3,12}$/.test(normalizarCurso(curso))) return 'El código del curso son de 3 a 12 letras o números, sin espacios.'
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ')
  if (limpio.length < 3 || normalizarNombre(nombre).length < 2) return 'Escribí tu nombre y apellido.'
  if (limpio.length > 40) return 'El nombre es muy largo: usá hasta 40 letras.'
  if ((contrasena || '').length < 6) return 'La contraseña tiene que tener al menos 6 caracteres.'
  return null
}

export async function entrar(curso, nombre, contrasena) {
  const error = validarDatosAlta(curso, nombre, contrasena)
  if (error) return { ok: false, error }
  const usuario = usuarioDe(curso, nombre)
  try {
    await signInWithEmailAndPassword(auth, correoDe(usuario), contrasena)
  } catch (e) {
    return { ok: false, error: mensajeError(e) }
  }
  const alta = await get(ref(db, 'alumnos/' + usuario)).catch(() => null)
  if (!alta?.exists()) {
    await signOut(auth)
    return { ok: false, error: 'Tu cuenta existe pero no terminó el alta. Tocá "Es mi primera vez" con los mismos datos.' }
  }
  return { ok: true }
}

// La plantilla del curso ({entradas, salidas, reglas} en listas) pasa al
// formato de la base: mapas por id. Cada alumno recibe una COPIA.
function placaDesdePlantilla(p) {
  const lista = (x) => (Array.isArray(x) ? x : Object.values(x || {})).filter(Boolean)
  const sinVacios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))
  const config = { entradas: {}, salidas: {} }
  let orden = 0
  for (const { id, tipo, ...e } of lista(p?.entradas)) config.entradas[id] = sinVacios({ ...e, orden: orden++ })
  for (const { id, tipo, ...s } of lista(p?.salidas)) config.salidas[id] = sinVacios({ ...s, orden: orden++ })
  if (p?.pulsador_modo != null) config.pulsador_modo = p.pulsador_modo
  const reglas = {}
  for (const g of lista(p?.reglas)) {
    reglas[g.salida] = { entrada: g.entrada, condicion: g.condicion, umbral: g.umbral, hist: g.hist ?? 1 }
  }
  return { config, control: { auto: false, reglas } }
}

// Crear la cuenta. Si ya existe con esa contraseña y le falta el alta (el
// docente la borró, o se cortó internet a mitad de camino), la completa.
// Si ya existe con el alta hecha, simplemente entra.
export async function registrar(curso, nombre, contrasena) {
  const error = validarDatosAlta(curso, nombre, contrasena)
  if (error) return { ok: false, error }
  const codigo = normalizarCurso(curso)
  const usuario = usuarioDe(curso, nombre)

  let abierto
  try {
    abierto = (await get(ref(db, `cursos/${codigo}/abierto`))).val()
  } catch (e) {
    return { ok: false, error: mensajeError(e) }
  }
  if (abierto == null) return { ok: false, error: `No existe el curso "${codigo}". Revisá el código que te pasó el docente.` }

  let creada = false
  try {
    await createUserWithEmailAndPassword(auth, correoDe(usuario), contrasena)
    creada = true
  } catch (e) {
    if (!(e?.code || '').includes('email-already-in-use')) return { ok: false, error: mensajeError(e) }
    try {
      await signInWithEmailAndPassword(auth, correoDe(usuario), contrasena)
    } catch {
      return { ok: false, error: 'Ya hay alguien con ese nombre en este curso. Si sos vos, tocá "Entrar" con tu contraseña.' }
    }
  }

  if ((await get(ref(db, 'alumnos/' + usuario))).exists()) return { ok: true, nuevo: false }

  if (abierto !== true) {
    if (creada) await auth.currentUser.delete().catch(() => {})
    await signOut(auth)
    return { ok: false, error: `Las inscripciones del curso "${codigo}" están cerradas. Hablá con el docente.` }
  }

  try {
    const plantilla = (await get(ref(db, `cursos/${codigo}/plantilla`))).val()
    const nombreLimpio = nombre.trim().replace(/\s+/g, ' ')
    await update(ref(db), {
      ['alumnos/' + usuario]: { curso: codigo, nombre: nombreLimpio, creado: Date.now() },
      ['placas/' + usuario]: placaDesdePlantilla(plantilla),
    })
  } catch (e) {
    if (creada) await auth.currentUser.delete().catch(() => {})
    await signOut(auth)
    return {
      ok: false,
      error: 'No se pudo completar el alta. Si el curso tiene una plantilla cargada, puede tener un error: avisale al docente. (' + mensajeError(e) + ')',
    }
  }
  return { ok: true, nuevo: true }
}

export async function entrarDocente(correo, contrasena) {
  try {
    await signInWithEmailAndPassword(auth, correo.trim(), contrasena)
  } catch (e) {
    return { ok: false, error: mensajeError(e) }
  }
  if (!(await esDocente(auth.currentUser.uid))) {
    await signOut(auth)
    return { ok: false, error: 'Esa cuenta no está marcada como docente (docentes/<uid> en la base).' }
  }
  return { ok: true }
}

export const esDocente = async (uid) =>
  (await get(ref(db, 'docentes/' + uid)).catch(() => null))?.val() === true

export const escucharAlta = (usuario, cb, onError) =>
  onValue(ref(db, 'alumnos/' + usuario), (s) => cb(s.val()), onError)

// ===================================================================
//  La placa de un alumno
// ===================================================================

// Kodular puede guardar los valores como texto ("1", "true", "\"1\""):
// todo lo que parece sí/no se interpreta igual que en la placa.
export function aBool(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (typeof v === 'string') return /^"?(1|true|on)"?$/i.test(v.trim())
  return false
}

export function aBinario(v) {
  if (v == null) return null
  return aBool(v) ? 1 : 0
}

// De la forma de la base a la que usan las pantallas:
//   canales  [{id, tipo, nombre, pin, ...}] ordenados, entradas primero
//   reglas   [{salida, entrada, condicion, umbral, hist}]
export function normalizarPlaca(p) {
  const config = p?.config || {}
  const control = p?.control || {}
  const canales = [
    ...Object.entries(config.entradas || {}).map(([id, c]) => ({ ...c, id, tipo: 'entrada' })),
    ...Object.entries(config.salidas || {}).map(([id, c]) => ({ ...c, id, tipo: 'salida' })),
  ].sort((a, b) => (a.tipo === b.tipo ? (a.orden ?? 0) - (b.orden ?? 0) : a.tipo === 'entrada' ? -1 : 1))
  const reglas = Object.entries(control.reglas || {}).map(([salida, g]) => ({ ...g, salida }))
  return {
    canales,
    reglas,
    pulsadorModo: config.pulsador_modo ?? null,
    auto: aBool(control.auto),
    cmd: control.cmd || {},
    estado: p?.estado || {},
  }
}

export function escucharPlaca(usuario, cb, onError) {
  return onValue(ref(db, 'placas/' + usuario), (snap) => cb(normalizarPlaca(snap.val())), onError)
}

// Diferencia entre el reloj de este dispositivo y el de Firebase: "visto"
// lo pone el servidor, y un celular con la hora corrida mostraría la placa
// desconectada estando conectada.
export const escucharDesfase = (cb) => onValue(ref(db, '.info/serverTimeOffset'), (s) => cb(s.val() || 0))

const placa = (usuario, ruta) => ref(db, `placas/${usuario}/${ruta}`)

export async function guardarCanal(usuario, canal, orden) {
  const { id, tipo, ...campos } = canal
  const rama = tipo === 'salida' ? 'salidas' : 'entradas'
  await set(placa(usuario, `config/${rama}/${id}`), { ...campos, orden })
}

// Borra el canal, las reglas que lo usan y un comando que haya quedado.
export async function borrarCanal(usuario, c, reglas) {
  const cambios = {}
  cambios[`config/${c.tipo === 'salida' ? 'salidas' : 'entradas'}/${c.id}`] = null
  for (const g of reglas) {
    if (g.salida === c.id || g.entrada === c.id) cambios[`control/reglas/${g.salida}`] = null
  }
  if (c.tipo === 'salida') cambios[`control/cmd/${c.id}`] = null
  await update(ref(db, 'placas/' + usuario), cambios)
}

export async function guardarRegla(usuario, { salida, entrada, condicion, umbral, hist }) {
  await set(placa(usuario, `control/reglas/${salida}`), { entrada, condicion, umbral, hist })
}

export const borrarRegla = (usuario, salida) => remove(placa(usuario, `control/reglas/${salida}`))
export const enviarComando = (usuario, salida, valor) => set(placa(usuario, `control/cmd/${salida}`), valor)
export const fijarAuto = (usuario, auto) => set(placa(usuario, 'control/auto'), auto)
export const guardarPulsadorModo = (usuario, gpio) => set(placa(usuario, 'config/pulsador_modo'), gpio)

// ===================================================================
//  Docente
// ===================================================================

export const escucharCursos = (cb, onError) => onValue(ref(db, 'cursos'), (s) => cb(s.val() || {}), onError)

export function escucharClase(curso, cb, onError) {
  const prefijo = curso.toLowerCase() + '-'
  let alumnos = null, placas = null
  const avisar = () => { if (alumnos && placas) cb({ alumnos, placas }) }
  const a = onValue(query(ref(db, 'alumnos'), orderByChild('curso'), equalTo(curso)),
    (s) => { alumnos = s.val() || {}; avisar() }, onError)
  const p = onValue(query(ref(db, 'placas'), orderByKey(), startAt(prefijo), endAt(prefijo + '')),
    (s) => { placas = s.val() || {}; avisar() }, onError)
  return () => { a(); p() }
}

export const fijarAbierto = (curso, abierto) => set(ref(db, `cursos/${curso}/abierto`), abierto)

export const borrarAlumno = (usuario) =>
  update(ref(db), { ['alumnos/' + usuario]: null, ['placas/' + usuario]: null })
