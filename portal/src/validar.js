// Lo mismo que controlan las reglas de Firebase, pero con un mensaje que
// dice qué corregir. Las reglas rechazan igual si algo se escapa de acá; este
// archivo existe para que el alumno no vea solo "permiso denegado".

import { RESERVADOS } from './nombres.js'

export const MAX = 10

// Las pantallas que entiende el firmware (config/pantalla). Van por I2C, en
// los pines del chip (sda y scl, abajo).
export const PANTALLAS = ['oled', 'lcd']

const rango = (desde, hasta, motivo) =>
  Object.fromEntries(Array.from({ length: hasta - desde + 1 }, (_, i) => [desde + i, motivo]))

// Las placas que entiende el portal (config/chip). Sin chip guardado es un
// ESP32 clásico, con el que empezó el proyecto. Lo mismo, en corto, está en
// las reglas de la base (hasta qué GPIO) y en gpioNoSirve() de main.cpp.
//   max          el GPIO más alto que tiene
//   noExisten    números que el chip se salta: ninguna placa tiene un pin así
//   usados       GPIO que la placa usa para otra cosa, con el motivo
//   soloEntrada  desde este GPIO no hay salida ni pull-up interno (null: no pasa)
//   sda, scl     la pantalla
//   adc1         los GPIO analógicos que leen con el WiFi prendido (el ADC2 no)
//   ejemplo      los números que se sugieren en los campos vacíos
export const CHIPS = {
  esp32: {
    nombre: 'ESP32',
    placa: 'ESP32 DevKit v1',
    max: 39,
    noExisten: [20, 24, 28, 29, 30, 31],
    usados: rango(6, 11, 'es de la memoria flash de la placa'),
    soloEntrada: 34,
    sda: 21, scl: 22,
    adc1: [32, 39],
    ejemplo: { salida: 26, entrada: 34, pulsador: 32, modo: 25 },
  },
  esp32s3: {
    nombre: 'ESP32-S3',
    placa: 'ESP32-S3 DevKitC-1 o compatible',
    max: 48,
    noExisten: [22, 23, 24, 25],
    usados: {
      ...rango(19, 20, 'es del USB de la placa'),
      ...rango(26, 32, 'es de la memoria flash de la placa'),
      ...rango(35, 37, 'es de la memoria PSRAM en muchas placas S3 (las N8R8 y N16R8)'),
      ...rango(45, 46, 'decide cómo arranca la placa (con algo conectado, puede no arrancar)'),
    },
    soloEntrada: null,
    sda: 8, scl: 9,
    adc1: [1, 10],
    ejemplo: { salida: 5, entrada: 1, pulsador: 15, modo: 17 },
  },
}

export const chipDe = (chip) => CHIPS[chip] || CHIPS.esp32

// esEntrada: un canal de entrada (no necesita salida ni pull-up).
function errorGpio(pin, que, chip, esEntrada = false) {
  const c = chipDe(chip)
  if (!Number.isInteger(pin) || pin < 0 || pin > c.max) {
    if (Number.isInteger(pin) && pin > c.max && pin <= CHIPS.esp32s3.max)
      return `El ${c.nombre} llega hasta el GPIO ${c.max}. Si tu placa es un ESP32-S3, elígela en "Tu placa", arriba de todo.`
    return `El GPIO de ${que} tiene que ser un número entre 0 y ${c.max}.`
  }
  if (c.noExisten.includes(pin))
    return `El ${c.nombre} no tiene GPIO ${pin}. Usa el número impreso junto al pin (D27, G27 o IO27 es el GPIO 27), no su posición en la placa.`
  if (c.usados[pin]) return `GPIO ${pin} ${c.usados[pin]}: no se puede usar para ${que}.`
  if (!esEntrada && c.soloEntrada != null && pin >= c.soloEntrada)
    return `GPIO ${pin} solo sirve como entrada y no tiene resistencia interna: para ${que} usa uno entre 0 y ${c.soloEntrada - 1}.`
  return null
}

// GPIO que la placa usa fuera de los canales: el pulsador o la llave de modo
// y la pantalla. Recibe la placa como la arma normalizarPlaca.
export function pinesFijos({ pulsadorModo, llaveModo, pantalla, chip } = {}) {
  const fijos = new Map()
  if (pantalla) {
    const c = chipDe(chip)
    fijos.set(c.sda, 'la pantalla (SDA)')
    fijos.set(c.scl, 'la pantalla (SCL)')
  }
  if (pulsadorModo != null) fijos.set(pulsadorModo, 'el pulsador de modo')
  if (llaveModo != null) fijos.set(llaveModo, 'la llave de modo')
  return fijos
}

// GPIO ocupados por otros canales, sus pulsadores y los pines fijos, para no
// pisar un cable.
function ocupados(canales, fijos, sinId) {
  const usados = new Map(fijos)
  for (const c of canales) {
    if (c.id === sinId) continue
    if (c.pin != null) usados.set(c.pin, `"${c.id}"`)
    if (c.pulsador != null) usados.set(c.pulsador, `el pulsador de "${c.id}"`)
  }
  return usados
}

