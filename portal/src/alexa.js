// Alexa (opcional). La skill es Smart Home: "Alexa, prende la bomba". Para
// vincularla, la app Alexa abre este portal en /alexa (el "Authorization URI"
// del account linking) con
//
//   ?client_id=…&redirect_uri=https://pitangui.amazon.com/api/skill/link/…&state=…&response_type=code
//
// El alumno (o el docente) entra, toca Autorizar, el portal deja un código en
// alexa/codigos/{sha256} y vuelve a Amazon con ?code=&state=. La Lambda
// (alexa/lambda/) canjea ese código. Acá va lo que no necesita Firebase: se
// prueba con node --test (pruebas/alexa.test.mjs).

export const CLIENTE_ALEXA = import.meta.env?.VITE_ALEXA_CLIENTE_ID || ''
export const NOMBRE_SKILL = 'Nexus IoT'
export const MAX_DISPOSITIVOS = 300

// Las únicas vueltas que acepta el portal: las de Amazon. Cualquier otra
// sería un robo del código.
const HOSTS = ['pitangui.amazon.com', 'layla.amazon.com', 'alexa.amazon.co.jp']

// Lo que pidió Amazon, validado: {redirect, state} o {error}.
export function leerPedido(busqueda, clienteId = CLIENTE_ALEXA) {
  const p = new URLSearchParams(busqueda)
  if (!clienteId) return { error: 'Este portal no tiene Alexa configurada (falta VITE_ALEXA_CLIENTE_ID).' }
  if (p.get('response_type') !== 'code') return { error: 'El pedido de Alexa no es válido (response_type).' }
  if (p.get('client_id') !== clienteId) return { error: 'El pedido no viene de la skill de este portal (client_id).' }
  const redirect = p.get('redirect_uri') || ''
  let u
  try { u = new URL(redirect) } catch { u = null }
  if (!u || u.protocol !== 'https:' || !HOSTS.includes(u.hostname) || !u.pathname.startsWith('/api/skill/link/')) {
    return { error: 'El pedido no vuelve a Amazon (redirect_uri): no se puede autorizar.' }
  }
  return { redirect, state: p.get('state') || '' }
}

// La URL para volver a Amazon: con {code} si autorizó, con {error: 'access_denied'} si no.
export function urlDeVuelta(pedido, campos) {
  const u = new URL(pedido.redirect)
  for (const [k, v] of Object.entries({ ...campos, state: pedido.state })) u.searchParams.set(k, v)
  return u.toString()
}

export function nuevoCodigo() {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// En la base se guarda el hash, no el código: igual que hashDe() de la Lambda.
export async function hashCodigo(codigo) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codigo))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Igual que alexa/lambda/placa.mjs: qué entradas ve Alexa como termómetro.
export const esTemperatura = (unidad) => /^\s*[°º]?\s*c\s*$/i.test(unidad || '')

// Cuántos dispositivos ve Alexa de una placa (normalizarPlaca): cada salida,
// el modo automático si hay salidas, y cada entrada en °C.
export function dispositivosDe(placa) {
  const salidas = placa.canales.filter(c => c.tipo === 'salida').length
  const termometros = placa.canales.filter(c => c.tipo === 'entrada' && esTemperatura(c.unidad)).length
  return salidas + (salidas ? 1 : 0) + termometros
}
