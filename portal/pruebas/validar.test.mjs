// Pruebas de src/validar.js: GPIO según el chip, y ocupados por el pulsador
// o la llave de modo y por la pantalla.
//
//   cd portal && npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorCanal, errorModoPlaca, errorPantalla, pinesFijos, problemasCon } from '../src/validar.js'

const canales = [
  { id: 't', tipo: 'entrada', pin: 4 },
  { id: 'bomba', tipo: 'salida', pin: 26, nivel_activo: 'LOW', pulsador: 32 },
]
const salida = (pin, pulsador) => ({ id: 'luz', tipo: 'salida', pin, nivel_activo: 'HIGH', pulsador })

test('con pantalla, GPIO 21 y 22 no sirven para un canal ni para su pulsador', () => {
  const fijos = pinesFijos({ pantalla: 'oled' })
  assert.match(errorCanal(salida(21), { canales, fijos, nuevo: true }), /la pantalla \(SDA\)/)
  assert.match(errorCanal(salida(2, 22), { canales, fijos, nuevo: true }), /la pantalla \(SCL\)/)
  assert.equal(errorCanal(salida(21), { canales, fijos: pinesFijos({}), nuevo: true }), null)
})

test('un canal no puede usar el GPIO de la llave ni del pulsador de modo', () => {
  assert.match(errorCanal(salida(14), { canales, fijos: pinesFijos({ llaveModo: 14 }), nuevo: true }), /la llave de modo/)
  assert.match(errorCanal(salida(25), { canales, fijos: pinesFijos({ pulsadorModo: 25 }), nuevo: true }), /el pulsador de modo/)
  assert.equal(errorCanal(salida(2), { canales, fijos: pinesFijos({ llaveModo: 14 }), nuevo: true }), null)
})

test('la llave de modo: GPIO que exista, con pull-up y libre', () => {
  assert.equal(errorModoPlaca('', null, canales, null), null)
  assert.equal(errorModoPlaca('llave', 14, canales, null), null)
  assert.match(errorModoPlaca('llave', null, canales, null), /GPIO de la llave/)
  assert.match(errorModoPlaca('llave', 35, canales, null), /solo sirve como entrada/)
  assert.match(errorModoPlaca('llave', 24, canales, null), /no tiene GPIO 24/)
  assert.match(errorModoPlaca('llave', 26, canales, null), /"bomba"/)
  assert.match(errorModoPlaca('pulsador', 32, canales, null), /el pulsador de "bomba"/)
  assert.match(errorModoPlaca('llave', 21, canales, 'lcd'), /la pantalla/)
})

test('la pantalla necesita 21 y 22 libres', () => {
  assert.equal(errorPantalla(null, canales), null)
  assert.equal(errorPantalla('oled', canales), null)
  assert.match(errorPantalla('tft', canales), /Elige una pantalla/)
  assert.match(errorPantalla('lcd', [...canales, salida(22)]), /GPIO 22 ya lo usa "luz"/)
  assert.match(errorPantalla('oled', canales, { llaveModo: 21 }), /GPIO 21 ya lo usa la llave de modo/)
})

test('ESP32-S3: llega hasta el GPIO 48 y rechaza los que usa para otra cosa', () => {
  const s3 = { canales, nuevo: true, chip: 'esp32s3' }
  assert.equal(errorCanal(salida(40, 41), s3), null)
  assert.equal(errorCanal(salida(47), s3), null)
  assert.equal(errorCanal({ id: 'pot', tipo: 'entrada', pin: 6 }, s3), null)
  assert.match(errorCanal(salida(22), s3), /El ESP32-S3 no tiene GPIO 22/)
  assert.match(errorCanal(salida(27), s3), /GPIO 27 es de la memoria flash/)
  assert.match(errorCanal(salida(36), s3), /PSRAM/)
  assert.match(errorCanal(salida(19), s3), /USB/)
  assert.match(errorCanal(salida(45), s3), /arranca/)
  assert.match(errorCanal(salida(2, 46), s3), /arranca/)
  assert.match(errorCanal(salida(49), s3), /entre 0 y 48/)
})

test('ESP32 clásico: de 40 para arriba sugiere elegir el S3', () => {
  assert.match(errorCanal(salida(40), { canales, nuevo: true }), /llega hasta el GPIO 39.*ESP32-S3/)
  assert.match(errorCanal(salida(40), { canales, nuevo: true, chip: 'esp32' }), /llega hasta el GPIO 39/)
  assert.match(errorCanal({ id: 'pot', tipo: 'entrada', pin: 6 }, { canales, nuevo: true }), /memoria flash/)
  assert.match(errorCanal(salida(60), { canales, nuevo: true }), /entre 0 y 39/)
})

test('ESP32-S3: la pantalla va en GPIO 8 y 9', () => {
  const fijos = pinesFijos({ pantalla: 'oled', chip: 'esp32s3' })
  assert.match(errorCanal(salida(8), { canales, fijos, nuevo: true, chip: 'esp32s3' }), /la pantalla \(SDA\)/)
  assert.equal(errorCanal(salida(21), { canales, fijos, nuevo: true, chip: 'esp32s3' }), null)
  assert.match(errorPantalla('lcd', [...canales, salida(9)], { chip: 'esp32s3' }), /GPIO 8 y 9, pero GPIO 9 ya lo usa "luz"/)
  assert.match(errorModoPlaca('llave', 8, canales, 'oled', 'esp32s3'), /la pantalla/)
  assert.equal(errorModoPlaca('llave', 21, canales, 'oled', 'esp32s3'), null)
})

test('cambiar de chip dice qué deja de servir', () => {
  const placa = { canales, pulsadorModo: 25, llaveModo: null, pantalla: null, chip: 'esp32' }
  const p = problemasCon(placa, 'esp32s3')
  assert.equal(p.length, 2)
  assert.match(p[0], /^"bomba": GPIO 26 es de la memoria flash/)
  assert.match(p[1], /^El pulsador de modo: El ESP32-S3 no tiene GPIO 25/)
  assert.deepEqual(problemasCon(placa, 'esp32'), [])
  const s3 = { canales: [{ id: 'luz', tipo: 'salida', pin: 40, nivel_activo: 'HIGH' }], llaveModo: 21, pantalla: 'oled', chip: 'esp32s3' }
  const vuelta = problemasCon(s3, 'esp32')
  assert.equal(vuelta.length, 2)
  assert.match(vuelta[0], /"luz": El ESP32 llega hasta el GPIO 39/)
  assert.match(vuelta[1], /^La llave de modo: GPIO 21 ya lo usa la pantalla/)
})
