// Una placa de mentira: hace lo mismo que src/main.cpp, pero en Node.
// Sirve para probar el portal y la app sin un ESP32, o para mostrarlos en
// clase antes de que llegue el hardware.
//
//   node pruebas/simular-placa.mjs <usuario> <contraseña> [--emulador]
//
// Contra el proyecto real hace falta, además, la config de Firebase en
// variables de entorno (las mismas del portal, sin el prefijo VITE_):
//   FIREBASE_API_KEY=... FIREBASE_DATABASE_URL=... node pruebas/simular-placa.mjs ...
//
// Entradas: "t" y "h" (un DHT22 inventado). Salidas: las que el alumno tenga
// declaradas en el portal. Escribiendo en la consola "p <salida>" se simula
// el pulsador de esa salida, y "m" el pulsador de modo.

import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth'
import { getDatabase, connectDatabaseEmulator, ref, onValue, get, update, remove, set, serverTimestamp } from 'firebase/database'
import { createInterface } from 'node:readline'

const [usuario, contrasena] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const emulador = process.argv.includes('--emulador')
if (!usuario || !contrasena) {
  console.error('uso: node pruebas/simular-placa.mjs <usuario> <contraseña> [--emulador]')
  process.exit(1)
}

const app = initializeApp(emulador
  ? { apiKey: 'fake', projectId: 'demo-nexus', databaseURL: 'https://demo-nexus-default-rtdb.firebaseio.com' }
  : { apiKey: process.env.FIREBASE_API_KEY, databaseURL: process.env.FIREBASE_DATABASE_URL })
const auth = getAuth(app)
const db = getDatabase(app)
if (emulador) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
}

await signInWithEmailAndPassword(auth, usuario + '@nexus-iot.example.com', contrasena)
console.log('[firebase] conectada como', usuario)

const RAIZ = 'placas/' + usuario
const aBool = (v) => typeof v === 'boolean' ? v : typeof v === 'number' ? v === 1
  : typeof v === 'string' ? /^"?(1|true|on)"?$/i.test(v.trim()) : null

const config = (await get(ref(db, RAIZ + '/config'))).val() || {}
const salidas = Object.fromEntries(Object.keys(config.salidas || {}).map(id => [id, 0]))
const entradas = { t: 22, h: 55 }
let modoAuto = false
let reglas = {}
let aviso = null

async function publicar() {
  const cuerpo = { ...entradas, ...salidas, visto: serverTimestamp() }
  if (aviso !== null) { cuerpo.aviso = aviso; aviso = null }
  await update(ref(db, RAIZ + '/estado'), cuerpo)
}

// Como el firmware: el aviso se borra solo a los 20 s.
let borrarAviso
function avisar(texto) {
  console.log('[aviso]', texto)
  aviso = texto
  clearTimeout(borrarAviso)
  borrarAviso = setTimeout(() => { aviso = ''; publicar() }, 20000)
}

function manual(id, encender, origen) {
  if (!(id in salidas)) return avisar('la placa no tiene la salida ' + id)
  if (modoAuto && reglas[id]) return avisar(`${id}: ${origen} ignorado, esta en modo automatico`)
  salidas[id] = encender ? 1 : 0
  console.log(`[salida] ${id} = ${encender ? 'ON' : 'OFF'} (${origen})`)
}

function evaluarReglas() {
  if (!modoAuto) return
  for (const [id, g] of Object.entries(reglas)) {
    const v = entradas[g.entrada]
    if (v === undefined || !(id in salidas)) continue
    const prender = g.condicion === '>' ? v > g.umbral : v < g.umbral
    const apagar = g.condicion === '>' ? v < g.umbral - g.hist : v > g.umbral + g.hist
    if (!salidas[id] && prender) { salidas[id] = 1; console.log('[regla]', id, '-> ON') }
    else if (salidas[id] && apagar) { salidas[id] = 0; console.log('[regla]', id, '-> OFF') }
  }
}

// Igual que el firmware: ante cualquier cambio en control, se procesa entero.
onValue(ref(db, RAIZ + '/control'), async (snap) => {
  const c = snap.val() || {}
  const auto = aBool(c.auto)
  if (auto !== null && auto !== modoAuto) { modoAuto = auto; console.log('[modo] automatico', modoAuto ? 'ACTIVADO' : 'DESACTIVADO') }
  reglas = c.reglas || {}
  for (const [id, v] of Object.entries(c.cmd || {})) {
    const encender = aBool(v)
    if (encender === null) avisar(id + ': valor de comando invalido')
    else manual(id, encender, 'comando')
    await remove(ref(db, `${RAIZ}/control/cmd/${id}`))
  }
  evaluarReglas()
  await publicar()
})

// Valores que se mueven solos, un latido y las reglas cada segundo.
let segundos = 0
setInterval(async () => {
  segundos++
  entradas.t = Math.round((22 + 8 * Math.sin(segundos / 20)) * 10) / 10
  entradas.h = Math.round((55 + 10 * Math.cos(segundos / 25)) * 10) / 10
  evaluarReglas()
  if (segundos % 3 === 0) await publicar()
}, 1000)

const rl = createInterface({ input: process.stdin })
rl.on('line', async (linea) => {
  const [orden, id] = linea.trim().split(/\s+/)
  if (orden === 'p' && id) manual(id, !salidas[id], 'pulsador')
  else if (orden === 'm') {
    modoAuto = !modoAuto
    console.log('[modo] automatico', modoAuto ? 'ACTIVADO' : 'DESACTIVADO', '(pulsador)')
    await set(ref(db, RAIZ + '/control/auto'), modoAuto)
  } else return console.log('comandos: "p <salida>" (pulsador), "m" (pulsador de modo)')
  evaluarReglas()
  await publicar()
})
