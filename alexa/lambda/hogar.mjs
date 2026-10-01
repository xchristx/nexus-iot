// Las directivas de Alexa (Smart Home, payloadVersion 3):
//
//   Alexa.Discovery / Discover       qué dispositivos hay ("Alexa, descubre dispositivos")
//   Alexa.PowerController / TurnOn   "Alexa, prende la bomba" (y TurnOff)
//   Alexa / ReportState              "¿está prendida la bomba?", la app Alexa al abrir un dispositivo
//
// Prender una salida hace lo mismo que el portal: escribe control/cmd/{id} y
// la placa lo aplica y lo borra. El firmware no se entera de que fue Alexa.

import { randomUUID } from 'node:crypto'
import { abrir } from './tokens.mjs'
import { leer, escribir } from './rtdb.mjs'
import { cargar } from './vinculo.mjs'
import { catalogo, dispositivosDe, aEndpoint, propiedades, conectada, aBool, aBinario } from './placa.mjs'

const ESPERA = Number(process.env.ESPERA_CONFIRMACION_MS ?? 3000)
const PASO = 250
const dormir = (ms) => new Promise(r => setTimeout(r, ms))

function respuestas(header, endpoint) {
  const cabecera = (namespace, name) => ({
    namespace, name, messageId: randomUUID(), payloadVersion: '3',
    ...(header.correlationToken && { correlationToken: header.correlationToken }),
  })
  const ep = endpoint && { ...(endpoint.scope && { scope: endpoint.scope }), endpointId: endpoint.endpointId }
  return {
    error: (type, message, extra) => ({
      event: { header: cabecera('Alexa', 'ErrorResponse'), ...(ep && { endpoint: ep }), payload: { type, message, ...extra } },
    }),
    listo: (properties) => ({
      event: { header: cabecera('Alexa', 'Response'), endpoint: ep, payload: {} },
      context: { properties },
    }),
    estado: (properties) => ({
      event: { header: cabecera('Alexa', 'StateReport'), endpoint: ep, payload: {} },
      context: { properties },
    }),
    descubiertos: (endpoints) => ({
      event: { header: cabecera('Alexa.Discovery', 'Discover.Response'), payload: { endpoints } },
    }),
    permiso: () => ({
      event: { header: cabecera('Alexa.Authorization', 'AcceptGrant.Response'), payload: {} },
    }),
  }
}

export async function atender({ header, endpoint, payload }) {
  console.log(header.namespace, header.name, endpoint?.endpointId ?? '')
  const r = respuestas(header, endpoint)
  try {
    // Solo llega si se activa "Send Alexa Events" en la consola: no lo usamos.
    if (header.namespace === 'Alexa.Authorization' && header.name === 'AcceptGrant') return r.permiso()

    const datos = abrir(endpoint?.scope?.token ?? payload?.scope?.token)
    if (!datos || datos.t !== 'a') return r.error('INVALID_AUTHORIZATION_CREDENTIAL', 'Vincula de nuevo la cuenta en la app Alexa.')
    if (!(datos.exp > Date.now())) return r.error('EXPIRED_AUTHORIZATION_CREDENTIAL', 'El token venció.')

    if (header.namespace === 'Alexa.Discovery' && header.name === 'Discover') {
      const carga = await cargar(datos)
      if (!carga) return r.error('INVALID_AUTHORIZATION_CREDENTIAL', 'La cuenta ya no está vinculada.')
      const placas = Object.entries(carga.placas).map(([usuario, p]) => ({ usuario, ...p }))
      return r.descubiertos(catalogo(placas).map(aEndpoint))
    }

    if (!endpoint?.endpointId) return r.error('INVALID_DIRECTIVE', 'Falta el dispositivo.')
    const usuario = endpoint.endpointId.split(':')[0]
    const carga = await cargar(datos, usuario)
    if (!carga) return r.error('INVALID_AUTHORIZATION_CREDENTIAL', 'La cuenta ya no está vinculada.')
    const p = carga.placas[usuario]
    const d = p && dispositivosDe(usuario, p.placa, p.alumno).find(x => x.endpointId === endpoint.endpointId)
    if (!d) return r.error('NO_SUCH_ENDPOINT', 'Ese dispositivo ya no existe: dile "Alexa, descubre dispositivos".')

    if (header.namespace === 'Alexa.PowerController' && (header.name === 'TurnOn' || header.name === 'TurnOff')) {
      return await encender(r, usuario, d, p.placa, header.name === 'TurnOn')
    }
    if (header.namespace === 'Alexa' && header.name === 'ReportState') {
      const props = propiedades(d, p.placa)
      return props ? r.estado(props) : r.error('ENDPOINT_UNREACHABLE', 'La placa no está conectada.')
    }
    return r.error('INVALID_DIRECTIVE', `No se entiende ${header.namespace}.${header.name}.`)
  } catch (e) {
    console.error(e)
    return r.error('INTERNAL_ERROR', String(e?.message || e).slice(0, 200))
  }
}

async function encender(r, usuario, d, placa, prender) {
  const raiz = 'placas/' + usuario

  if (d.tipo === 'auto') {
    await escribir(raiz + '/control/auto', prender)
    return r.listo(propiedades(d, { ...placa, control: { ...placa.control, auto: prender } }))
  }
  if (d.tipo !== 'salida') return r.error('INVALID_DIRECTIVE', 'Un termómetro no se prende.')

  // Sin placa, el comando quedaría en cola y la bomba arrancaría cuando
  // vuelva: por voz es mejor un "no responde".
  if (!conectada(placa)) return r.error('ENDPOINT_UNREACHABLE', 'La placa no está conectada.')
  // En modo automático la placa ignora lo manual en las salidas con regla.
  if (aBool(placa.control?.auto) && placa.control?.reglas?.[d.id]) {
    return r.error('NOT_SUPPORTED_IN_CURRENT_MODE', 'Está en modo automático: la maneja su regla.', { currentDeviceMode: 'OTHER' })
  }

  const valor = prender ? 1 : 0
  await escribir(`${raiz}/control/cmd/${d.id}`, valor)
  // Se espera a que la placa lo aplique, así Alexa contesta cuando ya cambió.
  // Si tarda, se contesta igual: la placa está conectada y lo va a aplicar.
  for (const fin = Date.now() + ESPERA; Date.now() < fin;) {
    await dormir(PASO)
    if (aBinario(await leer(`${raiz}/estado/${d.id}`)) === valor) break
  }
  return r.listo(propiedades(d, { ...placa, estado: { ...placa.estado, [d.id]: valor, visto: Date.now() } }))
}
