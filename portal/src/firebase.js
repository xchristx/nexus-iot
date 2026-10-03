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
import { Capacitor } from '@capacitor/core'
import {
  getAuth, initializeAuth, indexedDBLocalPersistence, inMemoryPersistence, connectAuthEmulator,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  updatePassword, deleteUser,
} from 'firebase/auth'
import {
  getDatabase, connectDatabaseEmulator, ref, get, set, update, remove, onValue,
  query, orderByChild, orderByKey, equalTo, startAt, endAt, serverTimestamp,
} from 'firebase/database'

import { generarContrasena } from './cuentas.js'
import { nuevoCodigo, hashCodigo, urlDeVuelta } from './alexa.js'
import { DOMINIO, normalizarNombre, normalizarCurso, usuarioDe, correoDe, usuarioDeCorreo } from './nombres.js'
export { DOMINIO, normalizarNombre, normalizarCurso, usuarioDe, correoDe, usuarioDeCorreo }

const env = import.meta.env

export const firebaseConfig = {
  apiKey:      env.VITE_FIREBASE_API_KEY,
  authDomain:  env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId:   env.VITE_FIREBASE_PROJECT_ID,
  appId:       env.VITE_FIREBASE_APP_ID,
}

export const configurado = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL)

// Ids que la base usa para otra cosa dentro de "estado".
export const RESERVADOS = ['visto', 'aviso', 'auto', 'cmd', 'reglas']

let auth, db
if (configurado) {
  const app = initializeApp(firebaseConfig)
  // En la app Android (Capacitor), getAuth carga el iframe de inicio con
  // redirección, que dentro del WebView puede no terminar nunca. Solo usamos
  // correo y contraseña, así que alcanza con guardar la sesión en IndexedDB.
  auth = Capacitor.isNativePlatform()
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app)
  db = getDatabase(app)
  if (env.VITE_USAR_EMULADOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectDatabaseEmulator(db, '127.0.0.1', 9000)
  }
}

// ===================================================================
//  Errores: lo que ve el alumno
// ===================================================================

// `rama`: si el rechazo es al escribir tablero/ o alertas/ (v5), lo más probable
// es que el proyecto tenga publicadas las reglas de antes, que no las conocen.
export function mensajeError(e, rama) {
  const codigo = e?.code || ''
  if (codigo.includes('network-request-failed')) return 'No se pudo conectar. Revisa tu internet.'
  if (codigo.includes('invalid-credential') || codigo.includes('wrong-password') || codigo.includes('user-not-found') || codigo.includes('invalid-login'))
    return 'El usuario o la contraseña no coinciden. Están en la tarjeta que te dio el docente.'
  if (codigo.includes('too-many-requests')) return 'Demasiados intentos seguidos. Espera unos minutos y prueba de nuevo.'
  if (codigo.includes('weak-password')) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (codigo.includes('invalid-email')) return 'Ese usuario no existe: revisa cómo está escrito en tu tarjeta.'
  if (codigo.includes('user-disabled')) return 'Tu cuenta está deshabilitada. Habla con el docente.'
  if (/permission.denied|PERMISSION_DENIED/i.test(codigo + ' ' + (e?.message || ''))) {
    if (rama) return `Firebase no acepta "${rama}": seguramente el proyecto tiene publicadas reglas viejas. ` +
      'Avísale al docente que publique de nuevo firebase/database.rules.json (Realtime Database → Reglas).'
    return 'Firebase rechazó el cambio: algún dato no cumple las reglas.'
  }
  return e?.message || String(e)
}

// ===================================================================
//  Sesión
// ===================================================================

export const escucharSesion = (cb) => onAuthStateChanged(auth, cb)
export const salir = () => signOut(auth)