// fijos: lo que devuelve pinesFijos(placa). chip: el de la placa ('esp32' si falta).
export function errorCanal(c, { canales, fijos = new Map(), nuevo, chip }) {
  if (!/^[a-z][a-z0-9_]{0,14}$/.test(c.id || ''))
    return 'El id va en minúsculas: empieza con una letra y sigue con letras, números o _, hasta 15 caracteres (por ejemplo "suelo" o "luz_2").'
  if (RESERVADOS.includes(c.id)) return `"${c.id}" está reservado: elige otro id.`
  if (nuevo && canales.some(x => x.id === c.id)) return `Ya tienes algo que se llama "${c.id}".`
  if (nuevo && canales.filter(x => x.tipo === c.tipo).length >= MAX)
    return `Ya tienes ${MAX} ${c.tipo === 'salida' ? 'salidas' : 'entradas'}, que es el máximo.`

  const usados = ocupados(canales, fijos, c.id)
  if (c.tipo === 'salida') {
    if (c.pin == null) return 'Una salida necesita el GPIO donde está conectada.'
    const e = errorGpio(c.pin, 'una salida', chip)
    if (e) return e
    if (c.pulsador != null) {
      const ep = errorGpio(c.pulsador, 'un pulsador', chip)
      if (ep) return ep
      if (c.pulsador === c.pin) return 'El pulsador y la salida no pueden estar en el mismo GPIO.'
      if (usados.has(c.pulsador)) return `GPIO ${c.pulsador} ya lo usa ${usados.get(c.pulsador)}.`
    }
  } else if (c.pin != null) {
    const e = errorGpio(c.pin, 'una entrada', chip, true)
    if (e) return e
  }
  if (c.pin != null && usados.has(c.pin)) return `GPIO ${c.pin} ya lo usa ${usados.get(c.pin)}.`
  return null
}

// El modo desde la placa. tipo: 'pulsador' | 'llave' | null (ninguno).
export function errorModoPlaca(tipo, pin, canales, pantalla, chip) {
  if (!tipo) return null
  const que = tipo === 'llave' ? 'una llave' : 'un pulsador'
  if (pin == null) return `Escribe el GPIO de ${tipo === 'llave' ? 'la llave' : 'el pulsador'}.`
  const e = errorGpio(pin, que, chip)
  if (e) return e
  const usados = ocupados(canales, pinesFijos({ pantalla, chip }), null)
  if (usados.has(pin)) return `GPIO ${pin} ya lo usa ${usados.get(pin)}.`
  return null
}

// tipo: 'oled' | 'lcd' | null (ninguna). placa: {pulsadorModo, llaveModo, chip}.
export function errorPantalla(tipo, canales, placa = {}) {
  if (tipo == null) return null
  if (!PANTALLAS.includes(tipo)) return 'Elige una pantalla de la lista.'
  const { sda, scl } = chipDe(placa.chip)
  const usados = ocupados(canales, pinesFijos({ pulsadorModo: placa.pulsadorModo, llaveModo: placa.llaveModo }), null)
  for (const pin of [sda, scl]) {
    if (usados.has(pin))
      return `La pantalla va en GPIO ${sda} y ${scl}, pero GPIO ${pin} ya lo usa ${usados.get(pin)}: muévelo a otro pin primero.`
  }
  return null
}

// Lo que dejaría de servir si la placa (como la arma normalizarPlaca) fuera
// de otro chip: una lista de textos, vacía si todo sigue bien.
export function problemasCon(placa, chip) {
  const p = { ...placa, chip }
  const fijos = pinesFijos(p)
  const r = []
  for (const c of placa.canales) {
    const e = errorCanal(c, { canales: placa.canales, fijos, nuevo: false, chip })
    if (e) r.push(`"${c.id}": ${e}`)
  }
  const tipo = placa.llaveModo != null ? 'llave' : placa.pulsadorModo != null ? 'pulsador' : null
  const em = errorModoPlaca(tipo, placa.llaveModo ?? placa.pulsadorModo, placa.canales, placa.pantalla, chip)
  if (em) r.push(`${tipo === 'llave' ? 'La llave' : 'El pulsador'} de modo: ${em}`)
  return r
}

export function errorRegla(g) {
  if (!g.entrada) return 'Elige la entrada que decide.'
  if (!Number.isFinite(g.umbral)) return 'El umbral tiene que ser un número.'
  if (!Number.isFinite(g.hist) || g.hist < 0) return 'La histéresis tiene que ser un número mayor o igual a 0.'
  return null
}

export function errorAlerta(a) {
  if (!Number.isFinite(a.umbral)) return 'El umbral tiene que ser un número.'
  if (!Number.isFinite(a.hist) || a.hist < 0) return 'La histéresis tiene que ser un número mayor o igual a 0.'
  return null
}

// El medidor y la barra necesitan saber de dónde a dónde va la escala.
export function errorWidget(w) {
  if (w.widget !== 'medidor' && w.widget !== 'barra') return null
  if (!Number.isFinite(w.min) || !Number.isFinite(w.max)) return 'Completa el mínimo y el máximo de la escala.'
  if (w.min >= w.max) return 'El mínimo tiene que ser menor que el máximo.'
  return null
}
