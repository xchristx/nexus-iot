// De una placa (lo que hay en placas/{usuario}) a los dispositivos que ve
// Alexa, y su estado. Sin acceso a la base: se prueba solo.
//
//   cada salida            interruptor (Alexa.PowerController)  "{usuario}:{id}"
//                          + su umbral, si tiene regla (Alexa.RangeController "Regla.Umbral")
//   el modo automático     interruptor "Modo automático"         "{usuario}:auto"  (no, si tiene llave)
//   cada entrada en °C     termómetro (Alexa.TemperatureSensor)  "{usuario}:{id}"
//   las demás entradas     "Placa", un valor de solo lectura por entrada
//                          (Alexa.RangeController "Entrada.{id}") "{usuario}:_entradas"
//
// "auto" es un id reservado (RESERVADOS en el portal y en las reglas) y los
// ids empiezan con una letra: ni "auto" ni "_entradas" chocan con un canal.

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
const esPorcentaje = (unidad) => /^\s*%\s*$/.test(unidad || '')

// Las instancias de Alexa.RangeController: el umbral de la regla de una
// salida, y el valor de cada entrada que no es temperatura.
export const UMBRAL = 'Regla.Umbral'
export const instanciaEntrada = (id) => 'Entrada.' + id

// De dónde a dónde se puede poner el umbral, y cuánto sube "sube el umbral".
// La escala del widget de la entrada si el alumno la eligió; si no, una según
// la unidad. Siempre incluye el umbral que ya tiene.
export function umbralDe(regla, entrada, tablero) {
  const w = tablero?.[regla.entrada]
  const temperatura = esTemperatura(entrada.unidad), porcentaje = esPorcentaje(entrada.unidad)
  let [min, max] = Number.isFinite(w?.min) && Number.isFinite(w?.max) && w.min < w.max ? [w.min, w.max]
    : temperatura ? [-20, 80] : porcentaje ? [0, 100] : [-1000, 10000]
  min = Math.min(min, regla.umbral)
  max = Math.max(max, regla.umbral)
  return {
    entrada: regla.entrada, valor: regla.umbral, min, max,
    precision: temperatura ? 0.5 : 1,
    paso: porcentaje ? 5 : 1,
    unidad: temperatura ? 'Alexa.Unit.Temperature.Celsius' : porcentaje ? 'Alexa.Unit.Percent' : null,
  }
}

// El ícono del tablero dice qué es: una luz se apaga con "Alexa, apaga las luces".
const CATEGORIA = { foco: 'LIGHT', ventilador: 'FAN', enchufe: 'SMARTPLUG' }

