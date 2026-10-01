// El "Access Token URI" del account linking: Amazon lo llama (por la Function
// URL de la Lambda) para canjear el código que le pasó el portal, y después
// cada hora para renovar el token. OAuth 2.0, código de autorización.
//
//   CLIENTE_ID, CLIENTE_SECRETO   los mismos que se cargan en la consola de Alexa

import { timingSafeEqual } from 'node:crypto'
import { crear, abrir } from './tokens.mjs'
import { canjear, vigente, limpiarCodigos } from './vinculo.mjs'

const DURACION = 3600

const responder = (statusCode, cuerpo, cabeceras = {}) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cabeceras },
  body: JSON.stringify(cuerpo),
})

const igual = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

// Amazon manda el cliente por HTTP Basic (lo recomendado en la consola) o en
// el cuerpo, según cómo se configure.
function cliente(evento, campos) {
  const h = evento.headers?.authorization || ''
  if (/^basic /i.test(h)) {
    const [id, ...resto] = Buffer.from(h.slice(6), 'base64').toString().split(':')
    const des = (s) => { try { return decodeURIComponent(s) } catch { return s } }
    return { id: des(id), secreto: des(resto.join(':')) }
  }
  return { id: campos.get('client_id'), secreto: campos.get('client_secret') }
}

function tokens(datos) {
  return responder(200, {
    access_token: crear({ ...datos, t: 'a', exp: Date.now() + DURACION * 1000 }),
    token_type: 'Bearer',
    expires_in: DURACION,
    refresh_token: crear({ ...datos, t: 'r' }),
  })
}

export async function token(evento) {
  if (evento.requestContext.http.method !== 'POST') return responder(405, { error: 'invalid_request' })
  const texto = evento.isBase64Encoded ? Buffer.from(evento.body || '', 'base64').toString() : (evento.body || '')
  const campos = new URLSearchParams(texto)
  const { id, secreto } = cliente(evento, campos)
  if (!igual(id, process.env.CLIENTE_ID) || !igual(secreto, process.env.CLIENTE_SECRETO)) {
    return responder(401, { error: 'invalid_client' }, { 'www-authenticate': 'Basic' })
  }

  const tipo = campos.get('grant_type')
  if (tipo === 'authorization_code') {
    const datos = await canjear(campos.get('code'), campos.get('redirect_uri'))
    await limpiarCodigos().catch(e => console.error('limpiar códigos:', e.message))
    if (!datos) return responder(400, { error: 'invalid_grant' })
    console.log('vinculada:', datos.u || `curso ${datos.c} (docente)`)
    return tokens(datos)
  }
  if (tipo === 'refresh_token') {
    const { t, exp, ...datos } = abrir(campos.get('refresh_token')) || {}
    if (t !== 'r' || !(await vigente(datos))) return responder(400, { error: 'invalid_grant' })
    return tokens(datos)
  }
  return responder(400, { error: 'unsupported_grant_type' })
}
