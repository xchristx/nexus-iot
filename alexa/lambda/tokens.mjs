// Los tokens que Alexa guarda y nos devuelve en cada pedido. No se guardan en
// la base: llevan adentro de quién son, firmados con SECRETO_TOKENS.
//
//   acceso    {t: 'a', u, g, exp}       o {t: 'a', c, d, g, exp}   (1 hora)
//   refresco  {t: 'r', u, g}            o {t: 'r', c, d, g}
//
// u = usuario del alumno; c = curso y d = uid del docente (el Echo del
// laboratorio); g = "generación": el `desde` del vínculo en la base. Al
// desvincular se borra el vínculo y todos los tokens de antes dejan de andar.

import { createHmac, timingSafeEqual } from 'node:crypto'

function firmar(texto) {
  const secreto = process.env.SECRETO_TOKENS
  if (!secreto || secreto.length < 32) throw new Error('SECRETO_TOKENS falta o es corto (32 caracteres o más)')
  return createHmac('sha256', secreto).update(texto).digest('base64url')
}

export function crear(datos) {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url')
  return cuerpo + '.' + firmar(cuerpo)
}

// Los datos, o null si el token no es nuestro o lo tocaron.
export function abrir(token) {
  if (typeof token !== 'string') return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [cuerpo, firma] = partes
  const esperada = Buffer.from(firmar(cuerpo))
  const dada = Buffer.from(firma)
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
    return datos && typeof datos === 'object' ? datos : null
  } catch {
    return null
  }
}
