// Realtime Database por REST, como administrador: las reglas no se aplican.
// Lo que protege acá es que cada pedido de Alexa trae un token firmado
// (tokens.mjs) que dice de quién es, y solo se toca la placa de ese dueño.
//
// Con la cuenta de servicio de Firebase se le pide a Google un token que dura
// una hora (JWT firmado con node:crypto: sin dependencias). Contra el
// emulador alcanza con "Bearer owner".
//
//   FIREBASE_DATABASE_URL  https://TUPROYECTO-default-rtdb.firebaseio.com
//   CUENTA_SERVICIO        el JSON de la clave, entero (Configuración del proyecto → Cuentas de servicio)
//   RTDB_EMULADOR          solo en las pruebas: http://127.0.0.1:9000

import { createSign } from 'node:crypto'

const ALCANCES = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'
const ESPERA_MAXIMA = 5000   // Alexa espera 8 s en total

let tokenGoogle = null
let venceGoogle = 0

async function autorizacion() {
  if (process.env.RTDB_EMULADOR) return 'Bearer owner'
  if (tokenGoogle && Date.now() < venceGoogle - 60000) return 'Bearer ' + tokenGoogle
  const cuenta = JSON.parse(process.env.CUENTA_SERVICIO)
  const ahora = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const sinFirma = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: cuenta.client_email, scope: ALCANCES, aud: 'https://oauth2.googleapis.com/token',
    iat: ahora, exp: ahora + 3600,
  })
  const firma = createSign('RSA-SHA256').update(sinFirma).sign(cuenta.private_key, 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: sinFirma + '.' + firma }),
    signal: AbortSignal.timeout(ESPERA_MAXIMA),
  })
  if (!r.ok) throw new Error(`Google no dio el token (${r.status}): ${await r.text()}`)
  const j = await r.json()
  tokenGoogle = j.access_token
  venceGoogle = Date.now() + j.expires_in * 1000
  return 'Bearer ' + tokenGoogle
}

// `consulta`: {orderBy: 'creado', endAt: 123} → ?orderBy="creado"&endAt=123
function url(ruta, consulta = {}) {
  const base = new URL(process.env.FIREBASE_DATABASE_URL)
  const emulador = process.env.RTDB_EMULADOR
  const u = new URL((emulador || base.origin).replace(/\/$/, '') + '/' + ruta.split('/').map(encodeURIComponent).join('/') + '.json')
  if (emulador) u.searchParams.set('ns', base.hostname.split('.')[0])
  for (const [k, v] of Object.entries(consulta)) u.searchParams.set(k, JSON.stringify(v))
  return u
}

async function pedir(metodo, ruta, cuerpo, consulta) {
  const r = await fetch(url(ruta, consulta), {
    method: metodo,
    headers: {
      authorization: await autorizacion(),
      ...(cuerpo !== undefined && { 'content-type': 'application/json' }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(ESPERA_MAXIMA),
  })
  if (!r.ok) throw new Error(`RTDB ${metodo} ${ruta} (${r.status}): ${await r.text()}`)
  return r.json()
}

export const leer = (ruta, consulta) => pedir('GET', ruta, undefined, consulta)
export const escribir = (ruta, valor) => pedir('PUT', ruta, valor)
export const actualizar = (ruta, cambios) => pedir('PATCH', ruta, cambios)
export const borrar = (ruta) => pedir('DELETE', ruta)