const ordenados = (mapa) =>
  Object.entries(mapa || {}).map(([id, c]) => ({ ...c, id })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

const nombreDe = (c) => (typeof c.nombre === 'string' && c.nombre.trim()) || c.id.replace(/_/g, ' ')

// Los dispositivos de una placa. `alumno`: su nombre, cuando la ve el docente
// ("Bomba de Ana Pérez").
export function dispositivosDe(usuario, placa, alumno) {
  const de = alumno ? ' de ' + alumno : ''
  const salidas = ordenados(placa?.config?.salidas)
  const entradas = ordenados(placa?.config?.entradas)
  const lista = salidas.map(s => {
    const regla = placa?.control?.reglas?.[s.id]
    const entrada = regla && entradas.find(e => e.id === regla.entrada)
    return {
      endpointId: `${usuario}:${s.id}`, usuario, id: s.id, tipo: 'salida',
      nombre: nombreDe(s) + de,
      categoria: CATEGORIA[placa?.tablero?.[s.id]?.icono] || 'SWITCH',
      descripcion: `Salida "${s.id}" de ${usuario}`,
      umbral: entrada && typeof regla.umbral === 'number' ? umbralDe(regla, entrada, placa.tablero) : null,
    }
  })
  // Con llave selectora el modo lo elige la llave de la placa: Alexa no lo ofrece.
  if (salidas.length && placa?.config?.llave_modo == null) {
    lista.push({
      endpointId: `${usuario}:auto`, usuario, id: 'auto', tipo: 'auto',
      nombre: 'Modo automático' + de, categoria: 'SWITCH',
      descripcion: `Modo automático de ${usuario}`,
    })
  }
  for (const e of entradas) {
    if (!esTemperatura(e.unidad)) continue
    lista.push({
      endpointId: `${usuario}:${e.id}`, usuario, id: e.id, tipo: 'temperatura',
      nombre: nombreDe(e) + de, categoria: 'TEMPERATURE_SENSOR',
      descripcion: `Entrada "${e.id}" de ${usuario}`,
    })
  }
  // Las demás, juntas: "Alexa, ¿cuál es la humedad de la placa?". Cada una se
  // nombra como en el portal; dos con el mismo nombre llevan un número.
  const usados = new Set()
  const otras = entradas.filter(e => !esTemperatura(e.unidad)).map(e => {
    let nombre = nombreDe(e)
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${nombreDe(e)} ${n}`
    usados.add(nombre.toLowerCase())
    return { id: e.id, nombre, unidad: esPorcentaje(e.unidad) ? 'Alexa.Unit.Percent' : null }
  })
  if (otras.length) {
    lista.push({
      endpointId: `${usuario}:_entradas`, usuario, id: '_entradas', tipo: 'lecturas',
      nombre: 'Placa' + de, categoria: 'OTHER',
      descripcion: `Entradas de ${usuario}`,
      entradas: otras,
    })
  }
  return lista
}

// Todo lo que ve una cuenta, para Discovery: primero las salidas de todos,
// después los modos, las temperaturas y al final las demás entradas, hasta
// 300. Alexa no acepta dos dispositivos con el mismo nombre: al repetido se le
// agrega un número.
// `placas`: [{usuario, placa, alumno}]
export function catalogo(placas) {
  const orden = { salida: 0, auto: 1, temperatura: 2, lecturas: 3 }
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
const SALUD = capacidad('Alexa.EndpointHealth', 'connectivity', '3.1')

// Los nombres con que se los llama por voz, en los idiomas de la skill.
const LOCALES = ['es-US', 'es-MX']
const nombres = (...textos) => ({
  friendlyNames: textos.flatMap(text => LOCALES.map(locale => ({ '@type': 'text', value: { text, locale } }))),
})

// Un valor numérico: el umbral (se cambia) o una entrada (solo se lee).
function rango(instance, textos, { min, max, precision, unidad }, nonControllable) {
  const c = capacidad('Alexa.RangeController', 'rangeValue')
  return {
    ...c, instance,
    properties: { ...c.properties, nonControllable },
    capabilityResources: nombres(...textos),
    configuration: {
      supportedRange: { minimumValue: min, maximumValue: max, precision },
      ...(unidad && { unitOfMeasure: unidad }),
    },
  }
}

// Una entrada que no es temperatura puede marcar casi cualquier cosa (una
// lectura analógica cruda llega a 4095, el CO2 a miles de ppm): la escala solo
// dice qué valores son posibles.
const escalaLectura = (unidad) => unidad === 'Alexa.Unit.Percent'
  ? { min: 0, max: 100, precision: 0.1 }
  : { min: -10000, max: 100000, precision: 0.1 }

function capacidades(d) {
  if (d.tipo === 'salida') {
    const umbral = d.umbral ? [rango(UMBRAL, ['umbral', 'límite'], d.umbral, false)] : []
    return [capacidad('Alexa.PowerController', 'powerState'), ...umbral, SALUD, ALEXA]
  }
  if (d.tipo === 'auto') return [capacidad('Alexa.PowerController', 'powerState'), ALEXA]
  if (d.tipo === 'temperatura') return [capacidad('Alexa.TemperatureSensor', 'temperature'), SALUD, ALEXA]
  return [
    ...d.entradas.map(e => rango(instanciaEntrada(e.id), [e.nombre], { ...escalaLectura(e.unidad), unidad: e.unidad }, true)),
    SALUD, ALEXA,
  ]
}

export const aEndpoint = (d) => ({
  endpointId: d.endpointId,
  manufacturerName: 'Nexus IoT',
  description: d.descripcion.slice(0, 128),
  friendlyName: d.nombre.slice(0, 128),
  displayCategories: [d.categoria],
  additionalAttributes: { manufacturer: 'Nexus IoT', model: 'ESP32' },
  capabilities: capacidades(d),
})

export const propiedad = (namespace, name, value, t, instance) => ({
  namespace, ...(instance && { instance }), name, value,
  timeOfSample: new Date(t).toISOString(), uncertaintyInMilliseconds: 0,
})

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
    return [
      ...(b == null ? [] : [propiedad('Alexa.PowerController', 'powerState', b ? 'ON' : 'OFF', visto)]),
      ...(d.umbral ? [propiedad('Alexa.RangeController', 'rangeValue', d.umbral.valor, ahora, UMBRAL)] : []),
      salud,
    ]
  }
  if (d.tipo === 'lecturas') {
    return [
      ...d.entradas.filter(e => typeof placa.estado[e.id] === 'number')
        .map(e => propiedad('Alexa.RangeController', 'rangeValue', placa.estado[e.id], visto, instanciaEntrada(e.id))),
      salud,
    ]
  }
  return typeof v === 'number'
    ? [propiedad('Alexa.TemperatureSensor', 'temperature', { value: v, scale: 'CELSIUS' }, visto), salud]
    : [salud]
}
