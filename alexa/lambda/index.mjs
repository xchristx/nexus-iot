// Nexus IoT para Alexa (skill Smart Home). Una sola Lambda con dos entradas:
//
//   - el disparador "Alexa Smart Home" (con verificación del Skill ID): las
//     directivas de voz → hogar.mjs
//   - la Function URL: el canje de tokens del account linking → oauth.mjs
//
// Sin dependencias: se sube el zip con estos archivos y listo. La puesta en
// marcha está en alexa/LEEME.md.

import { token } from './oauth.mjs'
import { atender } from './hogar.mjs'

const FALTAN = ['FIREBASE_DATABASE_URL', 'CLIENTE_ID', 'CLIENTE_SECRETO', 'SECRETO_TOKENS']
  .concat(process.env.RTDB_EMULADOR ? [] : ['CUENTA_SERVICIO'])
  .filter(v => !process.env[v])
if (FALTAN.length) console.error('Faltan variables de entorno:', FALTAN.join(', '))

export async function handler(evento) {
  if (FALTAN.length) throw new Error('Faltan variables de entorno: ' + FALTAN.join(', '))
  // Primero la Function URL: un pedido HTTP nunca se trata como directiva,
  // aunque traiga una en el cuerpo.
  if (evento?.requestContext?.http) return token(evento)
  if (evento?.directive) return atender(evento.directive)
  throw new Error('Evento desconocido')
}
