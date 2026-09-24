// Lo mismo que controlan las reglas de Firebase, pero con un mensaje que
// dice qué corregir. Las reglas rechazan igual si algo se escapa de acá; este
// archivo existe para que el alumno no vea solo "permiso denegado".

import { RESERVADOS } from './firebase.js'

export const MAX = 10

// 6 a 11 son de la flash interna. 34 a 39 solo son entradas y no tienen
// pull-up interno: un pulsador ahí necesita una resistencia externa.
const FLASH = [6, 7, 8, 9, 10, 11]

function errorGpio(pin, que, max) {
  if (!Number.isInteger(pin) || pin < 0 || pin > 39) return `El GPIO de ${que} tiene que ser un número entre 0 y 39.`
  if (FLASH.includes(pin)) return `GPIO ${pin} es de la memoria flash de la placa: no se puede usar para ${que}.`
  if (pin > max) return `GPIO ${pin} solo sirve como entrada y no tiene resistencia interna: para ${que} usá uno entre 0 y ${max}.`
  return null
}

// GPIO ocupados por otros canales y pulsadores, para no pisar un cable.
function ocupados(canales, pulsadorModo, sinId) {
  const usados = new Map()
  for (const c of canales) {
    if (c.id === sinId) continue
    if (c.pin != null) usados.set(c.pin, `"${c.id}"`)
    if (c.pulsador != null) usados.set(c.pulsador, `el pulsador de "${c.id}"`)
  }
  if (pulsadorModo != null) usados.set(pulsadorModo, 'el pulsador de modo')
  return usados
}

export function errorCanal(c, { canales, pulsadorModo, nuevo }) {
  if (!/^[a-z][a-z0-9_]{0,14}$/.test(c.id || ''))
    return 'El id va en minúsculas: empieza con una letra y sigue con letras, números o _, hasta 15 caracteres (por ejemplo "suelo" o "luz_2").'
  if (RESERVADOS.includes(c.id)) return `"${c.id}" está reservado: elegí otro id.`
  if (nuevo && canales.some(x => x.id === c.id)) return `Ya tenés algo que se llama "${c.id}".`
  if (nuevo && canales.filter(x => x.tipo === c.tipo).length >= MAX)
    return `Ya tenés ${MAX} ${c.tipo === 'salida' ? 'salidas' : 'entradas'}, que es el máximo.`

  const usados = ocupados(canales, pulsadorModo, c.id)
  if (c.tipo === 'salida') {
    if (c.pin == null) return 'Una salida necesita el GPIO donde está conectada.'
    const e = errorGpio(c.pin, 'una salida', 33)
    if (e) return e
    if (c.pulsador != null) {
      const ep = errorGpio(c.pulsador, 'un pulsador', 33)
      if (ep) return ep
      if (c.pulsador === c.pin) return 'El pulsador y la salida no pueden estar en el mismo GPIO.'
      if (usados.has(c.pulsador)) return `GPIO ${c.pulsador} ya lo usa ${usados.get(c.pulsador)}.`
    }
  } else if (c.pin != null) {
    const e = errorGpio(c.pin, 'una entrada', 39)
    if (e) return e
  }
  if (c.pin != null && usados.has(c.pin)) return `GPIO ${c.pin} ya lo usa ${usados.get(c.pin)}.`
  return null
}

export function errorPulsadorModo(pin, canales) {
  if (pin == null) return null
  const e = errorGpio(pin, 'un pulsador', 33)
  if (e) return e
  const usados = ocupados(canales, null, null)
  if (usados.has(pin)) return `GPIO ${pin} ya lo usa ${usados.get(pin)}.`
  return null
}

export function errorRegla(g) {
  if (!g.entrada) return 'Elegí la entrada que decide.'
  if (!Number.isFinite(g.umbral)) return 'El umbral tiene que ser un número.'
  if (!Number.isFinite(g.hist) || g.hist < 0) return 'La histéresis tiene que ser un número mayor o igual a 0.'
  return null
}