// El alumno entra con el usuario y la contraseña de la tarjeta que le dio el
// docente. Se acepta con mayúsculas o espacios de más.
export async function entrar(usuarioTipeado, contrasena) {
  const usuario = (usuarioTipeado || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!/^[a-z0-9]{3,12}-[a-z0-9_]{2,}$/.test(usuario))
    return { ok: false, error: 'El usuario es como "iot2026-ana_perez": el código del curso, un guion y tu nombre. Está en tu tarjeta.' }
  if (!contrasena) return { ok: false, error: 'Falta la contraseña.' }
  try {
    await signInWithEmailAndPassword(auth, correoDe(usuario), contrasena)
  } catch (e) {
    return { ok: false, error: mensajeError(e) }
  }
  const alta = await get(ref(db, 'alumnos/' + usuario)).catch(() => null)
  if (!alta?.exists()) {
    await signOut(auth)
    return { ok: false, error: 'Tu cuenta existe pero no está en ningún curso. Habla con el docente.' }
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
  // Cómo se ve cada canal y las alertas: solo los usan el portal y la app.
  // Lo que nombra un canal que el kit no tiene se descarta: las reglas de la
  // base rechazarían el alta entera por eso.
  const existe = (id) => config.entradas[id] || config.salidas[id]
  const tablero = {}
  for (const [id, w] of Object.entries(p?.tablero || {})) {
    if (existe(id) && w) tablero[id] = sinVacios(w)
  }
  const alertas = {}
  for (const a of lista(p?.alertas)) {
    if (config.entradas[a.entrada]) alertas[a.entrada] = { condicion: a.condicion, umbral: a.umbral, hist: a.hist ?? 1 }
  }
  return { config, control: { auto: false, reglas }, tablero, alertas }
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
//   tablero  {id: {widget, color, icono, min, max}}  (lo que falta lo completa widgets.jsx)
//   alertas  [{entrada, condicion, umbral, hist}]
//   alexa    {desde} si el alumno la vinculó con su cuenta de Amazon, o null
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
    tablero: p?.tablero || {},
    alertas: Object.entries(p?.alertas || {}).map(([entrada, a]) => ({ ...a, entrada })),
    alexa: p?.alexa || null,
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

// Borra el canal, las reglas que lo usan, un comando que haya quedado, su
// widget y su alerta.
export async function borrarCanal(usuario, c, reglas) {
  const cambios = {}
  cambios[`config/${c.tipo === 'salida' ? 'salidas' : 'entradas'}/${c.id}`] = null
  for (const g of reglas) {
    if (g.salida === c.id || g.entrada === c.id) cambios[`control/reglas/${g.salida}`] = null
  }
  if (c.tipo === 'salida') cambios[`control/cmd/${c.id}`] = null
  cambios[`tablero/${c.id}`] = null
  cambios[`alertas/${c.id}`] = null
  await update(ref(db, 'placas/' + usuario), cambios)
}

// La placa publica con update, que pisa pero no borra: un id que ya no está en
// el sketch se queda en "estado" para siempre y Mi placa lo sigue mostrando
// como "no declarado". Si la placa todavía lo manda, vuelve a aparecer.
export const quitarDetectado = (usuario, id) => remove(placa(usuario, `estado/${id}`))

// Mueve un canal un lugar (-1 arriba, +1 abajo) entre los de su tipo, y
// renumera el orden de todos: así no importa si había dos con el mismo.
export async function moverCanal(usuario, canales, id, paso) {
  const c = canales.find(x => x.id === id)
  const lista = canales.filter(x => x.tipo === c.tipo)
  const i = lista.indexOf(c), j = i + paso
  if (j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  const rama = c.tipo === 'salida' ? 'salidas' : 'entradas'
  // Las entradas van primero: las salidas siguen numerando después.
  const base = c.tipo === 'salida' ? canales.filter(x => x.tipo === 'entrada').length : 0
  const cambios = {}
  lista.forEach((x, k) => { cambios[`config/${rama}/${x.id}/orden`] = base + k })
  await update(ref(db, 'placas/' + usuario), cambios)
}

export const guardarWidget = (usuario, id, w) => set(placa(usuario, `tablero/${id}`), w)
export const guardarAlerta = (usuario, { entrada, condicion, umbral, hist }) =>
  set(placa(usuario, `alertas/${entrada}`), { condicion, umbral, hist })
export const borrarAlerta = (usuario, entrada) => remove(placa(usuario, `alertas/${entrada}`))

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

export const crearCurso = (codigo, nombre) => set(ref(db, 'cursos/' + codigo), { nombre })

// ===================================================================
//  Cuentas de los alumnos (las administra el docente)
// ===================================================================
//
// Firebase, sin servidor (plan Spark), no deja que alguien cree o cambie la
// cuenta de OTRO. Se hace con una segunda instancia de Auth, en memoria: crea
// la cuenta, entra como ese alumno cuando hace falta (para cambiarle o borrarle
// la contraseña) y sale, sin tocar la sesión del docente. Por eso la contraseña
// se guarda en credenciales/{usuario}, que solo lee el docente: sin ella no se
// podría volver a entrar a esa cuenta para cambiarla.

let authAltas = null
function auxiliar() {
  if (!authAltas) {
    authAltas = initializeAuth(initializeApp(firebaseConfig, 'altas'), { persistence: inMemoryPersistence })
    if (env.VITE_USAR_EMULADOR) connectAuthEmulator(authAltas, 'http://127.0.0.1:9099', { disableWarnings: true })
  }
  return authAltas
}

// Entra como el alumno en la instancia auxiliar, hace `fn(usuario de Auth)` y sale.
async function comoAlumno(usuario, contrasena, fn) {
  const aux = auxiliar()
  const { user } = await signInWithEmailAndPassword(aux, correoDe(usuario), contrasena)
  try {
    return await fn(user)
  } finally {
    await signOut(aux).catch(() => {})
  }
}

export const escucharCredenciales = (curso, cb, onError) => {
  const prefijo = curso.toLowerCase() + '-'
  return onValue(query(ref(db, 'credenciales'), orderByKey(), startAt(prefijo), endAt(prefijo + '\uf8ff')),
    (s) => cb(s.val() || {}), onError)
}

// Crea una cuenta: {usuario, contrasena} o {usuario, error}. Si se cortó a
// mitad de camino y se vuelve a intentar, sigue desde donde quedó: la
// contraseña se guarda antes que nada, y con ella se reconoce la cuenta.
async function crearUna(codigo, { nombre, usuario }, plantilla) {
  const guardada = (await get(ref(db, 'credenciales/' + usuario))).val()
  const contrasena = guardada?.contrasena || generarContrasena()
  if (!guardada) await set(ref(db, 'credenciales/' + usuario), { contrasena, creado: Date.now() })

  const aux = auxiliar()
  try {
    await createUserWithEmailAndPassword(aux, correoDe(usuario), contrasena)
    await signOut(aux)
  } catch (e) {
    if (!(e?.code || '').includes('email-already-in-use')) {
      if (!guardada) await remove(ref(db, 'credenciales/' + usuario)).catch(() => {})
      return { usuario, nombre, error: mensajeError(e) }
    }
    // Ya existe en Auth: sirve solo si es nuestra (entra con la guardada).
    try {
      await comoAlumno(usuario, contrasena, async () => {})
    } catch {
      if (!guardada) await remove(ref(db, 'credenciales/' + usuario)).catch(() => {})
      return {
        usuario, nombre,
        error: 'Ya hay una cuenta con ese usuario, de antes, con otra contraseña. Bórrala en Firebase Console → Authentication y vuelve a cargarlo.',
      }
    }
  }

  if (!(await get(ref(db, 'alumnos/' + usuario))).exists()) {
    await update(ref(db), {
      ['alumnos/' + usuario]: { curso: codigo, nombre, creado: Date.now() },
      ['placas/' + usuario]: placaDesdePlantilla(plantilla),
    })
  }
  return { usuario, nombre, contrasena }
}

// Crea las cuentas de la lista (de prepararLista, en cuentas.js), de a una:
// Firebase frena si se crean muchas de golpe. `onPaso(hechas, total)`.
export async function crearAlumnos(curso, lista, onPaso) {
  const codigo = curso.toUpperCase()
  const plantilla = (await get(ref(db, `cursos/${codigo}/plantilla`))).val()
  const resultados = []
  for (const [n, fila] of lista.entries()) {
    onPaso?.(n, lista.length)
    try {
      resultados.push(await crearUna(codigo, fila, plantilla))
    } catch (e) {
      resultados.push({ ...fila, error: mensajeError(e) })
    }
  }
  onPaso?.(lista.length, lista.length)
  return resultados
}

// Cambia la contraseña por una nueva generada. Hace falta la guardada.
export async function nuevaContrasena(usuario) {
  const guardada = (await get(ref(db, 'credenciales/' + usuario))).val()
  if (!guardada) throw new Error('No hay una contraseña guardada para esta cuenta: bórrala en Firebase Console → Authentication y vuelve a cargar al alumno.')
  const nueva = generarContrasena()
  try {
    await comoAlumno(usuario, guardada.contrasena, (user) => updatePassword(user, nueva))
  } catch (e) {
    throw new Error('No se pudo entrar a la cuenta con la contraseña guardada (' + mensajeError(e) + '). Bórrala en Firebase Console → Authentication y vuelve a cargar al alumno.')
  }
  await set(ref(db, 'credenciales/' + usuario), { contrasena: nueva, creado: Date.now() })
  return nueva
}

// Borra al alumno entero: la cuenta de Auth, su alta, su placa y su
// contraseña. Si la cuenta no se pudo borrar (no había contraseña guardada),
// igual borra los datos y lo avisa: `{cuentaBorrada: false}`.
export async function borrarAlumno(usuario) {
  const guardada = (await get(ref(db, 'credenciales/' + usuario))).val()
  let cuentaBorrada = false
  if (guardada) {
    try {
      await comoAlumno(usuario, guardada.contrasena, (user) => deleteUser(user))
      cuentaBorrada = true
    } catch {
      // No se pudo entrar (la borraron a mano, o le cambiaron la contraseña
      // desde la consola): se avisa para que la borren en Authentication.
    }
  }
  await update(ref(db), {
    ['alumnos/' + usuario]: null, ['placas/' + usuario]: null, ['credenciales/' + usuario]: null,
    [`cursos/${usuario.split('-')[0].toUpperCase()}/alexa/alumnos/${usuario}`]: null,
  })
  return { cuentaBorrada }
}

// ===================================================================
//  Alexa (opcional: solo con VITE_ALEXA_CLIENTE_ID, ver alexa.js)
// ===================================================================
//
// El portal no habla con Amazon: deja un código de un solo uso en
// alexa/codigos/{sha256} y se lo pasa a Amazon en la vuelta. La Lambda
// (alexa/lambda/) lo canjea y marca el vínculo en placas/{u}/alexa (un
// alumno) o cursos/{C}/alexa (el Echo del laboratorio, del docente).
// Desvincular es borrar esa marca: los tokens de Alexa dejan de andar.

// `dueno`: {usuario} o {curso, alumnos: [usuarios que maneja el Echo]}.
// Devuelve la URL para volver a Amazon.
export async function autorizarAlexa(pedido, dueno) {
  const codigo = nuevoCodigo()
  let datos
  if (dueno.usuario) {
    datos = { usuario: dueno.usuario }
  } else {
    datos = { curso: dueno.curso, docente: auth.currentUser.uid }
    await set(ref(db, `cursos/${dueno.curso}/alexa/alumnos`), Object.fromEntries(dueno.alumnos.map(u => [u, true])))
  }
  await set(ref(db, 'alexa/codigos/' + await hashCodigo(codigo)), { ...datos, redirect: pedido.redirect, creado: serverTimestamp() })
  return urlDeVuelta(pedido, { code: codigo })
}

export const desvincularAlexa = (usuario) => remove(ref(db, `placas/${usuario}/alexa`))
// La elección de alumnos queda, para la próxima vez.
export const desvincularAlexaCurso = (curso) => update(ref(db, `cursos/${curso}/alexa`), { desde: null, docente: null })
export const elegirAlexa = (curso, usuario, si) =>
  si ? set(ref(db, `cursos/${curso}/alexa/alumnos/${usuario}`), true)
     : remove(ref(db, `cursos/${curso}/alexa/alumnos/${usuario}`))
