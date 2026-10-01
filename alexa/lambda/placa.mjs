// De una placa (lo que hay en placas/{usuario}) a los dispositivos que ve
// Alexa, y su estado. Sin acceso a la base: se prueba solo.
//
//   cada salida            interruptor (Alexa.PowerController)  "{usuario}:{id}"
//   el modo automático     interruptor "Modo automático"         "{usuario}:auto"
//   cada entrada en °C     termómetro (Alexa.TemperatureSensor)  "{usuario}:{id}"
//
// "auto" es un id reservado (RESERVADOS en el portal y en las reglas): nunca
// choca con una salida.

export const LATIDO_MAX = 40000        // igual que MiPlaca.jsx: sin latido, la placa está desconectada
export const MAX_DISPOSITIVOS = 300    // lo que acepta Alexa por cuenta

// Iguales a aBool y aBinario de portal/src/firebase.js: Kodular puede guardar
// los valores como texto ("1", "true", "\"1\"").
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

export const conectada = (placa, ahora = Date.now()) =>
  typeof placa?.estado?.visto === 'number' && ahora - placa.estado.visto <= LATIDO_MAX

export const esTemperatura = (unidad) => /^\s*[°º]?\s*c\s*$/i.test(unidad || '')

// El ícono del tablero dice qué es: una luz se apaga con "Alexa, apagá las luces".
const CATEGORIA = { foco: 'LIGHT', ventilador: 'FAN', enchufe: 'SMARTPLUG' }

const ordenados = (mapa) =>
  Object.entries(mapa || {}).map(([id, c]) => ({ ...c, id })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

const nombreDe = (c) => (typeof c.nombre === 'string' && c.nombre.trim()) || c.id.replace(/_/g, ' ')

// Los dispositivos de una placa. `alumno`: su nombre, cuando la ve el docente
// ("Bomba de Ana Pérez").
export function dispositivosDe(usuario, placa, alumno) {
  const de = alumno ? ' de ' + alumno : ''
  const salidas = ordenados(placa?.config?.salidas)
  const lista = salidas.map(s => ({
    endpointId: `${usuario}:${s.id}`, usuario, id: s.id, tipo: 'salida',
    nombre: nombreDe(s) + de,
    categoria: CATEGORIA[placa?.tablero?.[s.id]?.icono] || 'SWITCH',
    descripcion: `Salida "${s.id}" de ${usuario}`,
  }))
  if (salidas.length) {
    lista.push({
      endpointId: `${usuario}:auto`, usuario, id: 'auto', tipo: 'auto',
      nombre: 'Modo automático' + de, categoria: 'SWITCH',
      descripcion: `Modo automático de ${usuario}`,
    })
  }
  for (const e of ordenados(placa?.config?.entradas)) {
    if (!esTemperatura(e.unidad)) continue
    lista.push({
      endpointId: `${usuario}:${e.id}`, usuario, id: e.id, tipo: 'temperatura',
      nombre: nombreDe(e) + de, categoria: 'TEMPERATURE_SENSOR',
      descripcion: `Entrada "${e.id}" de ${usuario}`,
    })
  }
  return lista
}

// Todo lo que ve una cuenta, para Discovery: primero las salidas de todos,
// después los modos y al final las temperaturas, hasta 300. Alexa no acepta
// dos dispositivos con el mismo nombre: al repetido se le agrega un número.
// `placas`: [{usuario, placa, alumno}]
export function catalogo(placas) {
  const orden = { salida: 0, auto: 1, temperatura: 2 }
  const todos = placas.flatMap(p => dispositivosDe(p.usuario, p.placa, p.alumno))
    .sort((a, b) => orden[a.tipo] - orden[b.tipo])
    .slice(0, MAX_DISPOSITIVOS)
  const usados = new Set()
  for (const d of todos) {
    let nombre = d.nombre
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${d.nombre} ${n}`
    usados.add(nombre.toLowerCase())
    d.nombre = nombre
  }
  return todos
}

const ALEXA = { type: 'AlexaInterface', interface: 'Alexa', version: '3' }
const capacidad = (iface, propiedad, version = '3') => ({
  type: 'AlexaInterface', interface: iface, version,
  properties: { supported: [{ name: propiedad }], retrievable: true, proactivelyReported: false },
})
const CAPACIDADES = {
  salida: [capacidad('Alexa.PowerController', 'powerState'), capacidad('Alexa.EndpointHealth', 'connectivity', '3.1'), ALEXA],
  auto: [capacidad('Alexa.PowerController', 'powerState'), ALEXA],
  temperatura: [capacidad('Alexa.TemperatureSensor', 'temperature'), capacidad('Alexa.EndpointHealth', 'connectivity', '3.1'), ALEXA],
}

export const aEndpoint = (d) => ({
  endpointId: d.endpointId,
  manufacturerName: 'Nexus IoT',
  description: d.descripcion.slice(0, 128),
  friendlyName: d.nombre.slice(0, 128),
  displayCategories: [d.categoria],
  additionalAttributes: { manufacturer: 'Nexus IoT', model: 'ESP32' },
  capabilities: CAPACIDADES[d.tipo],
})

const propiedad = (namespace, name, value, t) =>
  ({ namespace, name, value, timeOfSample: new Date(t).toISOString(), uncertaintyInMilliseconds: 0 })

// Lo que se le contesta a Alexa sobre un dispositivo, o null si la placa no
// está conectada (el modo automático se cambia igual, como en el portal).
export function propiedades(d, placa, ahora = Date.now()) {
  if (d.tipo === 'auto') {
    return [propiedad('Alexa.PowerController', 'powerState', aBool(placa?.control?.auto) ? 'ON' : 'OFF', ahora)]
  }
  if (!conectada(placa, ahora)) return null
  const salud = propiedad('Alexa.EndpointHealth', 'connectivity', { value: 'OK' }, ahora)
  const visto = placa.estado.visto
  const v = placa.estado[d.id]
  if (d.tipo === 'salida') {
    const b = aBinario(v)
    return b == null ? [salud] : [propiedad('Alexa.PowerController', 'powerState', b ? 'ON' : 'OFF', visto), salud]
  }
  return typeof v === 'number'
    ? [propiedad('Alexa.TemperatureSensor', 'temperature', { value: v, scale: 'CELSIUS' }, visto), salud]
    : [salud]
}
